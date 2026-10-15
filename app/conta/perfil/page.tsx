import type { Metadata } from "next";
import { Suspense } from "react";
import { AvisosPush } from "@/components/avisos-push";
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
      <Suspense fallback={<Carregando />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const voltar = caminhoSeguro((await searchParams).voltar);
  await exigirConta(`/conta/perfil?voltar=${encodeURIComponent(voltar)}`);
  const tutor = await tutorAtual();
  const telefone = tutor?.telefone_e164?.replace(/^\+55/, "");
  return (
    <div className="flex flex-col gap-4">
      <Cartao>
        <FormularioPerfil voltar={voltar} nome={tutor?.nome} telefone={telefone} />
      </Cartao>
      {/* Vale para o aparelho, não para uma loja: por isso fica na conta, e o WhatsApp de cada loja em Minhas lojas. */}
      {/* No primeiro cadastro (a caminho do agendamento) só o essencial. */}
      {telefone && (
        <Cartao>
          <h2 className="mb-2 font-medium">Avisos no celular</h2>
          <AvisosPush escopo="tutor" texto="Receba neste celular as confirmações, os lembretes e o aviso de pet pronto de todas as suas lojas, de graça." />
        </Cartao>
      )}
    </div>
  );
}
