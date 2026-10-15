import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";

const texto = Figtree({ subsets: ["latin"], variable: "--font-texto", display: "swap" });
const titulo = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Hora do Pet", template: "%s · Hora do Pet" },
  description: "Agende banho e tosa no seu petshop em poucos toques.",
  appleWebApp: { capable: true, title: "Hora do Pet", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1c2340",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`h-full antialiased ${texto.variable} ${titulo.variable}`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
