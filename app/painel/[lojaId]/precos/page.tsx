import type { Metadata } from "next";
import { Suspense } from "react";
import { Aviso, Carregando, Titulo, Vazio } from "@/components/ui";
import { centavosParaReais } from "@/lib/painel/formatos";
import { type Grade, gradeVazia } from "@/lib/painel/precos";
import { exigirLoja, podeConfigurar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { GradePrecos } from "./grade";

export const metadata: Metadata = { title: "Preços e duração" };

export default function PrecosPage({ params, searchParams }: PageProps<"/painel/[lojaId]/precos">) {
  return (
    <>
      <Titulo>Preços e duração</Titulo>
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: Promise<{ lojaId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lojaId } = await params;
  const { servico: servicoParam } = await searchParams;
  const { papel } = await exigirLoja(lojaId);
  const supabase = await createClient();

  const [servs, todos] = await Promise.all([
    supabase.from("servico").select("id, nome, tipo, ativo").eq("petshop_id", lojaId).order("ordem").order("nome"),
    supabase
      .from("servico_preco")
      .select("servico_id, porte, pelagem, preco_centavos, duracao_minutos")
      .eq("petshop_id", lojaId),
  ]);
  if (servs.error || todos.error) return <Aviso tipo="erro">Não foi possível carregar os serviços.</Aviso>;
  const servicos = servs.data;
  if (servicos.length === 0) return <Vazio>Cadastre um serviço antes de definir preços.</Vazio>;

  // Tabelas de todos os serviços da loja: a do serviço aberto e as que podem ser copiadas para ele.
  const grades = new Map<string, Grade>();
  for (const p of todos.data) {
    const g = grades.get(p.servico_id) ?? gradeVazia();
    g[`${p.porte}.${p.pelagem}`] = { preco: centavosParaReais(p.preco_centavos), duracao: String(p.duracao_minutos) };
    grades.set(p.servico_id, g);
  }
  const selecionado = servicos.find((s) => s.id === servicoParam) ?? servicos[0];

  return (
    <div className="flex flex-col gap-4">
      {!podeConfigurar(papel) && <Aviso>Só o dono ou o gerente altera os preços.</Aviso>}
      <GradePrecos
        key={selecionado.id}
        lojaId={lojaId}
        servico={{ id: selecionado.id, nome: selecionado.nome, tipo: selecionado.tipo }}
        servicos={servicos.map((s) => ({ id: s.id, nome: s.nome, semPreco: s.ativo && !grades.has(s.id) }))}
        inicial={grades.get(selecionado.id) ?? gradeVazia()}
        outros={servicos
          .filter((s) => s.id !== selecionado.id && grades.has(s.id))
          .map((s) => ({ id: s.id, nome: s.nome, grade: grades.get(s.id) ?? gradeVazia() }))}
        editavel={podeConfigurar(papel)}
      />
    </div>
  );
}
