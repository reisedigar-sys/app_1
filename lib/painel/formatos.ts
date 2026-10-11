/** "50", "50,5", "R$ 1.234,56" → centavos. Vazio ou inválido → null. */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/[R$\s.]/g, "").replace(",", ".");
  if (limpo === "") return null;
  const valor = Number(limpo);
  if (!Number.isFinite(valor) || valor < 0) return null;
  return Math.round(valor * 100);
}

export function centavosParaReais(centavos: number | null | undefined): string {
  if (centavos == null) return "";
  return (centavos / 100).toFixed(2).replace(".", ",");
}

export function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Gera um slug a partir do nome: "Pet Feliz Centro" → "pet-feliz-centro". */
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "(11) 98888-0001" → "+5511988880001" (assume Brasil quando não há código do país). */
export function telefoneParaE164(texto: string): string | null {
  const digitos = texto.replace(/\D/g, "");
  if (texto.trim().startsWith("+")) return digitos.length >= 8 ? `+${digitos}` : null;
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) return `+${digitos}`;
  return null;
}

export const PORTES = ["mini", "pequeno", "medio", "grande", "gigante"] as const;
export const PELAGENS = ["curta", "media", "longa"] as const;
export const NOME_PORTE: Record<(typeof PORTES)[number], string> = {
  mini: "Mini",
  pequeno: "Pequeno",
  medio: "Médio",
  grande: "Grande",
  gigante: "Gigante",
};
export const NOME_PELAGEM: Record<(typeof PELAGENS)[number], string> = { curta: "Curta", media: "Média", longa: "Longa" };
export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
export const NOME_PAPEL = { dono: "Dono", gerente: "Gerente", atendente: "Atendente", profissional: "Profissional" } as const;
