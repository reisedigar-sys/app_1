import { expect, type Page } from "@playwright/test";

// O roteador do Next mantém telas visitadas escondidas no DOM; os helpers miram só o que está visível.
export const campo = (page: Page, rotulo: string | RegExp, exact = true) =>
  page.getByLabel(rotulo, { exact }).filter({ visible: true });

export const botao = (page: Page, nome: string | RegExp) => page.getByRole("button", { name: nome }).filter({ visible: true });

export const texto = (page: Page, t: string | RegExp) => page.getByText(t).filter({ visible: true });

export async function abrir(page: Page, rotulo: string) {
  await page.getByRole("navigation", { name: "Configuração da loja" }).getByRole("link", { name: rotulo, exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Configuração da loja" }).getByRole("link", { name: rotulo, exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
}

export async function entrar(page: Page, email: string, senha = "senha123") {
  await page.goto("/entrar");
  await campo(page, "E-mail").fill(email);
  await campo(page, "Senha").fill(senha);
  await botao(page, "Entrar").click();
}
