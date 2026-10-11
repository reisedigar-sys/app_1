"use server";

import { z } from "zod";
import { iniciarAcao, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import type { Estado } from "@/lib/painel/estado";

/** Substitui os serviços que um profissional faz. Campos: servico (vários) e fator:{servicoId}. */
export async function salvarHabilitacao(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const profissionalId = z.guid().parse(form.get("profissional_id"));
  const servicos = z.array(z.guid()).parse(form.getAll("servico"));
  // Só mexe nos serviços exibidos na tela (ativos); vínculos de serviços inativos ficam guardados.
  const exibidos = z.array(z.guid()).parse(form.getAll("exibido"));
  const remover = exibidos.filter((id) => !servicos.includes(id));
  const fator = (id: string) => {
    const v = Number(form.get(`fator:${id}`) ?? 1);
    return Number.isFinite(v) && v >= 0.5 && v <= 3 ? v : 1;
  };

  if (servicos.length) {
    const { error } = await supabase.from("profissional_servico").upsert(
      servicos.map((servico_id) => ({ petshop_id: lojaId, profissional_id: profissionalId, servico_id, fator_duracao: fator(servico_id) })),
      { onConflict: "profissional_id,servico_id" },
    );
    if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  }
  if (remover.length) {
    const { error } = await supabase
      .from("profissional_servico")
      .delete()
      .eq("profissional_id", profissionalId)
      .eq("petshop_id", lojaId)
      .in("servico_id", remover);
    if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  }

  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Serviços do profissional salvos." };
}
