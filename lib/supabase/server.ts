import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "./database.types";
import { supabasePublishableKey, supabaseUrl } from "./env";

// Cliente do servidor com a sessão do usuário (cookies). Crie um por requisição.
export async function createClient() {
  // Dados do usuário são sempre de tempo de requisição (o cliente usa Date.now() ao validar a sessão).
  await connection();
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado de um Server Component: os cookies são renovados pelo proxy.ts.
        }
      },
    },
  });
}
