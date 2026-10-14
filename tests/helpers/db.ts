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
      if (eDeadlock(e)) throw e; // não é o resultado do teste: emTransacao refaz a transação
      return { codigo: (e as { code?: string }).code ?? "erro", linhas: 0 };
    }
  }

  /** Executa e devolve o código SQLSTATE do erro (ou null), sem abortar a transação. */
  async erro(sql: string, params: unknown[] = []): Promise<string | null> {
    return (await this.tentar(sql, params)).codigo;
  }
}

const eDeadlock = (e: unknown) => (e as { code?: string }).code === "40P01";

/**
 * Roda o teste numa transação que sempre é desfeita: o banco volta ao estado do seed.
 * Testes em paralelo mexem nas mesmas linhas do seed (a loja Centro, o agendamento do Thor) em ordens diferentes;
 * quando o Postgres acusa deadlock e derruba uma delas, a transação é refeita do zero, como uma aplicação faria.
 */
export async function emTransacao(fn: (db: Db) => Promise<void>) {
  for (let tentativa = 1; ; tentativa++) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await fn(new Db(client));
      return;
    } catch (e) {
      if (!eDeadlock(e) || tentativa >= 3) throw e;
    } finally {
      await client.query("rollback");
      client.release();
    }
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

/**
 * Apaga pedidos gravados de verdade por um teste (com commit). As notificações vão primeiro: um teste da fila
 * (worker_reservar/worker_concluir numa transação aberta) pode estar segurando uma delas, e apagar o pedido antes
 * travaria agendamento e notificação em ordem inversa à do worker (deadlock). Se mesmo assim houver deadlock, tenta de novo.
 */
export async function apagarPedidos(chaves: string[]) {
  for (let tentativa = 1; ; tentativa++) {
    try {
      await comConexao(async (db) => {
        await db.query("begin");
        try {
          await db.query(
            `delete from public.notificacao_agendada n
              using public.pedido p
              where p.chave_idempotencia = any($1)
                and (n.pedido_id = p.id or n.agendamento_id in (select a.id from public.agendamento a where a.pedido_id = p.id))`,
            [chaves],
          );
          await db.query("delete from public.pedido where chave_idempotencia = any($1)", [chaves]);
          await db.query("commit");
        } catch (e) {
          await db.query("rollback");
          throw e;
        }
      });
      return;
    } catch (e) {
      if (!eDeadlock(e) || tentativa >= 3) throw e;
    }
  }
}

export async function fecharPool() {
  await pool.end();
}
