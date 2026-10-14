import { describe, expect, it } from "vitest";
import { type Mensagem, type MensagemProvider, type PushProvider, ProvedorTeste, comLinks, processarFila, textoFinal } from "@/supabase/functions/_shared/fila";

const msg = (id: string, link: string | null = "/c/abc", extra: Partial<Mensagem> = {}): Mensagem => ({
  id,
  tipo: "lembrete_d1",
  destino: "+5511988880001",
  conteudo: { texto: "Loja: lembrete. Confirme: {link}", link, modelo: "hp_lembrete_vespera", parametros: ["Loja", "{link}"] },
  tentativas: 1,
  ...extra,
});

const inscricao = (id: string) => ({ id, endpoint: `https://push.exemplo/${id}`, p256dh: "x", auth: "y" });
const push = { titulo: "Loja", corpo: "Lembrete", url: "/c/abc", icone: "/loja/icone/192" };

/** Banco falso: devolve os lotes na ordem e anota cada chamada. */
function bancoFalso(lotes: Mensagem[][]) {
  const chamadas: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    if (fn === "worker_reservar") return { data: lotes.shift() ?? [], error: null };
    chamadas.push({ fn, args });
    return { data: null, error: null };
  };
  const de = (fn: string) => chamadas.filter((c) => c.fn === fn).map((c) => c.args);
  return { rpc, de };
}

function pushFalso(falhas: Record<string, { erro: string; expirada?: boolean }> = {}) {
  const enviados: { endpoint: string; url: string }[] = [];
  const p: PushProvider = {
    enviar: async (i, dados) => {
      if (falhas[i.id]) return { ok: false, ...falhas[i.id] };
      enviados.push({ endpoint: i.endpoint, url: dados.url });
      return { ok: true };
    },
  };
  return { p, enviados };
}

describe("worker da fila", () => {
  it("monta o link com o endereço do app, no texto, nos parâmetros do modelo e no push", () => {
    expect(textoFinal(msg("1"), "https://app.horadopet.com.br/")).toBe("Loja: lembrete. Confirme: https://app.horadopet.com.br/c/abc");
    expect(textoFinal({ ...msg("1", null), conteudo: { texto: "Pronto!", link: null } }, "https://x")).toBe("Pronto!");
    const m = comLinks({ ...msg("1"), conteudo: { ...msg("1").conteudo, push } }, "https://x/");
    expect(m.conteudo.parametros).toEqual(["Loja", "https://x/c/abc"]);
    expect(m.conteudo.push).toEqual({ ...push, url: "https://x/c/abc", icone: "https://x/loja/icone/192" });
  });

  it("envia pelo provedor e conclui cada mensagem; falha do provedor vira nova tentativa", async () => {
    const { rpc, de } = bancoFalso([[msg("1"), msg("2")]]);
    const teste = new ProvedorTeste();
    const instavel: MensagemProvider = {
      nome: "teste",
      enviar: async (destino, texto, m) => {
        if (m.id === "2") throw new Error("timeout");
        return teste.enviar(destino, texto, m);
      },
    };
    expect(await processarFila(rpc, instavel, { appUrl: "https://x", limite: 50 })).toEqual({ enviadas: 1, falhas: 1, push: 0 });
    expect(teste.enviadas).toEqual([{ destino: "+5511988880001", texto: "Loja: lembrete. Confirme: https://x/c/abc", tipo: "lembrete_d1" }]);
    expect(de("worker_concluir")).toEqual([
      { p_id: "1", p_ok: true, p_provedor: "teste", p_provedor_mensagem_id: "teste-1", p_erro: null },
      { p_id: "2", p_ok: false, p_provedor: "teste", p_provedor_mensagem_id: null, p_erro: "timeout" },
    ]);
  });

  it("lote cheio: busca de novo até esvaziar", async () => {
    const { rpc } = bancoFalso([[msg("1"), msg("2")], [msg("3")]]);
    expect(await processarFila(rpc, new ProvedorTeste(), { appUrl: "", limite: 2 })).toEqual({ enviadas: 3, falhas: 0, push: 0 });
  });

  it("push: sai junto com o WhatsApp na primeira tentativa e não se repete nas seguintes; inscrição expirada é avisada", async () => {
    const comPush = (id: string, tentativas: number) =>
      msg(id, "/c/abc", { tentativas, push: [inscricao("a"), inscricao("b")], conteudo: { ...msg(id).conteudo, push } });
    const { rpc, de } = bancoFalso([[comPush("1", 1), comPush("2", 2)]]);
    const { p, enviados } = pushFalso({ b: { erro: "push 410", expirada: true } });
    expect(await processarFila(rpc, new ProvedorTeste(), { appUrl: "https://x", push: p })).toEqual({ enviadas: 2, falhas: 0, push: 1 });
    expect(enviados).toEqual([{ endpoint: "https://push.exemplo/a", url: "https://x/c/abc" }]);
    expect(de("worker_push")).toEqual([
      { p_id: "1", p_resultados: [{ id: "a", ok: true }, { id: "b", ok: false, erro: "push 410", expirada: true }] },
    ]);
  });

  it("só push (sem WhatsApp): enviada se chegou a algum celular; sem nenhum, nova tentativa", async () => {
    const soPush = (id: string, inscricoes: string[]) =>
      msg(id, null, { tipo: "equipe_novo_pedido", destino: null, push: inscricoes.map(inscricao), conteudo: { texto: "Novo", link: null, push } });
    const { rpc, de } = bancoFalso([[soPush("1", ["a"]), soPush("2", ["b"])]]);
    const { p } = pushFalso({ b: { erro: "push 500" } });
    const teste = new ProvedorTeste();
    expect(await processarFila(rpc, teste, { appUrl: "https://x", push: p })).toEqual({ enviadas: 1, falhas: 1, push: 1 });
    expect(teste.enviadas).toEqual([]);
    expect(de("worker_concluir")).toEqual([
      { p_id: "1", p_ok: true, p_provedor: "push", p_provedor_mensagem_id: null, p_erro: null, p_registrar: false },
      { p_id: "2", p_ok: false, p_provedor: "push", p_provedor_mensagem_id: null, p_erro: "push 500", p_registrar: false },
    ]);
  });
});
