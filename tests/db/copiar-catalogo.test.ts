import { describe, expect, it } from "vitest";
import { type Db, emTransacao, usuario } from "../helpers/db";
import { LOJA, REDE, USUARIO } from "../helpers/ids";

// Nova unidade vazia na rede Pet Feliz (a dona da rede administra todas as unidades).
async function novaUnidade(db: Db) {
  const [{ id }] = await db.rows<{ id: string }>(
    "insert into public.petshop (rede_id, nome, slug) values ($1, 'Pet Feliz Norte', 'pet-feliz-norte') returning id",
    [REDE.petFeliz],
  );
  return id;
}

async function copiar(db: Db, origem: string, destino: string, substituir = false) {
  const [{ r }] = await db.rows<{ r: Record<string, number> }>("select public.copiar_catalogo($1, $2, $3) as r", [
    origem,
    destino,
    substituir,
  ]);
  return r;
}

describe("copiar_catalogo", () => {
  it("copia categorias, serviços e preços para uma unidade vazia da mesma rede", async () => {
    await emTransacao(async (db) => {
      const norte = await novaUnidade(db);
      await db.como(usuario(USUARIO.renataDonaRede));
      expect(await copiar(db, LOJA.centro, norte)).toEqual({
        categorias: 3,
        servicos_novos: 6,
        servicos_atualizados: 0,
        precos: 90,
      });
      // Os tempos copiados são da unidade de origem e ficam independentes depois.
      const [d] = await db.rows<{ duracao_minutos: number }>(
        `select sp.duracao_minutos from public.servico_preco sp join public.servico s on s.id = sp.servico_id
          where s.petshop_id = $1 and s.nome = 'Tosa completa' and sp.porte = 'pequeno' and sp.pelagem = 'curta'`,
        [norte],
      );
      expect(d.duracao_minutos).toBe(90);
      // Serviço copiado aponta para a categoria da própria unidade.
      expect(
        await db.count(
          `select 1 from public.servico s join public.categoria_servico c on c.id = s.categoria_id
            where s.petshop_id = $1 and c.petshop_id <> s.petshop_id`,
          [norte],
        ),
      ).toBe(0);
    });
  });

  it("sem substituir, preserva os ajustes da unidade de destino; com substituir, iguala à origem", async () => {
    await emTransacao(async (db) => {
      await db.query(
        `update public.servico_preco sp set duracao_minutos = 30 from public.servico s
          where s.id = sp.servico_id and s.petshop_id = $1 and s.nome = 'Banho'`,
        [LOJA.zonaSul],
      );
      await db.query("insert into public.servico (petshop_id, nome, tipo) values ($1, 'Banho a seco', 'principal')", [LOJA.centro]);
      await db.como(usuario(USUARIO.renataDonaRede));

      expect(await copiar(db, LOJA.centro, LOJA.zonaSul)).toMatchObject({ servicos_novos: 1, precos: 0 });
      const duracao = async () =>
        (
          await db.rows<{ d: number }>(
            `select max(sp.duracao_minutos) as d from public.servico_preco sp join public.servico s on s.id = sp.servico_id
              where s.petshop_id = $1 and s.nome = 'Banho'`,
            [LOJA.zonaSul],
          )
        )[0].d;
      expect(await duracao()).toBe(30);

      expect(await copiar(db, LOJA.centro, LOJA.zonaSul, true)).toMatchObject({ servicos_novos: 0, servicos_atualizados: 7, precos: 90 });
      expect(await duracao()).toBeGreaterThan(30);
    });
  });

  it("só quem configura as duas unidades da mesma rede pode copiar", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.gabrielGerenteCentro)); // gerente só da Centro
      expect(await db.erro("select public.copiar_catalogo($1, $2)", [LOJA.centro, LOJA.zonaSul])).toBe("42501");
      await db.como(usuario(USUARIO.diegoDonoMoema)); // outra rede
      expect(await db.erro("select public.copiar_catalogo($1, $2)", [LOJA.centro, LOJA.moema])).toBe("42501");
      await db.como(usuario(USUARIO.renataDonaRede));
      expect(await db.erro("select public.copiar_catalogo($1, $2)", [LOJA.centro, LOJA.centro])).toBe("22023");
      expect(await db.erro("select public.copiar_catalogo($1, $2)", [LOJA.centro, LOJA.moema])).toBe("42501");
    });
  });
});

describe("criar_unidade", () => {
  it("o dono da rede abre uma unidade nova e já a enxerga", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.renataDonaRede));
      const [{ id }] = await db.rows<{ id: string }>("select public.criar_unidade($1, 'Pet Feliz Leste', 'pet-feliz-leste') as id", [
        REDE.petFeliz,
      ]);
      expect(await db.rows("select nome from public.petshop where id = $1", [id])).toEqual([{ nome: "Pet Feliz Leste" }]);
    });
  });

  it("gerente de unidade e dono de outra rede não abrem unidades", async () => {
    await emTransacao(async (db) => {
      await db.como(usuario(USUARIO.gabrielGerenteCentro));
      expect(await db.erro("select public.criar_unidade($1, 'X', 'x-1')", [REDE.petFeliz])).toBe("42501");
      await db.como(usuario(USUARIO.diegoDonoMoema));
      expect(await db.erro("select public.criar_unidade($1, 'X', 'x-2')", [REDE.petFeliz])).toBe("42501");
    });
  });
});
