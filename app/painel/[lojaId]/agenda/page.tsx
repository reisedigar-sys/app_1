import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Aviso, BotaoLink, Carregando, Vazio } from "@/components/ui";
import {
  COR_STATUS,
  FILTROS_STATUS,
  type FiltroStatus,
  NOME_STATUS,
  dataNoFuso,
  diaCurto,
  diaPorExtenso,
  ehData,
  faixaDoDia,
  horaNoFuso,
  inicioDaSemana,
  minutosNoFuso,
  passaNoFiltro,
  somarDias,
} from "@/lib/painel/agenda";
import { lerPeriodo } from "@/lib/painel/periodo";
import { exigirLoja, exigirUsuario, podeOperar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { AoVivo } from "./ao-vivo";
import { Filtros } from "./filtros";

export const metadata: Metadata = { title: "Agenda" };

type Busca = Record<string, string | string[] | undefined>;

export default function AgendaPage({ params, searchParams }: PageProps<"/painel/[lojaId]/agenda">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const PIXELS_POR_MINUTO = 1.4;

async function Conteudo({ params, searchParams }: { params: Promise<{ lojaId: string }>; searchParams: Promise<Busca> }) {
  const { lojaId } = await params;
  const busca = await searchParams;
  const { loja, papel } = await exigirLoja(lojaId);
  const usuario = await exigirUsuario();
  const supabase = await createClient();

  const hoje = dataNoFuso(new Date(), loja.fuso);
  const data = ehData(busca.data) ? busca.data : hoje;
  const visao = busca.visao === "semana" ? "semana" : "dia";
  const filtroStatus: FiltroStatus = FILTROS_STATUS.includes(busca.status as FiltroStatus) ? (busca.status as FiltroStatus) : "ativos";
  const de = visao === "semana" ? inicioDaSemana(data) : data;
  const ate = visao === "semana" ? somarDias(de, 6) : data;
  const operacao = podeOperar(papel);

  const [agenda, profs, membro, horarios, bloqueios] = await Promise.all([
    supabase.rpc("agenda_loja", { p_petshop_id: lojaId, p_de: de, p_ate: ate }),
    supabase.from("profissional").select("id, nome").eq("petshop_id", lojaId).eq("ativo", true).order("ordem").order("nome"),
    supabase.from("petshop_membro").select("profissional_id").eq("petshop_id", lojaId).eq("user_id", usuario.id).maybeSingle(),
    supabase.from("horario_trabalho").select("profissional_id, dia_semana, inicio, fim").eq("petshop_id", lojaId),
    supabase
      .from("bloqueio")
      .select("id, profissional_id, tipo, periodo, motivo")
      .eq("petshop_id", lojaId)
      .filter("periodo", "ov", `[${de}T00:00:00Z,${somarDias(ate, 2)}T00:00:00Z)`),
  ]);
  if (agenda.error || profs.error) return <Aviso tipo="erro">Não foi possível carregar a agenda.</Aviso>;

  // Profissional sem papel de operação: só a própria coluna (o RLS já só devolve os atendimentos dela).
  const proprio = !operacao ? membro.data?.profissional_id : null;
  const filtroProf = typeof busca.prof === "string" ? busca.prof : "";
  const colunas = profs.data.filter((p) => (proprio ? p.id === proprio : !filtroProf || p.id === filtroProf));
  const itens = agenda.data.filter((a) => passaNoFiltro(a.status, filtroStatus) && colunas.some((c) => c.id === a.profissional_id));
  const aConfirmar = itens.filter((a) => a.status === "agendado" && new Date(a.inicio) > new Date()).length;
  const semConfirmacao = itens.filter((a) => a.status === "agendado" && a.sem_confirmacao_em && new Date(a.inicio) > new Date()).length;

  const base = `/painel/${lojaId}/agenda`;
  const link = (p: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ data, visao, prof: filtroProf, status: filtroStatus === "ativos" ? "" : filtroStatus, ...p })) if (v) q.set(k, v);
    return `${base}?${q}`;
  };
  const passo = visao === "semana" ? 7 : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold first-letter:uppercase">
            {visao === "dia" ? diaPorExtenso(data) : `Semana de ${diaCurto(de)} a ${diaCurto(ate)}`}
          </h1>
          <p className="flex items-center gap-3 text-sm text-neutral-500">
            <span>
              {itens.filter((a) => a.status !== "cancelado").length} atendimento(s)
              {aConfirmar > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-amber-700 dark:text-amber-400">{aConfirmar} a confirmar</span>
                </>
              )}
              {semConfirmacao > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-red-700 dark:text-red-400">{semConfirmacao} sem confirmação no prazo</span>
                </>
              )}
            </span>
            <AoVivo lojaId={lojaId} />
          </p>
        </div>
        {operacao && <BotaoLink href={`${base}/novo?data=${data}`}>Novo atendimento</BotaoLink>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Período" className="flex items-center gap-1">
          <Link className="flex min-h-10 items-center rounded-lg border border-neutral-300 px-3 text-sm dark:border-neutral-700" href={link({ data: somarDias(data, -passo) })} aria-label="Anterior">
            ‹
          </Link>
          <Link className="flex min-h-10 items-center rounded-lg border border-neutral-300 px-3 text-sm dark:border-neutral-700" href={link({ data: hoje })}>
            Hoje
          </Link>
          <Link className="flex min-h-10 items-center rounded-lg border border-neutral-300 px-3 text-sm dark:border-neutral-700" href={link({ data: somarDias(data, passo) })} aria-label="Próximo">
            ›
          </Link>
        </nav>
        <div className="flex rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700" role="group" aria-label="Visão">
          {(["dia", "semana"] as const).map((v) => (
            <Link
              key={v}
              href={link({ visao: v })}
              aria-current={visao === v ? "page" : undefined}
              className="flex min-h-9 items-center rounded-md px-3 text-sm aria-[current=page]:bg-marca-700 aria-[current=page]:text-white"
            >
              {v === "dia" ? "Dia" : "Semana"}
            </Link>
          ))}
        </div>
        <Filtros profissionais={profs.data} mostrarProfissional={!proprio} />
      </div>

      {colunas.length === 0 ? (
        <Vazio>Nenhum profissional ativo para mostrar.</Vazio>
      ) : visao === "dia" ? (
        <AgendaDia
          lojaId={lojaId}
          fuso={loja.fuso}
          data={data}
          hoje={hoje}
          colunas={colunas}
          itens={itens}
          horarios={(horarios.data ?? []).filter((h) => h.dia_semana === new Date(`${data}T12:00:00Z`).getUTCDay())}
          bloqueios={(bloqueios.data ?? []).map((b) => ({ ...b, ...lerPeriodo(b.periodo as string) }))}
        />
      ) : (
        <AgendaSemana lojaId={lojaId} fuso={loja.fuso} de={de} hoje={hoje} colunas={colunas} itens={itens} linkDia={(d) => link({ data: d, visao: "dia" })} />
      )}
    </div>
  );
}

type Item = {
  id: string;
  status: keyof typeof NOME_STATUS;
  inicio: string;
  fim: string;
  ocupado_ate: string;
  encaixe: boolean;
  profissional_id: string;
  pet_nome: string | null;
  tutor_nome: string | null;
  servicos: string[] | null;
  tutor_faltas: number | null;
  sem_confirmacao_em: string | null;
};

function minutosHora(h: string) {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}

function AgendaDia({
  lojaId,
  fuso,
  data,
  hoje,
  colunas,
  itens,
  horarios,
  bloqueios,
}: {
  lojaId: string;
  fuso: string;
  data: string;
  hoje: string;
  colunas: { id: string; nome: string }[];
  itens: Item[];
  horarios: { profissional_id: string; inicio: string; fim: string }[];
  bloqueios: { id: string; profissional_id: string | null; tipo: string; motivo: string | null; inicio: Date; fim: Date }[];
}) {
  // Partes de um instante que caem neste dia, em minutos locais (bloqueios podem atravessar dias).
  const noDia = (inicio: Date | string, fim: Date | string) => {
    const di = dataNoFuso(inicio, fuso);
    const df = dataNoFuso(new Date(new Date(fim).getTime() - 1), fuso);
    if (di > data || df < data) return null;
    return { inicio: di < data ? 0 : minutosNoFuso(inicio, fuso), fim: df > data ? 24 * 60 : minutosNoFuso(fim, fuso) || 24 * 60 };
  };
  const faixa = faixaDoDia([
    ...horarios.map((h) => ({ inicio: minutosHora(h.inicio), fim: minutosHora(h.fim) })),
    ...itens.map((a) => noDia(a.inicio, a.fim)).filter((x) => x !== null),
  ]);
  const altura = (faixa.fim - faixa.inicio) * PIXELS_POR_MINUTO;
  const y = (min: number) => (Math.min(Math.max(min, faixa.inicio), faixa.fim) - faixa.inicio) * PIXELS_POR_MINUTO;
  const horas: number[] = [];
  for (let m = faixa.inicio; m < faixa.fim; m += 60) horas.push(m);
  const agora = data === hoje ? minutosNoFuso(new Date(), fuso) : null;

  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <div className="flex min-w-fit gap-2" style={{ minWidth: `${3 + colunas.length * 11}rem` }}>
        <div className="w-10 shrink-0 pt-8" aria-hidden>
          <div className="relative" style={{ height: altura }}>
            {horas.map((m) => (
              <span key={m} className="absolute -translate-y-2 text-xs text-neutral-400" style={{ top: y(m) }}>
                {String(m / 60).padStart(2, "0")}h
              </span>
            ))}
          </div>
        </div>
        {colunas.map((c) => {
          const daColuna = itens.filter((a) => a.profissional_id === c.id);
          const janelas = horarios.filter((h) => h.profissional_id === c.id).map((h) => ({ inicio: minutosHora(h.inicio), fim: minutosHora(h.fim) }));
          return (
            <section key={c.id} aria-label={`Agenda de ${c.nome}`} className="min-w-40 flex-1">
              <h2 className="mb-2 h-6 truncate text-sm font-semibold">{c.nome}</h2>
              <div className="relative rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900" style={{ height: altura }}>
                {janelas.map((j, i) => (
                  <div key={i} aria-hidden className="absolute inset-x-0 bg-white dark:bg-neutral-950" style={{ top: y(j.inicio), height: y(j.fim) - y(j.inicio) }} />
                ))}
                {horas.map((m) => (
                  <div key={m} aria-hidden className="absolute inset-x-0 border-t border-neutral-200/70 dark:border-neutral-800/70" style={{ top: y(m) }} />
                ))}
                {bloqueios
                  .filter((b) => b.profissional_id === null || b.profissional_id === c.id)
                  .map((b) => {
                    const p = noDia(b.inicio, b.fim);
                    if (!p) return null;
                    return (
                      <div
                        key={b.id}
                        className="absolute inset-x-0 flex items-start justify-center bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgb(0_0_0/0.06)_6px,rgb(0_0_0/0.06)_12px)] pt-1 text-xs text-neutral-500"
                        style={{ top: y(p.inicio), height: Math.max(y(p.fim) - y(p.inicio), 2) }}
                      >
                        {b.motivo ?? "Bloqueado"}
                      </div>
                    );
                  })}
                {agora !== null && agora >= faixa.inicio && agora <= faixa.fim && (
                  <div aria-hidden className="absolute inset-x-0 z-10 border-t-2 border-red-500" style={{ top: y(agora) }} />
                )}
                <ol className="contents">
                  {daColuna.map((a) => {
                    const p = noDia(a.inicio, a.fim)!;
                    const buffer = noDia(a.fim, a.ocupado_ate);
                    return (
                      <li key={a.id}>
                        {buffer && a.status !== "cancelado" && a.status !== "faltou" && (
                          <div aria-hidden className="absolute inset-x-1 rounded-b bg-neutral-300/40 dark:bg-neutral-700/40" style={{ top: y(buffer.inicio), height: y(buffer.fim) - y(buffer.inicio) }} />
                        )}
                        <Link
                          href={`/painel/${lojaId}/agenda/${a.id}`}
                          className={`absolute inset-x-1 overflow-hidden rounded-md border-l-4 px-2 py-1 text-xs shadow-sm hover:z-20 hover:min-h-fit ${COR_STATUS[a.status]} ${a.status === "cancelado" ? "opacity-60" : ""}`}
                          style={{ top: y(p.inicio), height: Math.max(y(p.fim) - y(p.inicio), 22) }}
                        >
                          <CartaoAtendimento a={a} fuso={fuso} />
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CartaoAtendimento({ a, fuso }: { a: Item; fuso: string }) {
  return (
    <>
      <span className="flex items-center justify-between gap-1">
        <span className="font-semibold">
          {horaNoFuso(a.inicio, fuso)}–{horaNoFuso(a.fim, fuso)} {a.pet_nome}
        </span>
        {a.encaixe && <span className="rounded bg-black/10 px-1 text-[10px] uppercase">encaixe</span>}
        {a.status === "agendado" && a.sem_confirmacao_em && <span className="rounded bg-red-600 px-1 text-[10px] uppercase text-white">sem confirmação</span>}
      </span>
      <span className="block truncate">{(a.servicos ?? []).join(" + ")}</span>
      <span className="block truncate opacity-80">
        {a.tutor_nome}
        {(a.tutor_faltas ?? 0) > 0 && ` · ${a.tutor_faltas} falta(s)`}
      </span>
      <span className="block font-medium">{NOME_STATUS[a.status]}</span>
    </>
  );
}

function AgendaSemana({
  lojaId,
  fuso,
  de,
  hoje,
  colunas,
  itens,
  linkDia,
}: {
  lojaId: string;
  fuso: string;
  de: string;
  hoje: string;
  colunas: { id: string; nome: string }[];
  itens: Item[];
  linkDia: (d: string) => string;
}) {
  const dias = Array.from({ length: 7 }, (_, i) => somarDias(de, i));
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[56rem] table-fixed border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="w-24" />
            {dias.map((d) => (
              <th key={d} scope="col" className={`rounded-md py-1 font-medium ${d === hoje ? "bg-marca-700 text-white" : ""}`}>
                <Link href={linkDia(d)} className="capitalize hover:underline">
                  {diaCurto(d)}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {colunas.map((c) => (
            <tr key={c.id}>
              <th scope="row" className="truncate text-left align-top text-sm font-semibold">
                {c.nome}
              </th>
              {dias.map((d) => {
                const doDia = itens.filter((a) => a.profissional_id === c.id && dataNoFuso(a.inicio, fuso) === d);
                return (
                  <td key={d} className="rounded-md bg-white p-1 align-top dark:bg-neutral-950">
                    <ul className="flex flex-col gap-1">
                      {doDia.map((a) => (
                        <li key={a.id}>
                          <Link href={`/painel/${lojaId}/agenda/${a.id}`} className={`block rounded border-l-4 px-1.5 py-1 ${COR_STATUS[a.status]}`}>
                            <span className="font-semibold">{horaNoFuso(a.inicio, fuso)}</span> {a.pet_nome}
                            <span className="sr-only"> · {NOME_STATUS[a.status]}</span>
                            {a.status === "agendado" && <span aria-hidden> · {a.sem_confirmacao_em ? "sem confirmação" : "a confirmar"}</span>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
