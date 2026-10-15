import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { caminhoSeguro } from "@/lib/conta/voltar";
import { createClient } from "@/lib/supabase/server";

/**
 * Destino dos links de e-mail do Supabase Auth (por enquanto, a recuperação de senha). Aceita os dois formatos:
 * `token_hash` + `type` (modelo de e-mail do docs/ambientes.md; funciona em qualquer navegador) e `code` (modelo padrão,
 * fluxo PKCE; funciona no mesmo navegador em que o link foi pedido). Abre a sessão e segue para `next`.
 */
export async function GET(request: NextRequest) {
  const busca = request.nextUrl.searchParams;
  const destino = caminhoSeguro(busca.get("next"), "/senha/nova");
  const supabase = await createClient();
  const tokenHash = busca.get("token_hash");
  const codigo = busca.get("code");
  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: (busca.get("type") ?? "recovery") as EmailOtpType })
    : codigo
      ? await supabase.auth.exchangeCodeForSession(codigo)
      : { error: new Error("link sem token") };
  // O endereço que o navegador usou (o `nextUrl.origin` pode vir como localhost atrás de proxy, e o cookie da
  // sessão ficaria em outro host).
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const protocolo = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const url = new URL(destino, `${protocolo}://${host}`);
  if (error) url.searchParams.set("erro", "link");
  return NextResponse.redirect(url);
}
