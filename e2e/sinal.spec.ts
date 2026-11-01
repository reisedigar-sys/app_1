import { expect, type Page, test } from "@playwright/test";
import { config } from "dotenv";
import pg from "pg";
import { botao, campo, entrar, texto } from "./util";

// Semana 8a: sinal por Pix com o provedor de teste (ambiente local, sem a chave do Asaas).
const CENTRO = "20000000-0000-0000-0000-000000000001";
const MOEMA = "20000000-0000-0000-0000-000000000003";

async function sql(consulta: string, params: unknown[] = []) {
  config({ path: [".env.local", ".env.example"], quiet: true });
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
  await db.connect();
  try {
    await db.query(consulta, params);
  } finally {
    await db.end();
  }
}

async function criarTutorComPet(page: Page) {
  const sufixo = Date.now().toString().slice(-8);
  await page.goto("/conta/entrar?voltar=/conta/pets/novo");
  await page.getByRole("link", { name: "Criar conta" }).click();
  await expect(page.getByRole("link", { name: "Criar conta" })).toHaveAttribute("aria-current", "page");
  await campo(page, "E-mail").fill(`sinal-${sufixo}@e2e.test`);
  await campo(page, "Senha").fill("senha-segura-123");
  await botao(page, "Criar conta").click();
  await expect(page.getByRole("heading", { name: "Seus dados" })).toBeVisible();
  await campo(page, "Seu nome").fill("Teste Sinal");
  await campo(page, "Celular (WhatsApp)").fill(`118${sufixo}`);
  await botao(page, "Salvar e continuar").click();
  await expect(page.getByRole("heading", { name: "Cadastrar pet" })).toBeVisible();
  await campo(page, "Nome").fill("Nina");
  for (const radio of [page.getByRole("radio", { name: /^Pequeno / }), page.getByRole("radio", { name: "Curta", exact: true })]) {
    await page.locator("label").filter({ has: radio }).click();
    await expect(radio).toBeChecked();
  }
  await botao(page, "Cadastrar pet").click();
  await expect(page.getByRole("heading", { name: "Meus pets" })).toBeVisible();
}

test.afterAll(async () => {
  await sql("update public.petshop_pagamento set modo_sinal = 'nunca' where petshop_id = $1", [MOEMA]);
});

test("gerente abre a conta de recebimento e liga o sinal", async ({ page }) => {
  await entrar(page, "gabriel@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
  await page.goto(`/painel/${CENTRO}/pagamentos`);
  await expect(page.getByRole("heading", { name: "Abrir a conta de recebimento" })).toBeVisible();

  // CNPJ errado: o formulário aponta o campo.
  await campo(page, "CNPJ").fill("11.222.333/0001-82");
  await campo(page, "Razão social").fill("Pet Feliz Centro Ltda");
  await campo(page, "Tipo de empresa").selectOption("LIMITED");
  await campo(page, "E-mail").fill("financeiro@petfeliz.test");
  await campo(page, "Celular").fill("(11) 98888-0001");
  await campo(page, "Faturamento por mês (R$)").fill("20.000");
  await botao(page, "Abrir conta").click();
  await expect(texto(page, "Confira o CNPJ ou CPF.")).toBeVisible();

  await campo(page, "CNPJ").fill("11.222.333/0001-81");
  await botao(page, "Abrir conta").click();
  await expect(texto(page, "Conta aprovada. O sinal cai direto nela.")).toBeVisible();

  await page.locator("label").filter({ hasText: "De todos os agendamentos pelo app" }).click();
  await expect(campo(page, "Porcentagem (%)")).toHaveValue("30");
  await page.locator("label").filter({ hasText: "Valor fixo por pet" }).click();
  await campo(page, "Valor por pet (R$)").fill("25.50");
  await botao(page, "Salvar sinal").click();
  await expect(texto(page, "Sinal salvo. Vale para os próximos agendamentos pelo app.")).toBeVisible();

  // Desliga de novo (outros testes agendam no Centro).
  await page.locator("label").filter({ hasText: "Não cobrar sinal" }).click();
  await botao(page, "Salvar sinal").click();
  await expect(texto(page, "Sinal desligado.")).toBeVisible();
});

test("tutor paga o sinal por Pix e o horário fica garantido", async ({ page }) => {
  await sql("update public.petshop_pagamento set modo_sinal = 'todos', sinal_tipo = 'percentual', sinal_percentual = 30 where petshop_id = $1", [MOEMA]);
  await criarTutorComPet(page);

  await page.goto("/banho-e-cia-moema/agendar");
  await page.locator("label").filter({ hasText: /^Banho\d/ }).filter({ visible: true }).click();
  await botao(page, "Ver horários").click();
  await expect(page.getByRole("heading", { name: "Quando fica bom?" }).filter({ visible: true })).toBeVisible();
  await page.getByRole("group", { name: /Manhã|Tarde/ }).filter({ visible: true }).getByRole("button").first().click();
  await botao(page, "Revisar").click();

  const revisao = page.getByRole("dialog", { name: "Tudo certo?" });
  await expect(revisao.getByText("Sinal agora (Pix)")).toBeVisible();
  await expect(revisao.getByText("Na loja", { exact: true })).toBeVisible();
  await expect(revisao).toContainText(/o sinal volta para você; depois, fica com a loja/);
  await revisao.getByRole("button", { name: /^Confirmar e pagar sinal · R\$/ }).click();

  await expect(page.getByRole("heading", { name: "Falta o sinal" })).toBeVisible();
  await expect(page.getByRole("img", { name: "QR Code do Pix" })).toBeVisible();
  await expect(botao(page, "Copiar código Pix")).toBeVisible();
  await expect(texto(page, /Pague em até \d+:\d\d para garantir o horário/)).toBeVisible();
  await botao(page, "Simular pagamento (teste)").click();

  await expect(page.getByRole("heading", { name: "Horário de Nina garantido" })).toBeVisible();
  await expect(texto(page, /^Sinal pago:/)).toBeVisible();

  await page.goto("/conta/agendamentos");
  const cartao = page.locator("section").filter({ has: page.getByRole("heading", { name: "Próximos" }) }).locator(":scope > ul > li").first();
  await expect(cartao).toContainText("Confirmado");
  await expect(cartao).toContainText(/Sinal de R\$\s[\d,]+ pago por Pix\./);
});
