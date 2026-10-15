import { expect, test } from "@playwright/test";
import { entrar, menu, texto } from "./util";

test("painel exige login e o gerente vê o checklist completo", async ({ page }) => {
  await page.goto("/painel");
  await expect(page).toHaveURL(/\/entrar$/);
  await entrar(page, "gabriel@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
  await expect(page.getByRole("term").filter({ hasText: "A confirmar" })).toBeVisible();
  await menu(page, "Configurar");
  await expect(page.getByRole("heading", { name: "Configuração da loja" })).toBeVisible();
  await expect(texto(page, "Tudo pronto!")).toBeVisible();
});
