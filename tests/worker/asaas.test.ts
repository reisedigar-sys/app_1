import { describe, expect, it, vi } from "vitest";
import { processarWebhookAsaas, tokenValido } from "@/supabase/functions/_shared/asaas";

vi.mock("server-only", () => ({}));

function fetchFalso(respostas: Record<string, unknown>) {
  const pedidos: { url: string; metodo: string; corpo: Record<string, unknown> | null; cabecalhos: Record<string, string> }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    pedidos.push({ url, metodo: init.method ?? "GET", corpo: init.body ? JSON.parse(init.body as string) : null, cabecalhos: init.headers as Record<string, string> });
    const caminho = new URL(url).pathname.replace("/v3", "");
    return new Response(JSON.stringify(respostas[caminho] ?? {}), { status: caminho in respostas ? 200 : 404 });
  }) as unknown as typeof fetch;
  return { f, pedidos };
}

describe("Asaas: webhook", () => {
  const evento = JSON.stringify({ id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1", pixQrCodeId: "qr_1" } });

  it("token errado ou ausente é recusado sem chamar o banco", async () => {
    const rpc = vi.fn();
    expect((await processarWebhookAsaas(evento, "outro", "segredo", rpc)).status).toBe(401);
    expect((await processarWebhookAsaas(evento, null, "segredo", rpc)).status).toBe(401);
    expect((await processarWebhookAsaas(evento, "segredo", "", rpc)).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
    expect(tokenValido("abc", "abcd")).toBe(false);
  });

  it("repassa o evento ao banco; erro do banco devolve 500 para o Asaas tentar de novo", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "pago", error: null });
    expect(await processarWebhookAsaas(evento, "segredo", "segredo", rpc)).toEqual({ status: 200, corpo: { resultado: "pago" } });
    expect(rpc).toHaveBeenCalledWith("pagamento_webhook", { p_evento: JSON.parse(evento) });

    const falha = vi.fn().mockResolvedValue({ data: null, error: { message: "fora do ar" } });
    expect((await processarWebhookAsaas(evento, "segredo", "segredo", falha)).status).toBe(500);
    expect((await processarWebhookAsaas("{", "segredo", "segredo", falha)).status).toBe(400);
  });
});

describe("Asaas: chamadas da API", () => {
  it("abre a subconta com o webhook, consulta a situação e cria a chave Pix", async () => {
    const { ProvedorAsaas } = await import("@/lib/pagamentos/provedor");
    const { f, pedidos } = fetchFalso({
      "/accounts": { id: "acc_1", walletId: "wal_1", apiKey: "$aact_hmlg_sub" },
      "/myAccount/status": { general: "AWAITING_APPROVAL" },
      "/myAccount/documents": { data: [{ status: "PENDING", onboardingUrl: "https://asaas.test/docs" }] },
      "/pix/addressKeys": { key: "chave-evp" },
    });
    const p = new ProvedorAsaas("$aact_hmlg_plataforma", { url: "https://x.supabase.co/functions/v1/asaas", token: "tk" }, f);
    const conta = await p.abrirConta({
      tipo: "cnpj",
      cpf_cnpj: "11222333000181",
      nome: "Pet Feliz Ltda",
      email: "a@b.test",
      celular: "11988880001",
      tipo_empresa: "LIMITED",
      faturamento_centavos: 2_000_000,
      cep: "01310100",
      endereco: "Av. Paulista",
      numero: "1000",
      bairro: "Bela Vista",
    });
    expect(conta).toEqual({
      contaId: "acc_1",
      walletId: "wal_1",
      apiKey: "$aact_hmlg_sub",
      situacao: "em_analise",
      pixChave: "chave-evp",
      documentosUrl: "https://asaas.test/docs",
    });
    expect(pedidos[0].url).toBe("https://api-sandbox.asaas.com/v3/accounts");
    expect(pedidos[0].cabecalhos.access_token).toBe("$aact_hmlg_plataforma");
    expect(pedidos[0].corpo).toMatchObject({ cpfCnpj: "11222333000181", companyType: "LIMITED", incomeValue: 20000, postalCode: "01310100" });
    expect((pedidos[0].corpo!.webhooks as { authToken: string; url: string }[])[0]).toMatchObject({ authToken: "tk", url: "https://x.supabase.co/functions/v1/asaas" });
    // Depois de criada, a subconta é consultada com a chave dela.
    expect(pedidos.slice(1).every((x) => x.cabecalhos.access_token === "$aact_hmlg_sub")).toBe(true);
  });

  it("cria o QR Code estático com valor em reais, validade e um pagamento só", async () => {
    const { ProvedorAsaas } = await import("@/lib/pagamentos/provedor");
    const { f, pedidos } = fetchFalso({ "/pix/qrCodes/static": { id: "qr_1", payload: "000201...", encodedImage: "iVBOR" } });
    const p = new ProvedorAsaas("$aact_prod_plataforma", null, f);
    const qr = await p.criarQr("$aact_prod_sub", { pixChave: "chave", valorCentavos: 3050, expiraSegundos: 840, descricao: "Sinal Pet Feliz", referencia: "pg_1" });
    expect(qr).toEqual({ id: "qr_1", payload: "000201...", imagem: "data:image/png;base64,iVBOR" });
    expect(pedidos[0].url).toBe("https://api.asaas.com/v3/pix/qrCodes/static");
    expect(pedidos[0].corpo).toEqual({
      addressKey: "chave",
      description: "Sinal Pet Feliz",
      value: 30.5,
      format: "ALL",
      expirationSeconds: 840,
      allowsMultiplePayments: false,
      externalReference: "pg_1",
    });
  });

  it("erro do Asaas vira mensagem legível", async () => {
    const { ProvedorAsaas, ErroProvedor } = await import("@/lib/pagamentos/provedor");
    const f = (async () => new Response(JSON.stringify({ errors: [{ description: "O CPF/CNPJ informado é inválido." }] }), { status: 400 })) as unknown as typeof fetch;
    const p = new ProvedorAsaas("$aact_hmlg_x", null, f);
    const erro = await p.criarQr("k", { pixChave: "c", valorCentavos: 100, expiraSegundos: 60, descricao: "d", referencia: "r" }).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroProvedor);
    expect(erro.message).toBe("O CPF/CNPJ informado é inválido.");
  });
});
