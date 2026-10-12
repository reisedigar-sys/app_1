import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Carregando } from "@/components/ui";
import { exigirTutor } from "@/lib/conta/sessao";
import { lojaPorSlug } from "@/lib/loja-publica";
import { createClient } from "@/lib/supabase/server";
import { FluxoAgendamento, type PetTutor, type ServicoCatalogo } from "./fluxo";

export const metadata: Metadata = { title: "Agendar" };

export default function AgendarPage({ params }: PageProps<"/[slug]/agendar">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-4">
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </main>
  );
}

async function Conteudo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const loja = await lojaPorSlug(slug);
  if (!loja) notFound();
  const tutor = await exigirTutor(`/${slug}/agendar`);
  const supabase = await createClient();
  const [pets, servicos] = await Promise.all([
    supabase.from("pet").select("id, nome, raca, porte, pelagem, foto_url").eq("tutor_id", tutor.id).eq("ativo", true).order("nome"),
    supabase
      .from("servico")
      .select("id, nome, tipo, descricao, servico_preco(porte, pelagem, preco_centavos, duracao_minutos)")
      .eq("petshop_id", loja.id)
      .eq("ativo", true)
      .order("ordem")
      .order("nome"),
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
      <p className="mb-3 text-sm text-neutral-500">{loja.nome}</p>
      <FluxoAgendamento
        loja={{ id: loja.id, nome: loja.nome, slug: loja.slug, telefone: loja.telefone_e164, slotMinutos: loja.slot_minutos, hoje }}
        pets={(pets.data ?? []) as PetTutor[]}
        catalogo={catalogo}
      />
    </>
  );
}
