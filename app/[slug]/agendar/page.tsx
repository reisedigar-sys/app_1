import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Carregando } from "@/components/ui";
import { exigirTutor } from "@/lib/conta/sessao";
import { lojaPorSlug } from "@/lib/loja-publica";
import { createClient } from "@/lib/supabase/server";
import { FluxoAgendamento, type PedidoInicial, type PetTutor, type ServicoCatalogo } from "./fluxo";

export const metadata: Metadata = { title: "Agendar" };

export default function AgendarPage({ params, searchParams }: PageProps<"/[slug]/agendar">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const busca = await searchParams;
  const repetir = z.guid().safeParse(busca.repetir);
  const petInicial = z.guid().safeParse(busca.pet);
  const loja = await lojaPorSlug(slug);
  if (!loja) notFound();
  const tutor = await exigirTutor(`/${slug}/agendar`);
  const supabase = await createClient();
  const [pets, servicos, vinculo, anterior] = await Promise.all([
    supabase.from("pet").select("id, nome, raca, porte, pelagem, foto_url").eq("tutor_id", tutor.id).eq("ativo", true).order("nome"),
    supabase
      .from("servico")
      .select("id, nome, tipo, descricao, servico_preco(porte, pelagem, preco_centavos, duracao_minutos)")
      .eq("petshop_id", loja.id)
      .eq("ativo", true)
      .order("ordem")
      .order("nome"),
    supabase.from("tutor_petshop").select("consentimento_contato_em").eq("tutor_id", tutor.id).eq("petshop_id", loja.id).maybeSingle(),
    repetir.success
      ? supabase
          .from("agendamento")
          .select("pet_id, inicio, agendamento_item(servico_id, ordem)")
          .eq("pedido_id", repetir.data)
          .eq("tutor_id", tutor.id)
          .eq("petshop_id", loja.id)
          .order("inicio")
      : Promise.resolve({ data: null }),
  ]);
  const catalogo: ServicoCatalogo[] = (servicos.data ?? []).map((s) => ({
    id: s.id,
    nome: s.nome,
    tipo: s.tipo,
    descricao: s.descricao,
    precos: Object.fromEntries(s.servico_preco.map((p) => [`${p.porte}.${p.pelagem}`, { preco: p.preco_centavos, duracao: p.duracao_minutos }])),
  }));
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: loja.fuso }).format(new Date());

  return (
    <>
      <p className="mb-4 text-sm text-neutral-500">{loja.nome}</p>
      <FluxoAgendamento
        loja={{
          id: loja.id,
          nome: loja.nome,
          slug: loja.slug,
          telefone: loja.telefone_e164,
          hoje,
          fuso: loja.fuso,
          cancelamentoGratuitoHoras: loja.cancelamento_gratuito_horas,
        }}
        pets={(pets.data ?? []) as PetTutor[]}
        catalogo={catalogo}
        consentimentoAnterior={Boolean(vinculo.data?.consentimento_contato_em)}
        inicial={pedidoParaRepetir(anterior.data, (pets.data ?? []) as PetTutor[], catalogo)}
        petInicial={petInicial.success ? petInicial.data : undefined}
      />
    </>
  );
}

/**
 * "Repetir o último": o mesmo pet com os mesmos serviços, se ainda existem nesta loja com preço para o pet.
 * Qualquer diferença (pet inativo, serviço removido) faz o fluxo começar do zero.
 */
function pedidoParaRepetir(
  agendamentos: { pet_id: string; agendamento_item: { servico_id: string; ordem: number }[] }[] | null,
  pets: PetTutor[],
  catalogo: ServicoCatalogo[],
): PedidoInicial | undefined {
  if (!agendamentos?.length) return undefined;
  const servicos = new Map(catalogo.map((s) => [s.id, s]));
  const inicial: PedidoInicial = { pets: [], escolhas: {} };
  for (const a of agendamentos) {
    const pet = pets.find((p) => p.id === a.pet_id);
    if (!pet || inicial.escolhas[pet.id]) return undefined;
    const itens = [...a.agendamento_item].sort((x, y) => x.ordem - y.ordem).map((i) => servicos.get(i.servico_id));
    if (itens.some((s) => !s || !s.precos[`${pet.porte}.${pet.pelagem}`])) return undefined;
    const principal = itens.find((s) => s!.tipo === "principal");
    if (!principal) return undefined;
    inicial.pets.push(pet.id);
    inicial.escolhas[pet.id] = { principal: principal.id, adicionais: itens.filter((s) => s!.tipo === "adicional").map((s) => s!.id) };
  }
  return inicial;
}
