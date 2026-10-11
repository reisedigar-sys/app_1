import type { Metadata } from "next";
import { Suspense } from "react";
import { Aviso, Carregando, Titulo } from "@/components/ui";
import { exigirLoja, podeConfigurar } from "@/lib/painel/sessao";
import { FormularioLoja } from "./formulario";

export const metadata: Metadata = { title: "Dados da loja" };

export default function LojaPage({ params }: PageProps<"/painel/[lojaId]/loja">) {
  return (
    <>
      <Titulo>Dados da loja</Titulo>
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </>
  );
}

async function Conteudo({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params;
  const { loja, papel } = await exigirLoja(lojaId);
  const editavel = podeConfigurar(papel);
  return (
    <div className="flex flex-col gap-4">
      {!editavel && <Aviso>Só o dono ou o gerente altera os dados da loja.</Aviso>}
      <FormularioLoja loja={loja} editavel={editavel} />
    </div>
  );
}
