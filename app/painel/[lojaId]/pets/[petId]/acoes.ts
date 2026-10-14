"use server";

import { z } from "zod";
import { SEM_PERMISSAO, iniciarAcao, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import type { Estado } from "@/lib/painel/estado";

const observacoes = z.string().trim().max(2000);

/** Observações da loja sobre o pet (pet_petshop): o RLS só deixa a equipe de operação gravar. */
export async function salvarObservacoesPet(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const petId = z.guid().parse(form.get("pet_id"));
  const texto = observacoes.parse(form.get("observacoes") ?? "");
  const { data, error } = await supabase
    .from("pet_petshop")
    .upsert({ petshop_id: lojaId, pet_id: petId, observacoes: texto || null, atualizado_em: new Date().toISOString() })
    .select("pet_id");
  if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  if (!data.length) return SEM_PERMISSAO;
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Observações salvas." };
}

export async function salvarObservacoesTutor(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const tutorId = z.guid().parse(form.get("tutor_id"));
  const texto = observacoes.parse(form.get("observacoes") ?? "");
  const { data, error } = await supabase
    .from("tutor_petshop")
    .update({ observacoes: texto || null })
    .eq("petshop_id", lojaId)
    .eq("tutor_id", tutorId)
    .select("tutor_id");
  if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  if (!data.length) return SEM_PERMISSAO;
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Observações salvas." };
}
