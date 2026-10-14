import { describe, expect, it } from "vitest";
import { ProvedorPush, base64url, chavesDoConteudo, deBase64url, jwtVapid } from "@/supabase/functions/_shared/webpush";

const sutil = globalThis.crypto.subtle;

async function parDeChaves(uso: "ECDH" | "ECDSA") {
  const par = (await sutil.generateKey({ name: uso, namedCurve: "P-256" }, true, uso === "ECDH" ? ["deriveBits"] : ["sign", "verify"])) as CryptoKeyPair;
  const publica = new Uint8Array(await sutil.exportKey("raw", par.publicKey));
  const jwk = await sutil.exportKey("jwk", par.privateKey);
  return { par, publica, privada: jwk.d! };
}

/** Faz o papel do navegador: decifra o corpo aes128gcm com a chave privada da inscrição. */
async function decifrar(corpo: Uint8Array, navegador: CryptoKeyPair, publicaDoNavegador: Uint8Array, auth: Uint8Array) {
  const sal = corpo.slice(0, 16);
  const tamanhoChave = corpo[20];
  const publicaDoServidor = corpo.slice(21, 21 + tamanhoChave);
  const cifrado = corpo.slice(21 + tamanhoChave);
  const chaveServidor = await sutil.importKey("raw", publicaDoServidor, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const segredo = new Uint8Array(await sutil.deriveBits({ name: "ECDH", public: chaveServidor }, navegador.privateKey, 256));
  const { cek, nonce } = await chavesDoConteudo(segredo as never, auth as never, publicaDoNavegador as never, publicaDoServidor as never, sal as never);
  const chave = await sutil.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const claro = new Uint8Array(await sutil.decrypt({ name: "AES-GCM", iv: nonce }, chave, cifrado));
  expect(claro[claro.length - 1]).toBe(2);
  return new TextDecoder().decode(claro.slice(0, -1));
}

describe("web push", () => {
  it("base64url ida e volta", () => {
    const b = new Uint8Array([0, 250, 251, 252, 253, 254, 255]);
    expect(deBase64url(base64url(b))).toEqual(b);
  });

  it("cifra o conteúdo para a inscrição e assina o JWT VAPID com a chave do servidor", async () => {
    const navegador = await parDeChaves("ECDH");
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const vapid = await parDeChaves("ECDSA");
    const chaves = { publica: base64url(vapid.publica), privada: vapid.privada, assunto: "mailto:teste@horadopet.com.br" };

    const pedidos: { url: string; init: RequestInit }[] = [];
    const f = (async (url: string, init: RequestInit) => {
      pedidos.push({ url, init });
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;
    const provedor = new ProvedorPush(chaves, f);
    const dados = { titulo: "Pet Feliz Centro", corpo: "Thor está pronto!", url: "https://x/c/abc" };
    const inscricao = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: base64url(navegador.publica), auth: base64url(auth) };
    expect(await provedor.enviar(inscricao, dados)).toEqual({ ok: true });

    const { url, init } = pedidos[0];
    expect(url).toBe(inscricao.endpoint);
    const cabecalhos = init.headers as Record<string, string>;
    expect(cabecalhos["Content-Encoding"]).toBe("aes128gcm");
    expect(JSON.parse(await decifrar(init.body as Uint8Array, navegador.par, navegador.publica, auth))).toEqual(dados);

    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(cabecalhos.Authorization)!;
    expect(k).toBe(chaves.publica);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(new TextDecoder().decode(deBase64url(c)))).toMatchObject({ aud: "https://fcm.googleapis.com", sub: chaves.assunto });
    const valida = await sutil.verify({ name: "ECDSA", hash: "SHA-256" }, vapid.par.publicKey, deBase64url(s), new TextEncoder().encode(`${h}.${c}`));
    expect(valida).toBe(true);
  });

  it("410: inscrição expirada", async () => {
    const navegador = await parDeChaves("ECDH");
    const vapid = await parDeChaves("ECDSA");
    const f = (async () => new Response("gone", { status: 410 })) as unknown as typeof fetch;
    const provedor = new ProvedorPush({ publica: base64url(vapid.publica), privada: vapid.privada, assunto: "mailto:a@b.c" }, f);
    const r = await provedor.enviar({ endpoint: "https://push.exemplo/x", p256dh: base64url(navegador.publica), auth: base64url(new Uint8Array(16)) }, {});
    expect(r).toEqual({ ok: false, erro: "push 410: gone", expirada: true });
  });

  it("o JWT expira em 12 h", async () => {
    const vapid = await parDeChaves("ECDSA");
    const jwt = await jwtVapid("https://push.exemplo/x", { publica: base64url(vapid.publica), privada: vapid.privada, assunto: "mailto:a@b.c" }, 0);
    expect(JSON.parse(new TextDecoder().decode(deBase64url(jwt.split(".")[1]))).exp).toBe(12 * 3600);
  });
});
