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

// ---------------------------------------------------------------------------
// Devoluções e conferência (semana 8b), chamadas pelo worker da Edge Function `notificacoes`
// ---------------------------------------------------------------------------
// O banco diz o que devolver e o que conferir (estornos_reservar, conferencia_reservar); aqui só se chama o Asaas
// com a chave da subconta da loja e se devolve o resultado ao banco.

type Http = (url: string, init: RequestInit) => Promise<Response>;

type Estorno = {
  id: string;
  petshop_id: string;
  provedor: string;
  provedor_pagamento_id: string | null;
  valor_centavos: number;
  descricao: string;
};

type Conferencia = { id: string; petshop_id: string; qr_id: string };

/** A chave decide o ambiente: produção ($aact_prod_) ou sandbox. */
export const urlAsaas = (chave: string) => (chave.startsWith("$aact_prod_") ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3");

async function chamarAsaas(http: Http, chave: string, metodo: "GET" | "POST", caminho: string, corpo?: unknown) {
  const r = await http(`${urlAsaas(chave)}${caminho}`, {
    method: metodo,
    headers: { access_token: chave, "Content-Type": "application/json", "User-Agent": "salao-do-pet" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(15_000),
  });
  const texto = await r.text();
  let json: Record<string, unknown> = {};
  try {
    json = texto ? JSON.parse(texto) : {};
  } catch {
    // resposta que não é JSON: fica o status
  }
  if (!r.ok) {
    const erros = (json.errors as { description?: string }[] | undefined)?.map((e) => e.description).filter(Boolean);
    throw new Error(erros?.length ? erros.join(" ") : `Asaas respondeu ${r.status}`);
  }
  return json;
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function chaveDaLoja(rpc: Rpc, petshopId: string) {
  const { data, error } = await rpc("chave_conta_pagamento", { p_petshop_id: petshopId });
  if (error) throw new Error(`chave_conta_pagamento: ${error.message}`);
  if (typeof data !== "string" || !data) throw new Error("Conta de recebimento da loja sem chave.");
  return data;
}

/** Faz as devoluções pendentes e confere os Pix vencidos. Erros de um item não param os outros. */
export async function processarPagamentos(rpc: Rpc, http: Http = fetch, opcoes: { limite?: number } = {}) {
  const total = { devolvidos: 0, falhas: 0, conferidos: 0, achados: 0 };

  const estornos = await rpc("estornos_reservar", { p_limite: opcoes.limite ?? 20 });
  if (estornos.error) throw new Error(`estornos_reservar: ${estornos.error.message}`);
  for (const e of (estornos.data ?? []) as Estorno[]) {
    let resultado: { ok: true; id: string } | { ok: false; erro: string };
    try {
      if (e.provedor === "teste") {
        resultado = { ok: true, id: `teste-estorno-${e.id}` };
      } else if (!e.provedor_pagamento_id) {
        resultado = { ok: false, erro: "Pagamento sem id no Asaas." };
      } else {
        const chave = await chaveDaLoja(rpc, e.petshop_id);
        const r = await chamarAsaas(http, chave, "POST", `/payments/${encodeURIComponent(e.provedor_pagamento_id)}/refund`, {
          value: e.valor_centavos / 100,
          description: e.descricao,
        });
        resultado = { ok: true, id: String((r.id as string | undefined) ?? e.provedor_pagamento_id) };
      }
    } catch (erro) {
      resultado = { ok: false, erro: mensagem(erro) };
    }
    const fim = await rpc("estorno_concluir", {
      p_id: e.id,
      p_ok: resultado.ok,
      p_provedor_estorno_id: resultado.ok ? resultado.id : null,
      p_erro: resultado.ok ? null : resultado.erro,
    });
    if (fim.error) throw new Error(`estorno_concluir: ${fim.error.message}`);
    if (resultado.ok) total.devolvidos++;
    else total.falhas++;
  }

  const conferir = await rpc("conferencia_reservar", { p_limite: opcoes.limite ?? 20 });
  if (conferir.error) throw new Error(`conferencia_reservar: ${conferir.error.message}`);
  for (const c of (conferir.data ?? []) as Conferencia[]) {
    try {
      const chave = await chaveDaLoja(rpc, c.petshop_id);
      const r = await chamarAsaas(http, chave, "GET", `/payments?pixQrCodeId=${encodeURIComponent(c.qr_id)}&limit=10`);
      const pagos = ((r.data as { id: string; status: string }[] | undefined) ?? []).filter((p) =>
        ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"].includes(p.status),
      );
      for (const p of pagos) {
        // Mesmo caminho do webhook: o banco decide (o horário já foi liberado → devolver).
        const ev = await rpc("pagamento_webhook", {
          p_evento: { id: `conferencia_${p.id}`, event: "PAYMENT_RECEIVED", payment: { id: p.id, pixQrCodeId: c.qr_id } },
        });
        if (ev.error) throw new Error(`pagamento_webhook: ${ev.error.message}`);
        total.achados++;
      }
      total.conferidos++;
    } catch (erro) {
      console.error(`conferência do pagamento ${c.id}: ${mensagem(erro)}`);
    }
  }
  return total;
}
