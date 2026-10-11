import type { Metadata } from "next";
import { Suspense } from "react";
import { Aviso, Cartao, Carregando, Titulo, Vazio } from "@/components/ui";
import { exigirLoja, podeConfigurar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { EditarProfissional, NovoProfissional } from "./formularios";

export const metadata: Metadata = { title: "Profissionais" };

export default function ProfissionaisPage({ params }: PageProps<"/painel/[lojaId]/profissionais">) {
  return (
    <>
      <Titulo>Profissionais</Titulo>
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </>
  );
}

async function Conteudo({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params;
  const { papel } = await exigirLoja(lojaId);
  const supabase = await createClient();
  const { data: profissionais, error } = await supabase
    .from("profissional")
    .select("id, nome, bio, foto_url, ordem, ativo")
    .eq("petshop_id", lojaId)
    .order("ordem")
    .order("nome");
  if (error) return <Aviso tipo="erro">Não foi possível carregar os profissionais.</Aviso>;
  const editavel = podeConfigurar(papel);

  return (
    <div className="flex flex-col gap-4">
      {!editavel && <Aviso>Só o dono ou o gerente altera os profissionais.</Aviso>}
      {profissionais.length === 0 && <Vazio>Nenhum profissional ainda. Cadastre quem faz banho e tosa na loja.</Vazio>}
      <ul className="flex flex-col gap-2">
        {profissionais.map((p) => (
          <li key={p.id}>
            <details className="group rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
              <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4">
                <span className="size-10 shrink-0 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-900">
                  {/* eslint-disable-next-line @next/next/no-img-element -- foto do Storage */}
                  {p.foto_url && <img src={p.foto_url} alt="" className="size-full object-cover" />}
                </span>
                <span className="flex-1 font-medium">{p.nome}</span>
                {!p.ativo && <span className="text-xs text-neutral-500">inativo</span>}
                <span aria-hidden className="text-neutral-400 group-open:rotate-90">›</span>
              </summary>
              {editavel && (
                <div className="border-t border-neutral-100 p-4 dark:border-neutral-900">
                  <EditarProfissional lojaId={lojaId} p={p} />
                </div>
              )}
            </details>
          </li>
        ))}
      </ul>
      {editavel && (
        <Cartao>
          <h2 className="mb-3 font-medium">Novo profissional</h2>
          <NovoProfissional lojaId={lojaId} />
        </Cartao>
      )}
    </div>
  );
}
