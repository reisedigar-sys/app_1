import { describe, expect, it } from "vitest";
import { ANON, type Db, emTransacao, usuario } from "../helpers/db";
import { HOJE, proximo, somarDias } from "../helpers/datas";
import { AGENDAMENTO, LOJA, PET, TUTOR, USUARIO } from "../helpers/ids";

// Semana 6: fila de notificações com relógio falso (p_agora). O worker real só envia o que worker_reservar devolve.
const ana = usuario(USUARIO.anaTutora);
const alice = usuario(USUARIO.aliceAtendenteCentro);
const gabriel = usuario(USUARIO.gabrielGerenteCentro);

// Quinta a pelo menos 8 dias (todos trabalham de terça a sábado, 9h–18h), num dia que os outros testes não usam:
// pedidos de testes paralelos no mesmo horário esperariam uns pelos outros.
const DIA = proximo(4, 8);
const as = (hora: string, data = DIA) => `${data} ${hora}-03`;
const mais = (instante: string, minutos: number) => new Date(new Date(instante).getTime() + minutos * 60_000).toISOString();

type Reservada = { id: string; tipo: string; destino: string; conteudo: { texto: string; link: string | null }; tentativas: number };
type Notificacao = { id: string; tipo: string; status: string; agendamento_id: string | null; enviar_em: Date; ultimo_erro: string | null };

async function banho(db: Db) {
  const [{ id }] = await db.rows<{ id: string }>("select id from public.servico where petshop_id = $1 and nome = 'Banho'", [LOJA.centro]);
  return id;
}

/** Pedido da Ana no Centro (app próprio). */
async function pedidoDaAna(db: Db, pets: string[], inicio = as("10:00")) {
  const servico = await banho(db);
  await db.como(ana);
  const [{ r }] = await db.rows<{ r: { pedido_id: string; token_confirmacao: string; agendamentos: { id: string; pet_id: string }[] } }>(
    "select public.criar_pedido($1, $2, $3::jsonb, $4::timestamptz, 'app_proprio', $5) as r",
    [LOJA.centro, TUTOR.ana, JSON.stringify(pets.map((p) => ({ pet_id: p, servicos: [servico] }))), inicio, crypto.randomUUID()],
  );
  await db.comoSuperusuario();
  return r;
}

async function notificacoes(db: Db, pedido: string) {
  return db.rows<Notificacao>(
    "select id, tipo::text, status::text, agendamento_id, enviar_em, ultimo_erro from public.notificacao_agendada where pedido_id = $1 order by enviar_em, tipo",
    [pedido],
  );
}

/** Uma rodada do worker no instante informado, devolvendo só o que é do pedido (ou de todos, sem pedido). */
async function rodada(db: Db, agora: string, filtro?: { pedido?: string; tutor?: string }) {
  await db.comoSuperusuario();
  const reservadas = await db.rows<Reservada>("select * from public.worker_reservar(500, $1::timestamptz)", [agora]);
  // Conclui todas (o provedor de teste sempre aceita).
  for (const r of reservadas) await db.query("select public.worker_concluir($1, true, 'teste', null, null, $2::timestamptz)", [r.id, agora]);
  if (!filtro) return reservadas;
  const ids = (
    await db.rows<{ id: string }>(
      "select id from public.notificacao_agendada where ($1::uuid is null or pedido_id = $1) and ($2::uuid is null or tutor_id = $2)",
      [filtro.pedido ?? null, filtro.tutor ?? null],
    )
  ).map((x) => x.id);
  return reservadas.filter((r) => ids.includes(r.id));
}

describe("programação das mensagens", () => {
  it("dois pets: uma confirmação, um lembrete na véspera e um 2 h antes, listando os dois", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoDaAna(db, [PET.thor, PET.mel]);
      const fila = await notificacoes(db, p.pedido_id);
      expect(fila.map((n) => n.tipo)).toEqual(["confirmacao_imediata", "lembrete_d1", "lembrete_antes"]);
      expect(new Set(fila.map((n) => n.agendamento_id))).toEqual(new Set([p.agendamentos[0].id]));
      expect(fila[1].enviar_em.toISOString()).toBe(new Date(as("18:00", somarDias(DIA, -1))).toISOString());
      expect(fila[2].enviar_em.toISOString()).toBe(new Date(as("08:00")).toISOString());
    });
  });

  it("simulação: cada mensagem sai na hora certa, uma vez só, e nada sai depois do atendimento", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoDaAna(db, [PET.thor, PET.mel]);
      const agora = new Date().toISOString();

      const [imediata, ...resto] = await rodada(db, agora, { pedido: p.pedido_id });
      expect(resto).toEqual([]);
      expect(imediata.tipo).toBe("confirmacao_imediata");
      expect(imediata.destino).toBe("+5511988880001");
      expect(imediata.conteudo.texto).toContain("Thor e Mel");
      expect(imediata.conteudo.link).toBe(`/c/${p.token_confirmacao}`);
      expect(await rodada(db, agora, { pedido: p.pedido_id })).toEqual([]);

      // Véspera, 17:59: nada. 18:00: lembrete com o pedido de confirmação.
      expect(await rodada(db, as("17:59", somarDias(DIA, -1)), { pedido: p.pedido_id })).toEqual([]);
      const [d1] = await rodada(db, as("18:00", somarDias(DIA, -1)), { pedido: p.pedido_id });
      expect(d1.tipo).toBe("lembrete_d1");
      expect(d1.conteudo.texto).toContain("Confirme sua presença");

      await db.como(ANON);
      expect((await db.rows<{ n: number }>("select public.confirmar_por_token($1) as n", [p.token_confirmacao]))[0].n).toBe(2);

      const [antes] = await rodada(db, as("08:00"), { pedido: p.pedido_id });
      expect(antes.tipo).toBe("lembrete_antes");
      expect(await rodada(db, as("10:30"), { pedido: p.pedido_id })).toEqual([]);

      const fila = await notificacoes(db, p.pedido_id);
      expect(fila.map((n) => n.status)).toEqual(["enviada", "enviada", "enviada"]);
      expect(
        await db.count("select 1 from public.mensagem_log l join public.notificacao_agendada n on n.id = l.notificacao_id where n.pedido_id = $1 and l.status = 'simulada'", [p.pedido_id]),
      ).toBe(3);
    });
  });

  it("lembrete atrasado (worker parado) e lembrete depois do início não saem", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoDaAna(db, [PET.thor]);
      await rodada(db, new Date().toISOString());
      // O worker volta só às 21h da véspera: o lembrete das 18h perdeu a hora.
      expect(await rodada(db, as("21:00", somarDias(DIA, -1)), { pedido: p.pedido_id })).toEqual([]);
      // E depois do início do atendimento, nada.
      expect(await rodada(db, as("10:01"), { pedido: p.pedido_id })).toEqual([]);
      const fila = await notificacoes(db, p.pedido_id);
      expect(fila.map((n) => [n.tipo, n.status, n.ultimo_erro])).toEqual([
        ["confirmacao_imediata", "enviada", null],
        ["lembrete_d1", "cancelada", "perdeu a hora"],
        ["lembrete_antes", "cancelada", "o atendimento já começou ou foi cancelado"],
      ]);
    });
  });

  it("sem autorização de contato, nada é enviado", async () => {
    await emTransacao(async (db) => {
      await db.query("update public.tutor_petshop set consentimento_contato_em = null where petshop_id = $1 and tutor_id = $2", [LOJA.centro, TUTOR.ana]);
      const p = await pedidoDaAna(db, [PET.thor]);
      expect(await rodada(db, new Date().toISOString(), { pedido: p.pedido_id })).toEqual([]);
      const [imediata] = await notificacoes(db, p.pedido_id);
      expect([imediata.status, imediata.ultimo_erro]).toEqual(["cancelada", "sem autorização de contato"]);
    });
  });

  it("cancelar um pet passa os lembretes para o outro; cancelar tudo cancela os pendentes", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoDaAna(db, [PET.thor, PET.mel]);
      const [thor, mel] = p.agendamentos;
      await db.como(ana);
      await db.query("select public.cancelar_agendamento($1)", [thor.id]);
      await db.comoSuperusuario();
      const lembretes = (await notificacoes(db, p.pedido_id)).filter((n) => n.tipo !== "confirmacao_imediata");
      expect(lembretes.map((n) => [n.tipo, n.status, n.agendamento_id])).toEqual([
        ["lembrete_d1", "pendente", mel.id],
        ["lembrete_antes", "pendente", mel.id],
      ]);
      // O tutor cancelou: não recebe mensagem de cancelamento.
      expect((await notificacoes(db, p.pedido_id)).some((n) => n.tipo === "cancelamento")).toBe(false);

      await db.como(ana);
      await db.query("select public.cancelar_agendamento($1)", [mel.id]);
      await db.comoSuperusuario();
      expect((await notificacoes(db, p.pedido_id)).filter((n) => n.status === "pendente")).toEqual([]);
    });
  });

  it("remarcar reprograma os lembretes e avisa o novo horário", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoDaAna(db, [PET.thor]);
      await rodada(db, new Date().toISOString());
      const sexta = somarDias(DIA, 1);
      await db.como(ana);
      await db.query("select public.remarcar_agendamento($1, $2::timestamptz)", [p.agendamentos[0].id, as("15:00", sexta)]);
      await db.comoSuperusuario();
      const pendentes = (await notificacoes(db, p.pedido_id)).filter((n) => n.status === "pendente");
      expect(pendentes.map((n) => [n.tipo, n.enviar_em.toISOString()])).toEqual([
        ["confirmacao_imediata", expect.any(String)],
        ["lembrete_d1", new Date(as("18:00", DIA)).toISOString()],
        ["lembrete_antes", new Date(as("13:00", sexta)).toISOString()],
      ]);
      const [aviso] = await rodada(db, new Date().toISOString(), { pedido: p.pedido_id });
      expect(aviso.conteudo.texto).toMatch(/agendamento remarcado para Thor, sex, \d\d\/\d\d às 15:00/);
    });
  });

  it("falha no envio: tenta de novo com espera crescente e desiste depois de 5 tentativas", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoDaAna(db, [PET.thor]);
      let agora = new Date().toISOString();
      for (let i = 1; i <= 5; i++) {
        const [r] = (await db.rows<Reservada>("select * from public.worker_reservar(500, $1::timestamptz)", [agora])).filter((x) =>
          x.conteudo.link?.endsWith(p.token_confirmacao),
        );
        expect(r?.tentativas, `tentativa ${i}`).toBe(i);
        await db.query("select public.worker_concluir($1, false, 'teste', null, 'timeout', $2::timestamptz)", [r.id, agora]);
        // Antes da espera, não volta.
        expect(await db.count("select 1 from app.reservar_fila(500, $1::timestamptz) where id = $2", [mais(agora, 2 ** i - 1), r.id])).toBe(0);
        agora = mais(agora, 2 ** i);
      }
      const [imediata] = await notificacoes(db, p.pedido_id);
      expect([imediata.status, imediata.ultimo_erro]).toEqual(["falhou", "timeout"]);
      expect(await db.count("select 1 from public.mensagem_log where notificacao_id = $1 and status = 'erro'", [imediata.id])).toBe(5);
    });
  });

  it("pet pronto: uma mensagem, mesmo se o status for e voltar", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      for (const s of ["em_atendimento", "pronto", "em_atendimento", "pronto"]) {
        await db.query("update public.agendamento set status = $2 where id = $1", [AGENDAMENTO.thorCentro, s]);
      }
      await db.comoSuperusuario();
      const prontos = await db.rows("select 1 from public.notificacao_agendada where agendamento_id = $1 and tipo = 'pet_pronto'", [AGENDAMENTO.thorCentro]);
      expect(prontos).toHaveLength(1);
      const r = (await rodada(db, new Date().toISOString())).find((x) => x.tipo === "pet_pronto");
      expect(r?.conteudo.texto).toContain("Pet Feliz Centro: Thor está pronto! Pode vir buscar.");
    });
  });

  it("vários workers ao mesmo tempo nunca pegam a mesma mensagem", async () => {
    await emTransacao(async (db1) => {
      await emTransacao(async (db2) => {
        const agora = mais(new Date().toISOString(), 1);
        const a = await db1.rows<{ id: string }>("select id from app.reservar_fila(1, $1::timestamptz)", [agora]);
        const b = await db2.rows<{ id: string }>("select id from app.reservar_fila(1, $1::timestamptz)", [agora]);
        expect(a).toHaveLength(1);
        expect(b).toHaveLength(1);
        expect(a[0].id).not.toBe(b[0].id);
      });
    });
  });

  it("o worker não é chamável pela API", async () => {
    await emTransacao(async (db) => {
      for (const papel of [ANON, ana, alice]) {
        await db.como(papel);
        expect(await db.erro("select * from public.worker_reservar()")).toBe("42501");
        expect(await db.erro("select public.worker_concluir(gen_random_uuid(), true, 'teste')")).toBe("42501");
      }
    });
  });
});

describe("prazo de confirmação", () => {
  const prazo = as("22:00", somarDias(DIA, -1)); // 12 h antes das 10:00 (padrão da loja)

  it("avisar a loja (padrão): uma mensagem para a loja por pedido", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoDaAna(db, [PET.thor, PET.mel]);
      await rodada(db, new Date().toISOString());
      expect(await rodada(db, mais(prazo, -1), { pedido: p.pedido_id })).toEqual([]); // o lembrete das 18h perdeu a hora
      const avisos = await rodada(db, prazo, { pedido: p.pedido_id });
      expect(avisos.map((r) => r.tipo)).toEqual(["aviso_loja_sem_confirmacao"]);
      expect(avisos[0].destino).toMatch(/^\+55/);
      expect(avisos[0].conteudo.texto).toContain("não confirmou Thor e Mel");
      expect(await db.count("select 1 from public.agendamento where pedido_id = $1 and status = 'agendado' and sem_confirmacao_em is not null", [p.pedido_id])).toBe(2);
      expect(await rodada(db, mais(prazo, 5), { pedido: p.pedido_id })).toEqual([]);
    });
  });

  it("liberar o horário: cancela, avisa o tutor e não conta falta", async () => {
    await emTransacao(async (db) => {
      await db.query("update public.petshop set acao_sem_confirmacao = 'liberar_horario' where id = $1", [LOJA.centro]);
      const p = await pedidoDaAna(db, [PET.thor]);
      await rodada(db, new Date().toISOString());
      const [aviso] = await rodada(db, prazo, { pedido: p.pedido_id });
      expect(aviso.tipo).toBe("cancelamento");
      expect(aviso.conteudo.texto).toContain("foi liberado porque não recebemos a confirmação");
      expect(aviso.conteudo.link).toBe("/pet-feliz-centro");
      expect((await db.rows("select status::text from public.agendamento where pedido_id = $1", [p.pedido_id]))[0]).toEqual({ status: "cancelado" });
      const [{ faltas }] = await db.rows<{ faltas: number }>("select faltas from public.tutor_petshop where petshop_id = $1 and tutor_id = $2", [LOJA.centro, TUTOR.ana]);
      expect(faltas).toBe(0);
    });
  });

  it("quem confirmou, ou nunca recebeu o link, não é cobrado", async () => {
    await emTransacao(async (db) => {
      await db.query("update public.petshop set acao_sem_confirmacao = 'liberar_horario' where id = $1", [LOJA.centro]);
      const confirmou = await pedidoDaAna(db, [PET.thor]);
      await db.query("update public.tutor_petshop set consentimento_contato_em = null where petshop_id = $1 and tutor_id = $2", [LOJA.centro, TUTOR.ana]);
      const semLink = await pedidoDaAna(db, [PET.mel], as("10:00"));
      await db.query("update public.tutor_petshop set consentimento_contato_em = now() where petshop_id = $1 and tutor_id = $2", [LOJA.centro, TUTOR.ana]);
      await db.query("update public.notificacao_agendada set status = 'cancelada' where pedido_id = $1", [semLink.pedido_id]);
      await rodada(db, new Date().toISOString());
      await db.como(ANON);
      await db.query("select public.confirmar_por_token($1)", [confirmou.token_confirmacao]);
      await rodada(db, prazo);
      const status = await db.rows<{ pedido_id: string; status: string }>(
        "select pedido_id, status::text from public.agendamento where pedido_id = any($1)",
        [[confirmou.pedido_id, semLink.pedido_id]],
      );
      expect(status.every((s) => s.status !== "cancelado")).toBe(true);
    });
  });
});

describe("link de confirmação", () => {
  it("mostra o pedido sem dados de contato e permite confirmar, remarcar e cancelar sem login", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoDaAna(db, [PET.thor, PET.mel]);
      await db.como(ANON);
      const [{ r }] = await db.rows<{ r: Record<string, unknown> & { agendamentos: { id: string; pet_nome: string; alteravel: boolean }[] } }>(
        "select public.pedido_por_token($1) as r",
        [p.token_confirmacao],
      );
      expect(r.tutor_nome).toBe("Ana");
      expect(r.agendamentos.map((a) => [a.pet_nome, a.alteravel])).toEqual([["Thor", true], ["Mel", true]]);
      expect(JSON.stringify(r)).not.toContain("988880001");
      expect((await db.rows("select public.pedido_por_token(gen_random_uuid()) as r"))[0]).toEqual({ r: null });

      const [thor, mel] = p.agendamentos;
      await db.query("select public.remarcar_por_token($1, $2, $3::timestamptz)", [p.token_confirmacao, mel.id, as("15:00")]);
      await db.query("select public.cancelar_por_token($1, $2)", [p.token_confirmacao, thor.id]);
      // Token de um pedido não mexe em agendamento de outro.
      expect(await db.erro("select public.cancelar_por_token($1, $2)", [p.token_confirmacao, AGENDAMENTO.thorCentro])).toBe("AG002");
      await db.comoSuperusuario();
      expect(await db.rows("select id, status::text, inicio from public.agendamento where pedido_id = $1 order by inicio", [p.pedido_id])).toEqual([
        { id: thor.id, status: "cancelado", inicio: new Date(as("10:00")) },
        { id: mel.id, status: "agendado", inicio: new Date(as("15:00")) },
      ]);
    });
  });
});

describe("lista de espera", () => {
  it("avisa o primeiro da fila quando há vaga no período; o próximo só 30 min depois", async () => {
    await emTransacao(async (db) => {
      const servico = await banho(db);
      // Dia todo bloqueado: sem vaga.
      await db.query("insert into public.bloqueio (petshop_id, periodo) values ($1, tstzrange($2::timestamptz, $3::timestamptz))", [
        LOJA.centro,
        as("00:00"),
        as("23:59"),
      ]);
      await db.como(ana);
      const [{ id: thor }] = await db.rows<{ id: string }>("select public.entrar_lista_espera($1, $2, $3, $4, $5, 'manha') as id", [LOJA.centro, TUTOR.ana, PET.thor, servico, DIA]);
      const [{ id: mel }] = await db.rows<{ id: string }>("select public.entrar_lista_espera($1, $2, $3, $4, $5, 'tarde') as id", [LOJA.centro, TUTOR.ana, PET.mel, servico, DIA]);
      // Mesma transação, mesmo criado_em: a ordem de chegada fica explícita.
      await db.comoSuperusuario();
      await db.query("update public.lista_espera set criado_em = criado_em + interval '1 second' where id = $1", [mel]);
      // Outro tutor não entra na fila por ela.
      await db.como(usuario(USUARIO.brunoTutor));
      expect(await db.erro("select public.entrar_lista_espera($1, $2, $3, $4, $5)", [LOJA.centro, TUTOR.ana, PET.thor, servico, DIA])).toBe("42501");

      const meioDia = as("12:00", HOJE);
      const vagas = async (agora: string) => {
        const reservadas = await rodada(db, agora, { tutor: TUTOR.ana });
        const minhas = await db.rows<{ id: string }>("select id from public.notificacao_agendada where dados ->> 'lista_espera_id' = any($1)", [[thor, mel]]);
        return reservadas.filter((r) => minhas.some((m) => m.id === r.id));
      };
      expect(await vagas(meioDia)).toEqual([]);

      await db.query("delete from public.bloqueio where petshop_id = $1 and lower(periodo) = $2::timestamptz", [LOJA.centro, as("00:00")]);
      // Verificado há menos de 5 min: espera a próxima rodada.
      expect(await vagas(mais(meioDia, 1))).toEqual([]);
      const [aviso] = await vagas(mais(meioDia, 6));
      expect(aviso.conteudo.texto).toMatch(/abriu horário em \d\d\/\d\d \(manhã\) para Thor/);
      expect(aviso.conteudo.link).toBe("/pet-feliz-centro/agendar");
      expect(await vagas(mais(meioDia, 20))).toEqual([]);
      const [proximo] = await vagas(mais(meioDia, 36));
      expect(proximo.conteudo.texto).toContain("(tarde) para Mel");

      // Quem agenda para o dia sai da fila.
      await pedidoDaAna(db, [PET.thor]);
      expect(await db.rows("select id, status::text from public.lista_espera where id = any($1) order by status", [[thor, mel]])).toEqual([
        { id: thor, status: "atendido" },
        { id: mel, status: "notificado" },
      ]);
    });
  });

  it("de madrugada ninguém é avisado; dia que passou expira", async () => {
    await emTransacao(async (db) => {
      const servico = await banho(db);
      await db.como(ana);
      const [{ id }] = await db.rows<{ id: string }>("select public.entrar_lista_espera($1, $2, $3, $4, $5) as id", [LOJA.centro, TUTOR.ana, PET.thor, servico, DIA]);
      await rodada(db, as("23:30", HOJE));
      expect((await db.rows("select status::text from public.lista_espera where id = $1", [id]))[0]).toEqual({ status: "aguardando" });
      await rodada(db, as("09:00", somarDias(DIA, 1)));
      expect((await db.rows("select status::text from public.lista_espera where id = $1", [id]))[0]).toEqual({ status: "expirado" });
    });
  });
});

describe("faltas", () => {
  it("só dono ou gerente dispensa o sinal obrigatório", async () => {
    await emTransacao(async (db) => {
      await db.query("update public.tutor_petshop set faltas = 3, exige_sinal = true where petshop_id = $1 and tutor_id = $2", [LOJA.centro, TUTOR.ana]);
      await db.como(alice);
      expect(await db.erro("select public.dispensar_sinal($1, $2)", [LOJA.centro, TUTOR.ana])).toBe("42501");
      await db.como(gabriel);
      await db.query("select public.dispensar_sinal($1, $2)", [LOJA.centro, TUTOR.ana]);
      await db.comoSuperusuario();
      expect((await db.rows("select faltas, exige_sinal from public.tutor_petshop where petshop_id = $1 and tutor_id = $2", [LOJA.centro, TUTOR.ana]))[0]).toEqual({
        faltas: 3,
        exige_sinal: false,
      });
    });
  });
});
