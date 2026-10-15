import { expect, test } from "@playwright/test";
import { botao, campo, entrar, menu, texto } from "./util";

const CENTRO = "20000000-0000-0000-0000-000000000001";

test("recepção acha o cliente pelo pet e agenda de novo com os serviços da última vez", async ({ page }) => {
  await entrar(page, "alice@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
  await menu(page, "Clientes");
  const lista = page.getByRole("list", { name: "Clientes da loja" }).filter({ visible: true });
  await expect(lista.getByRole("link", { name: /Ana Souza/ })).toContainText("Mel, Thor");

  // Busca sem acento e pelo nome do pet.
  await page.getByRole("searchbox", { name: "Buscar cliente" }).filter({ visible: true }).fill("thor");
  await botao(page, "Buscar").click();
  await expect(page).toHaveURL(/clientes\?q=thor/);
  await expect(texto(page, "1 cliente(s) encontrado(s)")).toBeVisible();
  await lista.getByRole("link", { name: /Ana Souza/ }).click();

  // Ficha: pets, autorização de contato e histórico.
  await expect(page.getByRole("heading", { name: "Ana Souza" })).toBeVisible();
  await expect(page.getByRole("link", { name: "WhatsApp" }).filter({ visible: true })).toHaveAttribute("href", /^https:\/\/wa\.me\/5511988880001/);
  await expect(page.getByRole("region", { name: "Próximos atendimentos" }).filter({ visible: true })).toContainText("Thor");
  await expect(page.getByRole("region", { name: "Histórico" }).filter({ visible: true })).toContainText("Mel");

  // "Agendar de novo" o Thor: cliente, pet e serviço já escolhidos.
  await page.getByRole("listitem").filter({ hasText: "Thor" }).filter({ visible: true }).getByRole("link", { name: "Agendar de novo" }).click();
  await expect(page.getByRole("heading", { name: "Novo atendimento" })).toBeVisible();
  await expect(texto(page, "Ana Souza")).toBeVisible();
  await expect(campo(page, /^Thor · Grande/, false)).toBeChecked();
  await expect(campo(page, /^Mel · /, false)).not.toBeChecked();
  await expect(campo(page, "Serviço principal de Thor").locator("option:checked")).toHaveText(/^Banho/);
});

test("a profissional não vê os clientes da loja", async ({ page }) => {
  await entrar(page, "paula@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Painel da loja" }).getByRole("link", { name: "Clientes" })).toHaveCount(0);
  await page.goto(`/painel/${CENTRO}/clientes`);
  await expect(texto(page, "A lista de clientes fica com a recepção da loja.")).toBeVisible();
});
