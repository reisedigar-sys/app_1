import type { Metadata } from "next";

/** App instalável da equipe ("Salão do Pet Loja"): abre no painel, separado do app do tutor, que abre em Minha conta. */
export const metadataAppDaEquipe: Metadata = {
  manifest: "/loja.webmanifest",
  appleWebApp: { capable: true, title: "Salão Loja", statusBarStyle: "default" },
  icons: { apple: "/icons/loja-180.png" },
};
