import type { Metadata } from "next";
import { Suspense } from "react";
import { SeloFuncionamento } from "@/components/selo-funcionamento";
import { Aviso, Cartao, Carregando, Titulo } from "@/components/ui";
import { situacaoDasLojas } from "@/lib/funcionamento";
import { DIAS_SEMANA } from "@/lib/painel/formatos";
import { exigirLoja, podeConfigurar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { removerFaixa } from "./acoes";
import { NovaFaixa, UsarHorarioDaEquipe } from "./formulario";

export const metadata: Metadata = { title: "Funcionamento" };

const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

export default function FuncionamentoPage({ params }: PageProps<"/painel/[lojaId]/funcionamento">) {
  return (
    <>
      <Titulo>Horário de funcionamento</Titulo>
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
  const [{ data: faixas, error }, situacoes] = await Promise.all([
    supabase.from("horario_funcionamento").select("id, dia_semana, abre, fecha").eq("petshop_id", lojaId).order("abre"),
    situacaoDasLojas(supabase, [lojaId]),
  ]);
  if (error) return <Aviso tipo="erro">Não foi possível carregar o horário.</Aviso>;
  const editavel = podeConfigurar(papel);
  const situacao = situacoes.get(lojaId);
  const hhmm = (t: string) => t.slice(0, 5);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        É o horário que o cliente vê na página da {loja.nome}, com o selo “Aberto agora”. Não muda os horários de
        agendamento, que seguem a agenda da equipe. Feriado ou dia fechado: crie um bloqueio da loja inteira.
      </p>

      {!editavel && <Aviso>Só o dono ou o gerente altera o horário de funcionamento.</Aviso>}

      <Cartao>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Semana</h2>
          {situacao && <SeloFuncionamento situacao={situacao} fuso={loja.fuso} />}
        </div>
        {faixas.length === 0 && (
          <Aviso tipo="alerta">Sem horário cadastrado: a página da loja não mostra se está aberta.</Aviso>
        )}
        <ul className="flex flex-col divide-y divide-neutral-100 dark:divide-neutral-900" aria-label="Horário de funcionamento">
          {ORDEM_DIAS.map((d) => {
            const doDia = faixas.filter((f) => f.dia_semana === d);
            return (
              <li key={d} className="flex min-h-12 flex-wrap items-center gap-2 py-2">
                <span className="w-20 text-sm font-medium">{DIAS_SEMANA[d]}</span>
                {doDia.length === 0 && <span className="text-sm text-neutral-400">fechado</span>}
                {doDia.map((f) => (
                  <span key={f.id} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-neutral-100 pl-3 text-sm dark:bg-neutral-900">
                    {hhmm(f.abre)}–{hhmm(f.fecha)}
                    {editavel ? (
                      <form action={removerFaixa}>
                        <input type="hidden" name="loja_id" value={lojaId} />
                        <input type="hidden" name="id" value={f.id} />
                        <button
                          type="submit"
                          className="flex size-9 items-center justify-center rounded-full text-neutral-500 hover:text-red-600"
                          aria-label={`Remover ${DIAS_SEMANA[d]} ${hhmm(f.abre)} a ${hhmm(f.fecha)}`}
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
        <>
          <Cartao>
            <h2 className="mb-3 font-medium">Adicionar horário</h2>
            <NovaFaixa lojaId={lojaId} />
          </Cartao>
          <Cartao>
            <h2 className="mb-2 font-medium">Mesmo horário da equipe</h2>
            <UsarHorarioDaEquipe lojaId={lojaId} />
          </Cartao>
        </>
      )}
    </div>
  );
}
