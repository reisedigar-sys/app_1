import { describe, expect, it } from "vitest";
import { type Db, emTransacao } from "../helpers/db";
import { AGENDAMENTO, LOJA, PEDIDO, PET, PROFISSIONAL, TUTOR } from "../helpers/ids";

// Grava um agendamento direto (como superusuário) para a Paula na loja Centro.
async function agendar(db: Db, inicio: string, minutos: number, buffer = 10, status = "agendado") {
  return db.erro(
    `insert into public.agendamento (petshop_id, pedido_id, tutor_id, pet_id, profissional_id, canal, status,
                                     inicio, fim, buffer_minutos)
     values ($1, $2, $3, $4, $5, 'balcao', $6, $7::timestamptz, $7::timestamptz + make_interval(mins => $8), $9)`,
    [LOJA.centro, PEDIDO.anaCentro, TUTOR.ana, PET.thor, PROFISSIONAL.paula, status, inicio, minutos, buffer],
  );
}

describe("sem overbooking (constraint do banco)", () => {
  const base = "2030-01-08 10:00-03"; // terça-feira

  it("impede dois atendimentos sobrepostos do mesmo profissional", async () => {
    await emTransacao(async (db) => {
      expect(await agendar(db, base, 60)).toBeNull();
      expect(await agendar(db, "2030-01-08 10:30-03", 30)).toBe("23P01");
    });
  });

  it("o buffer de limpeza também bloqueia", async () => {
    await emTransacao(async (db) => {
      expect(await agendar(db, base, 60, 10)).toBeNull();
      // Começa quando o anterior termina, mas ainda dentro do buffer de 10 min.
      expect(await agendar(db, "2030-01-08 11:00-03", 30)).toBe("23P01");
      expect(await agendar(db, "2030-01-08 11:09-03", 30)).toBe("23P01");
      // Logo depois do buffer, pode.
      expect(await agendar(db, "2030-01-08 11:10-03", 30)).toBeNull();
    });
  });

  it("o buffer gravado no agendamento não muda quando a loja altera a configuração", async () => {
    await emTransacao(async (db) => {
      expect(await agendar(db, base, 60, 10)).toBeNull();
      await db.query("update public.petshop set buffer_minutos = 30 where id = $1", [LOJA.centro]);
      expect(await agendar(db, "2030-01-08 11:10-03", 30)).toBeNull();
    });
  });

  it("cancelado e falta liberam o horário", async () => {
    await emTransacao(async (db) => {
      expect(await agendar(db, base, 60, 10, "cancelado")).toBeNull();
      expect(await agendar(db, base, 60, 10, "faltou")).toBeNull();
      expect(await agendar(db, base, 60)).toBeNull();
    });
  });

  it("profissionais diferentes podem atender no mesmo horário", async () => {
    await emTransacao(async (db) => {
      expect(await agendar(db, base, 60)).toBeNull();
      expect(
        await db.erro(
          `insert into public.agendamento (petshop_id, pedido_id, tutor_id, pet_id, profissional_id, canal, inicio, fim, buffer_minutos)
           values ($1, $2, $3, $4, $5, 'balcao', $6::timestamptz, $6::timestamptz + interval '1 hour', 10)`,
          [LOJA.centro, PEDIDO.anaCentro, TUTOR.ana, PET.mel, PROFISSIONAL.marcos, base],
        ),
      ).toBeNull();
    });
  });

  it("reativar um agendamento cancelado em horário já ocupado falha", async () => {
    await emTransacao(async (db) => {
      expect(await agendar(db, base, 60, 10, "cancelado")).toBeNull();
      expect(await agendar(db, base, 60)).toBeNull();
      expect(
        await db.erro(
          "update public.agendamento set status = 'agendado' where status = 'cancelado' and profissional_id = $1",
          [PROFISSIONAL.paula],
        ),
      ).toBe("23P01");
    });
  });

  it("registra cancelado_em ao cancelar", async () => {
    await emTransacao(async (db) => {
      await db.query("update public.agendamento set status = 'cancelado' where id = $1", [AGENDAMENTO.thorCentro]);
      const [a] = await db.rows<{ cancelado_em: Date | null }>("select cancelado_em from public.agendamento where id = $1", [
        AGENDAMENTO.thorCentro,
      ]);
      expect(a.cancelado_em).not.toBeNull();
    });
  });

  it("não aceita fim antes do início", async () => {
    await emTransacao(async (db) => {
      expect(await agendar(db, base, -30)).toBe("23514");
    });
  });
});

describe("faltas", () => {
  it("conta faltas por loja e exige sinal acima do limite", async () => {
    await emTransacao(async (db) => {
      // limite_faltas padrão = 2: a 3ª falta passa a exigir sinal.
      for (const [i, inicio] of ["2030-01-08 09:00-03", "2030-01-09 09:00-03", "2030-01-10 09:00-03"].entries()) {
        expect(await agendar(db, inicio, 30)).toBeNull();
        await db.query(
          "update public.agendamento set status = 'faltou' where profissional_id = $1 and inicio = $2::timestamptz",
          [PROFISSIONAL.paula, inicio],
        );
        const [tp] = await db.rows<{ faltas: number; exige_sinal: boolean }>(
          "select faltas, exige_sinal from public.tutor_petshop where petshop_id = $1 and tutor_id = $2",
          [LOJA.centro, TUTOR.ana],
        );
        expect(tp.faltas).toBe(i + 1);
        expect(tp.exige_sinal).toBe(i + 1 > 2);
      }
      // A falta numa loja não afeta o vínculo com outra.
      const [moema] = await db.rows<{ faltas: number }>(
        "select faltas from public.tutor_petshop where petshop_id = $1 and tutor_id = $2",
        [LOJA.moema, TUTOR.ana],
      );
      expect(moema.faltas).toBe(0);
    });
  });

  it("desfazer a falta devolve o contador", async () => {
    await emTransacao(async (db) => {
      await db.query("update public.agendamento set status = 'faltou' where id = $1", [AGENDAMENTO.thorCentro]);
      await db.query("update public.agendamento set status = 'agendado' where id = $1", [AGENDAMENTO.thorCentro]);
      const [tp] = await db.rows<{ faltas: number }>(
        "select faltas from public.tutor_petshop where petshop_id = $1 and tutor_id = $2",
        [LOJA.centro, TUTOR.ana],
      );
      expect(tp.faltas).toBe(0);
    });
  });
});

describe("horários de trabalho e cadastro", () => {
  it("impede janelas sobrepostas do mesmo profissional no mesmo escopo", async () => {
    await emTransacao(async (db) => {
      const sql = `insert into public.horario_trabalho (petshop_id, profissional_id, servico_id, dia_semana, inicio, fim)
                   values ($1, $2, $3, 2, $4, $5)`;
      // Paula já trabalha terça 9h–18h (janela geral).
      expect(await db.erro(sql, [LOJA.centro, PROFISSIONAL.paula, null, "17:00", "19:00"])).toBe("23P01");
      expect(await db.erro(sql, [LOJA.centro, PROFISSIONAL.paula, null, "18:00", "20:00"])).toBeNull();
      // Janela de serviço não conflita com a geral, mas não pode sobrepor outra do mesmo serviço.
      const [{ id: tosa }] = await db.rows<{ id: string }>(
        "select id from public.servico where petshop_id = $1 and nome = 'Tosa completa'",
        [LOJA.centro],
      );
      expect(await db.erro(sql, [LOJA.centro, PROFISSIONAL.paula, tosa, "12:00", "14:00"])).toBe("23P01");
      expect(await db.erro(sql, [LOJA.centro, PROFISSIONAL.paula, tosa, "14:00", "16:00"])).toBeNull();
      expect(await db.erro(sql, [LOJA.centro, PROFISSIONAL.paula, null, "08:00", "08:00"])).toBe("23514");
    });
  });

  it("valida fuso, slug e telefone", async () => {
    await emTransacao(async (db) => {
      expect(await db.erro("update public.petshop set fuso = 'Marte/Olympus' where id = $1", [LOJA.centro])).toBe("22023");
      expect(await db.erro("update public.petshop set fuso = 'America/Manaus' where id = $1", [LOJA.centro])).toBeNull();
      expect(await db.erro("update public.petshop set slug = 'Com Espaço' where id = $1", [LOJA.centro])).toBe("23514");
      expect(await db.erro("update public.tutor set telefone_e164 = '11999998888' where id = $1", [TUTOR.ana])).toBe("23514");
    });
  });

  it("telefone identifica o tutor globalmente (único)", async () => {
    await emTransacao(async (db) => {
      expect(
        await db.erro("insert into public.tutor (nome, telefone_e164) values ('Outra Ana', '+5511988880001')"),
      ).toBe("23505");
    });
  });
});
