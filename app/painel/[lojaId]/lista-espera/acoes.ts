"use server";

import { z } from "zod";
import { SEM_PERMISSAO, iniciarAcao, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import type { Estado } from "@/lib/painel/estado";

/** Tira alguém da fila (o cliente desistiu ou foi atendido por telefone). */
export async function removerDaFila(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const { data, error } = await supabase
    .from("lista_espera")
    .update({ status: "cancelado" })
    .eq("id", z.guid().parse(form.get("id")))
    .eq("petshop_id", lojaId)
    .in("status", ["aguardando", "notificado"])
    .select("id");
  if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  if (!data.length) return SEM_PERMISSAO;
  revalidarLoja(lojaId);
  return { ok: true };
}

/** Inclui um cliente da loja na fila (pelo balcão ou telefone). */
export async function incluirNaFila(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const dados = z
    .object({
      pet: z.guid("Escolha o pet."),
      servico: z.guid("Escolha o serviço."),
      data: z.iso.date("Informe o dia."),
      periodo: z.enum(["manha", "tarde", "qualquer"]),
    })
    .safeParse(Object.fromEntries(form));
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0].message };
  const { data: pet } = await supabase.from("pet").select("tutor_id").eq("id", dados.data.pet).maybeSingle();
  if (!pet) return { ok: false, mensagem: "Pet não encontrado." };
  const { error } = await supabase.rpc("entrar_lista_espera", {
    p_petshop_id: lojaId,
    p_tutor_id: pet.tutor_id,
    p_pet_id: dados.data.pet,
    p_servico_id: dados.data.servico,
    p_data: dados.data.data,
    p_periodo: dados.data.periodo,
  });
  if (error) return { ok: false, mensagem: mensagemDeErro(error) };
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Cliente incluído na lista de espera." };
}
