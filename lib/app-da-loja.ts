import "server-only";

/** Tamanhos de ícone do app da loja (Android: 192 e 512; iPhone: 180). */
export const TAMANHOS_ICONE = [180, 192, 512] as const;

/** Iniciais para o ícone sem logo: "Pet Feliz Centro" → "PF"; "Banho & Cia" → "BC". */
export function iniciaisDaLoja(nome: string) {
  const palavras = nome.split(/[\s&]+/).filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p));
  return (palavras.length ? palavras : [nome])
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Versão do ícone: muda quando o logo muda (o celular guarda o ícone em cache). */
export function versaoDoIcone(logoUrl: string | null) {
  let h = 0;
  for (const c of logoUrl ?? "") h = (h * 31 + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

export const caminhoDoIcone = (slug: string, tamanho: number, logoUrl: string | null) => `/${slug}/icone/${tamanho}?v=${versaoDoIcone(logoUrl)}`;

/** Endereço público das imagens enviadas pela loja (bucket `fotos`); o logo só pode vir daí. */
export const prefixoDasFotos = (supabaseUrl: string) => `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/fotos/`;

/** Baixa o logo (só do Storage do próprio projeto, PNG ou JPG até 2 MB) como data URL; null se não der. */
export async function logoComoDataUrl(logoUrl: string | null, supabaseUrl: string) {
  if (!logoUrl?.startsWith(prefixoDasFotos(supabaseUrl))) return null;
  try {
    const r = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
    const tipo = r.headers.get("content-type") ?? "";
    if (!r.ok || !["image/png", "image/jpeg"].includes(tipo)) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > 2 * 1024 * 1024) return null;
    return `data:${tipo};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}
