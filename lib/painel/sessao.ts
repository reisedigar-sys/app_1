import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type Papel = Database["public"]["Enums"]["papel_loja"];
export type Loja = Database["public"]["Tables"]["petshop"]["Row"];

/** Usuário logado; sem sessão, manda para o login. */
export const exigirUsuario = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/entrar");
  return { id: claims.sub, email: (claims.email as string | undefined) ?? "" };
});

/** Lojas em que o usuário trabalha (como membro da loja ou dono da rede). */
export const minhasLojas = cache(async () => {
  const usuario = await exigirUsuario();
  const supabase = await createClient();
  const [membros, redes] = await Promise.all([
    supabase.from("petshop_membro").select("papel, petshop(id, nome, slug, ativo)").eq("user_id", usuario.id),
    supabase.from("rede_membro").select("rede(id, nome, petshop(id, nome, slug, ativo))").eq("user_id", usuario.id),
  ]);

  const lojas = new Map<string, { id: string; nome: string; slug: string; ativo: boolean; papel: Papel }>();
  for (const r of redes.data ?? []) {
    for (const p of r.rede?.petshop ?? []) lojas.set(p.id, { ...p, papel: "dono" });
  }
  for (const m of membros.data ?? []) {
    if (m.petshop && !lojas.has(m.petshop.id)) lojas.set(m.petshop.id, { ...m.petshop, papel: m.papel });
  }
  return [...lojas.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
});

/** Loja do painel e o papel do usuário nela; quem não é da equipe recebe 404. */
export const exigirLoja = cache(async (lojaId: string) => {
  const lojas = await minhasLojas();
  const minha = lojas.find((l) => l.id === lojaId);
  if (!minha) notFound();
  const supabase = await createClient();
  const { data: loja } = await supabase.from("petshop").select("*").eq("id", lojaId).single();
  if (!loja) notFound();
  return { loja, papel: minha.papel };
});

export const podeConfigurar = (papel: Papel) => papel === "dono" || papel === "gerente";
export const podeOperar = (papel: Papel) => papel !== "profissional";
