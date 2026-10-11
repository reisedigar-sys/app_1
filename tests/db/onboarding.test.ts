import { describe, expect, it } from "vitest";
import { ANON, type Db, emTransacao, usuario } from "../helpers/db";
import { LOJA, PROFISSIONAL, USUARIO } from "../helpers/ids";

const NOVO_USUARIO = "b0000000-0000-0000-0000-000000000001";

async function criarUsuario(db: Db, id = NOVO_USUARIO, email = "nova@loja.test") {
  await db.query(
    `insert into auth.users (instance_id, id, aud, role, email) values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2)`,
    [id, email],
  );
}

async function checklist(db: Db, lojaId: string) {
  const [{ c }] = await db.rows<{ c: Record<string, unknown> | null }>("select public.checklist_onboarding($1) as c", [lojaId]);
  return c;
}

describe("criar_rede_e_loja", () => {
  it("cria rede e loja e torna quem criou dono das duas", async () => {
    await emTransacao(async (db) => {
      await criarUsuario(db);
      await db.como(usuario(NOVO_USUARIO));
      const [{ id }] = await db.rows<{ id: string }>(
        "select public.criar_rede_e_loja('Rede Nova', 'Loja Nova', 'loja-nova') as id",
      );
      const [loja] = await db.rows<{ nome: string; comissao_marketplace_pct: string }>(
        "select nome, comissao_marketplace_pct from public.petshop where id = $1",
        [id],
      );
      expect(loja.nome).toBe("Loja Nova");
      expect(Number(loja.comissao_marketplace_pct)).toBe(0);
      expect(await db.rows("select papel from public.petshop_membro where petshop_id = $1", [id])).toEqual([{ papel: "dono" }]);
      // Como dona da rede, consegue abrir outra unidade.
      const [{ rede_id }] = await db.rows<{ rede_id: string }>("select rede_id from public.petshop where id = $1", [id]);
      expect(
        await db.erro("insert into public.petshop (rede_id, nome, slug) values ($1, 'Unidade 2', 'loja-nova-2')", [rede_id]),
      ).toBeNull();
      // Loja recém-criada ainda não está pronta.
      expect(await checklist(db, id)).toMatchObject({
        completo: false,
        dados_loja: false,
        tem_profissional: false,
        tem_servico_principal: false,
      });
    });
  });

  it("exige login e slug único", async () => {
    await emTransacao(async (db) => {
      await db.como(ANON);
      expect(await db.erro("select public.criar_rede_e_loja('R', 'L', 'l')")).toBe("42501");
      await db.como(usuario(USUARIO.anaTutora));
      expect(await db.erro("select public.criar_rede_e_loja('R', 'L', 'pet-feliz-centro')")).toBe("23505");
      expect(await db.erro("select public.criar_rede_e_loja('R', 'L', 'Slug Inválido')")).toBe("23514");
    });
  });
});

describe("equipe", () => {
  it("só o dono adiciona membros, pelo e-mail de uma conta existente", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.diegoDonoMoema));
      expect(await db.erro("select public.adicionar_membro($1, 'ANA@tutor.test', 'atendente')", [LOJA.moema])).toBeNull();
      expect(await db.erro("select public.adicionar_membro($1, 'ninguem@x.test', 'atendente')", [LOJA.moema])).toBe("P0002");
      expect(await db.erro("select public.adicionar_membro($1, 'ana@tutor.test', 'atendente')", [LOJA.centro])).toBe("42501");
      // Papel profissional precisa apontar para um profissional da própria loja.
      expect(
        await db.erro("select public.adicionar_membro($1, 'bruno@tutor.test', 'profissional', $2)", [LOJA.moema, PROFISSIONAL.paula]),
      ).toBe("23503");

      await db.como(usuario(USUARIO.gabrielGerenteCentro));
      expect(await db.erro("select public.adicionar_membro($1, 'ana@tutor.test', 'dono')", [LOJA.centro])).toBe("42501");
    });
  });

  it("lista a equipe com e-mail só para quem administra a loja", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.gabrielGerenteCentro));
      const emails = (await db.rows<{ email: string }>("select email from public.listar_equipe($1)", [LOJA.centro])).map((r) => r.email);
      expect(emails.sort()).toEqual(["alice@petfeliz.test", "gabriel@petfeliz.test", "paula@petfeliz.test"]);
      await db.como(usuario(USUARIO.aliceAtendenteCentro));
      expect(await db.count("select * from public.listar_equipe($1)", [LOJA.centro])).toBe(0);
      await db.como(usuario(USUARIO.diegoDonoMoema));
      expect(await db.count("select * from public.listar_equipe($1)", [LOJA.centro])).toBe(0);
    });
  });
});

describe("comissão da plataforma", () => {
  it("a loja não altera a própria comissão", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.gabrielGerenteCentro));
      expect(await db.erro("update public.petshop set comissao_marketplace_pct = 0 where id = $1", [LOJA.centro])).toBeNull();
      expect(await db.erro("update public.petshop set comissao_marketplace_pct = 5 where id = $1", [LOJA.centro])).toBe("42501");
      await db.comoSuperusuario();
      expect(await db.erro("update public.petshop set comissao_marketplace_pct = 5 where id = $1", [LOJA.centro])).toBeNull();
    });
  });
});

describe("checklist de onboarding", () => {
  it("aponta serviço sem profissional habilitado ou sem preço e profissional sem horário", async () => {
    await emTransacao(async (db) => {
      await db.query(
        "delete from public.profissional_servico where servico_id in (select id from public.servico where petshop_id = $1 and nome = 'Tosa completa')",
        [LOJA.centro],
      );
      await db.query(
        "delete from public.servico_preco where servico_id in (select id from public.servico where petshop_id = $1 and nome = 'Hidratação')",
        [LOJA.centro],
      );
      await db.query("delete from public.horario_trabalho where profissional_id = $1", [PROFISSIONAL.marcos]);
      await db.como(usuario(USUARIO.gabrielGerenteCentro));
      const c = await checklist(db, LOJA.centro);
      expect(c).toMatchObject({
        completo: false,
        dados_loja: true,
        servicos_incompletos: [
          { nome: "Hidratação", faltando: ["preco"] },
          { nome: "Tosa completa", faltando: ["profissional"] },
        ],
        profissionais_sem_horario: [{ id: PROFISSIONAL.marcos, nome: "Marcos" }],
      });
    });
  });

  it("profissional inativo não conta como habilitado", async () => {
    await emTransacao(async (db) => {
      // Tosa completa na Moema: só Carla é habilitada.
      await db.query("update public.profissional set ativo = false where id = $1", [PROFISSIONAL.carla]);
      await db.como(usuario(USUARIO.diegoDonoMoema));
      const c = await checklist(db, LOJA.moema);
      expect(c?.servicos_incompletos).toEqual([
        expect.objectContaining({ nome: "Tosa completa", faltando: ["profissional"] }),
      ]);
    });
  });

  it("não revela o checklist de outra loja", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.diegoDonoMoema));
      expect(await checklist(db, LOJA.centro)).toBeNull();
      await db.como(usuario(USUARIO.gabrielGerenteCentro));
      expect(await checklist(db, LOJA.centro)).toMatchObject({ completo: true });
    });
  });
});

describe("fotos", () => {
  it("a loja só envia fotos para a própria pasta", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.gabrielGerenteCentro));
      const sql = "insert into storage.objects (bucket_id, name, owner_id) values ('fotos', $1, $2)";
      expect(await db.erro(sql, [`${LOJA.centro}/profissionais/a.jpg`, USUARIO.gabrielGerenteCentro])).toBeNull();
      expect(await db.erro(sql, [`${LOJA.moema}/profissionais/a.jpg`, USUARIO.gabrielGerenteCentro])).toBe("42501");
      await db.como(usuario(USUARIO.aliceAtendenteCentro));
      expect(await db.erro(sql, [`${LOJA.centro}/profissionais/b.jpg`, USUARIO.aliceAtendenteCentro])).toBe("42501");
    });
  });
});

describe("criar_bloqueio", () => {
  it("converte o horário local da loja e respeita o RLS", async () => {
    await emTransacao(async (db) => {
      await db.query("update public.petshop set fuso = 'America/Manaus' where id = $1", [LOJA.centro]);
      await db.como(usuario(USUARIO.aliceAtendenteCentro));
      const [{ id }] = await db.rows<{ id: string }>(
        "select public.criar_bloqueio($1, '2030-01-08 12:00', '2030-01-08 13:00', 'almoco', $2, 'Almoço') as id",
        [LOJA.centro, PROFISSIONAL.paula],
      );
      const [b] = await db.rows<{ ini: string }>(
        "select to_char(lower(periodo) at time zone 'UTC', 'HH24:MI') as ini from public.bloqueio where id = $1",
        [id],
      );
      expect(b.ini).toBe("16:00"); // Manaus = UTC-4
      expect(await db.erro("select public.criar_bloqueio($1, '2030-01-08 13:00', '2030-01-08 12:00')", [LOJA.centro])).toBe("23514");
      await db.como(usuario(USUARIO.diegoDonoMoema));
      expect(await db.erro("select public.criar_bloqueio($1, '2030-01-08 12:00', '2030-01-08 13:00')", [LOJA.centro])).not.toBeNull();
    });
  });
});
