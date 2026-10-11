import { expect, test } from "@playwright/test";
import { botao, campo, entrar, texto } from "./util";

const CENTRO = "20000000-0000-0000-0000-000000000001";

test("senha errada mostra erro e não entra", async ({ page }) => {
  await entrar(page, "gabriel@petfeliz.test", "errada123");
  await expect(texto(page, "E-mail ou senha incorretos.")).toBeVisible();
});

test("atendente vê a configuração sem poder alterar", async ({ page }) => {
  await entrar(page, "alice@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Configuração da loja" })).toBeVisible();
  await page.goto(`/painel/${CENTRO}/precos`);
  await expect(texto(page, "Só o dono ou o gerente altera os preços.")).toBeVisible();
  await expect(botao(page, "Salvar preços")).toHaveCount(0);
  await expect(campo(page, "Preço Pequeno, pelagem curta")).toBeDisabled();
});

test("equipe de outra loja não abre o painel dela", async ({ page }) => {
  await entrar(page, "diego@banhoecia.test");
  await expect(page.getByRole("heading", { name: "Configuração da loja" })).toBeVisible();
  await page.goto(`/painel/${CENTRO}/loja`);
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  await expect(page.getByLabel("Nome da loja")).toHaveCount(0);
});

test("bloqueio de almoço aparece na lista no horário da loja", async ({ page }) => {
  await entrar(page, "gabriel@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Configuração da loja" })).toBeVisible();
  await page.goto(`/painel/${CENTRO}/bloqueios`);
  await campo(page, "Quem").selectOption({ label: "Paula" });
  await campo(page, "Tipo").selectOption("almoco");
  await campo(page, "De").fill("2030-01-08");
  await campo(page, "Até").fill("2030-01-08");
  await campo(page, "Às").first().fill("12:00");
  await campo(page, "Às").nth(1).fill("13:00");
  await campo(page, "Motivo (opcional)").fill("e2e");
  await botao(page, "Criar bloqueio").click();
  const item = page.getByRole("listitem").filter({ hasText: "ter 08/01, 12:00–13:00 · e2e" }).filter({ visible: true });
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "Remover" }).click();
  await expect(item).toHaveCount(0);
});

test("gerente vê a equipe, mas só o dono adiciona pessoas", async ({ page }) => {
  await entrar(page, "gabriel@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Configuração da loja" })).toBeVisible();
  await page.goto(`/painel/${CENTRO}/equipe`);
  await expect(texto(page, "alice@petfeliz.test")).toBeVisible();
  await expect(texto(page, "Só o dono adiciona ou remove pessoas da equipe.")).toBeVisible();
});
