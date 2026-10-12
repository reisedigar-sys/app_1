import type { Metadata } from "next";
import { Suspense } from "react";
import { Cartao, Carregando } from "@/components/ui";
import { exigirConta, tutorAtual } from "@/lib/conta/sessao";
import { caminhoSeguro } from "@/lib/conta/voltar";
import { FormularioPerfil } from "../formularios";

export const metadata: Metadata = { title: "Seus dados" };

export default function PerfilPage({ searchParams }: PageProps<"/conta/perfil">) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="mb-1 text-xl font-semibold">Seus dados</h1>
      <p className="mb-4 text-sm text-neutral-500">Precisamos do seu nome e celular para confirmar os agendamentos.</p>
      <Cartao>
        <Suspense fallback={<Carregando />}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </Cartao>
    </main>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const voltar = caminhoSeguro((await searchParams).voltar);
  await exigirConta(`/conta/perfil?voltar=${encodeURIComponent(voltar)}`);
  const tutor = await tutorAtual();
  const telefone = tutor?.telefone_e164?.replace(/^\+55/, "");
  return <FormularioPerfil voltar={voltar} nome={tutor?.nome} telefone={telefone} />;
}
