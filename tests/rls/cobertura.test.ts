import { beforeAll, describe, expect, it } from "vitest";
import { ANON, type Db, emTransacao, usuario } from "../helpers/db";
import { LOJA, TUTOR, USUARIO } from "../helpers/ids";

// Como saber se a linha pertence ao tutor $2 (tabelas sem coluna tutor_id).
const DONO_PADRAO = "to_jsonb(r) ->> 'tutor_id' is not distinct from $2::text";
const DONO_DA_LINHA: Record<string, string> = {
  agendamento_item: "exists (select 1 from public.agendamento a where a.id = r.agendamento_id and a.tutor_id = $2)",
};

// Catálogo público: qualquer visitante lê os dados das lojas ativas.
// Para essas tabelas a regra é "a equipe de outra loja não vê nada além do que um visitante vê".
const TABELAS_PUBLICAS = new Set([
  "categoria_servico",
  "servico",
  "servico_preco",
  "profissional",
  "profissional_servico",
  "avaliacao",
]);

let tabelas: string[] = [];

/** Linhas alteradas; recusa por falta de permissão (42501) conta como nenhuma linha alcançada. */
async function linhasAfetadas(db: Db, sql: string, params: unknown[] = []) {
  const { codigo, linhas } = await db.tentar(sql, params);
  if (codigo && codigo !== "42501") throw new Error(`erro inesperado ${codigo} em: ${sql}`);
  return linhas;
}
beforeAll(async () => {
  await emTransacao(async (db) => {
    tabelas = (
      await db.rows<{ table_name: string }>(
        `select c.table_name from information_schema.columns c
           join information_schema.tables t using (table_schema, table_name)
          where c.table_schema = 'public' and c.column_name = 'petshop_id' and t.table_type = 'BASE TABLE'
          order by 1`,
      )
    ).map((r) => r.table_name);
  });
});

describe("cobertura de RLS", () => {
  it("encontra as tabelas de negócio", () => {
    expect(tabelas.length).toBeGreaterThanOrEqual(20);
  });

  it("toda tabela do schema public tem RLS habilitado", async () => {
    await emTransacao(async (db) => {
      const semRls = await db.rows(
        `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
      );
      expect(semRls).toEqual([]);
    });
  });

  it("o seed tem dados da loja Moema em todas as tabelas (testes não ficam vazios)", async () => {
    await emTransacao(async (db) => {
      for (const t of tabelas) {
        const n = await db.count(`select 1 from public.${t} where petshop_id = $1`, [LOJA.moema]);
        expect(n, `seed sem linhas da loja Moema em ${t}`).toBeGreaterThan(0);
      }
    });
  });
});

describe.each([
  ["gerente da loja Centro", USUARIO.gabrielGerenteCentro],
  ["atendente da loja Centro", USUARIO.aliceAtendenteCentro],
  ["profissional da loja Centro", USUARIO.paulaProfissionalCentro],
  ["dona da rede Pet Feliz", USUARIO.renataDonaRede],
  ["tutora Ana", USUARIO.anaTutora],
])("%s não acessa dados privados da loja Moema (outra rede)", (_nome, userId) => {
  it("leitura: nada além do catálogo público", async () => {
    await emTransacao(async (db) => {
      for (const t of tabelas) {
        const sql = `select * from public.${t} where petshop_id = $1`;
        if (TABELAS_PUBLICAS.has(t)) {
          await db.como(ANON);
          const publico = await db.count(sql, [LOJA.moema]);
          await db.como(usuario(userId));
          expect(await db.count(sql, [LOJA.moema]), t).toBeLessThanOrEqual(publico);
        } else if (userId === USUARIO.anaTutora) {
          // A tutora é cliente da Moema: só pode ver o que é dela.
          await db.como(usuario(userId));
          const alheias = await db.count(
            `select 1 from public.${t} r where petshop_id = $1 and not (${DONO_DA_LINHA[t] ?? DONO_PADRAO})`,
            [LOJA.moema, TUTOR.ana],
          );
          expect(alheias, t).toBe(0);
        } else {
          await db.como(usuario(userId));
          expect(await db.count(sql, [LOJA.moema]), t).toBe(0);
        }
        await db.comoSuperusuario();
      }
    });
  });

  it("escrita: update e delete não alcançam nenhuma linha", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(userId));
      for (const t of tabelas) {
        expect(await linhasAfetadas(db, `update public.${t} set petshop_id = petshop_id where petshop_id = $1`, [LOJA.moema]), `update em ${t}`).toBe(0);
        expect(await linhasAfetadas(db, `delete from public.${t} where petshop_id = $1`, [LOJA.moema]), `delete em ${t}`).toBe(0);
      }
    });
  });
});

describe("visitante anônimo", () => {
  it("só lê as tabelas do catálogo público", async () => {
    await emTransacao(async (db) => {
      await db.como(ANON);
      for (const t of tabelas) {
        const n = await db.count(`select 1 from public.${t}`);
        if (TABELAS_PUBLICAS.has(t)) expect(n, t).toBeGreaterThan(0);
        else expect(n, t).toBe(0);
      }
    });
  });

  it("não escreve em nenhuma tabela", async () => {
    await emTransacao(async (db) => {
      await db.como(ANON);
      for (const t of tabelas) {
        expect(await linhasAfetadas(db, `update public.${t} set petshop_id = petshop_id`), t).toBe(0);
        expect(await linhasAfetadas(db, `delete from public.${t}`), t).toBe(0);
      }
    });
  });
});
