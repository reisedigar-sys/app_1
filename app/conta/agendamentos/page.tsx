import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Aviso, BotaoLink, Carregando, Titulo, Vazio } from "@/components/ui";
import { exigirTutor } from "@/lib/conta/sessao";
import { formatarReais } from "@/lib/painel/formatos";
import { createClient } from "@/lib/supabase/server";
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

async function Lista({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const aviso = AVISOS[String((await searchParams).aviso)];
  await exigirTutor("/conta/agendamentos");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("meus_agendamentos");
  if (error) return <Vazio>Não foi possível carregar seus agendamentos.</Vazio>;
  const agora = instanteAtual();
  const proximos = data.filter((a) => new Date(a.fim).getTime() >= agora && !["cancelado", "faltou", "concluido"].includes(a.status)).reverse();
  const anteriores = data.filter((a) => !proximos.includes(a));

  if (data.length === 0)
    return (
      <Vazio>
        Você ainda não tem agendamentos.{" "}
        <Link className="text-teal-700 underline dark:text-teal-400" href="/conta/pets">
          Cadastre seus pets
        </Link>{" "}
        e agende pela página da sua loja.
      </Vazio>
    );

  const cartao = (a: (typeof data)[number], futuro: boolean) => {
    const [rotulo, cor] = STATUS[a.status];
    const alteravel = futuro && ["agendado", "confirmado"].includes(a.status);
    const gratuito = new Date(a.cancelamento_gratuito_ate).getTime() > agora;
    return (
      <li key={a.id} className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-start justify-between gap-2">
          <div>
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
        {alteravel && (
          <div className="flex flex-wrap items-start gap-4 pt-1">
            <BotaoLink href={`/conta/agendamentos/${a.id}/remarcar`} variante="secundario">
              Remarcar
            </BotaoLink>
            <CancelarAgendamento
              id={a.id}
              politica={
                gratuito
                  ? `Cancelamento gratuito até ${quando(a.cancelamento_gratuito_ate, a.loja_fuso)}.`
                  : "O prazo de cancelamento gratuito da loja já passou. Se houver sinal pago, ele pode ser retido."
              }
            />
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      <section aria-labelledby="t-proximos">
        <h2 id="t-proximos" className="mb-2 font-semibold">Próximos</h2>
        {proximos.length ? <ul className="flex flex-col gap-2">{proximos.map((a) => cartao(a, true))}</ul> : <Vazio>Nenhum agendamento futuro.</Vazio>}
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
