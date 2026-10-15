// Web Push sem dependências (só Web Crypto): roda na Edge Function (Deno) e nos testes (Node 22).
//   * Autenticação VAPID (RFC 8292): JWT ES256 assinado com a chave privada do Hora do Pet.
//   * Conteúdo cifrado com aes128gcm (RFC 8188 e RFC 8291), com as chaves que o navegador gerou na inscrição.

export type InscricaoPush = { id?: string; endpoint: string; p256dh: string; auth: string };
export type ChavesVapid = { publica: string; privada: string; assunto: string };
export type ResultadoPush = { ok: true } | { ok: false; erro: string; expirada?: boolean };

type Bytes = Uint8Array<ArrayBuffer>;
const sutil = () => globalThis.crypto.subtle;
const texto = (s: string): Bytes => new TextEncoder().encode(s) as Bytes;

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function deBase64url(s: string): Bytes {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  const r = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) r[i] = b.charCodeAt(i);
  return r as Bytes;
}

export function juntar(...partes: Uint8Array[]): Bytes {
  const r = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    r.set(p, i);
    i += p.length;
  }
  return r as Bytes;
}

async function hmac(chave: Bytes, dados: Bytes): Promise<Bytes> {
  const k = await sutil().importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await sutil().sign("HMAC", k, dados)) as Bytes;
}

/** HKDF de um bloco (até 32 bytes), como nas RFC 8188 e 8291. */
export async function hkdf(sal: Bytes, ikm: Bytes, info: Bytes, tamanho: number): Promise<Bytes> {
  const prk = await hmac(sal, ikm);
  return (await hmac(prk, juntar(info, new Uint8Array([1])))).slice(0, tamanho) as Bytes;
}

/** Chave pública P-256 (65 bytes, sem compressão) → JWK. */
function jwkPublica(publica: Bytes): JsonWebKey {
  return { kty: "EC", crv: "P-256", x: base64url(publica.slice(1, 33)), y: base64url(publica.slice(33, 65)), ext: true };
}

/** Deriva as chaves do conteúdo (RFC 8291, seção 3.4). Usada para cifrar e, nos testes, para decifrar. */
export async function chavesDoConteudo(segredoEcdh: Bytes, auth: Bytes, publicaDoNavegador: Bytes, publicaDoServidor: Bytes, sal: Bytes) {
  const ikm = await hkdf(auth, segredoEcdh, juntar(texto("WebPush: info\0"), publicaDoNavegador, publicaDoServidor), 32);
  const cek = await hkdf(sal, ikm, texto("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sal, ikm, texto("Content-Encoding: nonce\0"), 12);
  return { cek, nonce };
}

/** Cifra o conteúdo para a inscrição (um registro só, com o delimitador final 0x02). */
export async function cifrar(conteudo: Bytes, p256dh: string, auth: string) {
  const publicaDoNavegador = deBase64url(p256dh);
  const efemera = (await sutil().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const publicaDoServidor = new Uint8Array(await sutil().exportKey("raw", efemera.publicKey)) as Bytes;
  const chaveDoNavegador = await sutil().importKey("raw", publicaDoNavegador, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const segredo = new Uint8Array(await sutil().deriveBits({ name: "ECDH", public: chaveDoNavegador }, efemera.privateKey, 256)) as Bytes;

  const sal = globalThis.crypto.getRandomValues(new Uint8Array(16)) as Bytes;
  const { cek, nonce } = await chavesDoConteudo(segredo, deBase64url(auth), publicaDoNavegador, publicaDoServidor, sal);
  const chave = await sutil().importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(await sutil().encrypt({ name: "AES-GCM", iv: nonce }, chave, juntar(conteudo, new Uint8Array([2]))));

  // Cabeçalho aes128gcm: sal (16) | tamanho do registro (4) | tamanho da chave (1) | chave pública do servidor (65).
  const tamanhoRegistro = new Uint8Array([0, 0, 16, 0]); // 4096
  return juntar(sal, tamanhoRegistro, new Uint8Array([publicaDoServidor.length]), publicaDoServidor, cifrado);
}

/** JWT VAPID (ES256) para o servidor de push do endpoint. */
export async function jwtVapid(endpoint: string, chaves: ChavesVapid, agora = Date.now()) {
  const publica = deBase64url(chaves.publica);
  const jwk = { ...jwkPublica(publica), d: chaves.privada };
  const chave = await sutil().importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const cabecalho = base64url(texto(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corpo = base64url(
    texto(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(agora / 1000) + 12 * 3600, sub: chaves.assunto })),
  );
  // O Web Crypto devolve a assinatura no formato r||s, que é o que o JWT espera.
  const assinatura = new Uint8Array(await sutil().sign({ name: "ECDSA", hash: "SHA-256" }, chave, texto(`${cabecalho}.${corpo}`)));
  return `${cabecalho}.${corpo}.${base64url(assinatura)}`;
}

/** Envia um push. 404/410: a inscrição não existe mais (o celular desligou os avisos ou reinstalou o app). */
export class ProvedorPush {
  constructor(
    private readonly chaves: ChavesVapid,
    private readonly f: typeof fetch = fetch,
  ) {}

  async enviar(inscricao: InscricaoPush, dados: unknown): Promise<ResultadoPush> {
    const corpo = await cifrar(texto(JSON.stringify(dados)), inscricao.p256dh, inscricao.auth);
    const jwt = await jwtVapid(inscricao.endpoint, this.chaves);
    const r = await this.f(inscricao.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${this.chaves.publica}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(24 * 3600),
        Urgency: "high",
      },
      body: corpo,
    });
    if (r.ok) return { ok: true };
    const detalhe = (await r.text().catch(() => "")).slice(0, 200);
    return { ok: false, erro: `push ${r.status}${detalhe ? `: ${detalhe}` : ""}`, expirada: r.status === 404 || r.status === 410 };
  }
}
