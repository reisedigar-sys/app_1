import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PassosAtendimento } from "@/components/agenda/passos-atendimento";
import { Aviso, BotaoLink, Carregando, Titulo, Vazio } from "@/components/ui";
import { exigirTutor } from "@/lib/conta/sessao";
import { formatarReais } from "@/lib/painel/formatos";
import { createClient } from "@/lib/supabase/server";
import { BotaoEnviar, FormAcao } from "@/components/form-acao";
import { sairListaEspera } from "./acoes";
import { CancelarAgendamento } from "./cancelar";

export const metadata: Metadata = { title: "Meus agendamentos" };

const STATUS: Record<string, [string, string]> = {
  agendado: ["Agendado", "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200"],
  confirmado: ["Confirmado", "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"],
  em_atendimento: ["Em atendimento", "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"],
  pronto: ["Pronto para retirar", "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"],
  concluido: ["Concluído", "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"],
  cancelado: ["Cancelado", "bg-neutral-100 text-neutral-500 dark:bg-neutral-900"],
  faltou: ["Não compareceu", "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200"],
};

const PERIODOS: Record<string, string> = { manha: "manhã", tarde: "tarde", qualquer: "qualquer horário" };

const AVISOS: Record<string, string> = {
  cancelado: "Agendamento cancelado.",
  "cancelado-fora-do-prazo": "Agendamento cancelado fora do prazo de cancelamento gratuito da loja.",
  remarcado: "Agendamento remarcado.",
};

export default function AgendamentosPage({ searchParams }: PageProps<"/conta/agendamentos">) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <Titulo>Meus agendamentos</Titulo>
      <Suspense fallback={<Carregando />}>
        <Lista searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Data/hora da requisição (a página é sempre renderizada no pedido; ver connection() em lib/supabase/server.ts).
const instanteAtual = () => Date.now();

function quando(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(iso))
    .replace(",", "");
}

function dataCurta(data: string) {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** "Hoje", "Amanhã" ou "Daqui a N dias", contando dias do calendário no fuso da loja. */
function contagem(iso: string, fuso: string, agora: number) {
  const dia = (t: number) => Date.parse(new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(t));
  const dias = Math.round((dia(new Date(iso).getTime()) - dia(agora)) / 86_400_000);
  return dias <= 0 ? "Hoje" : dias === 1 ? "Amanhã" : `Daqui a ${dias} dias`;
}

function hora(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

async function Lista({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const aviso = AVISOS[String((await searchParams).aviso)];
  await exigirTutor("/conta/agendamentos");
  const supabase = await createClient();
  const [{ data, error }, { data: espera }, { count: pets }, { data: lojas }] = await Promise.all([
    supabase.rpc("meus_agendamentos"),
    supabase
      .from("lista_espera")
      .select("id, data, periodo, status, pet(nome), servico(nome), petshop(nome, slug)")
      .in("status", ["aguardando", "notificado"])
      .order("data"),
    supabase.from("pet").select("id", { count: "exact", head: true }).eq("ativo", true),
    supabase.rpc("minhas_lojas"),
  ]);
  if (error) return <Vazio>Não foi possível carregar seus agendamentos.</Vazio>;
  // Uma loja: direto para o agendamento dela; várias: escolher em Minhas lojas.
  const novo = lojas?.length === 1 ? `/${lojas[0].slug}/agendar` : lojas?.length ? "/conta/lojas" : null;
  const botaoNovo = novo && (
    <BotaoLink href={novo} prefetch={false} className="self-start">
      + Novo agendamento
    </BotaoLink>
  );
  const agora = instanteAtual();
  const proximos = data.filter((a) => new Date(a.fim).getTime() >= agora && !["cancelado", "faltou", "concluido"].includes(a.status)).reverse();
  const anteriores = data.filter((a) => !proximos.includes(a));

  const filaDeEspera = espera?.length ? (
    <section aria-labelledby="t-espera">
      <h2 id="t-espera" className="mb-2 font-semibold">Lista de espera</h2>
      <ul className="flex flex-col gap-2">
        {espera.map((e) => (
          <li key={e.id} className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 text-sm dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex items-start justify-between gap-2">
              <p>
                <strong>{e.pet?.nome}</strong> · {e.servico?.nome}
                <span className="block text-neutral-500">
                  {dataCurta(e.data)} ({PERIODOS[e.periodo]}) · {e.petshop?.nome}
                </span>
              </p>
              {e.status === "notificado" ? (
                <span className="whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">Abriu vaga</span>
              ) : (
                <span className="whitespace-nowrap rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">Aguardando vaga</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {e.status === "notificado" && e.petshop && (
                <BotaoLink href={`/${e.petshop.slug}/agendar`} prefetch={false}>
                  Agendar agora
                </BotaoLink>
              )}
              <FormAcao acao={sairListaEspera} semBotao>
                <input type="hidden" name="id" value={e.id} />
                <BotaoEnviar variante="secundario">Sair da fila</BotaoEnviar>
              </FormAcao>
            </div>
          </li>
        ))}
      </ul>
    </section>
  ) : null;

  if (data.length === 0 && !filaDeEspera && !botaoNovo)
    return (
      <Vazio>
        Você ainda não tem agendamentos.{" "}
        {pets ? (
          "Agende pela página da sua loja (o link que o petshop passou)."
        ) : (
          <>
            <Link className="text-marca-700 underline dark:text-marca-400" href="/conta/pets">
              Cadastre seus pets
            </Link>{" "}
            e agende pela página da sua loja.
          </>
        )}
      </Vazio>
    );

  // "Agendar de novo" só no cartão mais recente de cada pedido (um pedido com 2 pets tem 2 cartões).
  const repetir = new Set<string>();
  const pedidosVistos = new Set(proximos.map((a) => a.pedido_id)); // pedido com pet ainda por vir: não repete
  for (const a of anteriores) {
    if (pedidosVistos.has(a.pedido_id)) continue;
    pedidosVistos.add(a.pedido_id);
    if (["concluido", "cancelado"].includes(a.status)) repetir.add(a.id);
  }

  const cartao = (a: (typeof data)[number], futuro: boolean, destaque = false) => {
    const [rotulo, cor] = STATUS[a.status];
    const alteravel = futuro && ["agendado", "confirmado"].includes(a.status);
    const gratuito = new Date(a.cancelamento_gratuito_ate).getTime() > agora;
    return (
      <li key={a.id} className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-start justify-between gap-2">
          <div>
            {destaque && <p className="text-xs font-semibold tracking-wide text-marca-700 uppercase dark:text-marca-400">{contagem(a.inicio, a.loja_fuso, agora)}</p>}
            <p className="font-semibold capitalize">{quando(a.inicio, a.loja_fuso)}</p>
            <p className="text-sm">
              <strong>{a.pet_nome}</strong> · {a.servicos.join(" + ")}
            </p>
          </div>
          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cor}`}>{rotulo}</span>
        </div>
        <p className="text-sm text-neutral-500">
          <Link href={`/${a.loja_slug}`} className="underline">
            {a.loja_nome}
          </Link>{" "}
          · {a.profissional_nome} · {formatarReais(a.preco_total_centavos)}
        </p>
        {destaque && (
          <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900">
            <PassosAtendimento status={a.status} inicio={hora(a.inicio, a.loja_fuso)} pronto={hora(a.fim, a.loja_fuso)} />
          </div>
        )}
        {alteravel && (
          <div className="flex flex-wrap items-start gap-2 pt-1">
            <BotaoLink href={`/conta/agendamentos/${a.id}/remarcar`} variante="secundario">
              Remarcar
            </BotaoLink>
            <CancelarAgendamento
              id={a.id}
              titulo={`Cancelar o horário de ${a.pet_nome}?`}
              politica={
                gratuito
                  ? `Cancelamento gratuito até ${quando(a.cancelamento_gratuito_ate, a.loja_fuso)}.`
                  : "O prazo de cancelamento gratuito da loja já passou. Se houver sinal pago, ele pode ser retido."
              }
            />
          </div>
        )}
        {repetir.has(a.id) && (
          <BotaoLink href={`/${a.loja_slug}/agendar?repetir=${a.pedido_id}`} prefetch={false} variante="secundario" className="self-start">
            Agendar de novo
          </BotaoLink>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {botaoNovo}
      {filaDeEspera}
      <section aria-labelledby="t-proximos">
        <h2 id="t-proximos" className="mb-2 font-semibold">Próximos</h2>
        {proximos.length ? <ul className="flex flex-col gap-2">{proximos.map((a, i) => cartao(a, true, i === 0))}</ul> : <Vazio>Nenhum agendamento futuro.</Vazio>}
      </section>
      {anteriores.length > 0 && (
        <section aria-labelledby="t-anteriores">
          <h2 id="t-anteriores" className="mb-2 font-semibold">Anteriores e cancelados</h2>
          <ul className="flex flex-col gap-2">{anteriores.map((a) => cartao(a, false))}</ul>
        </section>
      )}
    </div>
  );
}
