import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseUrl } from "./env";

// Cliente com a chave secreta: ignora o RLS. Só para rotas de servidor, workers e webhooks.
// Nunca importe este arquivo em código que roda no navegador.
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("Variável de ambiente ausente: SUPABASE_SECRET_KEY");
  return createClient<Database>(supabaseUrl(), secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
