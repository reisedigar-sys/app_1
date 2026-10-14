import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANON, type Db, emTransacao, usuario } from "../helpers/db";
import { proximo } from "../helpers/datas";
import { LOJA, PET, TUTOR, USUARIO } from "../helpers/ids";

// Semana 7a: modelos do WhatsApp, push (tutor e equipe), webhook (status, PARAR, resposta automática) e Minhas lojas.
const ana = usuario(USUARIO.anaTutora);
const alice = usuario(USUARIO.aliceAtendenteCentro);
const bruno = usuario(USUARIO.brunoTutor);

// Sexta a pelo menos 17 dias (dentro da janela de 30 dias da loja), num dia que os outros testes não usam.
const DIA = proximo(5, 17);
const as = (hora: string) => `${DIA} ${hora}-03`;
const CENTRAL = "106540352242922";

type Reservada = {
  id: string;
  tipo: string;
  destino: string | null;
  conteudo: { texto: string; link: string | null; modelo: string | null; parametros: string[]; push: { titulo: string; corpo: string; url: string } };
  push: { id: string; endpoint: string }[];
};

async function pedidoDaAna(db: Db, canal = "app_proprio") {
  const [{ id: servico }] = await db.rows<{ id: string }>("select id from public.servico where petshop_id = $1 and nome = 'Banho'", [LOJA.centro]);
  await db.como(canal === "balcao" ? alice : ana);
  const [{ r }] = await db.rows<{ r: { pedido_id: string; agendamentos: { id: string }[] } }>(
    "select public.criar_pedido($1, $2, $3::jsonb, $4::timestamptz, $5::public.canal_agendamento, $6) as r",
    [LOJA.centro, TUTOR.ana, JSON.stringify([{ pet_id: PET.thor, servicos: [servico] }]), as("10:00"), canal, crypto.randomUUID()],
  );
  await db.comoSuperusuario();
  return r;
}

async function reservar(db: Db, pedido?: string) {
  await db.comoSuperusuario();
  // clock_timestamp: o que foi programado nesta mesma transação (now() é o início dela) também vence.
  const todas = await db.rows<Reservada>("select * from public.worker_reservar(500, clock_timestamp())");
  if (!pedido) return todas;
  const ids = (await db.rows<{ id: string }>("select id from public.notificacao_agendada where pedido_id = $1", [pedido])).map((x) => x.id);
  return todas.filter((r) => ids.includes(r.id));
}

async function ligarPush(db: Db, quem: ReturnType<typeof usuario>, escopo: "tutor" | "equipe", endpoint: string) {
  await db.como(quem);
  await db.query("select public.registrar_push($1, $2, 'p256dh', 'auth')", [escopo, endpoint]);
  await db.comoSuperusuario();
}

async function receber(db: Db, id: string, de: string, texto: string, phoneNumberId = CENTRAL) {
  const [{ r }] = await db.rows<{ r: { resposta: string | null; duplicada?: boolean } }>(
    "select public.whatsapp_receber($1, $2, $3, $4, '{}'::jsonb) as r",
    [id, phoneNumberId, de, texto],
  );
  return r;
}

describe("modelos do WhatsApp", () => {
  it("a confirmação sai com o modelo, os parâmetros (link no fim) e o resumo do push", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoDaAna(db);
      const [m] = await reservar(db, p.pedido_id);
      expect(m.conteudo.modelo).toBe("hp_confirmacao");
      expect(m.conteudo.parametros).toEqual(["Pet Feliz Centro", "recebido", "Thor", expect.stringMatching(/^sex, \d\d\/\d\d às 10:00$/), "{link}"]);
      expect(m.conteudo.texto).toBe(
        `Olá! Pet Feliz Centro: agendamento recebido para Thor, ${m.conteudo.parametros[3]}. Para confirmar, remarcar ou cancelar: {link}\n\nPara não receber mais avisos, responda PARAR.`,
      );
      expect(m.conteudo.push).toMatchObject({ titulo: "Pet Feliz Centro", url: m.conteudo.link });
      expect(m.destino).toBe("+5511988880001");
      expect(m.push).toEqual([]);
    });
  });

  it("todo modelo começa e termina com texto fixo (regra da Meta) e está igual em docs/modelos-whatsapp.md", async () => {
    await emTransacao(async (db) => {
      const modelos = await db.rows<{ nome: string; corpo: string }>("select nome, corpo from public.modelo_mensagem");
      expect(modelos.length).toBeGreaterThanOrEqual(9);
      const doc = readFileSync("docs/modelos-whatsapp.md", "utf8");
      for (const m of modelos) {
        expect(m.corpo, m.nome).not.toMatch(/^\s*\{\{/);
        expect(m.corpo, m.nome).not.toMatch(/\}\}\s*$/);
        expect(doc, m.nome).toContain(`## \`${m.nome}\`\n`);
        expect(doc, m.nome).toContain("```text\n" + m.corpo + "\n```");
      }
    });
  });
});

describe("push", () => {
  it("tutor sem autorização de WhatsApp, mas com push ligado: o aviso sai só pelo push", async () => {
    await emTransacao(async (db) => {
      await db.query("update public.tutor_petshop set consentimento_contato_em = null where petshop_id = $1 and tutor_id = $2", [LOJA.centro, TUTOR.ana]);
      await ligarPush(db, ana, "tutor", "https://fcm.googleapis.com/fcm/send/ana");
      const p = await pedidoDaAna(db);
      const [m] = await reservar(db, p.pedido_id);
      expect(m.destino).toBeNull();
      expect(m.push.map((i) => i.endpoint)).toEqual(["https://fcm.googleapis.com/fcm/send/ana"]);

      await db.query("select public.worker_push($1, $2::jsonb)", [m.id, JSON.stringify([{ id: m.push[0].id, ok: true }])]);
      await db.query("select public.worker_concluir($1, true, 'push', null, null, now(), false)", [m.id]);
      const [n] = await db.rows("select status::text, push_enviados from public.notificacao_agendada where id = $1", [m.id]);
      expect(n).toEqual({ status: "enviada", push_enviados: 1 });
    });
  });

  it("a inscrição é de quem está logado; expirada é apagada", async () => {
    await emTransacao(async (db) => {
      await ligarPush(db, bruno, "tutor", "https://fcm.googleapis.com/fcm/send/celular");
      await ligarPush(db, ana, "tutor", "https://fcm.googleapis.com/fcm/send/celular");
      await db.como(bruno);
      expect(await db.count("select 1 from public.push_inscricao")).toBe(0);
      await db.como(ana);
      const [{ id }] = await db.rows<{ id: string }>("select id from public.push_inscricao");
      await db.como(ANON);
      expect((await db.tentar("select public.registrar_push('tutor', 'https://fcm.googleapis.com/fcm/send/x', 'a', 'b')")).codigo).toBe("42501");
      await db.como(ana);
      expect((await db.tentar("select public.registrar_push('equipe', 'https://fcm.googleapis.com/fcm/send/x', 'a', 'b')")).codigo).toBe("42501");
      expect((await db.tentar("select public.registrar_push('tutor', 'https://meu-servidor.com/x', 'a', 'b')")).codigo).toBe("22023");
      expect((await db.tentar("insert into public.push_inscricao (user_id, escopo, endpoint, p256dh, auth) values ($1, 'tutor', 'https://x', 'a', 'b')", [USUARIO.anaTutora])).codigo).toBe("42501");

      const p = await pedidoDaAna(db);
      const [m] = await reservar(db, p.pedido_id);
      await db.query("select public.worker_push($1, $2::jsonb)", [m.id, JSON.stringify([{ id, ok: false, erro: "push 410", expirada: true }])]);
      expect(await db.count("select 1 from public.push_inscricao where id = $1", [id])).toBe(0);
    });
  });

  it("equipe: aviso quando o tutor agenda pelo app ou cancela; agendamento feito no balcão não avisa", async () => {
    await emTransacao(async (db) => {
      // Sem ninguém com push ligado, o aviso nem entra na fila.
      const sem = await pedidoDaAna(db);
      expect(await db.count("select 1 from public.notificacao_agendada where pedido_id = $1 and tipo = 'equipe_novo_pedido'", [sem.pedido_id])).toBe(0);
      await db.query("delete from public.pedido where id = $1", [sem.pedido_id]);

      await ligarPush(db, alice, "equipe", "https://fcm.googleapis.com/fcm/send/alice");
      const balcao = await pedidoDaAna(db, "balcao");
      expect(await db.count("select 1 from public.notificacao_agendada where pedido_id = $1 and tipo::text like 'equipe%'", [balcao.pedido_id])).toBe(0);
      await db.query("delete from public.pedido where id = $1", [balcao.pedido_id]);

      const p = await pedidoDaAna(db);
      const novo = (await reservar(db, p.pedido_id)).find((m) => m.tipo === "equipe_novo_pedido")!;
      expect(novo.destino).toBeNull();
      expect(novo.push.map((i) => i.endpoint)).toEqual(["https://fcm.googleapis.com/fcm/send/alice"]);
      expect(novo.conteudo.push.titulo).toBe("Novo agendamento · Pet Feliz Centro");
      expect(novo.conteudo.push.corpo).toMatch(/^Ana Souza: Thor, sex, \d\d\/\d\d às 10:00 \(pelo app\)\.$/);
      expect(novo.conteudo.push.url).toBe(`/painel/${LOJA.centro}/agenda?data=${DIA}`);

      await db.como(ana);
      await db.query("select public.cancelar_agendamento($1)", [p.agendamentos[0].id]);
      const cancelou = (await reservar(db, p.pedido_id)).find((m) => m.tipo === "equipe_cancelamento")!;
      expect(cancelou.conteudo.push.corpo).toMatch(/^Ana Souza cancelou Thor, sex/);
    });
  });
});

describe("webhook do WhatsApp", () => {
  it("PARAR no número central: para os avisos de todas as lojas, uma vez só", async () => {
    await emTransacao(async (db) => {
      const r = await receber(db, "wamid.parar1", "5511988880001", "Parar.");
      expect(r.resposta).toBe(
        "Pronto: você não vai mais receber avisos pelo WhatsApp de Banho & Cia Moema e Pet Feliz Centro. Para voltar a receber, autorize em Minha conta, no app da loja.",
      );
      expect(await db.count("select 1 from public.tutor_petshop where tutor_id = $1 and consentimento_contato_em is not null", [TUTOR.ana])).toBe(0);
      expect(await db.count("select 1 from public.tutor_petshop where tutor_id = $1 and consentimento_contato_revogado_em is not null", [TUTOR.ana])).toBe(2);
      expect(await receber(db, "wamid.parar1", "5511988880001", "Parar.")).toEqual({ resposta: null, duplicada: true });

      const p = await pedidoDaAna(db);
      expect(await reservar(db, p.pedido_id)).toEqual([]);
      const [n] = await db.rows("select status::text, ultimo_erro from public.notificacao_agendada where pedido_id = $1 and tipo = 'confirmacao_imediata'", [p.pedido_id]);
      expect(n).toEqual({ status: "cancelada", ultimo_erro: "sem autorização de contato" });

      // De volta pelo app, por loja.
      await db.como(ana);
      await db.query("select public.definir_avisos_whatsapp($1, true)", [LOJA.centro]);
      const lojas = await db.rows<{ nome: string; avisos_whatsapp: boolean }>("select nome, avisos_whatsapp from public.minhas_lojas() order by nome");
      expect(lojas).toEqual([
        { nome: "Banho & Cia Moema", avisos_whatsapp: false },
        { nome: "Pet Feliz Centro", avisos_whatsapp: true },
      ]);
      expect((await db.tentar("select public.definir_avisos_whatsapp($1, true)", [LOJA.zonaSul])).codigo).toBe("P0002");
    });
  });

  it("PARAR no número da própria loja vale só para ela", async () => {
    await emTransacao(async (db) => {
      // O seed liga um número próprio para cada loja (pnid-…).
      await receber(db, "wamid.parar2", "5511988880001", "PARAR", "pnid-moema");
      const vinculos = await db.rows("select petshop_id, consentimento_contato_em is not null as avisos from public.tutor_petshop where tutor_id = $1 order by petshop_id", [TUTOR.ana]);
      expect(vinculos).toEqual([
        { petshop_id: LOJA.centro, avisos: true },
        { petshop_id: LOJA.moema, avisos: false },
      ]);
    });
  });

  it("outra mensagem no número central: resposta com o link das lojas, no máximo a cada 12 h", async () => {
    await emTransacao(async (db) => {
      const r = await receber(db, "wamid.oi1", "5511988880002", "Oi, quero agendar");
      expect(r.resposta).toContain("só envia avisos de agendamento");
      expect(r.resposta).toContain("Pet Feliz Zona Sul: {app}/pet-feliz-zona-sul");
      expect(r.resposta).toContain("{app}/banho-e-cia-moema");
      expect((await receber(db, "wamid.oi2", "5511988880002", "?")).resposta).toBeNull();
      expect((await receber(db, "wamid.oi3", "5511900000000", "Oi")).resposta).toContain("use o link ou o telefone que ele passou");
    });
  });

  it("status de entrega só avança (lida não volta para entregue); falha guarda o motivo", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoDaAna(db);
      const [m] = await reservar(db, p.pedido_id);
      await db.query("select public.worker_concluir($1, true, 'whatsapp', 'wamid.saida1')", [m.id]);
      const entrega = async () => (await db.rows<{ entrega: string }>("select entrega from public.notificacao_agendada where id = $1", [m.id]))[0].entrega;
      expect(await entrega()).toBe("enviada");
      await db.query("select public.whatsapp_status('wamid.saida1', 'read')");
      await db.query("select public.whatsapp_status('wamid.saida1', 'delivered')");
      expect(await entrega()).toBe("lida");
      await db.query("select public.whatsapp_status('wamid.saida1', 'failed', '131026 · Message undeliverable')");
      expect(await db.rows("select entrega, ultimo_erro from public.notificacao_agendada where id = $1", [m.id])).toEqual([
        { entrega: "falhou", ultimo_erro: "131026 · Message undeliverable" },
      ]);
      expect(await db.rows("select status from public.mensagem_log where provedor_mensagem_id = 'wamid.saida1'")).toEqual([{ status: "falhou" }]);
    });
  });

  it("as funções do webhook e do worker são só do servidor", async () => {
    await emTransacao(async (db) => {
      for (const sql of [
        "select public.whatsapp_receber('x', 'y', '5511', 'PARAR', '{}')",
        "select public.whatsapp_status('x', 'read')",
        "select public.worker_push(gen_random_uuid(), '[]')",
      ]) {
        await db.como(ana);
        expect((await db.tentar(sql)).codigo, sql).toBe("42501");
      }
    });
  });
});

describe("painel", () => {
  it("contagem do mês: só a equipe que opera a loja", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      const [c] = await db.rows("select * from public.mensagens_do_mes($1)", [LOJA.centro]);
      expect(Object.keys(c)).toEqual(["whatsapp", "push", "simuladas"]);
      await db.como(ana);
      expect((await db.tentar("select * from public.mensagens_do_mes($1)", [LOJA.centro])).codigo).toBe("42501");
    });
  });
});
