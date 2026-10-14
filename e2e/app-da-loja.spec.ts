import { expect, test } from "@playwright/test";
import { botao, campo } from "./util";

test("o app instalado pela página da loja tem o nome e o ícone dela", async ({ page, request }) => {
  await page.goto("/pet-feliz-centro");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "Pet Feliz Centro");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/pet-feliz-centro/manifest.webmanifest");

  const manifesto = await (await request.get(href!)).json();
  expect(manifesto).toMatchObject({ id: "/pet-feliz-centro", name: "Pet Feliz Centro", start_url: "/pet-feliz-centro" });
  const icone = await request.get(manifesto.icons[0].src);
  expect(icone.headers()["content-type"]).toBe("image/png");
});

test("tutor vê as lojas em que é cliente e liga ou desliga os avisos pelo WhatsApp de cada uma", async ({ page }) => {
  await page.goto("/conta/entrar?voltar=/conta/lojas");
  await campo(page, "E-mail").fill("ana@tutor.test");
  await campo(page, "Senha").fill("senha123");
  await botao(page, "Entrar").click();
  await expect(page.getByRole("heading", { name: "Minhas lojas" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Avisos no celular" }).filter({ visible: true })).toBeVisible();

  const centro = page.getByRole("listitem").filter({ hasText: "Pet Feliz Centro" }).filter({ visible: true });
  await expect(page.getByRole("listitem").filter({ hasText: "Banho & Cia Moema" }).filter({ visible: true })).toBeVisible();
  await expect(centro).toContainText("Recebe avisos pelo WhatsApp");
  await centro.getByRole("button", { name: "Parar avisos" }).click();
  await expect(centro).toContainText("Sem avisos pelo WhatsApp");
  await centro.getByRole("button", { name: "Receber avisos" }).click();
  await expect(centro).toContainText("Recebe avisos pelo WhatsApp");
});
