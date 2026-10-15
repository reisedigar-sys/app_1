import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Aviso, BotaoLink, Cartao, Carregando, Vazio } from "@/components/ui";
import { dataNoFuso, diaPorExtenso } from "@/lib/painel/agenda";
import { exigirLoja, podeConfigurar, podeOperar } from "@/lib/painel/sessao";
import { createClient } from "@/lib/supabase/server";
import { AoVivo } from "./agenda/ao-vivo";
import { LinkDaLoja } from "./link-da-loja";
import { ListaAtendimentos } from "./lista-atendimentos";

export const metadata: Metadata = { title: "Hoje" };

// Instante da requisição (a página é sempre dinâmica: a sessão é lida em createClient()).
const agora = () => Date.now();

export default function HojePage({ params }: PageProps<"/painel/[lojaId]">) {
  return (
    <Suspense fallback={<Carregando />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Promise<{ lojaId: string }> }) {
  const { lojaId } = await params;
  const { loja, papel } = await exigirLoja(lojaId);
  const supabase = await createClient();
  const hoje = dataNoFuso(new Date(), loja.fuso);
  const operacao = podeOperar(papel);
  const base = `/painel/${lojaId}`;

  const [agenda, checklist] = await Promise.all([
    supabase.rpc("agenda_loja", { p_petshop_id: lojaId, p_de: hoje, p_ate: hoje }),
    supabase.rpc("checklist_onboarding", { p_petshop_id: lojaId }),
  ]);
  if (agenda.error) return <Aviso tipo="erro">Não foi possível carregar os atendimentos de hoje.</Aviso>;
  const completo = (checklist.data as { completo?: boolean } | null)?.completo ?? true;

  // O RLS já devolve à profissional só os próprios atendimentos.
  const itens = agenda.data;
  const com = (...s: string[]) => itens.filter((a) => s.includes(a.status));
  const proximos = com("agendado", "confirmado");
  const aConfirmar = com("agendado").filter((a) => new Date(a.inicio).getTime() > agora());
  const semConfirmacao = aConfirmar.filter((a) => a.sem_confirmacao_em);
  const ativos = itens.filter((a) => a.status !== "cancelado");
  const c = { lojaId, lojaNome: loja.nome, fuso: loja.fuso, hoje, operacao };

  const numeros = [
    { rotulo: "Atendimentos", valor: ativos.length },
    { rotulo: "A confirmar", valor: aConfirmar.length, destaque: aConfirmar.length > 0 },
    { rotulo: "Em atendimento", valor: com("em_atendimento").length },
    { rotulo: "Prontos para buscar", valor: com("pronto").length, destaque: com("pronto").length > 0 },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Hoje</h1>
          <p className="flex items-center gap-3 text-sm text-neutral-500">
            <span className="first-letter:uppercase">{diaPorExtenso(hoje)}</span>
            <AoVivo lojaId={lojaId} />
          </p>
        </div>
        {operacao && <BotaoLink href={`${base}/agenda/novo?data=${hoje}`}>Novo atendimento</BotaoLink>}
      </div>

      {!completo && (
        <Aviso tipo="alerta">
          A configuração da loja não está completa: os clientes ainda não conseguem agendar.{" "}
          <Link href={`${base}/configurar`} className="font-medium underline">
            Ver o que falta
          </Link>
        </Aviso>
      )}

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {numeros.map((n) => (
          <div key={n.rotulo} className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
            <dt className="text-xs text-neutral-500">{n.rotulo}</dt>
            <dd className={`text-2xl font-semibold ${n.destaque ? "text-marca-700 dark:text-marca-400" : ""}`}>{n.valor}</dd>
          </div>
        ))}
      </dl>

      {semConfirmacao.length > 0 && (
        <Aviso tipo="alerta">
          {semConfirmacao.length === 1 ? "1 cliente não confirmou" : `${semConfirmacao.length} clientes não confirmaram`} dentro do prazo.
          Vale ligar ou mandar um WhatsApp.
        </Aviso>
      )}

      {ativos.length === 0 ? (
        <Vazio>Nenhum atendimento hoje.</Vazio>
      ) : (
        <ListaAtendimentos
          rotulo="Atendimentos de hoje"
          c={c}
          grupos={[
            { titulo: "Prontos para buscar", itens: com("pronto") },
            { titulo: "Em atendimento", itens: com("em_atendimento") },
            { titulo: "Próximos", itens: proximos },
            { titulo: "Encerrados", itens: com("concluido", "faltou") },
          ]}
        />
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Link href={`${base}/agenda`} className="text-sm font-medium text-marca-700 dark:text-marca-400">
          Ver a agenda completa ›
        </Link>
        {podeConfigurar(papel) && (
          <Link href={`${base}/resultados`} className="text-sm font-medium text-marca-700 dark:text-marca-400">
            Resultados do mês ›
          </Link>
        )}
      </div>

      {operacao && completo && (
        <Cartao>
          <h2 className="mb-2 font-medium">Link da loja</h2>
          <LinkDaLoja slug={loja.slug} nome={loja.nome} />
        </Cartao>
      )}
    </div>
  );
}
