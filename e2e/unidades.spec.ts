import { expect, test } from "@playwright/test";
import { abrir, botao, campo, entrar, texto } from "./util";

test("dona da rede abre uma unidade nova e copia o catálogo da outra", async ({ page }) => {
  const sufixo = Date.now().toString(36);
  await entrar(page, "renata@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Minhas lojas" })).toBeVisible();
  await page.getByRole("link", { name: "Nova loja" }).click();

  // A rede existente já vem selecionada: é uma nova unidade da Pet Feliz.
  await expect(campo(page, "Rede")).toHaveValue("10000000-0000-0000-0000-000000000001");
  await campo(page, "Nome da loja").fill(`E2E Pet Feliz Norte ${sufixo}`);
  await botao(page, "Criar loja").click();
  await expect(page.getByRole("heading", { name: "Configuração da loja" })).toBeVisible();

  await abrir(page, "Serviços");
  await expect(texto(page, "Nenhum serviço ainda.")).toBeVisible();
  await campo(page, "Copiar de").selectOption({ label: "Pet Feliz Centro" });
  await botao(page, "Copiar catálogo").click();
  await expect(texto(page, /Catálogo copiado: 6 serviço\(s\) novo\(s\), 0 atualizado\(s\), 90 preço\(s\)/)).toBeVisible();
  await expect(page.locator("summary").filter({ hasText: "Tosa completa" }).filter({ visible: true })).toBeVisible();

  // Os tempos copiados podem ser ajustados só nesta unidade.
  await abrir(page, "Preços");
  await page.getByRole("navigation", { name: "Serviço" }).getByRole("link", { name: "Tosa completa" }).click();
  await expect(campo(page, "Duração em minutos Pequeno, pelagem curta")).toHaveValue("90");
});

test("gerente de uma unidade só não vê a opção de copiar", async ({ page }) => {
  await entrar(page, "gabriel@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
  await abrir(page, "Serviços");
  await expect(page.getByRole("heading", { name: "Novo serviço" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Copiar de outra unidade" })).toHaveCount(0);
});
