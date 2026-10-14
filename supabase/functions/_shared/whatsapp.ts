// WhatsApp (Meta Cloud API) sem dependências: envio de modelos, resposta em texto e webhook.
// Roda na Edge Function (Deno) e nos testes (Node). As regras (PARAR, resposta automática, status) ficam no banco.

export type ConfigWhatsApp = { token: string; phoneNumberId: string; versao?: string };
type Resultado = { ok: true; id?: string } | { ok: false; erro: string };
type MensagemComModelo = { conteudo: { modelo?: string | null; parametros?: string[] } };
type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

const VERSAO_PADRAO = "v23.0";

export class ProvedorWhatsApp {
  readonly nome = "whatsapp";

  constructor(
    private readonly cfg: ConfigWhatsApp,
    private readonly f: typeof fetch = fetch,
  ) {}

  private async postar(phoneNumberId: string, corpo: Record<string, unknown>): Promise<Resultado> {
    const r = await this.f(`https://graph.facebook.com/${this.cfg.versao ?? VERSAO_PADRAO}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...corpo }),
    });
    const json = (await r.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
    if (!r.ok || json.error) {
      return { ok: false, erro: `whatsapp ${r.status}${json.error?.code ? ` (${json.error.code})` : ""}: ${json.error?.message ?? "erro"}` };
    }
    return { ok: true, id: json.messages?.[0]?.id };
  }

  /** Mensagem de modelo (fora da janela de 24 h só modelos aprovados são aceitos). */
  async enviar(destino: string, _texto: string, mensagem: MensagemComModelo): Promise<Resultado> {
    const { modelo, parametros = [] } = mensagem.conteudo;
    if (!modelo) return { ok: false, erro: "mensagem sem modelo do WhatsApp" };
    return this.postar(this.cfg.phoneNumberId, {
      to: destino.replace(/\D/g, ""),
      type: "template",
      template: {
        name: modelo,
        language: { code: "pt_BR" },
        components: parametros.length ? [{ type: "body", parameters: parametros.map((text) => ({ type: "text", text })) }] : [],
      },
    });
  }

  /** Texto livre, só como resposta a quem acabou de escrever (dentro da janela de 24 h). */
  async responder(phoneNumberId: string, destino: string, texto: string): Promise<Resultado> {
    return this.postar(phoneNumberId, { to: destino.replace(/\D/g, ""), type: "text", text: { body: texto, preview_url: true } });
  }
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

/** Confere o cabeçalho X-Hub-Signature-256 (HMAC-SHA256 do corpo com o segredo do app da Meta). */
export async function assinaturaValida(segredo: string, corpo: string, cabecalho: string | null): Promise<boolean> {
  if (!segredo || !cabecalho?.startsWith("sha256=")) return false;
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperado = hex(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(corpo)));
  const recebido = cabecalho.slice("sha256=".length).toLowerCase();
  if (recebido.length !== esperado.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i++) diferenca |= esperado.charCodeAt(i) ^ recebido.charCodeAt(i);
  return diferenca === 0;
}

type MensagemRecebida = {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
};
type StatusRecebido = { id: string; status: string; errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[] };
export type PayloadWebhook = {
  object?: string;
  entry?: { changes?: { field?: string; value?: { metadata?: { phone_number_id?: string }; messages?: MensagemRecebida[]; statuses?: StatusRecebido[] } }[] }[];
};

const textoDa = (m: MensagemRecebida) =>
  m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? "";

/** Processa um webhook já autenticado: status de entrega e mensagens recebidas (com a resposta, se houver). */
export async function processarWebhook(
  payload: PayloadWebhook,
  deps: { rpc: Rpc; appUrl: string; responder?: (phoneNumberId: string, destino: string, texto: string) => Promise<Resultado> },
) {
  const total = { status: 0, recebidas: 0, respostas: 0 };
  for (const entrada of payload.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const valor = mudanca.value;
      if (mudanca.field !== "messages" || !valor) continue;
      const phoneNumberId = valor.metadata?.phone_number_id ?? "";

      for (const s of valor.statuses ?? []) {
        const e = s.errors?.[0];
        const erro = e ? [e.code, e.title ?? e.message, e.error_data?.details].filter(Boolean).join(" · ") : null;
        const r = await deps.rpc("whatsapp_status", { p_provedor_mensagem_id: s.id, p_status: s.status, p_erro: erro });
        if (r.error) throw new Error(`whatsapp_status: ${r.error.message}`);
        total.status++;
      }

      for (const m of valor.messages ?? []) {
        const r = await deps.rpc("whatsapp_receber", {
          p_mensagem_id: m.id,
          p_phone_number_id: phoneNumberId,
          p_de: m.from,
          p_texto: textoDa(m),
          p_payload: m,
        });
        if (r.error) throw new Error(`whatsapp_receber: ${r.error.message}`);
        total.recebidas++;
        const resposta = (r.data as { resposta?: string | null } | null)?.resposta;
        if (resposta && deps.responder) {
          const enviada = await deps.responder(phoneNumberId, m.from, resposta.replaceAll("{app}", deps.appUrl.replace(/\/$/, "")));
          if (enviada.ok) total.respostas++;
          else console.error("resposta não enviada", enviada.erro);
        }
      }
    }
  }
  return total;
}
