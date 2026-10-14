import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { Aviso, BotaoLink, Cartao, Carregando } from "@/components/ui";
import { COR_STATUS, NOME_CANAL, NOME_STATUS, acoesDeStatus, dataNoFuso, diaPorExtenso, horaNoFuso, podeRemarcarOuCancelar } from "@/lib/painel/agenda";
import { NOME_PELAGEM, NOME_PORTE, formatarReais, telefoneLegivel } from "@/lib/painel/formatos";
import { COLUNAS_MENSAGEM, type LinhaMensagem } from "@/lib/painel/mensagens";
import { exigirLoja, podeConfigurar, podeOperar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { ListaMensagens } from "../../mensagens/lista";
import { dispensarSinal } from "../acoes";
import { AcoesStatus, Cancelar, Observacoes } from "./acoes-atendimento";

export const metadata: Metadata = { title: "Atendimento" };

export default function AtendimentoPage({ params }: PageProps<"/painel/[lojaId]/agenda/[agendamentoId]">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

// Instante da requisição (a página é sempre dinâmica: a sessão é lida em createClient()).
const agora = () => Date.now();

async function Conteudo({ params }: { params: Promise<{ lojaId: string; agendamentoId: string }> }) {
  const { lojaId, agendamentoId } = await params;
  const { loja, papel } = await exigirLoja(lojaId);
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("agendamento")
    .select(
      "id, pedido_id, status, canal, encaixe, inicio, fim, observacoes, sem_confirmacao_em, preco_total_centavos, criado_em, profissional(id, nome), pet(id, nome, raca, porte, pelagem, alergias, temperamento), tutor(id, nome, telefone_e164), agendamento_item(ordem, preco_centavos, duracao_minutos, servico(nome))",
    )
    .eq("id", agendamentoId)
    .eq("petshop_id", lojaId)
    .maybeSingle();
  if (!a) notFound();
  const [{ data: vinculo }, { data: obsPet }, { data: mensagens }] = await Promise.all([
    supabase.from("tutor_petshop").select("faltas, exige_sinal, observacoes, consentimento_contato_em").eq("petshop_id", lojaId).eq("tutor_id", a.tutor?.id ?? "").maybeSingle(),
    supabase.from("pet_petshop").select("observacoes").eq("petshop_id", lojaId).eq("pet_id", a.pet?.id ?? "").maybeSingle(),
    // Mensagens do pedido (os lembretes valem para todos os pets do pedido).
    supabase.from("notificacao_agendada").select(COLUNAS_MENSAGEM).eq("petshop_id", lojaId).eq("pedido_id", a.pedido_id).order("enviar_em"),
  ]);

  const operacao = podeOperar(papel);
  const jaComecou = new Date(a.inicio).getTime() <= agora();
  const acoes = acoesDeStatus(a.status, { operacao, jaComecou });
  const dia = dataNoFuso(a.inicio, loja.fuso);
  const itens = [...a.agendamento_item].sort((x, y) => x.ordem - y.ordem);

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/painel/${lojaId}/agenda?data=${dia}`} className="text-sm text-marca-700 dark:text-marca-400">
        ‹ Agenda do dia
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">
            {a.pet?.nome} · {horaNoFuso(a.inicio, loja.fuso)}–{horaNoFuso(a.fim, loja.fuso)}
          </h1>
          <p className="text-sm capitalize text-neutral-500">
            {diaPorExtenso(dia)} · {a.profissional?.nome}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-sm font-medium ${COR_STATUS[a.status]}`}>{NOME_STATUS[a.status]}</span>
      </div>
      {a.status === "agendado" && a.sem_confirmacao_em && (
        <Aviso tipo="alerta">O cliente não confirmou dentro do prazo da loja. Vale ligar para confirmar.</Aviso>
      )}

      {(acoes.length > 0 || (operacao && podeRemarcarOuCancelar(a.status))) && (
        <Cartao>
          <h2 className="mb-3 font-medium">Ações</h2>
          <div className="flex flex-col gap-3">
            {acoes.length > 0 && <AcoesStatus lojaId={lojaId} id={a.id} acoes={acoes} />}
            {operacao && podeRemarcarOuCancelar(a.status) && (
              <div className="flex flex-wrap items-start gap-3">
                <BotaoLink href={`/painel/${lojaId}/agenda/${a.id}/remarcar`} variante="secundario">
                  Remarcar
                </BotaoLink>
                <Cancelar lojaId={lojaId} id={a.id} />
              </div>
            )}
          </div>
        </Cartao>
      )}

      <Cartao>
        <h2 className="mb-2 font-medium">Serviços</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {itens.map((i) => (
            <li key={i.ordem} className="flex justify-between gap-2">
              <span>
                {i.servico?.nome} <span className="text-neutral-500">· {i.duracao_minutos} min</span>
              </span>
              <span>{formatarReais(i.preco_centavos)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-2 border-t border-neutral-100 pt-1 font-medium dark:border-neutral-900">
            <span>Total</span>
            <span>{formatarReais(a.preco_total_centavos)}</span>
          </li>
        </ul>
        <p className="mt-2 text-xs text-neutral-500">
          Canal: {NOME_CANAL[a.canal]}
          {a.encaixe && " · encaixe"}
        </p>
      </Cartao>

      <Cartao>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-medium">Pet</h2>
          {a.pet && (
            <Link href={`/painel/${lojaId}/pets/${a.pet.id}`} className="text-sm font-medium text-marca-700 dark:text-marca-400">
              Ficha do pet
            </Link>
          )}
        </div>
        {a.pet && (
          <p className="text-sm">
            <strong>{a.pet.nome}</strong>
            {a.pet.raca && ` · ${a.pet.raca}`} · {NOME_PORTE[a.pet.porte]} · pelagem {NOME_PELAGEM[a.pet.pelagem].toLowerCase()}
            {a.pet.temperamento && ` · ${a.pet.temperamento}`}
          </p>
        )}
        {a.pet?.alergias && <p className="text-sm text-red-700 dark:text-red-400">Alergias: {a.pet.alergias}</p>}
        {obsPet?.observacoes && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Observações da loja: {obsPet.observacoes}</p>}
      </Cartao>

      <Cartao>
        <h2 className="mb-2 font-medium">Tutor</h2>
        <p className="text-sm">
          <strong>{a.tutor?.nome}</strong> · {telefoneLegivel(a.tutor?.telefone_e164)}
        </p>
        {vinculo && vinculo.faltas > 0 && (
          <p className="text-sm text-red-700 dark:text-red-400">
            {vinculo.faltas} falta(s) nesta loja{vinculo.exige_sinal && " · exige sinal"}
          </p>
        )}
        {vinculo && !vinculo.consentimento_contato_em && <p className="text-sm text-neutral-500">Sem autorização de contato: não recebe lembretes.</p>}
        {vinculo?.exige_sinal && podeConfigurar(papel) && a.tutor && (
          <FormAcao acao={dispensarSinal} semBotao className="mt-2">
            <input type="hidden" name="loja_id" value={lojaId} />
            <input type="hidden" name="tutor_id" value={a.tutor.id} />
            <BotaoEnviar variante="secundario">Dispensar o sinal deste cliente</BotaoEnviar>
          </FormAcao>
        )}
        {vinculo?.observacoes && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{vinculo.observacoes}</p>}
      </Cartao>

      {operacao && (
        <Cartao>
          <h2 className="mb-2 font-medium">Mensagens ao cliente</h2>
          <ListaMensagens mensagens={(mensagens ?? []) as LinhaMensagem[]} fuso={loja.fuso} comTutor={false} />
        </Cartao>
      )}

      <Cartao>
        <h2 className="mb-2 font-medium">Observações do atendimento</h2>
        <Observacoes lojaId={lojaId} id={a.id} valor={a.observacoes ?? ""} />
      </Cartao>
    </div>
  );
}
