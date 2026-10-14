import type { Metadata } from "next";
import { Suspense } from "react";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { Aviso, Carregando, Cartao, Titulo, Vazio } from "@/components/ui";
import { dataNoFuso, diaCurto } from "@/lib/painel/agenda";
import { NOME_PERIODO, NOME_STATUS_ESPERA } from "@/lib/painel/mensagens";
import { exigirLoja, podeOperar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { removerDaFila } from "./acoes";
import { IncluirNaFila } from "./incluir";

export const metadata: Metadata = { title: "Lista de espera" };

export default function ListaEsperaPage({ params }: PageProps<"/painel/[lojaId]/lista-espera">) {
  return (
    <>
      <Titulo>Lista de espera</Titulo>
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} />
      </Suspense>
    </>
  );
}

async function Conteudo({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params;
  const { loja, papel } = await exigirLoja(lojaId);
  if (!podeOperar(papel)) return <Aviso>A lista de espera fica com a recepção da loja.</Aviso>;
  const hoje = dataNoFuso(new Date(), loja.fuso);
  const supabase = await createClient();
  const [{ data: fila }, { data: servicos }] = await Promise.all([
    supabase
      .from("lista_espera")
      .select("id, data, periodo, status, notificado_em, pet(nome), servico(nome), tutor(nome, telefone_e164)")
      .eq("petshop_id", lojaId)
      .gte("data", hoje)
      .in("status", ["aguardando", "notificado"])
      .order("data")
      .order("criado_em"),
    supabase.from("servico").select("id, nome").eq("petshop_id", lojaId).eq("ativo", true).eq("tipo", "principal").order("ordem"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-500">
        Quando abre um horário no dia (cancelamento, horário liberado ou bloqueio removido), o primeiro da fila recebe o aviso com o link para agendar. O
        próximo é avisado 30 minutos depois, se a vaga continuar aberta. Quem agendar primeiro leva.
      </p>
      {fila?.length ? (
        <ul className="flex flex-col gap-2">
          {fila.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950">
              <div>
                <p className="font-medium capitalize">
                  {diaCurto(e.data)} · {NOME_PERIODO[e.periodo]}
                </p>
                <p>
                  <strong>{e.pet?.nome}</strong> · {e.servico?.nome} · {e.tutor?.nome}
                </p>
                <p className="text-xs text-neutral-500">{NOME_STATUS_ESPERA[e.status]}</p>
              </div>
              <FormAcao acao={removerDaFila} semBotao className="shrink-0">
                <input type="hidden" name="loja_id" value={lojaId} />
                <input type="hidden" name="id" value={e.id} />
                <BotaoEnviar variante="secundario">Remover</BotaoEnviar>
              </FormAcao>
            </li>
          ))}
        </ul>
      ) : (
        <Vazio>Ninguém na lista de espera.</Vazio>
      )}
      <Cartao>
        <h2 className="mb-3 font-medium">Incluir cliente da loja</h2>
        <IncluirNaFila lojaId={lojaId} servicos={servicos ?? []} hoje={hoje} />
      </Cartao>
    </div>
  );
}
