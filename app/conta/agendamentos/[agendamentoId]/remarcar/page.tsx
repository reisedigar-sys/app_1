import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Carregando } from "@/components/ui";
import { exigirTutor } from "@/lib/conta/sessao";
import type { ItemPedido } from "@/lib/disponibilidade";
import { createClient } from "@/lib/supabase/server";
import { Remarcar } from "./remarcar";

export const metadata: Metadata = { title: "Remarcar" };

export default function RemarcarPage({ params }: PageProps<"/conta/agendamentos/[agendamentoId]/remarcar">) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ params }: { params: Promise<{ agendamentoId: string }> }) {
  const { agendamentoId } = await params;
  await exigirTutor(`/conta/agendamentos/${agendamentoId}/remarcar`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("meus_agendamentos");
  const a = data?.find((x) => x.id === agendamentoId);
  if (!a || !["agendado", "confirmado"].includes(a.status)) notFound();
  const [{ data: itens }, { data: loja }] = await Promise.all([
    supabase.from("agendamento_item").select("servico_id, ordem").eq("agendamento_id", a.id).order("ordem"),
    supabase.from("petshop").select("fuso").eq("id", a.petshop_id).single(),
  ]);
  const pedido: ItemPedido[] = [{ pet_id: a.pet_id, servicos: (itens ?? []).map((i) => i.servico_id) }];
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: loja?.fuso ?? a.loja_fuso }).format(new Date());

  return (
    <>
      <h1 className="text-xl font-semibold">Remarcar</h1>
      <p className="mb-4 text-sm text-neutral-500">
        {a.pet_nome} · {a.servicos.join(" + ")} · {a.loja_nome}
      </p>
      <Remarcar
        agendamentoId={a.id}
        lojaId={a.petshop_id}
        itens={pedido}
        profissional={{ id: a.profissional_id, nome: a.profissional_nome }}
        hoje={hoje}
      />
    </>
  );
}
