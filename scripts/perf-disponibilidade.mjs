// Mede as três consultas de leitura do motor contra o seed de 1.000 lojas.
// Uso: node scripts/perf-disponibilidade.mjs [amostras]   (requer supabase/perf/seed_1000_lojas.sql aplicado)
import pg from "pg";

const amostras = Number(process.argv[2] ?? 200);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
await db.connect();

// Consulta como visitante (anon), como a página pública da loja fará.
await db.query("set role anon");
await db.query(`select set_config('request.jwt.claims', '{"role":"anon"}', false)`);

const { rows: lojas } = await db.query(
  `select p.id, (select id from public.servico s where s.petshop_id = p.id and s.nome = 'Banho') as banho,
          (select id from public.servico s where s.petshop_id = p.id and s.nome = 'Hidratação') as hidratacao
     from public.petshop p where p.slug like 'loja-carga-%' order by random() limit $1`,
  [amostras],
);
if (!lojas.length) throw new Error("Seed de carga não encontrado. Rode supabase/perf/seed_1000_lojas.sql.");

const datas = await db.query(
  `select (current_date + 7 + ((9 - extract(dow from current_date + 7)::int) % 7))::date::text as dia,
          (date_trunc('month', current_date) + interval '1 month')::date::text as proximo_mes`,
);
const { dia, proximo_mes: proximoMes } = datas.rows[0];

async function medir(nome, fn) {
  const tempos = [];
  let linhas = 0;
  for (const l of lojas) {
    const itens = JSON.stringify([{ porte: "medio", pelagem: "curta", servicos: [l.banho, l.hidratacao] }]);
    const t0 = performance.now();
    const r = await fn(l, itens);
    tempos.push(performance.now() - t0);
    linhas += r.rowCount;
  }
  tempos.sort((a, b) => a - b);
  const p = (q) => tempos[Math.min(tempos.length - 1, Math.floor(q * tempos.length))].toFixed(1);
  const media = (linhas / lojas.length).toFixed(1);
  console.log(
    `${nome.padEnd(30)} p50 ${p(0.5).padStart(6)} ms   p95 ${p(0.95).padStart(6)} ms   máx ${tempos.at(-1).toFixed(1).padStart(6)} ms   resultados/loja ${media}`,
  );
}

console.log(`${lojas.length} lojas sorteadas, dia ${dia}\n`);
// Um horário livre por loja, para medir "profissionais disponíveis" num horário que tem vaga.
for (const l of lojas) {
  const itens = JSON.stringify([{ porte: "medio", pelagem: "curta", servicos: [l.banho, l.hidratacao] }]);
  const r = await db.query("select inicio from public.horarios_do_dia($1, $2::jsonb, $3::date) limit 1", [l.id, itens, dia]);
  l.livre = r.rows[0]?.inicio;
}

await medir("dias_com_vaga (mês atual)", (l, i) => db.query("select * from public.dias_com_vaga($1, $2::jsonb, $3::date)", [l.id, i, dia]));
await medir("dias_com_vaga (mês inteiro)", (l, i) =>
  db.query("select * from public.dias_com_vaga($1, $2::jsonb, $3::date)", [l.id, i, proximoMes]),
);
await medir("horarios_do_dia", (l, i) => db.query("select * from public.horarios_do_dia($1, $2::jsonb, $3::date)", [l.id, i, dia]));
await medir("profissionais_disponiveis", (l, i) =>
  db.query("select * from public.profissionais_disponiveis($1, $2::jsonb, $3)", [l.id, i, l.livre]),
);
await db.end();
