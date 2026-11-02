import { describe, expect, it } from "vitest";
import { ANON as ANON_, type Db, emTransacao, usuario } from "../helpers/db";
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

// ---------------------------------------------------------------------------
// Semana 8b: devolver, reter ou abater o sinal
// ---------------------------------------------------------------------------
type Parte = { agendamento_id: string; valor_centavos: number; situacao: string };
type Estorno = { agendamento_id: string | null; valor_centavos: number; motivo: string; status: string; tentativas: number; erro: string | null };

async function partesDo(db: Db, pagamentoId: string) {
  return db.rows<Parte>(
    `select pp.agendamento_id, pp.valor_centavos, pp.situacao::text from public.pagamento_parte pp
       join public.agendamento a on a.id = pp.agendamento_id where pp.pagamento_id = $1 order by a.inicio, a.id`,
    [pagamentoId],
  );
}

async function estornosDo(db: Db, pagamentoId: string) {
  return db.rows<Estorno>(
    "select agendamento_id, valor_centavos, motivo, status, tentativas, erro from public.estorno where pagamento_id = $1 order by criado_em, valor_centavos",
    [pagamentoId],
  );
}

/** Pedido da Ana com o sinal já pago. */
async function pedidoPago(db: Db, pets: string[], inicio?: string) {
  await ligarSinal(db, "todos");
  const p = await pedidoDaAna(db, pets, inicio);
  const pg = await pagamentoDo(db, p.pedido_id);
  expect(await pagarPix(db, pg.id)).toBe("pago");
  return { ...p, pagamento: pg };
}

async function cancelarComo(db: Db, papel: typeof ana, agendamentoId: string) {
  await db.como(papel);
  await db.query("select public.cancelar_agendamento($1)", [agendamentoId]);
  await db.comoSuperusuario();
}

describe("sinal dividido entre os pets", () => {
  it("as partes somam o sinal, na proporção do valor de cada pet; pagas quando o Pix cai", async () => {
    await emTransacao(async (db) => {
      await ligarSinal(db, "todos");
      const p = await pedidoDaAna(db, [PET.thor, PET.mel]);
      const pg = await pagamentoDo(db, p.pedido_id);
      const antes = await partesDo(db, pg.id);
      expect(antes).toHaveLength(2);
      expect(antes.reduce((s, x) => s + x.valor_centavos, 0)).toBe(pg.valor_centavos);
      expect(antes.every((x) => x.situacao === "aguardando")).toBe(true);
      const precos = await db.rows<{ preco_total_centavos: number }>(
        "select preco_total_centavos from public.agendamento where pedido_id = $1 order by inicio, id",
        [p.pedido_id],
      );
      expect(antes[0].valor_centavos).toBe(Math.floor((pg.valor_centavos * precos[0].preco_total_centavos) / p.total_centavos));

      await pagarPix(db, pg.id);
      expect((await partesDo(db, pg.id)).map((x) => x.situacao)).toEqual(["pago", "pago"]);
    });
  });
});

describe("devolver ou reter", () => {
  it("tutor cancela dentro do prazo: a parte daquele pet é devolvida; o worker faz o estorno", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoPago(db, [PET.thor, PET.mel]);
      const [thor, mel] = await partesDo(db, p.pagamento.id);
      await cancelarComo(db, ana, thor.agendamento_id);

      expect((await partesDo(db, p.pagamento.id)).map((x) => x.situacao)).toEqual(["devolver", "pago"]);
      expect(await estornosDo(db, p.pagamento.id)).toEqual([
        { agendamento_id: thor.agendamento_id, valor_centavos: thor.valor_centavos, motivo: "tutor_no_prazo", status: "pendente", tentativas: 0, erro: null },
      ]);

      const reservados = await db.rows<{ id: string; provedor: string; provedor_pagamento_id: string; valor_centavos: number; descricao: string }>(
        "select * from public.estornos_reservar(20, now() + interval '1 second')",
      );
      const meu = reservados.find((r) => r.valor_centavos === thor.valor_centavos && r.provedor_pagamento_id === "pay_1");
      expect(meu).toMatchObject({ provedor: "teste" });
      expect(meu!.descricao).toMatch(/^Devolução do sinal/);
      await db.query("select public.estorno_concluir($1, true, 'est_1')", [meu!.id]);

      expect((await partesDo(db, p.pagamento.id)).map((x) => x.situacao)).toEqual(["devolvido", "pago"]);
      expect((await estornosDo(db, p.pagamento.id))[0].status).toBe("feito");
      expect(mel.situacao).toBe("pago");
    });
  });

  it("tutor cancela fora do prazo: o sinal fica com a loja, sem estorno", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoPago(db, [PET.thor]);
      await db.query("update public.petshop set cancelamento_gratuito_horas = 2000 where id = $1", [LOJA.centro]);
      await cancelarComo(db, ana, p.agendamentos[0].id);
      expect((await partesDo(db, p.pagamento.id)).map((x) => x.situacao)).toEqual(["retido"]);
      expect(await estornosDo(db, p.pagamento.id)).toEqual([]);
    });
  });

  it("a loja cancela (pela função ou mudando o status na agenda): sempre devolve, mesmo fora do prazo", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoPago(db, [PET.thor, PET.mel]);
      await db.query("update public.petshop set cancelamento_gratuito_horas = 2000 where id = $1", [LOJA.centro]);
      const [thor, mel] = await partesDo(db, p.pagamento.id);
      await cancelarComo(db, alice, thor.agendamento_id);
      await db.como(alice);
      await db.query("update public.agendamento set status = 'cancelado' where id = $1", [mel.agendamento_id]);
      await db.comoSuperusuario();
      expect((await partesDo(db, p.pagamento.id)).map((x) => x.situacao)).toEqual(["devolver", "devolver"]);
      expect((await estornosDo(db, p.pagamento.id)).map((e) => e.motivo)).toEqual(["loja_cancelou", "loja_cancelou"]);
    });
  });

  it("falta retém, concluído abate e desfazer o passo devolve o sinal ao atendimento", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoPago(db, [PET.thor]);
      const id = p.agendamentos[0].id;
      const situacao = async () => (await partesDo(db, p.pagamento.id))[0].situacao;
      await db.query("update public.agendamento set status = 'faltou' where id = $1", [id]);
      expect(await situacao()).toBe("retido");
      await db.query("update public.agendamento set status = 'agendado' where id = $1", [id]);
      expect(await situacao()).toBe("pago");
      await db.query("update public.agendamento set status = 'em_atendimento' where id = $1", [id]);
      await db.query("update public.agendamento set status = 'concluido' where id = $1", [id]);
      expect(await situacao()).toBe("abatido");
      expect(await estornosDo(db, p.pagamento.id)).toEqual([]);
    });
  });

  it("remarcar mantém o sinal pago no mesmo atendimento", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoPago(db, [PET.thor]);
      await db.como(ana);
      await db.query("select public.remarcar_agendamento($1, $2::timestamptz)", [p.agendamentos[0].id, as("14:00")]);
      await db.comoSuperusuario();
      expect(await partesDo(db, p.pagamento.id)).toEqual([expect.objectContaining({ agendamento_id: p.agendamentos[0].id, situacao: "pago" })]);
    });
  });

  it("pet cancelado antes do Pix: quando o Pix cai, a parte dele é devolvida e a dos outros fica paga", async () => {
    await emTransacao(async (db) => {
      await ligarSinal(db, "todos");
      const p = await pedidoDaAna(db, [PET.thor, PET.mel]);
      const pg = await pagamentoDo(db, p.pedido_id);
      const [thor] = await partesDo(db, pg.id);
      await cancelarComo(db, ana, thor.agendamento_id);
      expect((await partesDo(db, pg.id)).map((x) => x.situacao)).toEqual(["cancelado", "aguardando"]);

      expect(await pagarPix(db, pg.id)).toBe("pago");
      expect((await partesDo(db, pg.id)).map((x) => x.situacao)).toEqual(["devolver", "pago"]);
      expect(await estornosDo(db, pg.id)).toEqual([expect.objectContaining({ agendamento_id: thor.agendamento_id, motivo: "pago_depois", valor_centavos: thor.valor_centavos })]);
    });
  });

  it("Pix que cai depois do vencimento é devolvido inteiro", async () => {
    await emTransacao(async (db) => {
      await ligarSinal(db, "todos");
      const p = await pedidoDaAna(db, [PET.thor, PET.mel]);
      const pg = await pagamentoDo(db, p.pedido_id);
      await db.query("select public.registrar_qr_pagamento($1, $2, 'copia-e-cola', 'imagem')", [pg.id, `qr-${pg.id}`]);
      await rodadaWorker(db, mais(pg.expira_em, 3));
      expect((await partesDo(db, pg.id)).map((x) => x.situacao)).toEqual(["cancelado", "cancelado"]);

      expect(await pagarPix(db, pg.id)).toBe("devolver");
      expect((await partesDo(db, pg.id)).map((x) => x.situacao)).toEqual(["devolver", "devolver"]);
      expect(await estornosDo(db, pg.id)).toEqual([expect.objectContaining({ agendamento_id: null, motivo: "pago_depois", valor_centavos: pg.valor_centavos })]);

      const [r] = await db.rows<{ id: string }>("select id from public.estornos_reservar(50, now() + interval '1 second') where valor_centavos = $1", [pg.valor_centavos]);
      await db.query("select public.estorno_concluir($1, true, 'est_2')", [r.id]);
      expect((await partesDo(db, pg.id)).map((x) => x.situacao)).toEqual(["devolvido", "devolvido"]);
    });
  });
});

describe("worker de devoluções e conferência", () => {
  it("falha no Asaas tenta de novo mais tarde; na quinta falha vira erro para a loja", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoPago(db, [PET.thor]);
      await cancelarComo(db, ana, p.agendamentos[0].id);
      const [{ id }] = await db.rows<{ id: string }>("select id from public.estorno where pagamento_id = $1", [p.pagamento.id]);
      let agora = new Date(Date.now() + 1000);
      for (let i = 1; i <= 5; i++) {
        const lote = await db.rows<{ id: string }>("select id from public.estornos_reservar(500, $1::timestamptz)", [agora.toISOString()]);
        expect(lote.map((r) => r.id)).toContain(id);
        await db.query("select public.estorno_concluir($1, false, null, 'saldo insuficiente', $2::timestamptz)", [id, agora.toISOString()]);
        // Antes do intervalo de espera, não é reservado de novo.
        const cedo = await db.rows<{ id: string }>("select id from public.estornos_reservar(500, $1::timestamptz)", [agora.toISOString()]);
        expect(cedo.map((r) => r.id)).not.toContain(id);
        agora = new Date(agora.getTime() + 16 * i * 60_000);
      }
      const [e] = await estornosDo(db, p.pagamento.id);
      expect(e).toMatchObject({ status: "erro", tentativas: 5, erro: "saldo insuficiente" });
      expect((await partesDo(db, p.pagamento.id))[0].situacao).toBe("devolver");
    });
  });

  it("devolução que ficou parada no meio não é refeita (o estorno pode ter saído): vira erro", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoPago(db, [PET.thor]);
      await cancelarComo(db, ana, p.agendamentos[0].id);
      const agora = new Date(Date.now() + 1000);
      await db.query("select * from public.estornos_reservar(500, $1::timestamptz)", [agora.toISOString()]);
      await db.query("select * from public.estornos_reservar(500, $1::timestamptz)", [mais(agora, 11)]);
      expect((await estornosDo(db, p.pagamento.id))[0]).toMatchObject({ status: "erro", tentativas: 1 });
    });
  });

  it("confere uma vez, uma hora depois do vencimento, os Pix do Asaas dados como não pagos", async () => {
    await emTransacao(async (db) => {
      await ligarSinal(db, "todos");
      const p = await pedidoDaAna(db, [PET.thor]);
      const pg = await pagamentoDo(db, p.pedido_id);
      await db.query("select public.registrar_qr_pagamento($1, $2, 'copia-e-cola', 'imagem')", [pg.id, `qr-${pg.id}`]);
      await db.query("update public.pagamento set provedor = 'asaas' where id = $1", [pg.id]);
      await rodadaWorker(db, mais(pg.expira_em, 3));
      const conferir = (agora: string) => db.rows<{ id: string; qr_id: string }>("select * from public.conferencia_reservar(500, $1::timestamptz)", [agora]);
      expect((await conferir(mais(pg.expira_em, 30))).map((r) => r.id)).not.toContain(pg.id);
      expect(await conferir(mais(pg.expira_em, 61))).toContainEqual(expect.objectContaining({ id: pg.id, qr_id: `qr-${pg.id}` }));
      expect((await conferir(mais(pg.expira_em, 120))).map((r) => r.id)).not.toContain(pg.id);
    });
  });

  it("nada disso é chamável pela API", async () => {
    await emTransacao(async (db) => {
      for (const papel of [gabriel, ana]) {
        await db.como(papel);
        expect(await db.erro("select * from public.estornos_reservar()")).toBe("42501");
        expect(await db.erro("select public.estorno_concluir(gen_random_uuid(), true)")).toBe("42501");
        expect(await db.erro("select * from public.conferencia_reservar()")).toBe("42501");
      }
    });
  });
});

describe("o que a loja e o tutor veem do sinal", () => {
  it("agenda mostra o sinal; partes para o tutor e a recepção; devoluções só para dono e gerência", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoPago(db, [PET.thor]);
      await cancelarComo(db, ana, p.agendamentos[0].id);
      await db.como(alice);
      const agenda = await db.rows<{ id: string; sinal: string; sinal_centavos: number }>(
        "select id, sinal::text, sinal_centavos from public.agenda_loja($1, $2, $2)",
        [LOJA.centro, DIA],
      );
      expect(agenda.find((a) => a.id === p.agendamentos[0].id)).toMatchObject({ sinal: "devolver", sinal_centavos: p.pagamento.valor_centavos });

      const partes = "select 1 from public.pagamento_parte where pagamento_id = $1";
      const estornos = "select 1 from public.estorno where pagamento_id = $1";
      for (const [papel, nPartes, nEstornos] of [[ana, 1, 0], [alice, 1, 0], [gabriel, 1, 1], [paula, 0, 0], [bruno, 0, 0]] as const) {
        await db.como(papel);
        expect(await db.count(partes, [p.pagamento.id])).toBe(nPartes);
        expect(await db.count(estornos, [p.pagamento.id])).toBe(nEstornos);
      }
    });
  });

  it("sinais do mês: recebidos, devolvidos, retidos e abatidos; só dono e gerência", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoPago(db, [PET.thor, PET.mel]);
      const [thor, mel] = await partesDo(db, p.pagamento.id);
      await cancelarComo(db, ana, thor.agendamento_id);
      await db.query("update public.agendamento set status = 'faltou' where id = $1", [mel.agendamento_id]);
      await db.como(gabriel);
      const [{ r }] = await db.rows<{ r: Record<string, number> & { itens: { agendamento_id: string; situacao: string }[] } }>(
        "select public.sinais_do_mes($1) as r",
        [LOJA.centro],
      );
      expect(r.recebidos_centavos).toBe(p.pagamento.valor_centavos);
      expect(r.devolvidos_centavos).toBe(thor.valor_centavos);
      expect(r.retidos_centavos).toBe(mel.valor_centavos);
      expect(r.abatidos_centavos).toBe(0);
      expect(r.itens.map((i) => i.situacao).sort()).toEqual(["devolver", "retido"]);
      await db.como(alice);
      expect(await db.erro("select public.sinais_do_mes($1)", [LOJA.centro])).toBe("42501");
    });
  });

  it("link de confirmação mostra o sinal pago de cada pet", async () => {
    await emTransacao(async (db) => {
      const p = await pedidoPago(db, [PET.thor]);
      const [{ token }] = await db.rows<{ token: string }>("select token_confirmacao as token from public.pedido where id = $1", [p.pedido_id]);
      await db.como(ANON_);
      const [{ r }] = await db.rows<{ r: { agendamentos: { sinal_centavos: number }[] } }>("select public.pedido_por_token($1) as r", [token]);
      expect(r.agendamentos[0].sinal_centavos).toBe(p.pagamento.valor_centavos);
    });
  });
});
