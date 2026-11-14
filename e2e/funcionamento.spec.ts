import { expect, test } from "@playwright/test";
import { abrir, botao, entrar, texto } from "./util";

const CENTRO = "20000000-0000-0000-0000-000000000001";

test("gerente cadastra o horário de funcionamento e o cliente vê na página da loja", async ({ page }) => {
  await entrar(page, "gabriel@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
  await abrir(page, "Funcionamento");
  await expect(page.getByRole("heading", { name: "Horário de funcionamento" })).toBeVisible();

  // Só domingo, das 07:00 às 08:00 (o seed abre de terça a sábado).
  const dias = page.getByRole("group", { name: "Dias" }).filter({ visible: true });
  for (const d of ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"]) await dias.locator("label").filter({ hasText: d }).click();
  await dias.locator("label").filter({ hasText: "Domingo" }).click();
  await page.getByLabel("Abre", { exact: true }).filter({ visible: true }).fill("07:00");
  await page.getByLabel("Fecha", { exact: true }).filter({ visible: true }).fill("08:00");
  await botao(page, "Adicionar horário").click();
  await expect(texto(page, "Horário adicionado.")).toBeVisible();
  const semana = page.getByRole("list", { name: "Horário de funcionamento" }).filter({ visible: true });
  await expect(semana.getByRole("listitem").filter({ hasText: "Domingo" })).toContainText("07:00–08:00");

  // Página pública: selo (aberto ou fechado, depende da hora em que o teste roda) e a semana.
  await page.goto("/pet-feliz-centro");
  await expect(page.locator("[data-selo-funcionamento]").filter({ visible: true })).toContainText(/Aberto agora|Fechado/);
  const publica = page.getByRole("region", { name: "Horário de funcionamento" });
  await expect(publica.getByRole("listitem").filter({ hasText: "Domingo" })).toContainText("07:00–08:00");
  await expect(publica.getByRole("listitem").filter({ hasText: "Segunda" })).toContainText("Fechado");

  // Volta ao horário do seed.
  await page.goto(`/painel/${CENTRO}/funcionamento`);
  await botao(page, "Remover Domingo 07:00 a 08:00").click();
  await expect(botao(page, "Remover Domingo 07:00 a 08:00")).toHaveCount(0);
});

test("atendente vê o horário de funcionamento sem poder alterar", async ({ page }) => {
  await entrar(page, "alice@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
  await page.goto(`/painel/${CENTRO}/funcionamento`);
  await expect(texto(page, "Só o dono ou o gerente altera o horário de funcionamento.")).toBeVisible();
  await expect(botao(page, "Adicionar horário")).toHaveCount(0);
  await expect(botao(page, "Usar o horário da equipe")).toHaveCount(0);
});
