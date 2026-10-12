import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Loja ativa pelo endereço público (/{slug}); null se não existir ou estiver inativa. */
export const lojaPorSlug = cache(async (slug: string) => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("petshop")
    .select("id, nome, slug, telefone_e164, logradouro, numero, bairro, cidade, uf, fuso, slot_minutos, ativo, cancelamento_gratuito_horas")
    .eq("slug", slug)
    .eq("ativo", true)
    .maybeSingle();
  return data;
});

export function enderecoDaLoja(l: { logradouro: string | null; numero: string | null; bairro: string | null; cidade: string | null; uf: string | null }) {
  return [[l.logradouro, l.numero].filter(Boolean).join(", "), l.bairro, [l.cidade, l.uf].filter(Boolean).join(" - ")].filter(Boolean).join(" · ");
}

export { telefoneLegivel } from "@/lib/painel/formatos";
