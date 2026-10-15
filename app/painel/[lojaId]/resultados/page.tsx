import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Aviso, Cartao, Carregando } from "@/components/ui";
import { NOME_CANAL, dataNoFuso } from "@/lib/painel/agenda";
import { formatarReais } from "@/lib/painel/formatos";
import { type Resultados, ehMes, faltasEvitadas, horas, nomeDoMes, percentual, somarMeses } from "@/lib/painel/resultados";
import { exigirLoja, podeConfigurar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { FaltasAntes } from "./formulario";

export const metadata: Metadata = { title: "Resultados" };

export default function ResultadosPage({ params, searchParams }: PageProps<"/painel/[lojaId]/resultados">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: { params: Promise<{ lojaId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ lojaId }, busca] = await Promise.all([params, searchParams]);
  const { loja, papel } = await exigirLoja(lojaId);
  if (!podeConfigurar(papel)) return <Aviso>Os resultados da loja ficam com o dono e a gerência.</Aviso>;
  const atual = dataNoFuso(new Date(), loja.fuso).slice(0, 7);
  const mes = ehMes(busca.mes) && busca.mes <= atual ? busca.mes : atual;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resultados_do_mes", { p_petshop_id: lojaId, p_mes: `${mes}-01` });
  if (error || !data) return <Aviso tipo="erro">Não foi possível carregar os resultados.</Aviso>;
  const r = data as unknown as Resultados;

  const base = `/painel/${lojaId}/resultados`;
  const realizados = r.concluidos + r.faltas;
  const taxaFaltas = percentual(r.faltas, realizados);
  const evitadas = faltasEvitadas(r.faltas_antes_pct, r.concluidos, r.faltas);
  const canais = Object.entries(r.por_canal).sort((a, b) => b[1] - a[1]) as [keyof typeof NOME_CANAL, number][];
  const totalCanais = canais.reduce((s, [, n]) => s + n, 0);
  const mesAtual = mes === atual;

  const numeros = [
    { rotulo: "Atendimentos concluídos", valor: String(r.concluidos), detalhe: r.a_realizar > 0 ? `+ ${r.a_realizar} a realizar` : undefined },
    { rotulo: "Faltas", valor: String(r.faltas), detalhe: taxaFaltas !== null ? `${taxaFaltas}% dos atendimentos` : undefined },
    { rotulo: "Confirmados pelo cliente", valor: `${percentual(r.pedidos_confirmados, r.pedidos) ?? 0}%`, detalhe: `${r.pedidos_confirmados} de ${r.pedidos} pedidos` },
    { rotulo: "Cancelamentos", valor: String(r.cancelados) },
    { rotulo: "Faturado", valor: formatarReais(r.faturado_centavos), detalhe: r.previsto_centavos > 0 ? `+ ${formatarReais(r.previsto_centavos)} previsto` : undefined },
    { rotulo: "Clientes", valor: String(r.clientes_atendidos), detalhe: `${r.clientes_novos} novo(s) no mês` },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold first-letter:uppercase">Resultados de {nomeDoMes(mes)}</h1>
        <nav aria-label="Mês" className="flex items-center gap-1">
          <Link className="flex min-h-10 items-center rounded-lg border border-neutral-300 px-3 text-sm dark:border-neutral-700" href={`${base}?mes=${somarMeses(mes, -1)}`} aria-label="Mês anterior">
            ‹
          </Link>
          {!mesAtual && (
            <>
              <Link className="flex min-h-10 items-center rounded-lg border border-neutral-300 px-3 text-sm dark:border-neutral-700" href={base}>
                Este mês
              </Link>
              <Link className="flex min-h-10 items-center rounded-lg border border-neutral-300 px-3 text-sm dark:border-neutral-700" href={`${base}?mes=${somarMeses(mes, 1)}`} aria-label="Próximo mês">
                ›
              </Link>
            </>
          )}
        </nav>
      </div>

      <Cartao className="border-marca-200 bg-marca-50 dark:border-marca-900 dark:bg-marca-950">
        <h2 className="text-sm font-medium text-marca-800 dark:text-marca-300">Faltas evitadas (estimativa)</h2>
        {evitadas !== null ? (
          <>
            <p className="font-titulo text-4xl font-semibold text-marca-700 dark:text-marca-400">{evitadas}</p>
            <p className="mt-1 text-sm text-neutral-700 dark:text-neutral-300">
              Antes, {String(r.faltas_antes_pct).replace(".", ",")}% dos clientes faltavam. Neste mês, {taxaFaltas}% faltaram em {realizados} atendimento(s).
            </p>
          </>
        ) : r.faltas_antes_pct === null ? (
          <p className="mt-1 text-sm">Informe abaixo quantas faltas a loja tinha antes para ver a estimativa.</p>
        ) : (
          <p className="mt-1 text-sm">A estimativa aparece quando houver atendimentos concluídos neste mês.</p>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          É uma estimativa: compara a taxa de faltas de antes, informada pela loja, com a deste mês.
        </p>
      </Cartao>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {numeros.map((n) => (
          <div key={n.rotulo} className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
            <dt className="text-xs text-neutral-500">{n.rotulo}</dt>
            <dd className="text-xl font-semibold">{n.valor}</dd>
            {n.detalhe && <dd className="text-xs text-neutral-500">{n.detalhe}</dd>}
          </div>
        ))}
      </dl>

      <Cartao>
        <h2 className="mb-2 font-medium">Ocupação dos profissionais</h2>
        {r.ocupacao.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum profissional ativo.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900">
            {r.ocupacao.map((o) => (
              <li key={o.profissional_id} className="flex items-center justify-between gap-2 py-2">
                <span className="font-medium">{o.nome}</span>
                <span className="text-neutral-600 dark:text-neutral-400">
                  {o.minutos_disponiveis > 0 ? (
                    <>
                      <strong className="text-neutral-900 dark:text-neutral-100">{percentual(o.minutos_ocupados, o.minutos_disponiveis)}%</strong> ·{" "}
                      {horas(o.minutos_ocupados)} de {horas(o.minutos_disponiveis)}
                    </>
                  ) : (
                    "sem horário no mês"
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-neutral-500">Horas agendadas sobre as horas de trabalho do mês, já sem folgas e bloqueios.</p>
      </Cartao>

      <Cartao>
        <h2 className="mb-2 font-medium">De onde vieram os agendamentos</h2>
        {totalCanais === 0 ? (
          <p className="text-sm text-neutral-500">Nenhum agendamento neste mês.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-100 text-sm dark:divide-neutral-900">
            {canais.map(([canal, n]) => (
              <li key={canal} className="flex justify-between gap-2 py-2">
                <span>{NOME_CANAL[canal]}</span>
                <span className="text-neutral-600 dark:text-neutral-400">
                  <strong className="text-neutral-900 dark:text-neutral-100">{n}</strong> · {percentual(n, totalCanais)}%
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Mensagens enviadas no mês: {r.mensagens.whatsapp} pelo WhatsApp e {r.mensagens.push} avisos no celular.
        </p>
      </Cartao>

      <Cartao>
        <h2 className="mb-2 font-medium">Referência de faltas</h2>
        <FaltasAntes lojaId={lojaId} valor={r.faltas_antes_pct} />
      </Cartao>
    </div>
  );
}
