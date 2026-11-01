import { describe, expect, it } from "vitest";
import { type Db, emTransacao, usuario } from "../helpers/db";
import { proximo } from "../helpers/datas";
import { LOJA, PET, TUTOR, USUARIO } from "../helpers/ids";

// Semana 8a: sinal por Pix. As chamadas ao Asaas ficam no servidor; aqui só o que o banco decide.
const ana = usuario(USUARIO.anaTutora);
const bruno = usuario(USUARIO.brunoTutor);
const alice = usuario(USUARIO.aliceAtendenteCentro);
const gabriel = usuario(USUARIO.gabrielGerenteCentro);
const paula = usuario(USUARIO.paulaProfissionalCentro);

// Sábado a pelo menos 22 dias, num dia que os outros testes não usam.
const DIA = proximo(6, 22);
const as = (hora: string) => `${DIA} ${hora}-03`;
const mais = (instante: Date | string, minutos: number) => new Date(new Date(instante).getTime() + minutos * 60_000).toISOString();

type Pagamento = { id: string; status: string; valor_centavos: number; expira_em: Date; tutor_id: string };

async function banho(db: Db) {
  const [{ id }] = await db.rows<{ id: string }>("select id from public.servico where petshop_id = $1 and nome = 'Banho'", [LOJA.centro]);
  return id;
}

/** Conta de recebimento do Centro aprovada (como o servidor faria) e regra do sinal escolhida pelo gerente. */
async function ligarSinal(db: Db, modo: "todos" | "faltas", tipo: "percentual" | "fixo" = "percentual", valor = 30) {
  await db.como(gabriel);
  await db.query("select public.solicitar_conta_pagamento($1, $2::jsonb)", [LOJA.centro, JSON.stringify({ nome: "Pet Feliz Centro Ltda" })]);
  await db.comoSuperusuario();
  await db.query("select public.registrar_conta_pagamento($1, 'teste', 'conta-1', 'carteira-1', 'chave-secreta', 'aprovada', 'pix-1')", [LOJA.centro]);
  await db.como(gabriel);
  await db.query("select public.configurar_sinal($1, $2, $3, $4, $5)", [
    LOJA.centro,
    modo,
    tipo,
    tipo === "percentual" ? valor : null,
    tipo === "fixo" ? valor : null,
  ]);
  await db.comoSuperusuario();
}

async function pedidoDaAna(db: Db, pets: string[], inicio = as("10:00")) {
  const servico = await banho(db);
  await db.como(ana);
  const [{ r }] = await db.rows<{ r: { pedido_id: string; total_centavos: number; agendamentos: { id: string }[] } }>(
    "select public.criar_pedido($1, $2, $3::jsonb, $4::timestamptz, 'app_proprio', $5) as r",
    [LOJA.centro, TUTOR.ana, JSON.stringify(pets.map((p) => ({ pet_id: p, servicos: [servico] }))), inicio, crypto.randomUUID()],
  );
  await db.comoSuperusuario();
  return r;
}

async function pagamentoDo(db: Db, pedido: string) {
  const [p] = await db.rows<Pagamento>("select id, status::text, valor_centavos, expira_em, tutor_id from public.pagamento where pedido_id = $1", [pedido]);
  return p;
}

async function statusDos(db: Db, pedido: string) {
  return (await db.rows<{ status: string }>("select status::text from public.agendamento where pedido_id = $1 order by inicio", [pedido])).map((r) => r.status);
}

/** QR Code criado (o servidor registra) e o webhook do Asaas avisando o Pix recebido. */
async function pagarPix(db: Db, pagamentoId: string, eventoId = crypto.randomUUID()) {
  await db.query("select public.registrar_qr_pagamento($1, $2, 'copia-e-cola', 'imagem')", [pagamentoId, `qr-${pagamentoId}`]);
  const [{ r }] = await db.rows<{ r: string }>("select public.pagamento_webhook($1::jsonb) as r", [
    JSON.stringify({ id: eventoId, event: "PAYMENT_RECEIVED", payment: { id: "pay_1", pixQrCodeId: `qr-${pagamentoId}`, value: 10 } }),
  ]);
  return r;
}

async function rodadaWorker(db: Db, agora: string) {
  await db.comoSuperusuario();
  await db.query("select pg_advisory_xact_lock(hashtext('worker_notificacoes'))");
  return db.rows<{ id: string; tipo: string }>("select id, tipo::text from public.worker_reservar(500, $1::timestamptz)", [agora]);
}

describe("valor do sinal", () => {
  it("loja sem conta ou sem regra: o pedido não tem sinal", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoDaAna(db, [PET.thor]);
      expect(await pagamentoDo(db, p.pedido_id)).toBeUndefined();
    });
  });

  it("de todos: 30% do pedido inteiro, um Pix só para dois pets", async () => {
    await emTransacao(async (db) => {
      await ligarSinal(db, "todos");
      await db.como(ana);
      const [{ previsto }] = await db.rows<{ previsto: number }>("select public.sinal_previsto($1, 10001, 2) as previsto", [LOJA.centro]);
      expect(previsto).toBe(3000);
      await db.comoSuperusuario();
      const p = await pedidoDaAna(db, [PET.thor, PET.mel]);
      const pg = await pagamentoDo(db, p.pedido_id);
      expect(pg.status).toBe("aguardando");
      expect(pg.valor_centavos).toBe(Math.round(p.total_centavos * 0.3));
      expect(pg.tutor_id).toBe(TUTOR.ana);
      expect(pg.expira_em.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    });
  });

  it("valor fixo por pet, nunca acima do total", async () => {
    await emTransacao(async (db) => {
      await ligarSinal(db, "todos", "fixo", 1500);
      const p = await pedidoDaAna(db, [PET.thor, PET.mel]);
      expect((await pagamentoDo(db, p.pedido_id)).valor_centavos).toBe(Math.min(3000, p.total_centavos));
      await db.como(ana);
      const [{ previsto }] = await db.rows<{ previsto: number }>("select public.sinal_previsto($1, 1000, 1) as previsto", [LOJA.centro]);
      expect(previsto).toBe(1000);

      // Desligar guarda o valor fixo para quando a loja ligar de novo.
      await db.como(gabriel);
      await db.query("select public.configurar_sinal($1, 'nunca', 'fixo')", [LOJA.centro]);
      await db.comoSuperusuario();
      const [c] = await db.rows<{ modo_sinal: string; sinal_fixo_centavos: number }>(
        "select modo_sinal::text, sinal_fixo_centavos from public.petshop_pagamento where petshop_id = $1",
        [LOJA.centro],
      );
      expect(c).toEqual({ modo_sinal: "nunca", sinal_fixo_centavos: 1500 });
    });
  });

  it("só de quem tem faltas: cobra de quem a semana 6 marcou e para de cobrar quando a loja dispensa", async () => {
    await emTransacao(async (db) => {
      await ligarSinal(db, "faltas");
      const sem = await pedidoDaAna(db, [PET.thor], as("09:00"));
      expect(await pagamentoDo(db, sem.pedido_id)).toBeUndefined();

      await db.query("update public.tutor_petshop set exige_sinal = true where petshop_id = $1 and tutor_id = $2", [LOJA.centro, TUTOR.ana]);
      const com = await pedidoDaAna(db, [PET.thor], as("11:00"));
      expect((await pagamentoDo(db, com.pedido_id)).status).toBe("aguardando");

      await db.como(gabriel);
      await db.query("select public.dispensar_sinal($1, $2)", [LOJA.centro, TUTOR.ana]);
      await db.comoSuperusuario();
      const dispensado = await pedidoDaAna(db, [PET.thor], as("13:00"));
      expect(await pagamentoDo(db, dispensado.pedido_id)).toBeUndefined();
    });
  });

  it("balcão não cobra sinal pelo app", async () => {
    await emTransacao(async (db) => {
      await ligarSinal(db, "todos");
      const servico = await banho(db);
      await db.como(alice);
      const [{ r }] = await db.rows<{ r: { pedido_id: string } }>(
        "select public.criar_pedido($1, $2, $3::jsonb, $4::timestamptz, 'balcao', $5) as r",
        [LOJA.centro, TUTOR.ana, JSON.stringify([{ pet_id: PET.thor, servicos: [servico] }]), as("15:00"), crypto.randomUUID()],
      );
      await db.comoSuperusuario();
      expect(await pagamentoDo(db, r.pedido_id)).toBeUndefined();
    });
  });
});

describe("Pix pago ou vencido", () => {
  it("pago: o pedido fica confirmado e a confirmação sai na hora; o webhook repetido não muda nada", async () => {
    await emTransacao(async (db) => {
      await ligarSinal(db, "todos");
      const p = await pedidoDaAna(db, [PET.thor, PET.mel]);
      const pg = await pagamentoDo(db, p.pedido_id);

      // Enquanto o Pix não cai, nenhum aviso sai.
      const antes = await rodadaWorker(db, new Date().toISOString());
      const doPedido = await db.rows<{ id: string }>("select id from public.notificacao_agendada where pedido_id = $1", [p.pedido_id]);
      expect(antes.filter((r) => doPedido.some((n) => n.id === r.id))).toEqual([]);

      const evento = crypto.randomUUID();
      expect(await pagarPix(db, pg.id, evento)).toBe("pago");
      expect((await pagamentoDo(db, p.pedido_id)).status).toBe("pago");
      expect(await statusDos(db, p.pedido_id)).toEqual(["confirmado", "confirmado"]);

      const depois = await rodadaWorker(db, new Date().toISOString());
      expect(depois.filter((r) => doPedido.some((n) => n.id === r.id)).map((r) => r.tipo)).toEqual(["confirmacao_imediata"]);

      const [{ r }] = await db.rows<{ r: string }>("select public.pagamento_webhook($1::jsonb) as r", [
        JSON.stringify({ id: evento, event: "PAYMENT_RECEIVED", payment: { id: "pay_1", pixQrCodeId: `qr-${pg.id}` } }),
      ]);
      expect(r).toBe("repetido");
    });
  });

  it("vencido: o horário é liberado, sem falta e sem aviso; o Pix que cai depois fica para devolver", async () => {
    await emTransacao(async (db) => {
      await ligarSinal(db, "todos");
      const p = await pedidoDaAna(db, [PET.thor]);
      const pg = await pagamentoDo(db, p.pedido_id);
      await db.query("select public.registrar_qr_pagamento($1, $2, 'copia-e-cola', 'imagem')", [pg.id, `qr-${pg.id}`]);

      expect(await rodadaWorker(db, mais(pg.expira_em, 1))).toBeDefined();
      expect(await statusDos(db, p.pedido_id)).toEqual(["agendado"]);

      const reservadas = await rodadaWorker(db, mais(pg.expira_em, 3));
      expect((await pagamentoDo(db, p.pedido_id)).status).toBe("expirado");
      expect(await statusDos(db, p.pedido_id)).toEqual(["cancelado"]);
      const doPedido = await db.rows<{ id: string; status: string }>("select id, status::text from public.notificacao_agendada where pedido_id = $1", [p.pedido_id]);
      expect(doPedido.every((n) => n.status === "cancelada")).toBe(true);
      expect(reservadas.filter((r) => doPedido.some((n) => n.id === r.id))).toEqual([]);
      const [{ faltas }] = await db.rows<{ faltas: number }>("select faltas from public.tutor_petshop where petshop_id = $1 and tutor_id = $2", [LOJA.centro, TUTOR.ana]);
      expect(faltas).toBe(0);

      // O horário voltou a ficar livre.
      const outro = await pedidoDaAna(db, [PET.thor]);
      expect(outro.agendamentos).toHaveLength(1);

      expect(await pagarPix(db, pg.id)).toBe("devolver");
      expect((await pagamentoDo(db, p.pedido_id)).status).toBe("devolver");
    });
  });

  it("o tutor cancela antes de pagar: não há mais o que pagar", async () => {
    await emTransacao(async (db) => {
      await ligarSinal(db, "todos");
      const p = await pedidoDaAna(db, [PET.thor]);
      await db.como(ana);
      await db.query("select public.cancelar_agendamento($1)", [p.agendamentos[0].id]);
      await db.comoSuperusuario();
      expect((await pagamentoDo(db, p.pedido_id)).status).toBe("cancelado");
    });
  });
});

describe("quem mexe na conta e vê os pagamentos", () => {
  it("só dono ou gerente abre a conta e liga o sinal; ligar exige conta aprovada", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      expect(await db.erro("select public.solicitar_conta_pagamento($1, '{}'::jsonb)", [LOJA.centro])).toBe("42501");
      await db.como(gabriel);
      await db.query("select public.solicitar_conta_pagamento($1, '{}'::jsonb)", [LOJA.centro]);
      expect(await db.erro("select public.configurar_sinal($1, 'todos', 'percentual', 30, null)", [LOJA.centro])).toBe("P0002");
      expect(await db.count("select 1 from public.petshop_pagamento where petshop_id = $1", [LOJA.centro])).toBe(1);
      await db.como(alice);
      expect(await db.count("select 1 from public.petshop_pagamento where petshop_id = $1", [LOJA.centro])).toBe(0);
    });
  });

  it("a chave da subconta e o webhook ficam fora do alcance da API", async () => {
    await emTransacao(async (db) => {
      await ligarSinal(db, "todos");
      for (const papel of [gabriel, ana]) {
        await db.como(papel);
        expect(await db.erro("select public.chave_conta_pagamento($1)", [LOJA.centro])).toBe("42501");
        expect(await db.erro("select public.pagamento_webhook('{\"id\":\"x\"}'::jsonb)")).toBe("42501");
        expect(await db.erro("select public.registrar_qr_pagamento(gen_random_uuid(), 'a', 'b', 'c')")).toBe("42501");
      }
      await db.comoSuperusuario();
      const [{ chave }] = await db.rows<{ chave: string }>("select public.chave_conta_pagamento($1) as chave", [LOJA.centro]);
      expect(chave).toBe("chave-secreta");
    });
  });

  it("o tutor vê o próprio pagamento; a recepção vê os da loja; a profissional e outro tutor não", async () => {
    await emTransacao(async (db) => {
      await ligarSinal(db, "todos");
      const p = await pedidoDaAna(db, [PET.thor]);
      const sql = "select 1 from public.pagamento where pedido_id = $1";
      for (const [papel, n] of [[ana, 1], [alice, 1], [gabriel, 1], [paula, 0], [bruno, 0]] as const) {
        await db.como(papel);
        expect(await db.count(sql, [p.pedido_id])).toBe(n);
      }
    });
  });
});
