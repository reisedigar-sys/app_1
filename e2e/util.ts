import { expect, type Page } from "@playwright/test";

// O roteador do Next mantém telas visitadas escondidas no DOM; os helpers miram só o que está visível.
export const campo = (page: Page, rotulo: string | RegExp, exact = true) =>
  page.getByLabel(rotulo, { exact }).filter({ visible: true });

export const botao = (page: Page, nome: string | RegExp) => page.getByRole("button", { name: nome }).filter({ visible: true });

export const texto = (page: Page, t: string | RegExp) => page.getByText(t).filter({ visible: true });

/** Item do menu do dia a dia (barra de baixo no celular). */
export async function menu(page: Page, rotulo: string) {
  const nav = page.getByRole("navigation", { name: "Painel da loja" });
  await nav.getByRole("link", { name: rotulo, exact: true }).click();
  await expect(nav.getByRole("link", { name: rotulo, exact: true })).toHaveAttribute("aria-current", "page");
}

/** Tela de configuração; fora de "Configurar", entra nele primeiro. */
export async function abrir(page: Page, rotulo: string) {
  if (!(await page.getByRole("navigation", { name: "Configuração da loja" }).isVisible())) await menu(page, "Configurar");
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
