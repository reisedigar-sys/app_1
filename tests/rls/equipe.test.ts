import { describe, expect, it } from "vitest";
import { emTransacao, usuario } from "../helpers/db";
import { AGENDAMENTO, LOJA, PROFISSIONAL, TUTOR, USUARIO } from "../helpers/ids";

describe("equipe da loja", () => {
  it("gerente da Centro não vê dados privados da Zona Sul, mesmo sendo da mesma rede", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.gabrielGerenteCentro));
      for (const t of ["agendamento", "pedido", "tutor_petshop", "horario_trabalho", "bloqueio", "notificacao_agendada", "mensagem_log", "lista_espera"]) {
        expect(await db.count(`select 1 from public.${t} where petshop_id = $1`, [LOJA.zonaSul]), t).toBe(0);
      }
      expect(await db.count("select 1 from public.agendamento where petshop_id = $1", [LOJA.centro])).toBe(2);
    });
  });

  it("dona da rede enxerga todas as unidades da rede e nenhuma de outra rede", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.renataDonaRede));
      const lojas = await db.rows<{ petshop_id: string }>("select distinct petshop_id from public.agendamento");
      expect(new Set(lojas.map((l) => l.petshop_id))).toEqual(new Set([LOJA.centro, LOJA.zonaSul]));
      expect(await db.count("select 1 from public.horario_trabalho where petshop_id = $1", [LOJA.zonaSul])).toBeGreaterThan(0);
      const up = await db.query("update public.petshop set buffer_minutos = 20 where id = $1", [LOJA.zonaSul]);
      expect(up.rowCount).toBe(1);
    });
  });

  it("equipe vê tutores e pets vinculados à loja, mas não os de fora", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.gabrielGerenteCentro));
      expect(await db.rows("select id from public.tutor")).toEqual([{ id: TUTOR.ana }]);
      expect(await db.count("select 1 from public.pet")).toBe(2);
      // Observações que a Moema fez sobre os pets da Ana não aparecem para a Centro.
      expect(await db.count("select 1 from public.pet_petshop where petshop_id <> $1", [LOJA.centro])).toBe(0);
    });
  });

  it("profissional vê só a própria agenda", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.paulaProfissionalCentro));
      const ags = await db.rows<{ profissional_id: string }>("select profissional_id from public.agendamento");
      expect(ags.length).toBeGreaterThan(0);
      expect(ags.every((a) => a.profissional_id === PROFISSIONAL.paula)).toBe(true);
      const up = await db.query("update public.agendamento set status = 'confirmado' where id = $1", [AGENDAMENTO.thorCentro]);
      expect(up.rowCount).toBe(0);
    });
  });

  it("atendente opera a agenda inteira, mas não altera a configuração da loja", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.aliceAtendenteCentro));
      expect(await db.count("select 1 from public.agendamento")).toBe(2);
      const status = await db.query("update public.agendamento set status = 'confirmado' where id = $1", [AGENDAMENTO.thorCentro]);
      expect(status.rowCount).toBe(1);
      expect((await db.query("update public.servico set ativo = false where petshop_id = $1", [LOJA.centro])).rowCount).toBe(0);
      expect((await db.query("update public.petshop set buffer_minutos = 30 where id = $1", [LOJA.centro])).rowCount).toBe(0);
      expect(await db.count("select 1 from public.mensagem_log")).toBe(0);
    });
  });

  it("gerente configura a loja, mas só o dono administra a equipe", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.gabrielGerenteCentro));
      expect((await db.query("update public.servico set ordem = 9 where petshop_id = $1", [LOJA.centro])).rowCount).toBe(6);
      expect(
        await db.erro("insert into public.petshop_membro (petshop_id, user_id, papel) values ($1, $2, 'dono')", [
          LOJA.centro,
          USUARIO.anaTutora,
        ]),
      ).toBe("42501");

      await db.como(usuario(USUARIO.diegoDonoMoema));
      expect(
        await db.erro("insert into public.petshop_membro (petshop_id, user_id, papel) values ($1, $2, 'atendente')", [
          LOJA.moema,
          USUARIO.anaTutora,
        ]),
      ).toBeNull();
      expect(
        await db.erro("insert into public.petshop_membro (petshop_id, user_id, papel) values ($1, $2, 'atendente')", [
          LOJA.centro,
          USUARIO.brunoTutor,
        ]),
      ).toBe("42501");
    });
  });

  it("não troca a loja de rede", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.diegoDonoMoema));
      expect(
        await db.erro("update public.petshop set rede_id = '10000000-0000-0000-0000-000000000001' where id = $1", [LOJA.moema]),
      ).toBe("42501");
    });
  });

  it("não insere dados na loja de outra rede", async () => {
    await emTransacao(async (db) => {
      await db.comoSuperusuario();
      const [{ id: banhoMoema }] = await db.rows<{ id: string }>(
        "select id from public.servico where petshop_id = $1 and nome = 'Banho'",
        [LOJA.moema],
      );
      await db.como(usuario(USUARIO.gabrielGerenteCentro));
      const tentativas: [string, unknown[]][] = [
        ["insert into public.servico (petshop_id, nome, tipo) values ($1, 'X', 'principal')", [LOJA.moema]],
        ["insert into public.profissional (petshop_id, nome) values ($1, 'X')", [LOJA.moema]],
        ["insert into public.categoria_servico (petshop_id, nome) values ($1, 'X')", [LOJA.moema]],
        ["insert into public.servico_preco (petshop_id, servico_id, porte, pelagem, preco_centavos, duracao_minutos) values ($1, $2, 'mini', 'curta', 1, 10)", [LOJA.moema, banhoMoema]],
        ["insert into public.horario_trabalho (petshop_id, profissional_id, dia_semana, inicio, fim) values ($1, $2, 1, '08:00', '09:00')", [LOJA.moema, PROFISSIONAL.carla]],
        ["insert into public.bloqueio (petshop_id, periodo) values ($1, tstzrange(now(), now() + interval '1 hour'))", [LOJA.moema]],
        ["insert into public.tutor_petshop (petshop_id, tutor_id) values ($1, $2)", [LOJA.moema, TUTOR.ana]],
        ["insert into public.pet_petshop (petshop_id, pet_id) values ($1, '50000000-0000-0000-0000-000000000001')", [LOJA.moema]],
      ];
      for (const [sql, params] of tentativas) {
        expect(await db.erro(sql, params), sql).toBe("42501");
      }
    });
  });

  it("não aponta dados da própria loja para registros de outra loja (FK composta)", async () => {
    await emTransacao(async (db) => {
      const [{ id: banhoMoema }] = await db.rows<{ id: string }>(
        "insert into public.servico (petshop_id, nome, tipo) values ($1, 'Novo', 'principal') returning id",
        [LOJA.moema],
      );
      await db.como(usuario(USUARIO.gabrielGerenteCentro));
      expect(
        await db.erro(
          "insert into public.servico_preco (petshop_id, servico_id, porte, pelagem, preco_centavos, duracao_minutos) values ($1, $2, 'mini', 'curta', 1, 10)",
          [LOJA.centro, banhoMoema],
        ),
      ).toBe("23503");
      expect(
        await db.erro("insert into public.profissional_servico (petshop_id, profissional_id, servico_id) values ($1, $2, $3)", [
          LOJA.centro,
          PROFISSIONAL.paula,
          banhoMoema,
        ]),
      ).toBe("23503");
    });
  });
});
