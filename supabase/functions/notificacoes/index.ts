// Edge Function chamada a cada minuto pelo pg_cron (app.disparar_worker, migração 010).
// Segredos da função (passo a passo em docs/ambientes.md):
//   WORKER_TOKEN (o mesmo do Vault) e APP_URL (endereço público do app, para os links);
//   WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID (número central). Sem eles, as mensagens só ficam registradas no painel;
//   WHATSAPP_SOMENTE_PARA (opcional, staging): telefones separados por vírgula; os outros ficam só registrados;
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT (mailto:…) para o push. Sem eles, não há push.
// Sem dependências: chama as funções do banco direto pela API REST (PostgREST) com a chave de serviço.
import { type Mensagem, type MensagemProvider, ProvedorTeste, processarFila } from "../_shared/fila.ts";
import { ProvedorPush } from "../_shared/webpush.ts";
import { ProvedorWhatsApp } from "../_shared/whatsapp.ts";

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

function provedorWhatsApp(): MensagemProvider {
  const token = env("WHATSAPP_TOKEN");
  const phoneNumberId = env("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) return new ProvedorTeste();
  const real = new ProvedorWhatsApp({ token, phoneNumberId, versao: env("WHATSAPP_API_VERSION") });
  const somentePara = env("WHATSAPP_SOMENTE_PARA")?.split(",").map((t) => t.replace(/\D/g, ""));
  if (!somentePara) return real;
  // Staging: o número de teste da Meta só envia para telefones cadastrados; os outros ficam registrados.
  const teste = new ProvedorTeste();
  return {
    nome: "whatsapp",
    enviar: (destino: string, texto: string, m: Mensagem) =>
      somentePara.includes(destino.replace(/\D/g, "")) ? real.enviar(destino, texto, m) : teste.enviar(destino, texto, m),
  };
}

function provedorPush() {
  const publica = env("VAPID_PUBLIC_KEY");
  const privada = env("VAPID_PRIVATE_KEY");
  if (!publica || !privada) return undefined;
  return new ProvedorPush({ publica, privada, assunto: env("VAPID_SUBJECT") ?? "mailto:contato@horadopet.com.br" });
}

Deno.serve(async (req) => {
  const token = Deno.env.get("WORKER_TOKEN");
  if (!token || req.headers.get("x-worker-token") !== token) {
    return new Response("acesso negado", { status: 403 });
  }
  try {
    const total = await processarFila(rpc, provedorWhatsApp(), { appUrl: env("APP_URL") ?? "", push: provedorPush() });
    return Response.json(total);
  } catch (e) {
    console.error(e);
    return new Response("erro no worker", { status: 500 });
  }
});
