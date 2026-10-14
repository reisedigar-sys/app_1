import type { Metadata } from "next";
import { caminhoDoIcone } from "@/lib/app-da-loja";
import { lojaPorSlug } from "@/lib/loja-publica";

// App com a cara da loja: manifesto, nome e ícone da tela de início (Android e iPhone) vêm da loja.
export async function generateMetadata({ params }: LayoutProps<"/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const loja = await lojaPorSlug(slug);
  if (!loja) return {};
  return {
    manifest: `/${loja.slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: loja.nome, statusBarStyle: "default" },
    icons: { apple: caminhoDoIcone(loja.slug, 180, loja.logo_url) },
  };
}

export default function LojaLayout({ children }: LayoutProps<"/[slug]">) {
  return children;
}
