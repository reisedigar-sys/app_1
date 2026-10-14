import type { Metadata } from "next";
import { Suspense } from "react";
import { Aviso, Carregando, Titulo } from "@/components/ui";
import { dataNoFuso, ehData } from "@/lib/painel/agenda";
import { exigirLoja, podeOperar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { NovoAtendimento } from "./novo";

export const metadata: Metadata = { title: "Novo atendimento" };

export default function NovoAtendimentoPage({ params, searchParams }: PageProps<"/painel/[lojaId]/agenda/novo">) {
  return (
    <>
      <Titulo>Novo atendimento</Titulo>
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Conteudo({ params, searchParams }: { params: Promise<{ lojaId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { lojaId } = await params;
  const { data: dataBusca } = await searchParams;
  const { loja, papel } = await exigirLoja(lojaId);
  if (!podeOperar(papel)) return <Aviso tipo="alerta">Só a recepção, a gerência ou o dono criam atendimentos.</Aviso>;
  const supabase = await createClient();
  const [servicos, profs] = await Promise.all([
    supabase
      .from("servico")
      .select("id, nome, tipo, ordem, servico_preco(porte, pelagem, preco_centavos, duracao_minutos)")
      .eq("petshop_id", lojaId)
      .eq("ativo", true)
      .order("ordem")
      .order("nome"),
    supabase.from("profissional").select("id, nome").eq("petshop_id", lojaId).eq("ativo", true).order("ordem").order("nome"),
  ]);
  if (servicos.error || profs.error) return <Aviso tipo="erro">Não foi possível carregar o catálogo da loja.</Aviso>;
  const hoje = dataNoFuso(new Date(), loja.fuso);

  return (
    <NovoAtendimento
      lojaId={lojaId}
      catalogo={servicos.data.map((s) => ({ id: s.id, nome: s.nome, tipo: s.tipo, precos: s.servico_preco }))}
      profissionais={profs.data}
      dataInicial={ehData(dataBusca) ? dataBusca : hoje}
      slotMinutos={loja.slot_minutos}
    />
  );
}
