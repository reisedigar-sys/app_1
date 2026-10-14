import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import pg from "pg";
import { proximo } from "../tests/helpers/datas";
import { botao, entrar, texto } from "./util";

const CENTRO = "20000000-0000-0000-0000-000000000001";
const DIA = proximo(4, 16); // quinta com a agenda livre (outros testes usam terça e quarta)
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** Cliente de balcão "E2E …" (apagado por e2e/limpeza.ts) com um pedido criado pelo sistema; devolve o token do link. */
async function pedidoDeBalcao() {
  config({ path: [".env.local", ".env.example"], quiet: true });
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
  await db.connect();
  try {
    await db.query("begin");
    const tel = `+55119${Date.now().toString().slice(-8)}`;
    const {
      rows: [{ id: tutor }],
    } = await db.query("insert into public.tutor (nome, telefone_e164) values ('E2E Link', $1) returning id", [tel]);
    await db.query("insert into public.tutor_petshop (petshop_id, tutor_id, consentimento_contato_em) values ($1, $2, now())", [CENTRO, tutor]);
    const {
      rows: [{ id: pet }],
    } = await db.query("insert into public.pet (tutor_id, nome, porte, pelagem) values ($1, 'Bidu', 'pequeno', 'curta') returning id", [tutor]);
    const {
      rows: [{ id: banho }],
    } = await db.query("select id from public.servico where petshop_id = $1 and nome = 'Banho'", [CENTRO]);
    await db.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    const {
      rows: [{ r }],
    } = await db.query("select public.criar_pedido($1, $2, $3::jsonb, $4::timestamptz, 'balcao', $5) as r", [
      CENTRO,
      tutor,
      JSON.stringify([{ pet_id: pet, servicos: [banho] }]),
      `${DIA} 10:00-03`,
      crypto.randomUUID(),
    ]);
    await db.query("commit");
    return { token: r.token_confirmacao as string, agendamento: r.agendamentos[0].id as string };
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    await db.end();
  }
}

test("pelo link, o tutor confirma, remarca e cancela sem login; a loja vê as mensagens", async ({ page }) => {
  const { token, agendamento } = await pedidoDeBalcao();

  await page.goto(`/c/${token}`);
  await expect(page.getByRole("heading", { name: "Seu agendamento na Pet Feliz Centro" })).toBeVisible();
  await expect(texto(page, "Aguardando sua confirmação")).toBeVisible();
  await botao(page, "Confirmar presença").click();
  await expect(texto(page, "Presença confirmada. Até lá!")).toBeVisible();
  await expect(texto(page, "Confirmado")).toBeVisible();

  // Remarcar para as 15:00 do mesmo dia.
  await page.getByRole("link", { name: "Remarcar" }).click();
  await expect(page.getByRole("heading", { name: "Remarcar" })).toBeVisible();
  const [ano, m, d] = DIA.split("-").map(Number);
  for (let i = 0; i < 2 && !(await page.getByText(`${MESES[m - 1]} de ${ano}`, { exact: true }).isVisible()); i++) {
    await page.getByRole("button", { name: "Próximo mês" }).click();
  }
  const alvo = page.getByRole("button", { name: `${d} de ${MESES[m - 1]}`, exact: true });
  await expect(alvo).toBeEnabled();
  await alvo.click();
  await page.getByRole("button", { name: "15:00" }).filter({ visible: true }).click();
  await botao(page, /Remarcar para .* às 15:00/).click();
  await expect(texto(page, "Agendamento remarcado.")).toBeVisible();
  await expect(texto(page, /15:00/)).toBeVisible();

  // A loja vê as mensagens do pedido na ficha do atendimento.
  await entrar(page, "gabriel@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Configuração da loja" })).toBeVisible();
  await page.goto(`/painel/${CENTRO}/agenda/${agendamento}`);
  await expect(page.getByRole("heading", { name: "Mensagens ao cliente" })).toBeVisible();
  await expect(texto(page, "Confirmação do agendamento").first()).toBeVisible();
  await expect(texto(page, "Lembrete da véspera")).toBeVisible();

  // Cancelar pelo link.
  await page.goto(`/c/${token}`);
  await page.getByText("Cancelar", { exact: true }).filter({ visible: true }).click();
  await botao(page, "Confirmar cancelamento").click();
  await expect(texto(page, "Agendamento cancelado.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Remarcar" })).toHaveCount(0);
});

test("link inválido mostra página não encontrada", async ({ page }) => {
  await page.goto("/c/00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
});
