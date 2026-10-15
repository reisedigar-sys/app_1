"use server";

import { z } from "zod";
import { iniciarAcao, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import type { Estado } from "@/lib/painel/estado";
import { NOME_PELAGEM, NOME_PORTE, PELAGENS, PORTES, reaisParaCentavos } from "@/lib/painel/formatos";

export async function salvarPrecos(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const servicoId = z.guid().parse(form.get("servico_id"));
  const grade = z.record(z.string(), z.object({ preco: z.string(), duracao: z.string() })).parse(JSON.parse(String(form.get("grade"))));

  const erros: Record<string, string> = {};
  const linhas: { petshop_id: string; servico_id: string; porte: (typeof PORTES)[number]; pelagem: (typeof PELAGENS)[number]; preco_centavos: number; duracao_minutos: number }[] = [];
  const vazias: { porte: (typeof PORTES)[number]; pelagem: (typeof PELAGENS)[number] }[] = [];

  for (const porte of PORTES) {
    for (const pelagem of PELAGENS) {
      const chave = `${porte}.${pelagem}`;
      const c = grade[chave] ?? { preco: "", duracao: "" };
      const nome = `${NOME_PORTE[porte]} / pelagem ${NOME_PELAGEM[pelagem].toLowerCase()}`;
      if (!c.preco.trim() && !c.duracao.trim()) {
        vazias.push({ porte, pelagem });
        continue;
      }
      const preco = reaisParaCentavos(c.preco);
      const duracao = Number(c.duracao);
      if (preco === null) erros[chave] = `${nome}: preço inválido.`;
      else if (!Number.isInteger(duracao) || duracao < 5 || duracao > 600) erros[chave] = `${nome}: duração entre 5 e 600 minutos.`;
      else linhas.push({ petshop_id: lojaId, servico_id: servicoId, porte, pelagem, preco_centavos: preco, duracao_minutos: duracao });
    }
  }
  if (Object.keys(erros).length) return { ok: false, mensagem: Object.values(erros).join(" "), erros };

  if (linhas.length) {
    const { error } = await supabase.from("servico_preco").upsert(linhas, { onConflict: "servico_id,porte,pelagem" });
    if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  }
  for (const v of vazias) {
    const { error } = await supabase
      .from("servico_preco")
      .delete()
      .eq("servico_id", servicoId)
      .eq("porte", v.porte)
      .eq("pelagem", v.pelagem);
    if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  }
  revalidarLoja(lojaId);
  return { ok: true, mensagem: `Preços salvos (${linhas.length} de ${PORTES.length * PELAGENS.length} combinações).` };
}
