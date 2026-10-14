import { describe, expect, it } from "vitest";
import { type Mensagem, type MensagemProvider, ProvedorTeste, processarFila, textoFinal } from "@/supabase/functions/_shared/fila";

const msg = (id: string, link: string | null = "/c/abc"): Mensagem => ({
  id,
  tipo: "lembrete_d1",
  destino: "+5511988880001",
  conteudo: { texto: "Loja: lembrete. Confirme: {link}", link },
  tentativas: 1,
});

/** Banco falso: devolve os lotes na ordem e anota cada conclusão. */
function bancoFalso(lotes: Mensagem[][]) {
  const concluidas: Record<string, unknown>[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    if (fn === "worker_reservar") return { data: lotes.shift() ?? [], error: null };
    concluidas.push(args);
    return { data: null, error: null };
  };
  return { rpc, concluidas };
}

describe("worker da fila", () => {
  it("monta o link com o endereço do app", () => {
    expect(textoFinal(msg("1"), "https://app.horadopet.com.br/")).toBe("Loja: lembrete. Confirme: https://app.horadopet.com.br/c/abc");
    expect(textoFinal({ ...msg("1", null), conteudo: { texto: "Pronto!", link: null } }, "https://x")).toBe("Pronto!");
  });

  it("envia pelo provedor e conclui cada mensagem; falha do provedor vira nova tentativa", async () => {
    const { rpc, concluidas } = bancoFalso([[msg("1"), msg("2")]]);
    const teste = new ProvedorTeste();
    const instavel: MensagemProvider = {
      nome: "teste",
      enviar: async (destino, texto, m) => {
        if (m.id === "2") throw new Error("timeout");
        return teste.enviar(destino, texto, m);
      },
    };
    expect(await processarFila(rpc, instavel, { appUrl: "https://x", limite: 50 })).toEqual({ enviadas: 1, falhas: 1 });
    expect(teste.enviadas).toEqual([{ destino: "+5511988880001", texto: "Loja: lembrete. Confirme: https://x/c/abc", tipo: "lembrete_d1" }]);
    expect(concluidas).toEqual([
      { p_id: "1", p_ok: true, p_provedor: "teste", p_provedor_mensagem_id: "teste-1", p_erro: null },
      { p_id: "2", p_ok: false, p_provedor: "teste", p_provedor_mensagem_id: null, p_erro: "timeout" },
    ]);
  });

  it("lote cheio: busca de novo até esvaziar", async () => {
    const { rpc } = bancoFalso([[msg("1"), msg("2")], [msg("3")]]);
    expect(await processarFila(rpc, new ProvedorTeste(), { appUrl: "", limite: 2 })).toEqual({ enviadas: 3, falhas: 0 });
  });
});
