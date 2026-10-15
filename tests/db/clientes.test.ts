import { describe, expect, it } from "vitest";
import { emTransacao, usuario } from "../helpers/db";
import { LOJA, TUTOR, USUARIO } from "../helpers/ids";

const alice = usuario(USUARIO.aliceAtendenteCentro);
const paula = usuario(USUARIO.paulaProfissionalCentro);
const diego = usuario(USUARIO.diegoDonoMoema);

type Cliente = { tutor_id: string; nome: string; pets: string[]; atendimentos: number; total: string };
const sql = "select * from public.clientes_da_loja($1, $2)";

describe("clientes da loja", () => {
  it("lista só os clientes da própria loja, com pets e histórico", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      const lista = await db.rows<Cliente>(sql, [LOJA.centro, null]);
      expect(lista.map((c) => c.tutor_id)).toEqual([TUTOR.ana]);
      expect(lista[0].pets).toEqual(["Mel", "Thor"]);
      expect(lista[0].atendimentos).toBe(1);
      expect(Number(lista[0].total)).toBe(1);

      // O Bruno é cliente de outras lojas, não da Centro.
      await db.como(diego);
      expect((await db.rows<Cliente>(sql, [LOJA.moema, null])).map((c) => c.tutor_id)).toContain(TUTOR.bruno);
      expect(await db.erro(sql, [LOJA.centro, null])).toBe("42501");
    });
  });

  it("busca por nome sem acento, nome do pet ou parte do telefone", async () => {
    await emTransacao(async (db) => {
      await db.como(alice);
      const nomes = async (busca: string) => (await db.rows<Cliente>(sql, [LOJA.centro, busca])).map((c) => c.nome);
      await db.comoSuperusuario();
      await db.query("update public.tutor set nome = 'Ána Souza' where id = $1", [TUTOR.ana]);
      await db.como(alice);
      expect(await nomes("ana sou")).toEqual(["Ána Souza"]);
      expect(await nomes("THOR")).toEqual(["Ána Souza"]);
      expect(await nomes("8888-0001")).toEqual(["Ána Souza"]);
      expect(await nomes("zzz")).toEqual([]);
      // Poucos dígitos não viram busca por telefone (evita "11" achar todo mundo).
      expect(await nomes("11")).toEqual([]);
    });
  });

  it("a profissional não vê a carteira de clientes", async () => {
    await emTransacao(async (db) => {
      await db.como(paula);
      expect(await db.erro(sql, [LOJA.centro, null])).toBe("42501");
    });
  });
});
