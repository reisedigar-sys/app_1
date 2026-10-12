import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { comVoltar } from "./voltar";

/** Usuário logado (qualquer conta); sem sessão, manda para o login do tutor e volta depois. */
export const exigirConta = cache(async (voltar: string) => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect(comVoltar("/conta/entrar", voltar));
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? "" };
});

/** Cadastro do tutor ligado à conta, ou null se ainda não completou o perfil. */
export const tutorAtual = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return null;
  const { data: tutor } = await supabase.from("tutor").select("id, nome, telefone_e164, email").eq("user_id", data.claims.sub).maybeSingle();
  return tutor;
});

/** Tutor com perfil completo (nome e telefone); senão, manda completar o perfil e volta depois. */
export async function exigirTutor(voltar: string) {
  await exigirConta(voltar);
  const tutor = await tutorAtual();
  if (!tutor) redirect(comVoltar("/conta/perfil", voltar));
  return tutor;
}
