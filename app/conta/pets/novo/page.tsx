import type { Metadata } from "next";
import { Suspense } from "react";
import { Cartao, Carregando } from "@/components/ui";
import { exigirTutor } from "@/lib/conta/sessao";
import { caminhoSeguro } from "@/lib/conta/voltar";
import { FormularioPet } from "../formulario";

export const metadata: Metadata = { title: "Cadastrar pet" };

export default function NovoPetPage({ searchParams }: PageProps<"/conta/pets/novo">) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">Cadastrar pet</h1>
      <Cartao>
        <Suspense fallback={<Carregando />}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </Cartao>
    </main>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const voltar = caminhoSeguro((await searchParams).voltar, "/conta/pets");
  const tutor = await exigirTutor(`/conta/pets/novo?voltar=${encodeURIComponent(voltar)}`);
  return <FormularioPet tutorId={tutor.id} voltar={voltar} />;
}
