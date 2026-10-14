import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Aviso, Carregando } from "@/components/ui";
import { dataNoFuso, diaPorExtenso, ehData, somarDias } from "@/lib/painel/agenda";
import { COLUNAS_MENSAGEM, type LinhaMensagem } from "@/lib/painel/mensagens";
import { exigirLoja, podeOperar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { ListaMensagens } from "./lista";

export const metadata: Metadata = { title: "Mensagens" };

export default function MensagensPage({ params, searchParams }: PageProps<"/painel/[lojaId]/mensagens">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ params, searchParams }: { params: Promise<{ lojaId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ lojaId }, busca] = await Promise.all([params, searchParams]);
  const { loja, papel } = await exigirLoja(lojaId);
  if (!podeOperar(papel)) return <Aviso>As mensagens aos clientes ficam com a recepção da loja.</Aviso>;
  const hoje = dataNoFuso(new Date(), loja.fuso);
  const data = ehData(busca.data) ? busca.data : hoje;
  const supabase = await createClient();
  const [{ data: de }, { data: ate }] = await Promise.all([
    supabase.rpc("horario_da_loja", { p_petshop_id: lojaId, p_local: `${data} 00:00` }),
    supabase.rpc("horario_da_loja", { p_petshop_id: lojaId, p_local: `${somarDias(data, 1)} 00:00` }),
  ]);
  const { data: mensagens } = await supabase
    .from("notificacao_agendada")
    .select(COLUNAS_MENSAGEM)
    .eq("petshop_id", lojaId)
    .gte("enviar_em", de ?? "")
    .lt("enviar_em", ate ?? "")
    .order("enviar_em");
  const link = (d: string) => `/painel/${lojaId}/mensagens?data=${d}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold first-letter:uppercase">Mensagens · {diaPorExtenso(data)}</h1>
        <p className="text-sm text-neutral-500">Confirmações, lembretes e avisos do dia, na hora prevista de envio.</p>
      </div>
      <nav aria-label="Dia" className="flex gap-2 text-sm">
        <Link href={link(somarDias(data, -1))} className="rounded-full border border-neutral-300 px-3 py-2 dark:border-neutral-700">‹ Anterior</Link>
        <Link href={link(hoje)} className="rounded-full border border-neutral-300 px-3 py-2 dark:border-neutral-700">Hoje</Link>
        <Link href={link(somarDias(data, 1))} className="rounded-full border border-neutral-300 px-3 py-2 dark:border-neutral-700">Próximo ›</Link>
      </nav>
      <Aviso tipo="alerta">
        Envio pelo WhatsApp em preparação: por enquanto as mensagens são registradas aqui, com o texto exato, mas ainda não chegam ao celular do cliente.
      </Aviso>
      <ListaMensagens mensagens={(mensagens ?? []) as LinhaMensagem[]} fuso={loja.fuso} />
    </div>
  );
}
