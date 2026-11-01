// Webhook do Asaas (semana 8). Sem dependências: roda na Edge Function (Deno) e nos testes (Node).
// A regra (o Pix é de qual pedido, se confirma ou fica para devolver, se o evento já foi visto) fica no banco
// (public.pagamento_webhook, migração 017); aqui só se confere o token e se repassa o evento.

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Comparação em tempo constante (o token não vaza pelo tempo de resposta). */
export function tokenValido(esperado: string, recebido: string | null) {
  if (!esperado || !recebido) return false;
  const a = new TextEncoder().encode(esperado);
  const b = new TextEncoder().encode(recebido);
  let diferenca = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diferenca |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diferenca === 0;
}

/** Status HTTP e corpo da resposta. Erro devolve 500 para o Asaas tentar de novo (o evento repetido é ignorado). */
export async function processarWebhookAsaas(corpo: string, token: string | null, esperado: string, rpc: Rpc) {
  if (!tokenValido(esperado, token)) return { status: 401, corpo: { erro: "token inválido" } };
  let evento: unknown;
  try {
    evento = JSON.parse(corpo);
  } catch {
    return { status: 400, corpo: { erro: "corpo inválido" } };
  }
  if (!evento || typeof evento !== "object" || !("id" in evento)) return { status: 400, corpo: { erro: "evento sem id" } };
  const { data, error } = await rpc("pagamento_webhook", { p_evento: evento });
  if (error) {
    console.error(error.message);
    return { status: 500, corpo: { erro: "erro ao processar" } };
  }
  return { status: 200, corpo: { resultado: data } };
}
