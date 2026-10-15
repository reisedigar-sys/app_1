// Contas da tela Resultados. Os números vêm do banco (resultados_do_mes); aqui só se derivam taxas e a estimativa.

export type Resultados = {
  mes: string;
  faltas_antes_pct: number | null;
  agendados: number;
  concluidos: number;
  faltas: number;
  cancelados: number;
  a_realizar: number;
  pedidos: number;
  pedidos_confirmados: number;
  faturado_centavos: number;
  previsto_centavos: number;
  clientes_atendidos: number;
  clientes_novos: number;
  por_canal: Partial<Record<"app_proprio" | "balcao" | "whatsapp" | "marketplace", number>>;
  mensagens: { whatsapp: number; push: number };
  ocupacao: { profissional_id: string; nome: string; minutos_disponiveis: number; minutos_ocupados: number }[];
};

/** Percentual arredondado; null quando não há base para a conta. */
export function percentual(parte: number, total: number) {
  return total > 0 ? Math.round((parte / total) * 100) : null;
}

/**
 * Faltas evitadas, SEMPRE uma estimativa: quantas faltas a loja teria com a taxa de antes (informada por ela)
 * sobre os atendimentos que já aconteceram no mês, menos as faltas que de fato houve.
 */
export function faltasEvitadas(faltasAntesPct: number | null, concluidos: number, faltas: number) {
  const realizados = concluidos + faltas;
  if (faltasAntesPct === null || realizados === 0) return null;
  return Math.max(0, Math.round((faltasAntesPct / 100) * realizados) - faltas);
}

/** "2026-10" ± n meses. */
export function somarMeses(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export const ehMes = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export function nomeDoMes(mes: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${mes}-15T12:00:00Z`));
}

/** 12420 → "207 h". */
export const horas = (minutos: number) => `${Math.round(minutos / 60)} h`;
