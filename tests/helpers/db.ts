import { Pool, type PoolClient, type QueryResultRow } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 4,
});

export type Papel = { anon: true } | { usuario: string };
export const ANON: Papel = { anon: true };
export const usuario = (id: string): Papel => ({ usuario: id });

export class Db {
  private savepoint = 0;
  constructor(private readonly client: PoolClient) {}

  async query<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
    return this.client.query<T>(sql, params);
  }

  async rows<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
    return (await this.query<T>(sql, params)).rows;
  }

  async count(sql: string, params: unknown[] = []): Promise<number> {
    const r = await this.query<{ n: string }>(`select count(*) as n from (${sql}) s`, params);
    return Number(r.rows[0].n);
  }

  /** Passa a agir como o papel informado, do jeito que o PostgREST faz com o JWT. */
  async como(papel: Papel) {
    const claims = "anon" in papel
      ? { role: "anon" }
      : { sub: papel.usuario, role: "authenticated" };
    await this.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await this.query(`set local role ${"anon" in papel ? "anon" : "authenticated"}`);
  }

  /** Volta ao superusuário (ignora RLS), para preparar ou conferir dados. */
  async comoSuperusuario() {
    await this.query("reset role");
    await this.query("select set_config('request.jwt.claims', '', true)");
  }

  /** Executa e devolve o código SQLSTATE do erro (ou null), sem abortar a transação. */
  async erro(sql: string, params: unknown[] = []): Promise<string | null> {
    const nome = `sp_${++this.savepoint}`;
    await this.query(`savepoint ${nome}`);
    try {
      await this.query(sql, params);
      await this.query(`release savepoint ${nome}`);
      return null;
    } catch (e) {
      await this.query(`rollback to savepoint ${nome}`);
      return (e as { code?: string }).code ?? "erro";
    }
  }
}

/** Roda o teste numa transação que sempre é desfeita: o banco volta ao estado do seed. */
export async function emTransacao(fn: (db: Db) => Promise<void>) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await fn(new Db(client));
  } finally {
    await client.query("rollback");
    client.release();
  }
}

export async function fecharPool() {
  await pool.end();
}
