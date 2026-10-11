import { Pool, type PoolClient, type QueryResultRow } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  max: 6,
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

  /** Executa sem abortar a transação: devolve o código SQLSTATE do erro (ou null) e as linhas afetadas. */
  async tentar(sql: string, params: unknown[] = []): Promise<{ codigo: string | null; linhas: number }> {
    const nome = `sp_${++this.savepoint}`;
    await this.query(`savepoint ${nome}`);
    try {
      const r = await this.query(sql, params);
      await this.query(`release savepoint ${nome}`);
      return { codigo: null, linhas: r.rowCount ?? 0 };
    } catch (e) {
      await this.query(`rollback to savepoint ${nome}`);
      return { codigo: (e as { code?: string }).code ?? "erro", linhas: 0 };
    }
  }

  /** Executa e devolve o código SQLSTATE do erro (ou null), sem abortar a transação. */
  async erro(sql: string, params: unknown[] = []): Promise<string | null> {
    return (await this.tentar(sql, params)).codigo;
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

/** Conexão própria, sem transação automática (para testes de concorrência, que precisam de commit). */
export async function comConexao<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(new Db(client));
  } finally {
    client.release();
  }
}

export async function fecharPool() {
  await pool.end();
}
