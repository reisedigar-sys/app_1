import type { Metadata } from "next";
import { Suspense } from "react";
import { Aviso, Cartao, Carregando, Titulo } from "@/components/ui";
import { provedorPagamento } from "@/lib/pagamentos/provedor";
import { exigirLoja, podeConfigurar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { FormConta, FormSinal, FormSituacao } from "./formularios";

export const metadata: Metadata = { title: "Pagamentos" };

const SITUACAO = {
  pendente: { tipo: "alerta", texto: "Falta enviar documentos para o Asaas aprovar a conta." },
  em_analise: { tipo: "info", texto: "Conta em análise no Asaas. Assim que for aprovada, você liga o sinal aqui." },
  aprovada: { tipo: "ok", texto: "Conta aprovada. O sinal cai direto nela." },
  recusada: { tipo: "erro", texto: "O Asaas recusou a conta. Confira os documentos no link abaixo ou fale com o suporte." },
} as const;

export default function PagamentosPage({ params }: PageProps<"/painel/[lojaId]/pagamentos">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params;
  const { loja, papel } = await exigirLoja(lojaId);
  if (!podeConfigurar(papel)) return <Aviso>Pagamentos ficam com o dono e a gerência.</Aviso>;
  const supabase = await createClient();
  const { data: conta } = await supabase.from("petshop_pagamento").select("*").eq("petshop_id", lojaId).maybeSingle();
  const disponivel = provedorPagamento() !== null || conta?.provedor === "teste";

  return (
    <>
      <Titulo>Pagamentos</Titulo>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">
        Cobre um sinal por Pix de quem agenda pelo app. O cliente paga na hora, o horário só fica garantido com o Pix e o dinheiro cai na conta
        da loja no Asaas, sem comissão do Salão do Pet. Cancelando até {loja.cancelamento_gratuito_horas} h antes, o sinal volta para o
        cliente; depois disso, fica com a loja.
      </p>

      {!conta?.conta_id ? (
        <Cartao>
          <h2 className="mb-1 font-medium">Abrir a conta de recebimento</h2>
          <p className="mb-4 text-sm text-neutral-500">
            Use os dados da empresa (ou o seu CPF, se a loja não tiver CNPJ). Depois, o Asaas pede os documentos por um link próprio.
          </p>
          {disponivel ? (
            <FormConta
              lojaId={lojaId}
              erro={conta?.erro ?? null}
              inicial={{
                cep: loja.cep ?? "",
                endereco: loja.logradouro ?? "",
                numero: loja.numero ?? "",
                bairro: loja.bairro ?? "",
                ...(conta?.dados_conta as Record<string, string> | undefined),
              }}
            />
          ) : (
            <Aviso>O recebimento por Pix ainda não está disponível. Avisaremos quando puder abrir a conta.</Aviso>
          )}
        </Cartao>
      ) : (
        <>
          <Cartao className="flex flex-col gap-3">
            <h2 className="font-medium">Conta de recebimento</h2>
            <Aviso tipo={SITUACAO[conta.situacao].tipo}>{SITUACAO[conta.situacao].texto}</Aviso>
            {conta.provedor === "teste" && <p className="text-xs text-neutral-500">Conta de teste: os Pix são simulados.</p>}
            {conta.situacao !== "aprovada" && conta.documentos_url && (
              <a
                href={conta.documentos_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-lg bg-marca-700 px-4 text-sm font-medium text-white"
              >
                Enviar documentos no Asaas
              </a>
            )}
            {conta.situacao === "aprovada" && !conta.pix_chave && <Aviso tipo="alerta">A conta ainda não tem chave Pix. Atualize a situação em alguns minutos.</Aviso>}
            {(conta.situacao !== "aprovada" || !conta.pix_chave) && <FormSituacao lojaId={lojaId} />}
          </Cartao>

          {conta.situacao === "aprovada" && (
            <Cartao className="mt-4">
              <h2 className="mb-1 font-medium">Sinal</h2>
              <p className="mb-4 text-sm text-neutral-500">
                O cliente tem 15 minutos para pagar; sem o Pix, o horário é liberado. No balcão e no telefone não há cobrança pelo app.
              </p>
              <FormSinal
                lojaId={lojaId}
                limiteFaltas={loja.limite_faltas}
                inicial={{
                  modo: conta.modo_sinal,
                  tipo: conta.sinal_tipo as "percentual" | "fixo",
                  percentual: String(Number(conta.sinal_percentual)).replace(".", ","),
                  fixo: conta.sinal_fixo_centavos ? (conta.sinal_fixo_centavos / 100).toFixed(2).replace(".", ",") : "",
                }}
              />
            </Cartao>
          )}
        </>
      )}
    </>
  );
}
