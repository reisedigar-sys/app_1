import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Aviso, Cartao, Carregando, Titulo, Vazio } from "@/components/ui";
import { DIAS_SEMANA } from "@/lib/painel/formatos";
import { exigirLoja, podeConfigurar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { removerHorario } from "./acoes";
import { NovoHorario } from "./formulario";

export const metadata: Metadata = { title: "Horários" };

const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

export default function HorariosPage({ params, searchParams }: PageProps<"/painel/[lojaId]/horarios">) {
  return (
    <>
      <Titulo>Horários de trabalho</Titulo>
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
  const { profissional: profParam } = await searchParams;
  const { papel } = await exigirLoja(lojaId);
  const supabase = await createClient();
  const [profs, servs] = await Promise.all([
    supabase.from("profissional").select("id, nome").eq("petshop_id", lojaId).eq("ativo", true).order("ordem").order("nome"),
    supabase.from("servico").select("id, nome").eq("petshop_id", lojaId).eq("ativo", true).order("ordem").order("nome"),
  ]);
  if (profs.error || servs.error) return <Aviso tipo="erro">Não foi possível carregar os dados.</Aviso>;
  if (!profs.data.length) return <Vazio>Cadastre um profissional para definir os horários.</Vazio>;

  const prof = profs.data.find((p) => p.id === profParam) ?? profs.data[0];
  const { data: janelas } = await supabase
    .from("horario_trabalho")
    .select("id, dia_semana, inicio, fim, servico_id")
    .eq("profissional_id", prof.id)
    .order("inicio");
  const nomeServico = new Map(servs.data.map((s) => [s.id, s.nome]));
  const editavel = podeConfigurar(papel);
  const hhmm = (t: string) => t.slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Profissional" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2 pb-1">
          {profs.data.map((p) => (
            <li key={p.id}>
              <Link
                href={`/painel/${lojaId}/horarios?profissional=${p.id}`}
                aria-current={p.id === prof.id ? "page" : undefined}
                className="flex min-h-10 items-center whitespace-nowrap rounded-full border border-neutral-300 px-3 text-sm aria-[current=page]:border-marca-700 aria-[current=page]:bg-marca-50 aria-[current=page]:text-marca-800 dark:border-neutral-700 dark:aria-[current=page]:bg-marca-950 dark:aria-[current=page]:text-marca-200"
              >
                {p.nome}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {!editavel && <Aviso>Só o dono ou o gerente altera os horários.</Aviso>}

      <Cartao>
        <h2 className="mb-2 font-medium">Semana de {prof.nome}</h2>
        <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" aria-label={`Horários de ${prof.nome}`}>
          {ORDEM_DIAS.map((d) => {
            const doDia = (janelas ?? []).filter((j) => j.dia_semana === d);
            return (
              <li key={d} className="flex min-h-12 flex-wrap items-center gap-2 py-2">
                <span className="w-20 text-sm font-medium">{DIAS_SEMANA[d]}</span>
                {doDia.length === 0 && <span className="text-sm text-neutral-400">folga</span>}
                {doDia.map((j) => (
                  <span
                    key={j.id}
                    className="inline-flex min-h-9 items-center gap-1 rounded-full bg-neutral-100 pl-3 text-sm dark:bg-neutral-900"
                  >
                    {hhmm(j.inicio)}–{hhmm(j.fim)}
                    {j.servico_id && <span className="text-marca-700 dark:text-marca-400">· só {nomeServico.get(j.servico_id) ?? "serviço inativo"}</span>}
                    {editavel ? (
                      <form action={removerHorario}>
                        <input type="hidden" name="loja_id" value={lojaId} />
                        <input type="hidden" name="id" value={j.id} />
                        <button
                          type="submit"
                          className="flex size-9 items-center justify-center rounded-full text-neutral-500 hover:text-red-600"
                          aria-label={`Remover ${DIAS_SEMANA[d]} ${hhmm(j.inicio)} a ${hhmm(j.fim)}`}
                        >
                          ×
                        </button>
                      </form>
                    ) : (
                      <span className="pr-3" />
                    )}
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
      </Cartao>

      {editavel && (
        <Cartao>
          <h2 className="mb-3 font-medium">Adicionar horário para {prof.nome}</h2>
          <NovoHorario key={prof.id} lojaId={lojaId} profissionalId={prof.id} servicos={servs.data} />
        </Cartao>
      )}
    </div>
  );
}
