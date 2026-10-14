// Gera o par de chaves VAPID do push (uma vez por ambiente). Uso: pnpm vapid:gerar
// A chave pública vai para a Vercel (NEXT_PUBLIC_VAPID_PUBLIC_KEY) e para a função (VAPID_PUBLIC_KEY);
// a privada só para os segredos da função (VAPID_PRIVATE_KEY). Não salve a privada em arquivo nem em print.
const b64url = (b) => Buffer.from(b).toString("base64url");
const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publica = b64url(await crypto.subtle.exportKey("raw", par.publicKey));
const privada = (await crypto.subtle.exportKey("jwk", par.privateKey)).d;
console.log(`VAPID_PUBLIC_KEY=${publica}\nVAPID_PRIVATE_KEY=${privada}`);
