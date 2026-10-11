import { describe, expect, it } from "vitest";
import { emTransacao, usuario } from "../helpers/db";
import { LOJA, PET, PROFISSIONAL, TUTOR, USUARIO } from "../helpers/ids";

const ana = usuario(USUARIO.anaTutora);

describe("tutor", () => {
  it("vê só o próprio cadastro e os próprios pets", async () => {
    await emTransacao(async (db) => {
      await db.como(ana);
      expect(await db.rows("select id from public.tutor")).toEqual([{ id: TUTOR.ana }]);
      const pets = (await db.rows<{ id: string }>("select id from public.pet order by id")).map((p) => p.id);
      expect(pets).toEqual([PET.thor, PET.mel]);
    });
  });

  it("vê os próprios agendamentos em todas as lojas e nenhum de outro tutor", async () => {
    await emTransacao(async (db) => {
      await db.como(ana);
      const ags = await db.rows<{ tutor_id: string; petshop_id: string }>(
        "select tutor_id, petshop_id from public.agendamento",
      );
      expect(ags.length).toBe(3);
      expect(ags.every((a) => a.tutor_id === TUTOR.ana)).toBe(true);
      expect(new Set(ags.map((a) => a.petshop_id))).toEqual(new Set([LOJA.centro, LOJA.moema]));
      expect(await db.count("select 1 from public.agendamento_item")).toBe(3);
      expect(await db.count("select 1 from public.pedido")).toBe(3);
    });
  });

  it("não vê observações internas da loja nem filas e logs", async () => {
    await emTransacao(async (db) => {
      await db.como(ana);
      for (const t of ["pet_petshop", "notificacao_agendada", "mensagem_log", "whatsapp_sessao", "petshop_whatsapp", "horario_trabalho", "bloqueio"]) {
        expect(await db.count(`select 1 from public.${t}`), t).toBe(0);
      }
      // Vê os próprios vínculos com as lojas (consentimentos), não os de outros tutores.
      const vinculos = await db.rows<{ tutor_id: string }>("select tutor_id from public.tutor_petshop");
      expect(vinculos.length).toBe(2);
      expect(vinculos.every((v) => v.tutor_id === TUTOR.ana)).toBe(true);
    });
  });

  it("cadastra pet para si, mas não para outro tutor", async () => {
    await emTransacao(async (db) => {
      await db.como(ana);
      expect(
        await db.erro("insert into public.pet (tutor_id, nome, porte, pelagem) values ($1, 'Nina', 'mini', 'curta')", [TUTOR.ana]),
      ).toBeNull();
      expect(
        await db.erro("insert into public.pet (tutor_id, nome, porte, pelagem) values ($1, 'Nina', 'mini', 'curta')", [TUTOR.bruno]),
      ).toBe("42501");
      const up = await db.query("update public.pet set nome = 'X' where id = $1", [PET.luna]);
      expect(up.rowCount).toBe(0);
    });
  });

  it("não cria pedido nem agendamento por insert direto e não altera agendamentos", async () => {
    await emTransacao(async (db) => {
      await db.como(ana);
      expect(
        await db.erro(
          "insert into public.pedido (petshop_id, tutor_id, canal, chave_idempotencia, criado_por_tipo) values ($1, $2, 'app_proprio', 'x', 'tutor')",
          [LOJA.centro, TUTOR.ana],
        ),
      ).toBe("42501");
      const up = await db.query("update public.agendamento set status = 'confirmado'");
      expect(up.rowCount).toBe(0);
      expect(
        await db.erro("insert into public.servico (petshop_id, nome, tipo) values ($1, 'X', 'principal')", [LOJA.centro]),
      ).toBe("42501");
    });
  });

  it("não vira membro da equipe sozinho", async () => {
    await emTransacao(async (db) => {
      await db.como(ana);
      expect(
        await db.erro("insert into public.petshop_membro (petshop_id, user_id, papel) values ($1, $2, 'dono')", [
          LOJA.centro,
          USUARIO.anaTutora,
        ]),
      ).toBe("42501");
      expect(
        await db.erro("insert into public.rede_membro (rede_id, user_id) values ('10000000-0000-0000-0000-000000000001', $1)", [
          USUARIO.anaTutora,
        ]),
      ).toBe("42501");
    });
  });

  it("entra na lista de espera só com o próprio pet", async () => {
    await emTransacao(async (db) => {
      const [{ id: banho }] = await db.rows<{ id: string }>(
        "select id from public.servico where petshop_id = $1 and nome = 'Banho'",
        [LOJA.centro],
      );
      await db.como(ana);
      const sql = `insert into public.lista_espera (petshop_id, tutor_id, pet_id, servico_id, data, profissional_id)
                   values ($1, $2, $3, $4, current_date + 5, $5)`;
      expect(await db.erro(sql, [LOJA.centro, TUTOR.ana, PET.thor, banho, PROFISSIONAL.paula])).toBeNull();
      expect(await db.erro(sql, [LOJA.centro, TUTOR.ana, PET.luna, banho, null])).toBe("42501");
      expect(await db.erro(sql, [LOJA.centro, TUTOR.bruno, PET.luna, banho, null])).toBe("42501");
    });
  });
});
