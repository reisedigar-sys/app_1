import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CancelarAgendamento } from "@/app/conta/agendamentos/cancelar";
import { FormAcao } from "@/components/form-acao";
import { Aviso, BotaoLink, Carregando } from "@/components/ui";
import { telefoneLegivel } from "@/lib/loja-publica";
import { cancelar, confirmar } from "./acoes";
import { pedidoDoLink } from "./pedido";

export const metadata: Metadata = { title: "Seu agendamento", robots: { index: false } };

const STATUS: Record<string, string> = {
  agendado: "Aguardando sua confirmação",
  confirmado: "Confirmado",
  em_atendimento: "Em atendimento",
  pronto: "Pronto para retirar",
  concluido: "Concluído",
  cancelado: "Cancelado",
  faltou: "Não compareceu",
};

const AVISOS: Record<string, [string, "ok" | "alerta"]> = {
  confirmado: ["Presença confirmada. Até lá!", "ok"],
  remarcado: ["Agendamento remarcado.", "ok"],
  cancelado: ["Agendamento cancelado.", "ok"],
  "cancelado-fora-do-prazo": ["Agendamento cancelado fora do prazo de cancelamento gratuito da loja.", "alerta"],
};

export default function LinkConfirmacaoPage({ params, searchParams }: PageProps<"/c/[token]">) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6">
      <Suspense fallback={<Carregando />}>
        <Conteudo params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

// Instante da requisição (a página é sempre renderizada no pedido; ver connection() em lib/supabase/server.ts).
const instanteAtual = () => Date.now();

function quando(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(new Date(iso))
    .replace(",", "");
}

async function Conteudo({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ token }, busca] = await Promise.all([params, searchParams]);
  const pedido = await pedidoDoLink(token);
  if (!pedido) notFound();
  const aviso = AVISOS[String(busca.aviso)];
  const agora = instanteAtual();
  const { loja } = pedido;
  const aConfirmar = pedido.agendamentos.some((a) => a.alteravel && a.status === "agendado");
  const telefone = telefoneLegivel(loja.telefone);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-sm text-neutral-500">Olá, {pedido.tutor_nome}</p>
        <h1 className="text-xl font-semibold">Seu agendamento na {loja.nome}</h1>
        <p className="text-sm text-neutral-500">{loja.endereco}</p>
      </header>
      {aviso && <Aviso tipo={aviso[1]}>{aviso[0]}</Aviso>}

      <ul className="flex flex-col gap-3">
        {pedido.agendamentos.map((a) => {
          const gratuito = new Date(a.cancelamento_gratuito_ate).getTime() > agora;
          return (
            <li key={a.id} className="flex flex-col gap-2 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold first-letter:uppercase">{quando(a.inicio, loja.fuso)}</p>
                  <p className="text-sm">
                    <strong>{a.pet_nome}</strong> · {a.servicos.join(" + ")} · {a.profissional_nome}
                  </p>
                </div>
                <span className="whitespace-nowrap rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium dark:bg-neutral-900">{STATUS[a.status]}</span>
              </div>
              {a.alteravel && (
                <div className="flex flex-wrap items-start gap-2 pt-1">
                  <BotaoLink href={`/c/${token}/remarcar/${a.id}`} variante="secundario">
                    Remarcar
                  </BotaoLink>
                  <CancelarAgendamento
                    id={a.id}
                    titulo={`Cancelar o horário de ${a.pet_nome}?`}
                    acaoCancelar={cancelar.bind(null, token)}
                    politica={
                      gratuito
                        ? `Cancelamento gratuito até ${quando(a.cancelamento_gratuito_ate, loja.fuso)}.`
                        : "O prazo de cancelamento gratuito da loja já passou. Se houver sinal pago, ele pode ser retido."
                    }
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {aConfirmar && (
        <FormAcao acao={confirmar.bind(null, token)} rotuloEnviar={pedido.agendamentos.length > 1 ? "Confirmar presença de todos" : "Confirmar presença"}>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Confirme para a loja saber que você vem. Se não puder, remarque ou cancele acima.</p>
        </FormAcao>
      )}
      {telefone && <p className="text-sm text-neutral-500">Dúvidas? Fale com a loja: {telefone}</p>}
    </div>
  );
}
