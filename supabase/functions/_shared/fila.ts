// Worker da fila de notificações (semana 6). Sem dependências: roda na Edge Function (Deno) e nos testes (Node).
// As regras (o que enviar, quando, para quem e com que texto) ficam no banco: aqui só se reserva, envia e conclui.

export type Mensagem = {
  id: string;
  tipo: string;
  destino: string;
  conteudo: { texto: string; link: string | null };
  tentativas: number;
};

export type ResultadoEnvio = { ok: true; id?: string } | { ok: false; erro: string };

/** Canal de envio. O de teste registra a mensagem sem enviar; o do WhatsApp (Meta Cloud API) entra na semana 7. */
export interface MensagemProvider {
  readonly nome: string;
  enviar(destino: string, texto: string, mensagem: Mensagem): Promise<ResultadoEnvio>;
}

export class ProvedorTeste implements MensagemProvider {
  readonly nome = "teste";
  readonly enviadas: { destino: string; texto: string; tipo: string }[] = [];

  async enviar(destino: string, texto: string, mensagem: Mensagem): Promise<ResultadoEnvio> {
    this.enviadas.push({ destino, texto, tipo: mensagem.tipo });
    return { ok: true, id: `teste-${this.enviadas.length}` };
  }
}

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** Texto final: o banco devolve o caminho do link ({link}); o endereço do app vem da configuração do worker. */
export function textoFinal(m: Mensagem, appUrl: string) {
  const link = m.conteudo.link ? `${appUrl.replace(/\/$/, "")}${m.conteudo.link}` : "";
  return m.conteudo.texto.replace("{link}", link).trim();
}

/** Processa a fila até esvaziar o que venceu (ou até o limite de rodadas). */
export async function processarFila(
  rpc: Rpc,
  provedor: MensagemProvider,
  opcoes: { appUrl: string; limite?: number; rodadas?: number },
) {
  const total = { enviadas: 0, falhas: 0 };
  for (let rodada = 0; rodada < (opcoes.rodadas ?? 10); rodada++) {
    const { data, error } = await rpc("worker_reservar", { p_limite: opcoes.limite ?? 50 });
    if (error) throw new Error(`worker_reservar: ${error.message}`);
    const lote = (data ?? []) as Mensagem[];
    if (lote.length === 0) break;

    for (const m of lote) {
      let r: ResultadoEnvio;
      try {
        r = await provedor.enviar(m.destino, textoFinal(m, opcoes.appUrl), m);
      } catch (e) {
        r = { ok: false, erro: e instanceof Error ? e.message : String(e) };
      }
      const concluir = await rpc("worker_concluir", {
        p_id: m.id,
        p_ok: r.ok,
        p_provedor: provedor.nome,
        p_provedor_mensagem_id: r.ok ? (r.id ?? null) : null,
        p_erro: r.ok ? null : r.erro,
      });
      if (concluir.error) throw new Error(`worker_concluir: ${concluir.error.message}`);
      if (r.ok) total.enviadas++;
      else total.falhas++;
    }
    if (lote.length < (opcoes.limite ?? 50)) break;
  }
  return total;
}
