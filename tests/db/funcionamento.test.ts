import { describe, expect, it } from "vitest";
import { ANON, type Db, emTransacao, usuario } from "../helpers/db";
import { proximo, somarDias } from "../helpers/datas";
import { LOJA, PROFISSIONAL, USUARIO } from "../helpers/ids";

// Seed: todas as lojas abrem de terça a sábado, das 9h às 18h (o horário da equipe), no fuso de São Paulo.
// Datas longe de hoje, sem bloqueios do seed nem de outros testes.
const TERCA = proximo(2, 200);
const QUARTA = somarDias(TERCA, 1);
const SABADO = somarDias(TERCA, 4);
const SEGUNDA = somarDias(TERCA, 6);
const sp = (data: string, hora: string) => new Date(`${data}T${hora}:00-03:00`).toISOString();

type Situacao = { petshop_id: string; aberto: boolean; fecha_em: Date | null; abre_em: Date | null };

async function situacao(db: Db, agora: string, loja: string = LOJA.centro) {
  const linhas = await db.rows<Situacao>("select * from public.situacao_lojas($1::uuid[], $2::timestamptz)", [[loja], agora]);
  return linhas[0] ? { ...linhas[0], fecha_em: linhas[0].fecha_em?.toISOString() ?? null, abre_em: linhas[0].abre_em?.toISOString() ?? null } : null;
}

async function trocarHorario(db: Db, loja: string, faixas: [number, string, string][]) {
  await db.query("delete from public.horario_funcionamento where petshop_id = $1", [loja]);
  for (const [dia, abre, fecha] of faixas)
    await db.query("insert into public.horario_funcionamento (petshop_id, dia_semana, abre, fecha) values ($1, $2, $3, $4)", [loja, dia, abre, fecha]);
}

describe("situacao_lojas (aberto agora)", () => {
  it("aberta no meio do dia: fecha às 18h", () =>
    emTransacao(async (db) => {
      expect(await situacao(db, sp(TERCA, "10:00"))).toMatchObject({ aberto: true, fecha_em: sp(TERCA, "18:00"), abre_em: sp(QUARTA, "09:00") });
    }));

  it("fechada às 18h em ponto e antes de abrir; depois de sábado, abre na terça", () =>
    emTransacao(async (db) => {
      expect(await situacao(db, sp(TERCA, "18:00"))).toMatchObject({ aberto: false, fecha_em: null, abre_em: sp(QUARTA, "09:00") });
      expect(await situacao(db, sp(TERCA, "08:59"))).toMatchObject({ aberto: false, abre_em: sp(TERCA, "09:00") });
      expect(await situacao(db, sp(SABADO, "19:00"))).toMatchObject({ aberto: false, abre_em: sp(somarDias(SABADO, 3), "09:00") });
      expect(await situacao(db, sp(SEGUNDA, "12:00"))).toMatchObject({ aberto: false, abre_em: sp(somarDias(SEGUNDA, 1), "09:00") });
    }));

  it("pausa para o almoço fecha a loja; faixas que se encostam contam como uma só", () =>
    emTransacao(async (db) => {
      await trocarHorario(db, LOJA.centro, [[2, "08:00", "12:00"], [2, "13:00", "18:00"], [3, "08:00", "12:00"], [3, "12:00", "18:00"]]);
      expect(await situacao(db, sp(TERCA, "11:00"))).toMatchObject({ aberto: true, fecha_em: sp(TERCA, "12:00") });
      expect(await situacao(db, sp(TERCA, "12:30"))).toMatchObject({ aberto: false, abre_em: sp(TERCA, "13:00") });
      expect(await situacao(db, sp(QUARTA, "11:00"))).toMatchObject({ aberto: true, fecha_em: sp(QUARTA, "18:00") });
    }));

  it("bloqueio da loja inteira fecha; bloqueio de um profissional não", () =>
    emTransacao(async (db) => {
      await db.query(
        "insert into public.bloqueio (petshop_id, profissional_id, tipo, periodo) values ($1, $2, 'outro', tstzrange($3, $4))",
        [LOJA.centro, PROFISSIONAL.marcos, sp(TERCA, "09:00"), sp(TERCA, "18:00")],
      );
      expect(await situacao(db, sp(TERCA, "10:00"))).toMatchObject({ aberto: true });
      await db.query("insert into public.bloqueio (petshop_id, tipo, periodo) values ($1, 'feriado', tstzrange($2, $3))", [
        LOJA.centro,
        sp(TERCA, "00:00"),
        sp(QUARTA, "00:00"),
      ]);
      expect(await situacao(db, sp(TERCA, "10:00"))).toMatchObject({ aberto: false, fecha_em: null, abre_em: sp(QUARTA, "09:00") });
      // Bloqueio só à tarde: a loja fecha quando ele começa.
      await db.query("insert into public.bloqueio (petshop_id, tipo, periodo) values ($1, 'outro', tstzrange($2, $3))", [
        LOJA.centro,
        sp(QUARTA, "14:00"),
        sp(QUARTA, "16:00"),
      ]);
      expect(await situacao(db, sp(QUARTA, "10:00"))).toMatchObject({ aberto: true, fecha_em: sp(QUARTA, "14:00") });
    }));

  it("usa o fuso da loja", () =>
    emTransacao(async (db) => {
      await db.query("update public.petshop set fuso = 'America/Manaus' where id = $1", [LOJA.centro]);
      // 09:30 em São Paulo = 08:30 em Manaus: ainda fechada; abre às 09:00 de Manaus (10:00 em São Paulo).
      expect(await situacao(db, sp(TERCA, "09:30"))).toMatchObject({ aberto: false, abre_em: sp(TERCA, "10:00") });
    }));

  it("loja sem horário ou inativa não aparece (sem selo)", () =>
    emTransacao(async (db) => {
      await trocarHorario(db, LOJA.centro, []);
      expect(await situacao(db, sp(TERCA, "10:00"))).toBeNull();
      await db.query("update public.petshop set ativo = false where id = $1", [LOJA.moema]);
      expect(await situacao(db, sp(TERCA, "10:00"), LOJA.moema)).toBeNull();
    }));

  it("anônimo consulta a situação e lê o horário das lojas", () =>
    emTransacao(async (db) => {
      await db.como(ANON);
      expect(await situacao(db, sp(TERCA, "10:00"))).toMatchObject({ aberto: true });
      expect(await db.count("select 1 from public.horario_funcionamento where petshop_id = $1", [LOJA.centro])).toBe(5);
      expect((await db.tentar("delete from public.horario_funcionamento where petshop_id = $1", [LOJA.centro])).linhas).toBe(0);
    }));
});

describe("quem altera o horário de funcionamento", () => {
  const novo = "insert into public.horario_funcionamento (petshop_id, dia_semana, abre, fecha) values ($1, 1, '09:00', '12:00')";

  it("gerente grava; atendente e outra loja não", () =>
    emTransacao(async (db) => {
      await db.como(usuario(USUARIO.aliceAtendenteCentro));
      expect(await db.erro(novo, [LOJA.centro])).toBe("42501");
      expect((await db.tentar("delete from public.horario_funcionamento where petshop_id = $1", [LOJA.centro])).linhas).toBe(0);
      await db.como(usuario(USUARIO.diegoDonoMoema));
      expect(await db.erro(novo, [LOJA.centro])).toBe("42501");
      await db.como(usuario(USUARIO.gabrielGerenteCentro));
      expect(await db.erro(novo, [LOJA.centro])).toBeNull();
    }));

  it("faixas do mesmo dia não se sobrepõem", () =>
    emTransacao(async (db) => {
      expect(
        await db.erro("insert into public.horario_funcionamento (petshop_id, dia_semana, abre, fecha) values ($1, 2, '17:00', '20:00')", [LOJA.centro]),
      ).toBe("23P01");
      expect(
        await db.erro("insert into public.horario_funcionamento (petshop_id, dia_semana, abre, fecha) values ($1, 2, '18:00', '20:00')", [LOJA.centro]),
      ).toBeNull();
    }));

  it("usar o horário da equipe: troca pelo horário dos profissionais ativos; só dono e gerente", () =>
    emTransacao(async (db) => {
      await trocarHorario(db, LOJA.centro, [[1, "07:00", "08:00"]]);
      await db.como(usuario(USUARIO.aliceAtendenteCentro));
      expect(await db.erro("select public.copiar_horario_da_equipe($1)", [LOJA.centro])).toBe("42501");
      await db.como(usuario(USUARIO.diegoDonoMoema));
      expect(await db.erro("select public.copiar_horario_da_equipe($1)", [LOJA.centro])).toBe("42501");
      await db.como(usuario(USUARIO.gabrielGerenteCentro));
      const [{ n }] = await db.rows<{ n: number }>("select public.copiar_horario_da_equipe($1) as n", [LOJA.centro]);
      expect(n).toBe(5);
      const dias = await db.rows("select dia_semana, abre, fecha from public.horario_funcionamento where petshop_id = $1 order by dia_semana", [LOJA.centro]);
      expect(dias).toEqual([2, 3, 4, 5, 6].map((d) => ({ dia_semana: d, abre: "09:00:00", fecha: "18:00:00" })));
    }));
});
