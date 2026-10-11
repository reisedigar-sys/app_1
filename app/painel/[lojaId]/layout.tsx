import { Suspense } from "react";
import { exigirLoja } from "@/lib/painel/sessao";
import { Navegacao } from "./navegacao";

export default function LojaLayout({ children, params }: LayoutProps<"/painel/[lojaId]">) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4">
      <Suspense fallback={<div className="h-20" />}>
        <Cabecalho params={params} />
      </Suspense>
      <main className="mt-2">{children}</main>
    </div>
  );
}

async function Cabecalho({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params;
  const { loja } = await exigirLoja(lojaId);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-neutral-500">
        {loja.nome}
        {!loja.ativo && " · inativa"}
      </p>
      <Navegacao lojaId={lojaId} />
    </div>
  );
}
