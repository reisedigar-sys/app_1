import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Remarcar } from "@/app/conta/agendamentos/[agendamentoId]/remarcar/remarcar";
import { Carregando } from "@/components/ui";
import type { ItemPedido } from "@/lib/disponibilidade";
import { remarcar } from "../../acoes";
import { pedidoDoLink } from "../../pedido";

export const metadata: Metadata = { title: "Remarcar", robots: { index: false } };

export default function RemarcarPeloLinkPage({ params }: PageProps<"/c/[token]/remarcar/[agendamentoId]">) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ params }: { params: Promise<{ token: string; agendamentoId: string }> }) {
  const { token, agendamentoId } = await params;
  const pedido = await pedidoDoLink(token);
  const a = pedido?.agendamentos.find((x) => x.id === agendamentoId);
  if (!pedido || !a?.alteravel) notFound();
  // Sem login: a busca usa porte e pelagem do pet (o motor não revela o pet de ninguém).
  const itens: ItemPedido[] = [{ porte: a.porte, pelagem: a.pelagem, servicos: a.servico_ids }];
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: pedido.loja.fuso }).format(new Date());

  return (
    <>
      <h1 className="text-xl font-semibold">Remarcar</h1>
      <p className="mb-4 text-sm text-neutral-500">
        {a.pet_nome} · {a.servicos.join(" + ")} · {pedido.loja.nome}
      </p>
      <Remarcar
        agendamentoId={a.id}
        lojaId={pedido.loja.id}
        itens={itens}
        profissional={{ id: a.profissional_id, nome: a.profissional_nome }}
        hoje={hoje}
        slotMinutos={pedido.loja.slot_minutos}
        acaoRemarcar={remarcar.bind(null, token)}
        destino={`/c/${token}?aviso=remarcado`}
      />
    </>
  );
}
