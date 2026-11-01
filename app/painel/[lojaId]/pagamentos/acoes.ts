"use server";

import { SEM_PERMISSAO, iniciarAcao, revalidarLoja } from "@/lib/painel/acao";
import { mensagemDeErro } from "@/lib/painel/erros";
import { type Estado, dadosDoForm, errosDeValidacao } from "@/lib/painel/estado";
import { contaSchema, sinalSchema } from "@/lib/pagamentos/conta";
import { ErroPagamento, abrirConta, atualizarConta } from "@/lib/pagamentos/servico";

/** Dono ou gerente informa os dados (o banco confere o papel) e o servidor abre a subconta no provedor. */
export async function abrirContaPagamento(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const enviados = dadosDoForm(form);
  const r = contaSchema.safeParse(enviados);
  if (!r.success) return { ...errosDeValidacao(r.error), valores: enviados };
  const { error } = await supabase.rpc("solicitar_conta_pagamento", { p_petshop_id: lojaId, p_dados: r.data });
  if (error) return error.code === "42501" ? SEM_PERMISSAO : { ok: false, mensagem: mensagemDeErro(error), valores: enviados };
  try {
    await abrirConta(lojaId);
  } catch (e) {
    revalidarLoja(lojaId);
    return { ok: false, mensagem: e instanceof ErroPagamento ? e.message : "Não foi possível abrir a conta agora. Tente de novo.", valores: enviados };
  }
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Conta de recebimento criada." };
}

/** Consulta de novo a aprovação da conta. Só quem enxerga a conta (dono ou gerente, pelo RLS) pode pedir. */
export async function atualizarSituacaoConta(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const { data } = await supabase.from("petshop_pagamento").select("petshop_id").eq("petshop_id", lojaId);
  if (!data?.length) return SEM_PERMISSAO;
  try {
    await atualizarConta(lojaId);
  } catch (e) {
    console.error(e);
    return { ok: false, mensagem: e instanceof ErroPagamento ? e.message : "Não foi possível consultar agora. Tente de novo." };
  }
  revalidarLoja(lojaId);
  return { ok: true, mensagem: "Situação atualizada." };
}

export async function salvarSinal(_: Estado, form: FormData): Promise<Estado> {
  const { supabase, lojaId } = await iniciarAcao(form);
  const r = sinalSchema.safeParse(dadosDoForm(form));
  if (!r.success) return errosDeValidacao(r.error);
  const { error } = await supabase.rpc("configurar_sinal", {
    p_petshop_id: lojaId,
    p_modo: r.data.modo,
    p_tipo: r.data.tipo,
    p_percentual: r.data.percentual ?? undefined,
    p_fixo_centavos: r.data.fixoCentavos ?? undefined,
  });
  if (error) return error.code === "42501" ? SEM_PERMISSAO : { ok: false, mensagem: mensagemDeErro(error) };
  revalidarLoja(lojaId);
  return { ok: true, mensagem: r.data.modo === "nunca" ? "Sinal desligado." : "Sinal salvo. Vale para os próximos agendamentos pelo app." };
}
