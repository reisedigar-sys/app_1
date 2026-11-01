import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { type DadosConta, ErroProvedor, type ProvedorPagamento, ProvedorTeste, pagamentosDeTestePermitidos, provedorPagamento } from "./provedor";

// Passos que falam com o provedor de pagamento. Cada um parte do estado gravado no banco e é seguro repetir:
// quem decide se pode (papel, valor, prazo) foram as funções SQL chamadas antes pelo usuário.

export class ErroPagamento extends Error {}

/** Provedor da conta já aberta: a conta de teste continua no Pix simulado mesmo depois de a chave do Asaas existir. */
function provedorDaConta(nome: string): ProvedorPagamento {
  if (nome === "teste") {
    if (!pagamentosDeTestePermitidos()) throw new ErroPagamento("Esta conta é de teste e não recebe Pix de verdade.");
    return new ProvedorTeste();
  }
  const p = provedorPagamento();
  if (!p || p.nome !== "asaas") throw new ErroPagamento("Os pagamentos ainda não estão configurados.");
  return p;
}

async function chaveDaConta(lojaId: string) {
  const { data, error } = await createAdminClient().rpc("chave_conta_pagamento", { p_petshop_id: lojaId });
  if (error || !data) throw new ErroPagamento("Conta de recebimento sem chave. Fale com o suporte.");
  return data;
}

/** Cria a subconta da loja no provedor com os dados já gravados por solicitar_conta_pagamento. */
export async function abrirConta(lojaId: string) {
  const admin = createAdminClient();
  const { data: conta } = await admin.from("petshop_pagamento").select("conta_id, dados_conta").eq("petshop_id", lojaId).single();
  if (!conta) throw new ErroPagamento("Preencha os dados da conta.");
  if (conta.conta_id) return;
  const provedor = provedorPagamento();
  if (!provedor) throw new ErroPagamento("Os pagamentos ainda não estão configurados.");
  try {
    const criada = await provedor.abrirConta(conta.dados_conta as unknown as DadosConta);
    const { error } = await admin.rpc("registrar_conta_pagamento", {
      p_petshop_id: lojaId,
      p_provedor: provedor.nome,
      p_conta_id: criada.contaId,
      p_wallet_id: criada.walletId,
      p_api_key: criada.apiKey,
      p_pix_chave: criada.pixChave ?? undefined,
      p_situacao: criada.situacao,
      p_documentos_url: criada.documentosUrl ?? undefined,
    });
    if (error) throw error;
  } catch (e) {
    const motivo = e instanceof ErroProvedor ? e.message : "Não foi possível abrir a conta agora. Tente de novo.";
    if (!(e instanceof ErroProvedor)) console.error(e);
    await admin.from("petshop_pagamento").update({ erro: motivo.slice(0, 500) }).eq("petshop_id", lojaId);
    throw new ErroPagamento(motivo);
  }
}

/** Consulta a situação da conta no provedor (aprovação, documentos pendentes, chave Pix). */
export async function atualizarConta(lojaId: string) {
  const admin = createAdminClient();
  const { data: conta } = await admin.from("petshop_pagamento").select("provedor, conta_id, pix_chave").eq("petshop_id", lojaId).single();
  if (!conta?.conta_id) return;
  const provedor = provedorDaConta(conta.provedor);
  const s = await provedor.situacaoConta(await chaveDaConta(lojaId), conta.pix_chave);
  await admin.rpc("atualizar_conta_pagamento", {
    p_petshop_id: lojaId,
    p_situacao: s.situacao,
    p_pix_chave: s.pixChave ?? undefined,
    p_documentos_url: s.documentosUrl ?? undefined,
  });
}

export type Pix = {
  id: string;
  status: "aguardando" | "pago" | "expirado" | "cancelado" | "devolver";
  valorCentavos: number;
  expiraEm: string;
  payload: string | null;
  imagem: string | null;
  teste: boolean;
};

/**
 * QR Code do sinal. Quem chama já conferiu que o pagamento é do usuário (leitura com RLS); aqui o QR é criado uma vez
 * só, com validade até o fim do prazo de pagamento.
 */
export async function qrDoPagamento(pagamentoId: string): Promise<Pix> {
  const admin = createAdminClient();
  const { data: p } = await admin
    .from("pagamento")
    .select("id, petshop_id, status, valor_centavos, expira_em, provedor, qr_id, qr_payload, qr_imagem, petshop(nome)")
    .eq("id", pagamentoId)
    .single();
  if (!p) throw new ErroPagamento("Pagamento não encontrado.");
  const pix = (q: { payload: string | null; imagem: string | null }): Pix => ({
    id: p.id,
    status: p.status,
    valorCentavos: p.valor_centavos,
    expiraEm: p.expira_em,
    teste: p.provedor === "teste",
    ...q,
  });
  const segundos = Math.floor((new Date(p.expira_em).getTime() - Date.now()) / 1000);
  if (p.qr_id || p.status !== "aguardando" || segundos < 60) return pix({ payload: p.qr_payload, imagem: p.qr_imagem });

  const { data: conta } = await admin.from("petshop_pagamento").select("pix_chave").eq("petshop_id", p.petshop_id).single();
  if (!conta?.pix_chave) throw new ErroPagamento("A loja ainda não pode receber Pix. Fale com a loja.");
  const qr = await provedorDaConta(p.provedor).criarQr(await chaveDaConta(p.petshop_id), {
    pixChave: conta.pix_chave,
    valorCentavos: p.valor_centavos,
    expiraSegundos: segundos,
    descricao: `Sinal ${p.petshop?.nome ?? ""}`.trim(),
    referencia: p.id,
  });
  await admin.rpc("registrar_qr_pagamento", { p_pagamento_id: p.id, p_qr_id: qr.id, p_payload: qr.payload, p_imagem: qr.imagem });
  // Duas abas ao mesmo tempo: vale o QR que foi gravado primeiro.
  const { data: gravado } = await admin.from("pagamento").select("qr_payload, qr_imagem").eq("id", p.id).single();
  return pix({ payload: gravado?.qr_payload ?? qr.payload, imagem: gravado?.qr_imagem ?? qr.imagem });
}

/** Pix simulado: faz o papel do webhook do Asaas. Só para pagamentos de teste, onde o Pix de teste é permitido. */
export async function simularPagamento(pagamentoId: string) {
  if (!pagamentosDeTestePermitidos()) throw new ErroPagamento("Simulação desligada neste ambiente.");
  const admin = createAdminClient();
  const { data: p } = await admin.from("pagamento").select("provedor, qr_id").eq("id", pagamentoId).single();
  if (!p || p.provedor !== "teste" || !p.qr_id) throw new ErroPagamento("Só dá para simular um Pix de teste.");
  const { error } = await admin.rpc("pagamento_webhook", {
    p_evento: { id: `teste-${crypto.randomUUID()}`, event: "PAYMENT_RECEIVED", payment: { id: `teste-${pagamentoId}`, pixQrCodeId: p.qr_id } },
  });
  if (error) throw error;
}
