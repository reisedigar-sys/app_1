import type { Database } from "@/lib/supabase/database.types";

// Regras de exibição da agenda do painel. As regras de negócio (transições, conflito, permissões) ficam no banco
// (migração 008); aqui só se decide quais botões mostrar e onde desenhar cada atendimento.

export type Status = Database["public"]["Enums"]["status_agendamento"];
export type Canal = Database["public"]["Enums"]["canal_agendamento"];

export const NOME_STATUS: Record<Status, string> = {
  agendado: "A confirmar",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  pronto: "Pronto",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou: "Faltou",
};

export const COR_STATUS: Record<Status, string> = {
  agendado: "border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
  confirmado: "border-sky-400 bg-sky-50 text-sky-950 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
  em_atendimento: "border-violet-400 bg-violet-50 text-violet-950 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100",
  pronto: "border-emerald-500 bg-emerald-50 text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
  concluido: "border-neutral-300 bg-neutral-100 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
  cancelado: "border-neutral-200 bg-white text-neutral-400 line-through dark:border-neutral-800 dark:bg-neutral-950",
  faltou: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
};

export const NOME_CANAL: Record<Canal, string> = {
  app_proprio: "App",
  marketplace: "Marketplace",
  balcao: "Balcão/telefone",
  whatsapp: "WhatsApp",
};

/** Filtro de status da agenda: "ativos" esconde cancelados (o padrão). */
export const FILTROS_STATUS = ["ativos", "todos", "agendado", "confirmado", "em_atendimento", "pronto", "concluido", "cancelado", "faltou"] as const;
export type FiltroStatus = (typeof FILTROS_STATUS)[number];

export function passaNoFiltro(status: Status, filtro: FiltroStatus) {
  if (filtro === "todos") return true;
  if (filtro === "ativos") return status !== "cancelado";
  return status === filtro;
}

type Acao = { status: Status; rotulo: string };

/**
 * Próximos passos que o painel oferece para um atendimento (o banco confere de novo).
 * Equipe de operação: confirmar, iniciar, pronto, concluir, falta (depois do início) e desfazer.
 * Profissional: só conduz o atendimento (iniciar, pronto, concluir).
 */
export function acoesDeStatus(status: Status, opts: { operacao: boolean; jaComecou: boolean }): Acao[] {
  const acoes: Acao[] = [];
  const add = (s: Status, rotulo: string) => acoes.push({ status: s, rotulo });
  switch (status) {
    case "agendado":
      if (opts.operacao) add("confirmado", "Confirmar");
      add("em_atendimento", "Iniciar atendimento");
      if (opts.operacao && opts.jaComecou) add("faltou", "Marcar falta");
      break;
    case "confirmado":
      add("em_atendimento", "Iniciar atendimento");
      if (opts.operacao && opts.jaComecou) add("faltou", "Marcar falta");
      break;
    case "em_atendimento":
      add("pronto", "Pet pronto");
      add("concluido", "Concluir");
      break;
    case "pronto":
      add("concluido", "Concluir (retirado)");
      break;
    case "faltou":
      if (opts.operacao) add("agendado", "Desfazer falta");
      break;
  }
  if (!opts.operacao) return acoes.filter((a) => ["em_atendimento", "pronto", "concluido"].includes(a.status));
  return acoes;
}

/** Remarcar e cancelar só antes de o atendimento começar. */
export const podeRemarcarOuCancelar = (status: Status) => status === "agendado" || status === "confirmado";

// ---------------------------------------------------------------------------
// Datas no fuso da loja
// ---------------------------------------------------------------------------

/** Data local (yyyy-mm-dd) de um instante no fuso informado. */
export function dataNoFuso(instante: Date | string, fuso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(new Date(instante));
}

/** Minutos desde a meia-noite local. */
export function minutosNoFuso(instante: Date | string, fuso: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: fuso, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(instante))
      .map((x) => [x.type, x.value]),
  );
  return Number(p.hour) * 60 + Number(p.minute);
}

export function horaNoFuso(instante: Date | string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instante));
}

export function somarDias(data: string, n: number) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Segunda-feira da semana da data. */
export function inicioDaSemana(data: string) {
  const dow = new Date(`${data}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return somarDias(data, dow === 0 ? -6 : 1 - dow);
}

export function diaPorExtenso(data: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long" }).format(new Date(`${data}T12:00:00Z`));
}

export function diaCurto(data: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short", day: "2-digit", month: "2-digit" })
    .format(new Date(`${data}T12:00:00Z`))
    .replace(".", "")
    .replace(",", "");
}

export const ehData = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

/**
 * Faixa de horas da grade do dia: das janelas de trabalho e dos atendimentos, arredondada para horas cheias
 * (padrão 08:00–19:00 quando não há nada).
 */
export function faixaDoDia(minutos: { inicio: number; fim: number }[]) {
  if (minutos.length === 0) return { inicio: 8 * 60, fim: 19 * 60 };
  const inicio = Math.min(...minutos.map((m) => m.inicio));
  const fim = Math.max(...minutos.map((m) => m.fim));
  return { inicio: Math.max(0, Math.floor(inicio / 60) * 60), fim: Math.min(24 * 60, Math.ceil(fim / 60) * 60) };
}
