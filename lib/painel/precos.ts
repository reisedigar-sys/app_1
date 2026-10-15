import { PELAGENS, PORTES, centavosParaReais, reaisParaCentavos } from "./formatos";

/** Uma combinação de porte e pelagem, como a loja digita (texto). */
export type Celula = { preco: string; duracao: string };
/** Tabela de um serviço; chave "porte.pelagem". */
export type Grade = Record<string, Celula>;

export const CHAVES = PORTES.flatMap((porte) => PELAGENS.map((pelagem) => `${porte}.${pelagem}`));

export function gradeVazia(): Grade {
  return Object.fromEntries(CHAVES.map((k) => [k, { preco: "", duracao: "" }]));
}

/** Aplica preço e/ou duração a todas as combinações; campo vazio mantém o que já estava. */
export function preencherTodas(grade: Grade, preco: string, duracao: string): Grade {
  return Object.fromEntries(
    CHAVES.map((k) => {
      const c = grade[k] ?? { preco: "", duracao: "" };
      return [k, { preco: preco.trim() ? preco : c.preco, duracao: duracao.trim() ? duracao : c.duracao }];
    }),
  );
}

/** Todas as combinações preenchidas com o mesmo preço e a mesma duração. */
export function ehPrecoUnico(grade: Grade): boolean {
  const [primeira, ...resto] = CHAVES.map((k) => grade[k] ?? { preco: "", duracao: "" });
  if (!primeira.preco.trim() || !primeira.duracao.trim()) return false;
  const preco = reaisParaCentavos(primeira.preco);
  return resto.every((c) => reaisParaCentavos(c.preco) === preco && c.duracao === primeira.duracao);
}

/** Primeira combinação com algo preenchido (base para o modo de preço único). */
export function primeiraPreenchida(grade: Grade): Celula {
  return (
    CHAVES.map((k) => grade[k]).find((c) => c && (c.preco.trim() || c.duracao.trim())) ?? { preco: "", duracao: "" }
  );
}

export function mesmaGrade(a: Grade, b: Grade): boolean {
  return CHAVES.every(
    (k) => (a[k]?.preco ?? "") === (b[k]?.preco ?? "") && (a[k]?.duracao ?? "") === (b[k]?.duracao ?? ""),
  );
}

/** Mostra o preço como ele será salvo ("45.9" → "45,90"); texto inválido fica como está para o erro aparecer. */
export function normalizarPreco(texto: string): string {
  const centavos = reaisParaCentavos(texto);
  return centavos === null ? texto : centavosParaReais(centavos);
}
