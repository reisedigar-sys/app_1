"use server";

import { z } from "zod";
import { SEM_PERMISSAO, iniciarAcao, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import { type Estado, errosDeValidacao } from "@/lib/painel/estado";
import { DIAS_SEMANA } from "@/lib/painel/formatos";

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
  // Depois de um erro, o formulário volta com o que foi escolhido (dias separados por vírgula).
  const enviados = {
    dias: form.getAll("dias").join(","),
    abre: String(form.get("abre") ?? ""),
    fecha: String(form.get("fecha") ?? ""),
  };
  const dados = schema.safeParse({ dias: form.getAll("dias"), abre: form.get("abre"), fecha: form.get("fecha") });
  if (!dados.success) return { ...errosDeValidacao(dados.error), valores: enviados };
  const { dias, abre, fecha } = dados.data;

  // Diz em quais dias há conflito (a constraint do banco continua sendo a garantia).
  const { data: existentes } = await supabase
    .from("horario_funcionamento")
    .select("dia_semana, abre, fecha")
    .eq("petshop_id", lojaId)
    .in("dia_semana", dias);
  const conflito = [
    ...new Set(
      (existentes ?? [])
        .filter((f) => abre < f.fecha.slice(0, 5) && fecha > f.abre.slice(0, 5))
        .map((f) => f.dia_semana),
    ),
  ];
  if (conflito.length)
    return {
      ok: false,
      mensagem: `Já existe horário que se sobrepõe a esse em: ${conflito
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map((d) => DIAS_SEMANA[d])
        .join(", ")}.`,
      valores: enviados,
    };

  // Um insert só: ou entram todos os dias, ou nenhum.
  const { data, error } = await supabase
    .from("horario_funcionamento")
    .insert(dias.map((dia_semana) => ({ petshop_id: lojaId, dia_semana, abre, fecha })))
    .select("id");
  if (error)
    return {
      ok: false,
      mensagem: mensagemDeErro(error, {
        sobreposto: "Esse horário se sobrepõe a outro já cadastrado num dos dias escolhidos.",
      }),
      valores: enviados,
    };
  if (!data?.length) return SEM_PERMISSAO;
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Horário adicionado." };
}

export async function removerFaixa(form: FormData) {
  const { supabase, lojaId } = await iniciarAcao(form);
  const id = z.guid().parse(form.get("id"));
  const { data } = await supabase
    .from("horario_funcionamento")
    .delete()
    .eq("id", id)
    .eq("petshop_id", lojaId)
    .select("id");
  if (!data?.length) throw new Error(SEM_PERMISSAO.mensagem);
  revalidarLoja(lojaId);
}

export async function usarHorarioDaEquipe(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  if (form.get("confirmar") !== "on")
    return { ok: false, mensagem: "Marque a confirmação: isso substitui o horário cadastrado." };
  const { data, error } = await supabase.rpc("copiar_horario_da_equipe", { p_petshop_id: lojaId });
  if (error) return error.code === "42501" ? SEM_PERMISSAO : { ok: false, mensagem: mensagemDeErro(error) };
  revalidarLoja(lojaId);
  return data
    ? { ok: true, mensagem: "Pronto: o horário da loja agora é o mesmo da equipe." }
    : { ok: true, mensagem: "A equipe ainda não tem horários. O horário da loja ficou vazio." };
}
