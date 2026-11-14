"use server";

import { z } from "zod";
import { SEM_PERMISSAO, iniciarAcao, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import { type Estado, errosDeValidacao } from "@/lib/painel/estado";

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida.");

const schema = z
  .object({
    dias: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Escolha pelo menos um dia."),
    abre: hora,
    fecha: hora,
  })
  .refine((d) => d.fecha > d.abre, { path: ["fecha"], message: "O fechamento precisa ser depois da abertura." });

export async function adicionarFaixa(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const dados = schema.safeParse({ dias: form.getAll("dias"), abre: form.get("abre"), fecha: form.get("fecha") });
  if (!dados.success) return errosDeValidacao(dados.error);
  const { dias, abre, fecha } = dados.data;

  // Um insert só: ou entram todos os dias, ou nenhum.
  const { data, error } = await supabase
    .from("horario_funcionamento")
    .insert(dias.map((dia_semana) => ({ petshop_id: lojaId, dia_semana, abre, fecha })))
    .select("id");
  if (error)
    return {
      ok: false,
      mensagem: mensagemDeErro(error, { sobreposto: "Esse horário se sobrepõe a outro já cadastrado num dos dias escolhidos." }),
    };
  if (!data?.length) return SEM_PERMISSAO;
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Horário adicionado." };
}

export async function removerFaixa(form: FormData) {
  const { supabase, lojaId } = await iniciarAcao(form);
  const id = z.guid().parse(form.get("id"));
  const { data } = await supabase.from("horario_funcionamento").delete().eq("id", id).eq("petshop_id", lojaId).select("id");
  if (!data?.length) throw new Error(SEM_PERMISSAO.mensagem);
  revalidarLoja(lojaId);
}

export async function usarHorarioDaEquipe(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const { data, error } = await supabase.rpc("copiar_horario_da_equipe", { p_petshop_id: lojaId });
  if (error) return error.code === "42501" ? SEM_PERMISSAO : { ok: false, mensagem: mensagemDeErro(error) };
  revalidarLoja(lojaId);
  return data
    ? { ok: true, mensagem: "Pronto: o horário da loja agora é o mesmo da equipe." }
    : { ok: true, mensagem: "A equipe ainda não tem horários. O horário da loja ficou vazio." };
}
