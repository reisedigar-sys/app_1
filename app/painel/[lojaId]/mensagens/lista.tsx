import { Vazio } from "@/components/ui";
import { horaNoFuso } from "@/lib/painel/agenda";
import { type LinhaMensagem, NOME_ENTREGA, NOME_STATUS_MENSAGEM, NOME_TIPO_MENSAGEM } from "@/lib/painel/mensagens";

function quando(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, day: "2-digit", month: "2-digit" }).format(new Date(iso)) + " " + horaNoFuso(iso, fuso);
}

/** Por onde a mensagem saiu: "WhatsApp (lida) · push em 2 celulares". */
function canais(m: LinhaMensagem) {
  if (m.status !== "enviada" && m.status !== "falhou") return "";
  const partes = [];
  if (m.destino) partes.push(m.entrega ? `WhatsApp (${NOME_ENTREGA[m.entrega] ?? m.entrega})` : "WhatsApp");
  if (m.push_enviados > 0) partes.push(`push em ${m.push_enviados} ${m.push_enviados === 1 ? "celular" : "celulares"}`);
  return partes.join(" · ");
}

/** Mensagens da fila (agendadas, enviadas e as que não saíram, com o motivo). */
export function ListaMensagens({ mensagens, fuso, comTutor = true }: { mensagens: LinhaMensagem[]; fuso: string; comTutor?: boolean }) {
  if (mensagens.length === 0) return <Vazio>Nenhuma mensagem.</Vazio>;
  return (
    <ul className="flex flex-col gap-2">
      {mensagens.map((m) => {
        const [rotulo, cor] = NOME_STATUS_MENSAGEM[m.status];
        const texto = (m.conteudo as { texto?: string } | null)?.texto;
        return (
          <li key={m.id} className="flex flex-col gap-1 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
            <div className="flex items-start justify-between gap-2">
              <p>
                <strong>{NOME_TIPO_MENSAGEM[m.tipo]}</strong>
                {comTutor && m.tutor && <span className="text-neutral-500"> · {m.tutor.nome}</span>}
              </p>
              <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cor}`}>{rotulo}</span>
            </div>
            <p className="text-xs text-neutral-500">
              {m.status === "enviada" && m.enviada_em ? `Enviada ${quando(m.enviada_em, fuso)}` : `Prevista ${quando(m.enviar_em, fuso)}`}
              {m.tentativas > 1 && ` · ${m.tentativas} tentativas`}
              {m.ultimo_erro && ` · ${m.ultimo_erro}`}
            </p>
            {canais(m) && <p className="text-xs text-neutral-600 dark:text-neutral-400">{canais(m)}</p>}
            {texto && <p className="whitespace-pre-line text-neutral-700 dark:text-neutral-300">{texto.replace("{link}", "(link)")}</p>}
          </li>
        );
      })}
    </ul>
  );
}
