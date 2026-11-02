import "server-only";

// Provedor de pagamento (semana 8): Asaas de verdade ou um Pix simulado para desenvolver e testar sem a conta.
// Só faz chamadas; quem decide valor, prazo e o que acontece depois é o banco (migração 017).
//
// Variáveis de ambiente (só servidor, nunca NEXT_PUBLIC_):
//   ASAAS_API_KEY        chave da conta da plataforma ($aact_hmlg_… no sandbox, $aact_prod_… na conta real).
//   ASAAS_WEBHOOK_TOKEN  o mesmo segredo da Edge Function `asaas`; vai junto no webhook de cada subconta.
//   PAGAMENTOS_TESTE=1   sem a chave do Asaas, usa o Pix simulado (fora do ambiente local, só se ligado).

export type SituacaoConta = "pendente" | "em_analise" | "aprovada" | "recusada";

export type DadosConta = {
  tipo: "cnpj" | "cpf";
  cpf_cnpj: string;
  nome: string;
  email: string;
  celular: string;
  nascimento?: string;
  tipo_empresa?: "MEI" | "LIMITED" | "INDIVIDUAL" | "ASSOCIATION";
  faturamento_centavos: number;
  cep: string;
  endereco: string;
  numero: string;
  complemento?: string;
  bairro: string;
};

export type ContaCriada = {
  contaId: string;
  walletId: string;
  apiKey: string;
  pixChave: string | null;
  situacao: SituacaoConta;
  documentosUrl: string | null;
};

export type QrPix = { id: string; payload: string; imagem: string };

export interface ProvedorPagamento {
  readonly nome: "asaas" | "teste";
  abrirConta(dados: DadosConta): Promise<ContaCriada>;
  situacaoConta(apiKey: string, pixChave: string | null): Promise<{ situacao: SituacaoConta; pixChave: string | null; documentosUrl: string | null }>;
  criarQr(apiKey: string, p: { pixChave: string; valorCentavos: number; expiraSegundos: number; descricao: string; referencia: string }): Promise<QrPix>;
}

export class ErroProvedor extends Error {}

const SITUACAO_ASAAS: Record<string, SituacaoConta> = {
  APPROVED: "aprovada",
  REJECTED: "recusada",
  AWAITING_APPROVAL: "em_analise",
  PENDING: "pendente",
};

/** Asaas (API v3). A chave decide o ambiente: sandbox ($aact_hmlg_) ou produção ($aact_prod_). */
export class ProvedorAsaas implements ProvedorPagamento {
  readonly nome = "asaas";
  private readonly url: string;

  constructor(
    private readonly chavePlataforma: string,
    private readonly webhook: { url: string; token: string } | null,
    private readonly http: typeof fetch = fetch,
  ) {
    this.url = chavePlataforma.startsWith("$aact_prod_") ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
  }

  private async chamar<T>(chave: string, metodo: "GET" | "POST", caminho: string, corpo?: unknown): Promise<T> {
    const r = await this.http(`${this.url}${caminho}`, {
      method: metodo,
      headers: { access_token: chave, "Content-Type": "application/json", "User-Agent": "salao-do-pet" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(15_000),
    });
    const texto = await r.text();
    const json = texto ? (JSON.parse(texto) as T & { errors?: { description?: string }[] }) : ({} as T & { errors?: { description?: string }[] });
    if (!r.ok) {
      const motivo = json.errors?.map((e) => e.description).filter(Boolean).join(" ") || `erro ${r.status}`;
      throw new ErroProvedor(motivo);
    }
    return json;
  }

  async abrirConta(d: DadosConta): Promise<ContaCriada> {
    const conta = await this.chamar<{ id: string; walletId: string; apiKey: string }>(this.chavePlataforma, "POST", "/accounts", {
      name: d.nome,
      email: d.email,
      cpfCnpj: d.cpf_cnpj,
      birthDate: d.tipo === "cpf" ? d.nascimento : undefined,
      companyType: d.tipo === "cnpj" ? d.tipo_empresa : undefined,
      mobilePhone: d.celular,
      incomeValue: d.faturamento_centavos / 100,
      address: d.endereco,
      addressNumber: d.numero,
      complement: d.complemento || undefined,
      province: d.bairro,
      postalCode: d.cep,
      webhooks: this.webhook
        ? [
            {
              name: "Salão do Pet",
              url: this.webhook.url,
              email: d.email,
              enabled: true,
              interrupted: false,
              authToken: this.webhook.token,
              sendType: "SEQUENTIALLY",
              events: ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED", "PAYMENT_REFUNDED"],
            },
          ]
        : undefined,
    });
    const s = await this.situacaoConta(conta.apiKey, null).catch(() => ({ situacao: "pendente" as const, pixChave: null, documentosUrl: null }));
    return { contaId: conta.id, walletId: conta.walletId, apiKey: conta.apiKey, ...s };
  }

  async situacaoConta(apiKey: string, pixChave: string | null) {
    const status = await this.chamar<{ general?: string }>(apiKey, "GET", "/myAccount/status");
    const situacao = SITUACAO_ASAAS[status.general ?? ""] ?? "pendente";
    let documentosUrl: string | null = null;
    if (situacao !== "aprovada") {
      const docs = await this.chamar<{ data?: { onboardingUrl?: string | null; status?: string }[] }>(apiKey, "GET", "/myAccount/documents").catch(() => ({ data: [] }));
      documentosUrl = docs.data?.find((x) => x.onboardingUrl && x.status !== "APPROVED")?.onboardingUrl ?? null;
    }
    // A chave Pix aleatória (EVP) da subconta é criada uma vez; pode falhar enquanto a conta não for aprovada.
    let chave = pixChave;
    if (!chave) {
      chave = await this.chamar<{ key?: string }>(apiKey, "POST", "/pix/addressKeys", { type: "EVP" })
        .then((k) => k.key ?? null)
        .catch(() => null);
    }
    return { situacao, pixChave: chave, documentosUrl };
  }

  async criarQr(apiKey: string, p: { pixChave: string; valorCentavos: number; expiraSegundos: number; descricao: string; referencia: string }) {
    const qr = await this.chamar<{ id: string; payload: string; encodedImage: string }>(apiKey, "POST", "/pix/qrCodes/static", {
      addressKey: p.pixChave,
      description: p.descricao.slice(0, 37),
      value: p.valorCentavos / 100,
      format: "ALL",
      expirationSeconds: p.expiraSegundos,
      allowsMultiplePayments: false,
      externalReference: p.referencia,
    });
    return { id: qr.id, payload: qr.payload, imagem: `data:image/png;base64,${qr.encodedImage}` };
  }
}

/** Pix simulado: conta aprovada na hora e QR Code de mentira. O pagamento é feito pelo botão "Simular pagamento". */
export class ProvedorTeste implements ProvedorPagamento {
  readonly nome = "teste";

  async abrirConta(d: DadosConta): Promise<ContaCriada> {
    const id = crypto.randomUUID();
    return { contaId: `teste-${id}`, walletId: `teste-${id}`, apiKey: `teste-${id}`, pixChave: `teste-${d.cpf_cnpj}`, situacao: "aprovada", documentosUrl: null };
  }

  async situacaoConta(_apiKey: string, pixChave: string | null) {
    return { situacao: "aprovada" as const, pixChave, documentosUrl: null };
  }

  async criarQr(_apiKey: string, p: { valorCentavos: number; referencia: string }) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#fff"/><rect x="10" y="10" width="180" height="180" fill="none" stroke="#1c2340" stroke-width="8" stroke-dasharray="12 8"/><text x="100" y="95" font-family="sans-serif" font-size="22" font-weight="700" text-anchor="middle" fill="#1c2340">PIX DE TESTE</text><text x="100" y="125" font-family="sans-serif" font-size="14" text-anchor="middle" fill="#1c2340">não pague</text></svg>`;
    return {
      id: `teste-qr-${p.referencia}`,
      payload: `00020126TESTE-SALAO-DO-PET-${p.referencia}-${p.valorCentavos}`,
      imagem: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    };
  }
}

/** Pix simulado só no ambiente local ou com PAGAMENTOS_TESTE=1 (nunca na produção sem querer). */
export function pagamentosDeTestePermitidos() {
  return process.env.PAGAMENTOS_TESTE === "1" || /^http:\/\/(127\.0\.0\.1|localhost)/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
}

/** Provedor do ambiente, ou null quando os pagamentos não estão configurados. */
export function provedorPagamento(): ProvedorPagamento | null {
  const chave = process.env.ASAAS_API_KEY?.trim();
  if (chave) {
    const token = process.env.ASAAS_WEBHOOK_TOKEN?.trim();
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    return new ProvedorAsaas(chave, token && base ? { url: `${base}/functions/v1/asaas`, token } : null);
  }
  return pagamentosDeTestePermitidos() ? new ProvedorTeste() : null;
}
