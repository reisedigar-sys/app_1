import type { Metadata } from "next";
import { Suspense } from "react";
import { Aviso, Cartao, Carregando, Titulo, Vazio } from "@/components/ui";
import { exigirLoja, podeConfigurar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { EditarServico, NovaCategoria, NovoServico } from "./formularios";

export const metadata: Metadata = { title: "Serviços" };

export default function ServicosPage({ params }: PageProps<"/painel/[lojaId]/servicos">) {
  return (
    <>
      <Titulo>Serviços</Titulo>
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
  const [cats, servs] = await Promise.all([
    supabase.from("categoria_servico").select("id, nome").eq("petshop_id", lojaId).order("ordem").order("nome"),
    supabase
      .from("servico")
      .select("id, nome, descricao, tipo, categoria_id, ordem, ativo")
      .eq("petshop_id", lojaId)
      .order("ordem")
      .order("nome"),
  ]);
  if (cats.error || servs.error) return <Aviso tipo="erro">Não foi possível carregar os serviços.</Aviso>;
  const categorias = cats.data;
  const servicos = servs.data;
  const editavel = podeConfigurar(papel);

  const grupos = [
    ...categorias.map((c) => ({ id: c.id, nome: c.nome, itens: servicos.filter((s) => s.categoria_id === c.id) })),
    { id: "sem", nome: "Sem categoria", itens: servicos.filter((s) => !s.categoria_id) },
  ].filter((g) => g.itens.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {!editavel && <Aviso>Só o dono ou o gerente altera os serviços.</Aviso>}
      <p className="text-sm text-neutral-500">
        O cliente escolhe <strong>um</strong> serviço principal (ex.: banho, tosa) e quantos adicionais quiser (ex.: hidratação).
      </p>
      {servicos.length === 0 && <Vazio>Nenhum serviço ainda.</Vazio>}
      {grupos.map((g) => (
        <section key={g.id}>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-500">{g.nome}</h2>
          <ul className="flex flex-col gap-2">
            {g.itens.map((s) => (
              <li key={s.id}>
                <details className="group rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4">
                    <span className="flex-1 font-medium">{s.nome}</span>
                    <span className="text-xs text-neutral-500">
                      {s.tipo === "principal" ? "principal" : "adicional"}
                      {!s.ativo && " · inativo"}
                    </span>
                    <span aria-hidden className="text-neutral-400 group-open:rotate-90">›</span>
                  </summary>
                  {editavel && (
                    <div className="border-t border-neutral-100 p-4 dark:border-neutral-900">
                      <EditarServico lojaId={lojaId} categorias={categorias} s={s} />
                    </div>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {editavel && (
        <>
          <Cartao>
            <h2 className="mb-3 font-medium">Novo serviço</h2>
            <NovoServico lojaId={lojaId} categorias={categorias} />
          </Cartao>
          <Cartao>
            <h2 className="mb-1 font-medium">Categorias</h2>
            <p className="mb-3 text-sm text-neutral-500">{categorias.map((c) => c.nome).join(", ") || "Nenhuma ainda."}</p>
            <NovaCategoria lojaId={lojaId} />
          </Cartao>
        </>
      )}
    </div>
  );
}
