/** Mensagem do login a partir do erro do Supabase Auth: diz quando falta confirmar o e-mail (no Supabase hospedado
 *  a confirmação está ligada) em vez de "senha incorreta". */
export function mensagemDeLogin(erro: { code?: string; status?: number }) {
  if (erro.code === "email_not_confirmed") {
    return "Confirme seu e-mail antes de entrar: abra o link que enviamos (veja também a caixa de spam).";
  }
  if (erro.code === "over_request_rate_limit" || erro.status === 429)
    return "Muitas tentativas. Espere alguns minutos e tente de novo.";
  return "E-mail ou senha incorretos.";
}
