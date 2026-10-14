// Edge Function chamada a cada minuto pelo pg_cron (app.disparar_worker, migração 010).
// Segredos da função: WORKER_TOKEN (o mesmo do Vault) e APP_URL (endereço público do app, para os links).
// Sem dependências: chama as funções do banco direto pela API REST (PostgREST) com a chave de serviço.
import { ProvedorTeste, processarFila } from "../_shared/fila.ts";

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
  const token = Deno.env.get("WORKER_TOKEN");
  if (!token || req.headers.get("x-worker-token") !== token) {
    return new Response("acesso negado", { status: 403 });
  }
  try {
    const total = await processarFila(rpc, new ProvedorTeste(), { appUrl: Deno.env.get("APP_URL") ?? "" });
    return Response.json(total);
  } catch (e) {
    console.error(e);
    return new Response("erro no worker", { status: 500 });
  }
});
