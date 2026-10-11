/** Lê um tstzrange do PostgREST, ex.: ["2026-10-12 15:00:00+00","2026-10-12 16:00:00+00"). */
export function lerPeriodo(texto: string): { inicio: Date; fim: Date } {
  const m = texto.match(/^[[(]"?([^",]+)"?,"?([^",]+)"?[\])]$/);
  if (!m) throw new Error(`Período inválido: ${texto}`);
  const data = (s: string) => new Date(s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00"));
  return { inicio: data(m[1]), fim: data(m[2]) };
}

/** Formata um período no fuso da loja. Dia inteiro (00:00 → 00:00) aparece só com as datas. */
export function formatarPeriodo({ inicio, fim }: { inicio: Date; fim: Date }, fuso: string): string {
  const parte = (d: Date) => {
    const f = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
    return { data: `${p.weekday.replace(".", "")} ${p.day}/${p.month}`, hora: `${p.hour}:${p.minute}` };
  };
  const i = parte(inicio);
  const f = parte(fim);
  if (i.hora === "00:00" && f.hora === "00:00") {
    const ultimoDia = parte(new Date(fim.getTime() - 1));
    return i.data === ultimoDia.data ? `${i.data} (dia inteiro)` : `${i.data} a ${ultimoDia.data} (dias inteiros)`;
  }
  return i.data === f.data ? `${i.data}, ${i.hora}–${f.hora}` : `${i.data} ${i.hora} a ${f.data} ${f.hora}`;
}
