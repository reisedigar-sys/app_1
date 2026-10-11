/** Datas relativas para testes de agenda (fuso da loja: America/Sao_Paulo). */
export function somarDias(data: string, n: number) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const HOJE = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

/** Próximo dia da semana (0 = domingo) a pelo menos `minDias` de hoje. */
export function proximo(diaSemana: number, minDias: number) {
  let d = somarDias(HOJE, minDias);
  while (new Date(`${d}T12:00:00Z`).getUTCDay() !== diaSemana) d = somarDias(d, 1);
  return d;
}
