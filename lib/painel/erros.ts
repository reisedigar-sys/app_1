type ErroBanco = { code?: string; message?: string; hint?: string } | null | undefined;

/** Traduz um erro do Postgres/PostgREST para uma mensagem para a equipe da loja. */
export function mensagemDeErro(erro: ErroBanco, contexto?: { duplicado?: string; sobreposto?: string }): string {
  // Regras de agenda (AG001…AG005): a mensagem em português vem do banco.
  if (erro?.code?.startsWith("AG") && erro.message) return erro.message.charAt(0).toUpperCase() + erro.message.slice(1) + ".";
  switch (erro?.code) {
    case "23505":
      return contexto?.duplicado ?? "Já existe um cadastro com esses dados.";
    case "23P01":
      return contexto?.sobreposto ?? "Esse horário se sobrepõe a outro já cadastrado.";
    case "23514":
    case "22023":
    case "22P02":
      return "Algum valor está fora do permitido. Confira os campos.";
    case "23503":
      return "Esse cadastro está ligado a outro registro que não existe ou é de outra loja.";
    case "42501":
      return "Você não tem permissão para fazer isso nesta loja.";
    case "P0002":
      return [erro.message, erro.hint].filter(Boolean).join(". ");
    default:
      return "Não foi possível salvar. Tente de novo.";
  }
}
