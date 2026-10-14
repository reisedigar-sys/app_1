import { ImageResponse } from "next/og";
import { TAMANHOS_ICONE, iniciaisDaLoja, logoComoDataUrl } from "@/lib/app-da-loja";
import { lojaPorSlug } from "@/lib/loja-publica";
import { supabaseUrl } from "@/lib/supabase/env";

// Ícone do app da loja: o logo sobre fundo branco (com margem, para o recorte redondo do Android) ou as iniciais.
export async function GET(_: Request, { params }: RouteContext<"/[slug]/icone/[tamanho]">) {
  const { slug, tamanho } = await params;
  const t = Number(tamanho);
  const loja = await lojaPorSlug(slug);
  if (!loja || !TAMANHOS_ICONE.includes(t as (typeof TAMANHOS_ICONE)[number])) return new Response("não encontrado", { status: 404 });

  // O logo é baixado aqui (e não pelo gerador de imagem) para cair nas iniciais se ele não abrir.
  const logo = await logoComoDataUrl(loja.logo_url, supabaseUrl());
  const conteudo = logo ? (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- imagem desenhada pelo ImageResponse */}
      <img src={logo} alt="" width={Math.round(t * 0.72)} height={Math.round(t * 0.72)} style={{ objectFit: "contain" }} />
    </div>
  ) : (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ef5a3c",
        color: "#ffffff",
        fontSize: Math.round(t * 0.38),
        fontWeight: 700,
      }}
    >
      {iniciaisDaLoja(loja.nome)}
    </div>
  );
  return new ImageResponse(conteudo, { width: t, height: t, headers: { "Cache-Control": "public, max-age=86400" } });
}
