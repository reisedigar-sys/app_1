// Edge Function chamada a cada minuto pelo pg_cron (app.disparar_worker, migração 010).
// Segredos da função: WORKER_TOKEN (o mesmo do Vault) e APP_URL (endereço público do app, para os links).
import { createClient } from "npm:@supabase/supabase-js@2";
import { ProvedorTeste, processarFila } from "../_shared/fila.ts";

Deno.serve(async (req) => {
  const token = Deno.env.get("WORKER_TOKEN");
  if (!token || req.headers.get("x-worker-token") !== token) {
    return new Response("acesso negado", { status: 403 });
  }
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  try {
    const total = await processarFila((fn, args) => supabase.rpc(fn, args), new ProvedorTeste(), {
      appUrl: Deno.env.get("APP_URL") ?? "",
    });
    return Response.json(total);
  } catch (e) {
    console.error(e);
    return new Response("erro no worker", { status: 500 });
  }
});
