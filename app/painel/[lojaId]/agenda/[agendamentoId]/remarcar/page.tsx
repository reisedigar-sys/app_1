import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Aviso, Carregando, Titulo } from "@/components/ui";
import type { ItemPedido } from "@/lib/disponibilidade";
import { dataNoFuso, horaNoFuso, podeRemarcarOuCancelar } from "@/lib/painel/agenda";
import { exigirLoja, podeOperar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { RemarcarPainel } from "./remarcar";

export const metadata: Metadata = { title: "Remarcar" };

export default function RemarcarPage({ params }: PageProps<"/painel/[lojaId]/agenda/[agendamentoId]/remarcar">) {
  return (
    <>
      <Titulo>Remarcar</Titulo>
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </>
  );
}

async function Conteudo({ params }: { params: Promise<{ lojaId: string; agendamentoId: string }> }) {
  const { lojaId, agendamentoId } = await params;
  const { loja, papel } = await exigirLoja(lojaId);
  if (!podeOperar(papel)) return <Aviso tipo="alerta">Só a recepção, a gerência ou o dono remarcam atendimentos.</Aviso>;
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("agendamento")
    .select("id, status, inicio, pet_id, pet(nome), profissional(id, nome), agendamento_item(servico_id, ordem, servico(nome))")
    .eq("id", agendamentoId)
    .eq("petshop_id", lojaId)
    .maybeSingle();
  if (!a) notFound();
  if (!podeRemarcarOuCancelar(a.status)) return <Aviso tipo="alerta">Este atendimento não pode mais ser remarcado.</Aviso>;
  const itens = [...a.agendamento_item].sort((x, y) => x.ordem - y.ordem);
  const pedido: ItemPedido[] = [{ pet_id: a.pet_id, servicos: itens.map((i) => i.servico_id) }];
  const { data: profs } = await supabase.rpc("profissionais_aptos", { p_petshop_id: lojaId, p_itens: pedido });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-500">
        {a.pet?.nome} · {itens.map((i) => i.servico?.nome).join(" + ")} · hoje marcado para{" "}
        {dataNoFuso(a.inicio, loja.fuso).split("-").reverse().join("/")} às {horaNoFuso(a.inicio, loja.fuso)} com {a.profissional?.nome}.{" "}
        <Link href={`/painel/${lojaId}/agenda/${a.id}`} className="text-marca-700 underline dark:text-marca-400">
          Voltar
        </Link>
      </p>
      <RemarcarPainel
        lojaId={lojaId}
        agendamentoId={a.id}
        itens={pedido}
        atual={{ id: a.profissional?.id ?? "", nome: a.profissional?.nome ?? "" }}
        profissionais={(profs ?? []).map((p) => ({ id: p.profissional_id, nome: p.nome }))}
        hoje={dataNoFuso(new Date(), loja.fuso)}
        slotMinutos={loja.slot_minutos}
      />
    </div>
  );
}
