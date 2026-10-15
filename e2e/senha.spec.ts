import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { botao, campo, texto } from "./util";

config({ path: [".env.local", ".env.example"], quiet: true });

// Sem servidor de e-mail no Supabase local, o link de recuperação é gerado pela API de administração,
// no mesmo formato do modelo de e-mail (token_hash + type).
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
}

test("tutor que esqueceu a senha cria uma nova pelo link e entra com ela", async ({ page, browser }) => {
  const email = `senha-${Date.now()}@e2e.test`;
  const supabase = admin();
  const { error } = await supabase.auth.admin.createUser({ email, password: "senha-antiga-1", email_confirm: true });
  expect(error).toBeNull();

  await page.goto("/conta/entrar");
  await page.getByRole("link", { name: "Esqueci a senha" }).click();
  await expect(page.getByRole("heading", { name: "Esqueci a senha" })).toBeVisible();
  await expect(campo(page, "E-mail")).toBeVisible();

  const { data } = await supabase.auth.admin.generateLink({ type: "recovery", email });
  await page.goto(`/auth/confirmar?token_hash=${data.properties!.hashed_token}&type=recovery&next=${encodeURIComponent("/senha/nova?para=tutor")}`);
  await expect(page.getByRole("heading", { name: "Crie sua nova senha" })).toBeVisible();
  await expect(texto(page, `Conta: ${email}`)).toBeVisible();

  await campo(page, "Nova senha").fill("senha-nova-2");
  await campo(page, "Repita a nova senha").fill("outra-coisa");
  await botao(page, "Salvar nova senha").click();
  await expect(texto(page, "As duas senhas precisam ser iguais.")).toBeVisible();
  await campo(page, "Nova senha").fill("senha-nova-2");
  await campo(page, "Repita a nova senha").fill("senha-nova-2");
  await botao(page, "Salvar nova senha").click();
  await page.waitForURL(/\/conta\//);

  // Em outro navegador, entra com a senha nova.
  const outro = await browser.newPage();
  await outro.goto("/conta/entrar");
  await campo(outro, "E-mail").fill(email);
  await campo(outro, "Senha").fill("senha-nova-2");
  await botao(outro, "Entrar").click();
  await outro.waitForURL(/\/conta\//);
  await outro.close();
});

test("link de recuperação usado ou inválido pede um novo", async ({ page }) => {
  await page.goto("/entrar");
  await page.getByRole("link", { name: "Esqueci a senha" }).click();
  await expect(page).toHaveURL(/\/senha\/esqueci\?para=equipe$/);

  await page.goto(`/auth/confirmar?token_hash=invalido&type=recovery&next=${encodeURIComponent("/senha/nova?para=equipe")}`);
  await expect(texto(page, "Esse link expirou ou já foi usado. Peça um novo.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Pedir um novo link" })).toHaveAttribute("href", "/senha/esqueci?para=equipe");
});
