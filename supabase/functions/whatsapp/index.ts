// Webhook do WhatsApp (Meta Cloud API): status de entrega, "PARAR" e mensagens enviadas ao número central.
// Endereço para cadastrar na Meta: https://<projeto>.supabase.co/functions/v1/whatsapp
// Segredos da função (passo a passo em docs/ambientes.md):
//   WHATSAPP_VERIFY_TOKEN (o mesmo digitado na Meta ao cadastrar o webhook), WHATSAPP_APP_SECRET (segredo do app,
//   para conferir a assinatura), WHATSAPP_TOKEN (para responder) e APP_URL (links das lojas na resposta).
import { type PayloadWebhook, ProvedorWhatsApp, assinaturaValida, processarWebhook } from "../_shared/whatsapp.ts";

const URL_BANCO = Deno.env.get("SUPABASE_URL")!;
const CHAVE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const env = (nome: string) => Deno.env.get(nome)?.trim() || undefined;

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
  // Verificação feita pela Meta ao cadastrar o webhook.
  if (req.method === "GET") {
    const url = new URL(req.url);
    const verificar = env("WHATSAPP_VERIFY_TOKEN");
    if (verificar && url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === verificar) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("acesso negado", { status: 403 });
  }
  if (req.method !== "POST") return new Response("método não aceito", { status: 405 });

  const corpo = await req.text();
  if (!(await assinaturaValida(env("WHATSAPP_APP_SECRET") ?? "", corpo, req.headers.get("x-hub-signature-256")))) {
    return new Response("assinatura inválida", { status: 401 });
  }
  const token = env("WHATSAPP_TOKEN");
  const provedor = token ? new ProvedorWhatsApp({ token, phoneNumberId: "", versao: env("WHATSAPP_API_VERSION") }) : null;
  try {
    const total = await processarWebhook(JSON.parse(corpo) as PayloadWebhook, {
      rpc,
      appUrl: env("APP_URL") ?? "",
      responder: provedor ? (id, destino, texto) => provedor.responder(id, destino, texto) : undefined,
    });
    return Response.json(total);
  } catch (e) {
    // Erro: a Meta tenta de novo, e a mesma mensagem nunca é processada duas vezes.
    console.error(e);
    return new Response("erro no webhook", { status: 500 });
  }
});
