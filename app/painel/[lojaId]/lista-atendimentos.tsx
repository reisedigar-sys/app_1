import Link from "next/link";
import { COR_STATUS, NOME_STATUS, acaoRapida, dataNoFuso, horaNoFuso, somarDias } from "@/lib/painel/agenda";
import { linkLigar, linkWhatsApp, textoWhatsApp } from "@/lib/painel/contato";
import type { Database } from "@/lib/supabase/database.types";
import { AcaoRapida } from "./acao-rapida";

export type LinhaAgenda = Database["public"]["Functions"]["agenda_loja"]["Returns"][number];

type Contexto = { lojaId: string; lojaNome: string; fuso: string; hoje: string; operacao: boolean };

/** "hoje às 10:00", "amanhã às 10:00" ou "dia 17/10 às 10:00" (texto do WhatsApp). */
export function quando(inicio: string, c: Pick<Contexto, "fuso" | "hoje">) {
  const dia = dataNoFuso(inicio, c.fuso);
  const hora = horaNoFuso(inicio, c.fuso);
  if (dia === c.hoje) return `hoje às ${hora}`;
  if (dia === somarDias(c.hoje, 1)) return `amanhã às ${hora}`;
  return `dia ${dia.slice(8, 10)}/${dia.slice(5, 7)} às ${hora}`;
}

const classeContato =
  "inline-flex min-h-10 items-center rounded-lg border border-neutral-300 bg-white/70 px-3 text-sm font-medium text-neutral-800 hover:bg-white dark:border-neutral-700 dark:bg-neutral-900/70 dark:text-neutral-100";

/** Ligar e abrir o WhatsApp do tutor com a mensagem já escrita (quem envia é a pessoa da loja). */
export function ContatoTutor({ telefone, texto }: { telefone: string | null | undefined; texto: string }) {
  const ligar = linkLigar(telefone);
  const whatsapp = linkWhatsApp(telefone, texto);
  if (!ligar || !whatsapp) return null;
  return (
    <>
      <a href={ligar} className={classeContato}>
        Ligar
      </a>
      <a href={whatsapp} target="_blank" rel="noreferrer" className={classeContato}>
        WhatsApp
      </a>
    </>
  );
}

/** Um atendimento em forma de linha: o toque no texto abre a ficha; os botões resolvem sem sair da lista. */
export function ItemAtendimento({ a, c, mostrarProfissional = true }: { a: LinhaAgenda; c: Contexto; mostrarProfissional?: boolean }) {
  const ehHoje = dataNoFuso(a.inicio, c.fuso) === c.hoje;
  const acao = acaoRapida(a.status, { operacao: c.operacao, ehHoje });
  const encerrado = ["concluido", "cancelado", "faltou"].includes(a.status);
  const contato = c.operacao && !encerrado;
  return (
    <div className={`flex flex-col gap-2 rounded-xl border border-l-4 p-3 ${COR_STATUS[a.status]} ${a.status === "cancelado" ? "opacity-60" : ""}`}>
      <Link href={`/painel/${c.lojaId}/agenda/${a.id}`} className="flex flex-col gap-0.5 text-sm">
        <span className="flex flex-wrap items-center justify-between gap-x-2">
          <span className="font-semibold">
            {horaNoFuso(a.inicio, c.fuso)}–{horaNoFuso(a.fim, c.fuso)} {a.pet_nome}
          </span>
          <span className="text-xs font-medium">{NOME_STATUS[a.status]}</span>
        </span>
        <span className="truncate">
          {(a.servicos ?? []).join(" + ")}
          {mostrarProfissional && a.profissional_nome && ` · ${a.profissional_nome}`}
        </span>
        <span className="truncate opacity-80">
          {a.tutor_nome}
          {(a.tutor_faltas ?? 0) > 0 && ` · ${a.tutor_faltas} falta(s)`}
        </span>
        {(a.encaixe || (a.status === "agendado" && a.sem_confirmacao_em)) && (
          <span className="mt-1 flex flex-wrap gap-1">
            {a.encaixe && <span className="rounded bg-black/10 px-1 text-[10px] uppercase">encaixe</span>}
            {a.status === "agendado" && a.sem_confirmacao_em && (
              <span className="rounded bg-red-600 px-1 text-[10px] uppercase text-white">sem confirmação</span>
            )}
          </span>
        )}
      </Link>
      {(acao || contato) && (
        <div className="flex flex-wrap items-center gap-2">
          <AcaoRapida lojaId={c.lojaId} id={a.id} status={a.status} acao={acao} operacao={c.operacao} />
          {contato && (
            <ContatoTutor
              telefone={a.tutor_telefone}
              texto={textoWhatsApp({ status: a.status, loja: c.lojaNome, tutor: a.tutor_nome, pet: a.pet_nome, quando: quando(a.inicio, c) })}
            />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Lista com grupos opcionais. Os grupos são linhas da MESMA lista: quando um atendimento muda de grupo
 * (ex.: "Próximos" → "Em atendimento"), o item não é recriado e o botão "Desfazer" continua na tela.
 */
export function ListaAtendimentos({
  rotulo,
  grupos,
  c,
  mostrarProfissional,
}: {
  rotulo: string;
  grupos: { titulo?: string; itens: LinhaAgenda[] }[];
  c: Contexto;
  mostrarProfissional?: boolean;
}) {
  return (
    <ol aria-label={rotulo} className="flex flex-col gap-2">
      {grupos
        .filter((g) => g.itens.length > 0)
        .flatMap((g) => [
          g.titulo ? (
            <li key={`grupo-${g.titulo}`} className="pt-2 first:pt-0">
              <h2 className="text-sm font-semibold text-neutral-600 dark:text-neutral-400">
                {g.titulo} <span className="font-normal">({g.itens.length})</span>
              </h2>
            </li>
          ) : null,
          ...g.itens.map((a) => (
            <li key={a.id}>
              <ItemAtendimento a={a} c={c} mostrarProfissional={mostrarProfissional} />
            </li>
          )),
        ])}
    </ol>
  );
}
