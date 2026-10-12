/** Caminho de retorno depois do login: só caminhos internos (evita redirecionar para outro site). */
export function caminhoSeguro(valor: unknown, padrao = "/conta"): string {
  if (typeof valor !== "string" || !valor.startsWith("/") || valor.startsWith("//") || valor.includes("\\")) return padrao;
  return valor;
}

export const comVoltar = (caminho: string, voltar: string) => `${caminho}?voltar=${encodeURIComponent(voltar)}`;
