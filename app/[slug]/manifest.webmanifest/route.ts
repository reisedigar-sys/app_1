import { caminhoDoIcone } from "@/lib/app-da-loja";
import { lojaPorSlug } from "@/lib/loja-publica";

// Manifesto do PWA da loja: quem instala o app a partir de /{slug} vê o nome e o logo da loja na tela de início.
// O `id` separa o app de cada loja (o mesmo celular pode ter o app de duas lojas); o escopo é o site todo, para
// a conta e o link de confirmação abrirem dentro do app.
export async function GET(_: Request, { params }: RouteContext<"/[slug]/manifest.webmanifest">) {
  const { slug } = await params;
  const loja = await lojaPorSlug(slug);
  if (!loja) return new Response("loja não encontrada", { status: 404 });
  const icone = (t: number) => caminhoDoIcone(loja.slug, t, loja.logo_url);
  return Response.json(
    {
      id: `/${loja.slug}`,
      name: loja.nome,
      short_name: loja.nome,
      description: `Agende banho e tosa na ${loja.nome}.`,
      lang: "pt-BR",
      start_url: `/${loja.slug}`,
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#0f766e",
      icons: [
        { src: icone(192), sizes: "192x192", type: "image/png" },
        { src: icone(512), sizes: "512x512", type: "image/png" },
        { src: icone(512), sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" } },
  );
}
