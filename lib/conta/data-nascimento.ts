// Data de nascimento digitada como DD/MM/AAAA. O campo nativo de data é ruim para isso no celular (no Android abre um
// calendário no mês atual, sem digitação) e o tutor costuma saber a data de cor.

/** Máscara enquanto digita: só números, com as barras no lugar. */
export function mascaraData(texto: string) {
  const d = texto.replace(/\D/g, "").slice(0, 8);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/");
}

/** DD/MM/AAAA → AAAA-MM-DD; null se a data não existe, é futura ou tem mais de 40 anos. */
export function nascimentoParaIso(texto: string, hoje = new Date()) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (!m) return null;
  const [dia, mes, ano] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const hojeIso = hoje.toISOString().slice(0, 10);
  if (iso > hojeIso || ano < hoje.getUTCFullYear() - 40) return null;
  return iso;
}

/** AAAA-MM-DD → DD/MM/AAAA (para editar). */
export const nascimentoDeIso = (iso: string | null | undefined) => (iso ? iso.split("-").reverse().join("/") : "");
