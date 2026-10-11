import type { Metadata } from "next";
import { Suspense } from "react";
import { Aviso, Cartao, Carregando, Titulo, Vazio } from "@/components/ui";
import { formatarPeriodo, lerPeriodo } from "@/lib/painel/periodo";
import { exigirLoja, podeOperar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { removerBloqueio } from "./acoes";
import { NovoBloqueio } from "./formulario";

export const metadata: Metadata = { title: "Bloqueios" };

const NOME_TIPO = { folga: "Folga", almoco: "Almoço", feriado: "Feriado", outro: "Bloqueio" } as const;

export default function BloqueiosPage({ params }: PageProps<"/painel/[lojaId]/bloqueios">) {
  return (
    <>
      <Titulo>Bloqueios</Titulo>
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </>
  );
}

async function Conteudo({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params;
  const { loja, papel } = await exigirLoja(lojaId);
  const supabase = await createClient();
  const agora = new Date().toISOString();
  const [bloqs, profs] = await Promise.all([
    supabase
      .from("bloqueio")
      .select("id, tipo, periodo, motivo, profissional(nome)")
      .eq("petshop_id", lojaId)
      .filter("periodo", "not.sl", `[${agora},${agora}]`) // ainda não terminou
      .order("periodo"),
    supabase.from("profissional").select("id, nome").eq("petshop_id", lojaId).eq("ativo", true).order("ordem").order("nome"),
  ]);
  if (bloqs.error || profs.error) return <Aviso tipo="erro">Não foi possível carregar os bloqueios.</Aviso>;
  const editavel = podeOperar(papel);
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: loja.fuso }).format(new Date());

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-500">Horários bloqueados não aparecem para agendamento. Horários no fuso da loja.</p>
      {bloqs.data.length === 0 ? (
        <Vazio>Nenhum bloqueio programado.</Vazio>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Bloqueios programados">
          {bloqs.data.map((b) => (
            <li key={b.id} className="flex min-h-14 items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {NOME_TIPO[b.tipo]} · {b.profissional?.nome ?? "Loja inteira"}
                </p>
                <p className="text-sm text-neutral-500">
                  {formatarPeriodo(lerPeriodo(b.periodo as string), loja.fuso)}
                  {b.motivo && ` · ${b.motivo}`}
                </p>
              </div>
              {editavel && (
                <form action={removerBloqueio}>
                  <input type="hidden" name="loja_id" value={lojaId} />
                  <input type="hidden" name="id" value={b.id} />
                  <button type="submit" className="min-h-11 px-2 text-sm text-red-700 dark:text-red-400">
                    Remover
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {editavel && (
        <Cartao>
          <h2 className="mb-3 font-medium">Novo bloqueio</h2>
          <NovoBloqueio lojaId={lojaId} profissionais={profs.data} hoje={hoje} />
        </Cartao>
      )}
    </div>
  );
}
