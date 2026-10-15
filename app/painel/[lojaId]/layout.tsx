import { Suspense } from "react";
import { exigirLoja, podeOperar } from "@/lib/painel/sessao";
import { NavegacaoConfiguracao, NavegacaoOperacao } from "./navegacao";

export default function LojaLayout({ children, params }: LayoutProps<"/painel/[lojaId]">) {
  return (
    // No celular, o menu fica fixo embaixo: o espaço extra evita que ele cubra o fim da tela.
    <div className="mx-auto w-full max-w-4xl px-4 pt-4 pb-24 md:pb-4">
      <Suspense fallback={<div className="h-20" />}>
        <Cabecalho params={params} />
      </Suspense>
      <main className="mt-2">{children}</main>
    </div>
  );
}

async function Cabecalho({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params;
  const { loja, papel } = await exigirLoja(lojaId);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-neutral-500">
        {loja.nome}
        {!loja.ativo && " · inativa"}
      </p>
      <NavegacaoOperacao lojaId={lojaId} operacao={podeOperar(papel)} />
      <NavegacaoConfiguracao lojaId={lojaId} />
    </div>
  );
}
