// Worker da fila de notificações (semanas 6 e 7). Sem dependências: roda na Edge Function (Deno) e nos testes (Node).
// As regras (o que enviar, quando, para quem, por qual canal e com que texto) ficam no banco: aqui só se reserva,
// envia e conclui.

export type DadosPush = { titulo: string; corpo: string; url: string; icone?: string };

export type Inscricao = { id: string; endpoint: string; p256dh: string; auth: string };

export type Mensagem = {
  id: string;
  tipo: string;
  /** Telefone para o WhatsApp; null quando a mensagem só sai por push. */
  destino: string | null;
  conteudo: {
    texto: string;
    link: string | null;
    /** Modelo aprovado na Meta e seus parâmetros ("{link}" vira o endereço completo). */
    modelo?: string | null;
    parametros?: string[];
    push?: DadosPush;
  };
  tentativas: number;
  push?: Inscricao[];
};

export type ResultadoEnvio = { ok: true; id?: string } | { ok: false; erro: string };
export type ResultadoPush = { ok: true } | { ok: false; erro: string; expirada?: boolean };

/** Canal de envio do WhatsApp. O de teste registra a mensagem sem enviar. */
export interface MensagemProvider {
  readonly nome: string;
  enviar(destino: string, texto: string, mensagem: Mensagem): Promise<ResultadoEnvio>;
}

/** Push no celular (Web Push). */
export interface PushProvider {
  enviar(inscricao: Inscricao, dados: DadosPush): Promise<ResultadoPush>;
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

const absoluto = (caminho: string, appUrl: string) => (caminho.startsWith("/") ? `${appUrl.replace(/\/$/, "")}${caminho}` : caminho);

/** Texto final: o banco devolve o caminho do link ({link}); o endereço do app vem da configuração do worker. */
export function textoFinal(m: Mensagem, appUrl: string) {
  const link = m.conteudo.link ? absoluto(m.conteudo.link, appUrl) : "";
  return m.conteudo.texto.replace("{link}", link).trim();
}

/** A mensagem com os links completos (texto, parâmetros do modelo e push). */
export function comLinks(m: Mensagem, appUrl: string): Mensagem {
  const link = m.conteudo.link ? absoluto(m.conteudo.link, appUrl) : "";
  const push = m.conteudo.push;
  return {
    ...m,
    conteudo: {
      ...m.conteudo,
      texto: textoFinal(m, appUrl),
      parametros: m.conteudo.parametros?.map((p) => (p === "{link}" ? link : p)),
      push: push && { ...push, url: absoluto(push.url, appUrl), icone: push.icone && absoluto(push.icone, appUrl) },
    },
  };
}

const mensagemDeErro = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Processa a fila até esvaziar o que venceu (ou até o limite de rodadas). */
export async function processarFila(
  rpc: Rpc,
  provedor: MensagemProvider,
  opcoes: { appUrl: string; limite?: number; rodadas?: number; push?: PushProvider },
) {
  const total = { enviadas: 0, falhas: 0, push: 0 };
  for (let rodada = 0; rodada < (opcoes.rodadas ?? 10); rodada++) {
    const { data, error } = await rpc("worker_reservar", { p_limite: opcoes.limite ?? 50 });
    if (error) throw new Error(`worker_reservar: ${error.message}`);
    const lote = (data ?? []) as Mensagem[];
    if (lote.length === 0) break;

    for (const bruta of lote) {
      const m = comLinks(bruta, opcoes.appUrl);

      // Push: um aviso a mais, só na primeira tentativa (numa nova tentativa do WhatsApp o celular já foi avisado).
      const inscricoes = opcoes.push && m.conteudo.push && (m.tentativas === 1 || !m.destino) ? (m.push ?? []) : [];
      const resultados: (ResultadoPush & { id: string })[] = [];
      for (const i of inscricoes) {
        let r: ResultadoPush;
        try {
          r = await opcoes.push!.enviar(i, m.conteudo.push!);
        } catch (e) {
          r = { ok: false, erro: mensagemDeErro(e) };
        }
        resultados.push({ id: i.id, ...r });
      }
      if (resultados.length > 0) {
        const registro = await rpc("worker_push", { p_id: m.id, p_resultados: resultados });
        if (registro.error) throw new Error(`worker_push: ${registro.error.message}`);
        total.push += resultados.filter((r) => r.ok).length;
      }

      let concluir;
      let ok: boolean;
      if (m.destino) {
        let r: ResultadoEnvio;
        try {
          r = await provedor.enviar(m.destino, m.conteudo.texto, m);
        } catch (e) {
          r = { ok: false, erro: mensagemDeErro(e) };
        }
        ok = r.ok;
        concluir = await rpc("worker_concluir", {
          p_id: m.id,
          p_ok: r.ok,
          p_provedor: provedor.nome,
          p_provedor_mensagem_id: r.ok ? (r.id ?? null) : null,
          p_erro: r.ok ? null : r.erro,
        });
      } else {
        // Só push: enviada se chegou a pelo menos um celular.
        ok = resultados.some((r) => r.ok);
        const falha = resultados.find((r) => !r.ok);
        concluir = await rpc("worker_concluir", {
          p_id: m.id,
          p_ok: ok,
          p_provedor: "push",
          p_provedor_mensagem_id: null,
          p_erro: ok ? null : falha && !falha.ok ? falha.erro : "push não configurado",
          p_registrar: false,
        });
      }
      if (concluir.error) throw new Error(`worker_concluir: ${concluir.error.message}`);
      if (ok) total.enviadas++;
      else total.falhas++;
    }
    if (lote.length < (opcoes.limite ?? 50)) break;
  }
  return total;
}
