"use server";

import { z } from "zod";
import { SEM_PERMISSAO, iniciarAcao, opcional, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import { type Estado, errosDeValidacao } from "@/lib/painel/estado";

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida.");

const schema = z
  .object({
    profissional_id: z.guid(),
    servico_id: opcional(z.guid()),
    dias: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Escolha pelo menos um dia."),
    inicio: hora,
    fim: hora,
  })
  .refine((d) => d.fim > d.inicio, { path: ["fim"], message: "O fim precisa ser depois do início." });

export async function adicionarHorario(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const dados = schema.safeParse({
    profissional_id: form.get("profissional_id"),
    servico_id: form.get("servico_id"),
    dias: form.getAll("dias"),
    inicio: form.get("inicio"),
    fim: form.get("fim"),
  });
  if (!dados.success) return errosDeValidacao(dados.error);
  const { dias, ...janela } = dados.data;

  // Um insert só: ou entram todos os dias, ou nenhum.
  const { error } = await supabase
    .from("horario_trabalho")
    .insert(dias.map((dia_semana) => ({ ...janela, dia_semana, petshop_id: lojaId })));
  if (error)
    return {
      ok: false,
      mensagem: mensagemDeErro(error, {
        sobreposto: "Esse horário se sobrepõe a outro já cadastrado para o profissional num dos dias escolhidos.",
      }),
    };
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Horário adicionado." };
}

export async function removerHorario(form: FormData) {
  const { supabase, lojaId } = await iniciarAcao(form);
  const id = z.guid().parse(form.get("id"));
  const { data } = await supabase.from("horario_trabalho").delete().eq("id", id).eq("petshop_id", lojaId).select("id");
  if (!data?.length) throw new Error(SEM_PERMISSAO.mensagem);
  revalidarLoja(lojaId);
}
