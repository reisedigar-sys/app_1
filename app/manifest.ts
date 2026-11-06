import type { MetadataRoute } from "next";

// App do tutor: abre em Minha conta. A equipe instala o app da loja (public/loja.webmanifest, a partir do painel ou
// do login da equipe), que abre no painel. O `id` fica "/" para quem já instalou continuar com o mesmo app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Salão do Pet",
    short_name: "Salão do Pet",
    description: "Agende banho e tosa no seu petshop em poucos toques.",
    lang: "pt-BR",
    start_url: "/conta",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1c2340",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
