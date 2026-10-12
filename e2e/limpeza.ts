import { config } from "dotenv";
import pg from "pg";

// Remove o que os testes E2E criam (contas @e2e.test, lojas e redes novas), para o banco local voltar ao estado
// do seed e os testes de banco (pnpm test) não dependerem da ordem em que as suítes rodam.
export default async function limparDadosE2E() {
  config({ path: [".env.local", ".env.example"], quiet: true });
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
  await db.connect();
  try {
    await db.query("begin");
    await db.query(`
      create temporary table _usuarios on commit drop as
        select id from auth.users where email like '%@e2e.test';
      create temporary table _tutores on commit drop as
        select id from public.tutor where user_id in (select id from _usuarios);
      create temporary table _lojas on commit drop as
        select id, rede_id from public.petshop where slug like 'e2e-%';
    `);
    await db.query("delete from public.pedido where tutor_id in (select id from _tutores) or petshop_id in (select id from _lojas)");
    await db.query("delete from public.tutor where id in (select id from _tutores)");
    await db.query("delete from public.petshop where id in (select id from _lojas)");
    await db.query(
      "delete from public.rede r where r.id in (select rede_id from _lojas) and not exists (select 1 from public.petshop p where p.rede_id = r.id)",
    );
    await db.query("delete from auth.users where id in (select id from _usuarios)");
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    await db.end();
  }
}
