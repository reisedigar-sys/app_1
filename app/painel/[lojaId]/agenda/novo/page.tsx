import type { Metadata } from "next";
import { Suspense } from "react";
import { Aviso, Carregando, Titulo } from "@/components/ui";
import { dataNoFuso, ehData } from "@/lib/painel/agenda";
import { exigirLoja, podeOperar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { PetBalcao } from "../acoes";
import { type Escolha, type Inicial, NovoAtendimento } from "./novo";

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
  const { data: dataBusca, cliente, pet } = await searchParams;
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
  const inicial = await clienteInicial(lojaId, cliente, pet, servicos.data);

  return (
    <NovoAtendimento
      lojaId={lojaId}
      catalogo={servicos.data.map((s) => ({ id: s.id, nome: s.nome, tipo: s.tipo, precos: s.servico_preco }))}
      profissionais={profs.data}
      dataInicial={ehData(dataBusca) ? dataBusca : hoje}
      slotMinutos={loja.slot_minutos}
      inicial={inicial}
    />
  );
}

const id = z.guid();

/**
 * "Agendar de novo" a partir da ficha do cliente: o tutor já vem escolhido e, com um pet, os serviços do último
 * atendimento dele nesta loja (só os que continuam ativos e têm preço para o porte e a pelagem).
 */
async function clienteInicial(
  lojaId: string,
  cliente: unknown,
  pet: unknown,
  catalogo: { id: string; tipo: string; servico_preco: { porte: string; pelagem: string }[] }[],
): Promise<Inicial | undefined> {
  const tutorId = id.safeParse(cliente);
  if (!tutorId.success) return undefined;
  const supabase = await createClient();
  const { data: t } = await supabase.from("tutor").select("telefone_e164").eq("id", tutorId.data).maybeSingle();
  if (!t?.telefone_e164) return undefined;
  const { data: achados } = await supabase.rpc("buscar_tutor_balcao", { p_petshop_id: lojaId, p_telefone: t.telefone_e164 });
  const r = achados?.find((x) => x.tutor_id === tutorId.data);
  if (!r) return undefined;
  const pets = r.pets as unknown as PetBalcao[];
  const tutor = { id: r.tutor_id, nome: r.nome, telefone: r.telefone, temConta: r.tem_conta, faltas: r.faltas, exigeSinal: r.exige_sinal, pets };

  const petId = id.safeParse(pet);
  const escolhido = petId.success ? pets.find((p) => p.id === petId.data) : undefined;
  if (!escolhido) return { tutor, pets: [], escolhas: {} };

  const { data: ultimo } = await supabase
    .from("agendamento")
    .select("agendamento_item(ordem, servico_id)")
    .eq("petshop_id", lojaId)
    .eq("pet_id", escolhido.id)
    .not("status", "in", "(cancelado,faltou)")
    .order("inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  const disponivel = (sid: string) =>
    catalogo.find((s) => s.id === sid && s.servico_preco.some((p) => p.porte === escolhido.porte && p.pelagem === escolhido.pelagem));
  const anteriores = [...(ultimo?.agendamento_item ?? [])].sort((a, b) => a.ordem - b.ordem).map((i) => disponivel(i.servico_id)).filter((s) => s !== undefined);
  const principal = anteriores.find((s) => s.tipo === "principal");
  const escolha: Escolha = { principal: principal?.id ?? "", adicionais: anteriores.filter((s) => s.tipo === "adicional").map((s) => s.id) };
  return { tutor, pets: [escolhido.id], escolhas: principal ? { [escolhido.id]: escolha } : {} };
}
