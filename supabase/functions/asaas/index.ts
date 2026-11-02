// Webhook do Asaas: Pix recebido do sinal (semana 8).
// Endereço, cadastrado sozinho em cada subconta quando a loja abre a conta: https://<projeto>.supabase.co/functions/v1/asaas
// Segredo da função (passo a passo em docs/ambientes.md): ASAAS_WEBHOOK_TOKEN, o mesmo da Vercel; o Asaas o manda
// no cabeçalho asaas-access-token.
import { processarWebhookAsaas } from "../_shared/asaas.ts";

const URL_BANCO = Deno.env.get("SUPABASE_URL")!;
const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${URL_BANCO}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!r.ok) return { data: null, error: { message: `${r.status} ${await r.text()}` } };
  const texto = await r.text();
  return { data: texto ? JSON.parse(texto) : null, error: null };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("método não aceito", { status: 405 });
  const r = await processarWebhookAsaas(
    await req.text(),
    req.headers.get("asaas-access-token"),
    Deno.env.get("ASAAS_WEBHOOK_TOKEN")?.trim() ?? "",
    rpc,
  );
  return Response.json(r.corpo, { status: r.status });
});
