import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type PayloadWebhook, ProvedorWhatsApp, assinaturaValida, processarWebhook } from "@/supabase/functions/_shared/whatsapp";
import webhook from "./fixtures/meta-webhook.json";

function fetchFalso(resposta: unknown, status = 200) {
  const pedidos: { url: string; corpo: Record<string, unknown>; cabecalhos: Record<string, string> }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    pedidos.push({ url, corpo: JSON.parse(init.body as string), cabecalhos: init.headers as Record<string, string> });
    return new Response(JSON.stringify(resposta), { status });
  }) as unknown as typeof fetch;
  return { f, pedidos };
}

describe("WhatsApp: envio", () => {
  it("envia o modelo com os parâmetros, pelo número central", async () => {
    const { f, pedidos } = fetchFalso({ messages: [{ id: "wamid.X" }] });
    const p = new ProvedorWhatsApp({ token: "tk", phoneNumberId: "123" }, f);
    const r = await p.enviar("+5511988880001", "texto", { conteudo: { modelo: "hp_pet_pronto", parametros: ["Pet Feliz Centro", "Thor"] } });
    expect(r).toEqual({ ok: true, id: "wamid.X" });
    expect(pedidos[0].url).toBe("https://graph.facebook.com/v23.0/123/messages");
    expect(pedidos[0].cabecalhos.Authorization).toBe("Bearer tk");
    expect(pedidos[0].corpo).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "5511988880001",
      type: "template",
      template: {
        name: "hp_pet_pronto",
        language: { code: "pt_BR" },
        components: [{ type: "body", parameters: [{ type: "text", text: "Pet Feliz Centro" }, { type: "text", text: "Thor" }] }],
      },
    });
  });

  it("erro da Meta vira falha com o código", async () => {
    const { f } = fetchFalso({ error: { message: "Template name does not exist", code: 132001 } }, 404);
    const p = new ProvedorWhatsApp({ token: "tk", phoneNumberId: "123" }, f);
    expect(await p.enviar("+5511988880001", "", { conteudo: { modelo: "x", parametros: [] } })).toEqual({
      ok: false,
      erro: "whatsapp 404 (132001): Template name does not exist",
    });
    expect(await p.enviar("+5511988880001", "", { conteudo: {} })).toEqual({ ok: false, erro: "mensagem sem modelo do WhatsApp" });
  });

  it("resposta em texto livre", async () => {
    const { f, pedidos } = fetchFalso({ messages: [{ id: "wamid.R" }] });
    await new ProvedorWhatsApp({ token: "tk", phoneNumberId: "" }, f).responder("999", "5511988880001", "Olá");
    expect(pedidos[0].url).toBe("https://graph.facebook.com/v23.0/999/messages");
    expect(pedidos[0].corpo).toMatchObject({ to: "5511988880001", type: "text", text: { body: "Olá", preview_url: true } });
  });
});

describe("WhatsApp: webhook", () => {
  it("confere a assinatura da Meta", async () => {
    const corpo = JSON.stringify(webhook);
    const assinatura = "sha256=" + createHmac("sha256", "segredo").update(corpo).digest("hex");
    expect(await assinaturaValida("segredo", corpo, assinatura)).toBe(true);
    expect(await assinaturaValida("segredo", corpo + " ", assinatura)).toBe(false);
    expect(await assinaturaValida("outro", corpo, assinatura)).toBe(false);
    expect(await assinaturaValida("segredo", corpo, null)).toBe(false);
    expect(await assinaturaValida("", corpo, assinatura)).toBe(false);
  });

  it("repassa status e mensagens ao banco e envia a resposta que ele devolver", async () => {
    const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
    const rpc = async (fn: string, args: Record<string, unknown>) => {
      chamadas.push({ fn, args });
      const resposta = args.p_mensagem_id === "wamid.ENTRADA2" ? "Para agendar:\nPet Feliz Centro: {app}/pet-feliz-centro" : null;
      return { data: fn === "whatsapp_receber" ? { resposta } : null, error: null };
    };
    const respostas: string[][] = [];
    const total = await processarWebhook(webhook as PayloadWebhook, {
      rpc,
      appUrl: "https://hora-do-pet.vercel.app/",
      responder: async (id, destino, texto) => {
        respostas.push([id, destino, texto]);
        return { ok: true };
      },
    });
    expect(total).toEqual({ status: 2, recebidas: 2, respostas: 1 });
    expect(chamadas.filter((c) => c.fn === "whatsapp_status").map((c) => c.args)).toEqual([
      { p_provedor_mensagem_id: "wamid.SAIDA1", p_status: "delivered", p_erro: null },
      { p_provedor_mensagem_id: "wamid.SAIDA2", p_status: "failed", p_erro: "131026 · Message undeliverable · Receiver is incapable of receiving this message" },
    ]);
    expect(chamadas.filter((c) => c.fn === "whatsapp_receber").map((c) => [c.args.p_mensagem_id, c.args.p_phone_number_id, c.args.p_de, c.args.p_texto])).toEqual([
      ["wamid.ENTRADA1", "106540352242922", "5511988880001", "Parar"],
      ["wamid.ENTRADA2", "106540352242922", "5511988880002", "Quero agendar"],
    ]);
    expect(respostas).toEqual([["106540352242922", "5511988880002", "Para agendar:\nPet Feliz Centro: https://hora-do-pet.vercel.app/pet-feliz-centro"]]);
  });

  it("erro do banco interrompe (a Meta tenta de novo)", async () => {
    const rpc = async () => ({ data: null, error: { message: "fora do ar" } });
    await expect(processarWebhook(webhook as PayloadWebhook, { rpc, appUrl: "" })).rejects.toThrow("whatsapp_receber: fora do ar");
  });
});
