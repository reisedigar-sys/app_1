import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Aviso, Carregando, Titulo, Vazio } from "@/components/ui";
import { PELAGENS, PORTES, centavosParaReais } from "@/lib/painel/formatos";
import { exigirLoja, podeConfigurar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import type { Grade } from "./acoes";
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

  const { data: servicos, error } = await supabase
    .from("servico")
    .select("id, nome, tipo, ativo, servico_preco(count)")
    .eq("petshop_id", lojaId)
    .order("ordem")
    .order("nome");
  if (error) return <Aviso tipo="erro">Não foi possível carregar os serviços.</Aviso>;
  if (servicos.length === 0) return <Vazio>Cadastre um serviço antes de definir preços.</Vazio>;

  const selecionado = servicos.find((s) => s.id === servicoParam) ?? servicos[0];
  const { data: precos } = await supabase
    .from("servico_preco")
    .select("porte, pelagem, preco_centavos, duracao_minutos")
    .eq("servico_id", selecionado.id);

  const inicial: Grade = {};
  for (const porte of PORTES) for (const pelagem of PELAGENS) inicial[`${porte}.${pelagem}`] = { preco: "", duracao: "" };
  for (const p of precos ?? []) inicial[`${p.porte}.${p.pelagem}`] = { preco: centavosParaReais(p.preco_centavos), duracao: String(p.duracao_minutos) };

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Serviço" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2 pb-1">
          {servicos.map((s) => {
            const total = s.servico_preco[0]?.count ?? 0;
            return (
              <li key={s.id}>
                <Link
                  href={`/painel/${lojaId}/precos?servico=${s.id}`}
                  aria-current={s.id === selecionado.id ? "page" : undefined}
                  className="flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full border border-neutral-300 px-3 text-sm aria-[current=page]:border-teal-700 aria-[current=page]:bg-teal-50 aria-[current=page]:text-teal-800 dark:border-neutral-700 dark:aria-[current=page]:bg-teal-950 dark:aria-[current=page]:text-teal-200"
                >
                  {s.nome}
                  {total === 0 && s.ativo && <span className="size-2 rounded-full bg-amber-500" aria-label="sem preço" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {!podeConfigurar(papel) && <Aviso>Só o dono ou o gerente altera os preços.</Aviso>}
      <GradePrecos key={selecionado.id} lojaId={lojaId} servicoId={selecionado.id} inicial={inicial} editavel={podeConfigurar(papel)} />
    </div>
  );
}
