import { expect, test } from "@playwright/test";
import { botao, campo, entrar, texto } from "./util";

const CENTRO = "20000000-0000-0000-0000-000000000001";
const REFERENCIA = "Antes do Hora do Pet, quantos clientes faltavam a cada 100 agendamentos?";

test("gerente vê os resultados do mês e ajusta a referência de faltas", async ({ page }) => {
  await entrar(page, "gabriel@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Resultados do mês ›" }).click();
  await expect(page.getByRole("heading", { name: /^Resultados de / })).toBeVisible();
  await expect(texto(page, "Faltas evitadas (estimativa)")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ocupação dos profissionais" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Paula" }).filter({ visible: true }).first()).toContainText(/\d+%/);

  // Mês anterior: o seed tem um atendimento concluído há 14 dias (em outubro ou setembro, conforme a data).
  await page.getByRole("link", { name: "Mês anterior" }).click();
  await expect(page.getByRole("link", { name: "Este mês" })).toBeVisible();

  await campo(page, REFERENCIA).fill("abc");
  await botao(page, "Salvar referência").click();
  await expect(texto(page, "Informe um número de 0 a 100.").first()).toBeVisible();
  await campo(page, REFERENCIA).fill("15");
  await botao(page, "Salvar referência").click();
  await expect(texto(page, "Referência salva.")).toBeVisible();
});

test("atendente não vê os resultados", async ({ page }) => {
  await entrar(page, "alice@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Resultados do mês ›" })).toHaveCount(0);
  await page.goto(`/painel/${CENTRO}/resultados`);
  await expect(texto(page, "Os resultados da loja ficam com o dono e a gerência.")).toBeVisible();
});
