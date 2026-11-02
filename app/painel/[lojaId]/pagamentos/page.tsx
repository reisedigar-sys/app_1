import type { Metadata } from "next";
import { Suspense } from "react";
import { Aviso, Cartao, Carregando, Titulo } from "@/components/ui";
import Link from "next/link";
import { provedorPagamento } from "@/lib/pagamentos/provedor";
import type { SituacaoSinal } from "@/lib/pagamentos/sinal";
import { dataNoFuso, horaNoFuso } from "@/lib/painel/agenda";
import { formatarReais } from "@/lib/painel/formatos";
import { ehMes, nomeDoMes, somarMeses } from "@/lib/painel/resultados";
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

export default function PagamentosPage({ params, searchParams }: PageProps<"/painel/[lojaId]/pagamentos">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: { params: Promise<{ lojaId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ lojaId }, busca] = await Promise.all([params, searchParams]);
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

          <SinaisDoMes lojaId={lojaId} fuso={loja.fuso} mesPedido={busca.mes} />
        </>
      )}
    </>
  );
}

const SITUACAO_SINAL: Partial<Record<SituacaoSinal, string>> = {
  pago: "Pago, atendimento a fazer",
  devolver: "Devolvendo",
  devolvido: "Devolvido",
  retido: "Retido",
  abatido: "Descontado no atendimento",
};

type Sinais = {
  recebidos_centavos: number;
  quantidade: number;
  devolvidos_centavos: number;
  retidos_centavos: number;
  abatidos_centavos: number;
  a_realizar_centavos: number;
  itens: { agendamento_id: string; pago_em: string; inicio: string; pet_nome: string | null; tutor_nome: string | null; valor_centavos: number; situacao: SituacaoSinal }[];
};

/** Pix de sinal recebidos no mês e o que aconteceu com cada um; devoluções que o Asaas recusou (fazer à mão). */
async function SinaisDoMes({ lojaId, fuso, mesPedido }: { lojaId: string; fuso: string; mesPedido: string | string[] | undefined }) {
  const atual = dataNoFuso(new Date(), fuso).slice(0, 7);
  const mes = ehMes(mesPedido) && mesPedido <= atual ? mesPedido : atual;
  const supabase = await createClient();
  const [{ data, error }, { data: falhas }] = await Promise.all([
    supabase.rpc("sinais_do_mes", { p_petshop_id: lojaId, p_mes: `${mes}-01` }),
    supabase.from("estorno").select("id, valor_centavos, erro, criado_em, agendamento_id").eq("petshop_id", lojaId).eq("status", "erro").order("criado_em", { ascending: false }).limit(20),
  ]);
  if (error || !data) return <Aviso tipo="erro">Não foi possível carregar os sinais do mês.</Aviso>;
  const r = data as unknown as Sinais;
  const base = `/painel/${lojaId}/pagamentos`;
  const dataCurta = (iso: string) => `${dataNoFuso(iso, fuso).slice(8, 10)}/${dataNoFuso(iso, fuso).slice(5, 7)}`;
  const numeros = [
    ["Recebidos", r.recebidos_centavos, `${r.quantidade} Pix`],
    ["Ficaram com a loja", r.retidos_centavos, "cancelamento fora do prazo ou falta"],
    ["Devolvidos", r.devolvidos_centavos, null],
    ["Descontados no atendimento", r.abatidos_centavos + r.a_realizar_centavos, r.a_realizar_centavos > 0 ? `${formatarReais(r.a_realizar_centavos)} de atendimentos a fazer` : null],
  ] as const;
  return (
    <>
      {(falhas ?? []).length > 0 && (
        <Aviso tipo="erro">
          <strong>Devoluções que o Asaas não fez:</strong>
          <ul className="mt-1 list-disc pl-5">
            {falhas!.map((f) => (
              <li key={f.id}>
                {formatarReais(f.valor_centavos)} em {dataCurta(f.criado_em)} ({f.erro}).{" "}
                {f.agendamento_id && (
                  <Link className="underline" href={`/painel/${lojaId}/agenda/${f.agendamento_id}`}>
                    Ver atendimento
                  </Link>
                )}
              </li>
            ))}
          </ul>
          Devolva pelo app do Asaas (Pix → transações → devolver).
        </Aviso>
      )}
      <Cartao className="mt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium first-letter:uppercase">Sinais de {nomeDoMes(mes)}</h2>
          <nav aria-label="Mês" className="flex items-center gap-1">
            <Link className="flex min-h-10 items-center rounded-lg border border-neutral-300 px-3 text-sm dark:border-neutral-700" href={`${base}?mes=${somarMeses(mes, -1)}`} aria-label="Mês anterior">
              ‹
            </Link>
            {mes < atual && (
              <Link className="flex min-h-10 items-center rounded-lg border border-neutral-300 px-3 text-sm dark:border-neutral-700" href={`${base}?mes=${somarMeses(mes, 1)}`} aria-label="Próximo mês">
                ›
              </Link>
            )}
          </nav>
        </div>
        {r.quantidade === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum sinal recebido neste mês.</p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3">
              {numeros.map(([rotulo, valor, detalhe]) => (
                <div key={rotulo} className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
                  <dt className="text-xs text-neutral-500">{rotulo}</dt>
                  <dd className="text-lg font-semibold">{formatarReais(valor)}</dd>
                  {detalhe && <dd className="text-xs text-neutral-500">{detalhe}</dd>}
                </div>
              ))}
            </dl>
            <ul className="mt-4 flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900">
              {r.itens.map((i) => (
                <li key={i.agendamento_id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/painel/${lojaId}/agenda/${i.agendamento_id}`} className="min-w-0">
                    <span className="block truncate font-medium">
                      {i.pet_nome} · {i.tutor_nome}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      Atendimento {dataCurta(i.inicio)} às {horaNoFuso(i.inicio, fuso)} · {SITUACAO_SINAL[i.situacao] ?? i.situacao}
                    </span>
                  </Link>
                  <span className="whitespace-nowrap">{formatarReais(i.valor_centavos)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Cartao>
    </>
  );
}
