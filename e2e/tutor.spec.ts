import { expect, type Page, test } from "@playwright/test";
import { proximo } from "../tests/helpers/datas";
import { botao, campo, texto } from "./util";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const TER = proximo(2, 14); // terça com a agenda da loja livre

async function cadastrarPet(page: Page, nome: string, porte: string, pelagem: string) {
  await page.goto("/conta/pets/novo");
  await campo(page, "Nome").fill(nome);
  for (const radio of [page.getByRole("radio", { name: new RegExp(`^${porte} `) }), page.getByRole("radio", { name: pelagem, exact: true })]) {
    await page.locator("label").filter({ has: radio }).click();
    await expect(radio).toBeChecked();
  }
  await botao(page, "Cadastrar pet").click();
  await expect(page.getByRole("heading", { name: "Meus pets" })).toBeVisible();
}

async function escolherDia(page: Page, dia: string) {
  const [ano, m, d] = dia.split("-").map(Number);
  const mesAlvo = `${MESES[m - 1]} de ${ano}`;
  for (let i = 0; i < 2 && !(await page.getByText(mesAlvo, { exact: true }).isVisible()); i++) {
    await page.getByRole("button", { name: "Próximo mês" }).click();
  }
  await expect(page.getByText(mesAlvo, { exact: true })).toBeVisible();
  // Enquanto as vagas carregam, os dias aparecem como "sem horários"; espera o dia ficar livre.
  const alvo = page.getByRole("button", { name: `${d} de ${MESES[m - 1]}`, exact: true });
  await expect(alvo).toBeEnabled();
  await alvo.click();
}

test("tutor novo agenda 2 pets pelo fluxo e vê os agendamentos gravados", async ({ page }) => {
  const sufixo = Date.now().toString().slice(-8);

  // Página pública da loja → login → volta para o agendamento
  await page.goto("/pet-feliz-centro");
  await expect(page.getByRole("heading", { name: "Pet Feliz Centro" })).toBeVisible();
  await page.getByRole("link", { name: "Agendar agora" }).click();
  await expect(page).toHaveURL(/\/conta\/entrar\?voltar=/);
  await page.getByRole("link", { name: "Criar conta" }).click();
  await expect(page.getByRole("link", { name: "Criar conta" })).toHaveAttribute("aria-current", "page");
  await campo(page, "E-mail").fill(`tutor-${sufixo}@e2e.test`);
  await campo(page, "Senha").fill("senha-segura-123");
  await botao(page, "Criar conta").click();

  // Perfil (nome e celular) e volta para o fluxo
  await expect(page.getByRole("heading", { name: "Seus dados" })).toBeVisible();
  await campo(page, "Seu nome").fill("Teste Tutor");
  await campo(page, "Celular (WhatsApp)").fill(`119${sufixo}`);
  await botao(page, "Salvar e continuar").click();
  await expect(texto(page, "Quais pets vão hoje?")).toBeVisible();
  await expect(texto(page, "Você ainda não cadastrou nenhum pet.")).toBeVisible();

  await cadastrarPet(page, "Rex", "Grande", "Longa");
  await cadastrarPet(page, "Pipoca", "Pequeno", "Curta");

  // Etapa 1: os dois pets
  await page.goto("/pet-feliz-centro/agendar");
  const avancar = botao(page, "Avançar ›");
  await expect(avancar).toBeDisabled();
  await page.locator("label").filter({ hasText: "Rex" }).click();
  await page.locator("label").filter({ hasText: "Pipoca" }).click();
  await avancar.click();

  // Etapa 2: serviço de cada pet, na ordem em que foram escolhidos (é a ordem de atendimento)
  await expect(page.getByRole("heading", { name: "Serviço para Rex" })).toBeVisible();
  await expect(avancar).toBeDisabled();
  await page.locator("label").filter({ hasText: /^BanhoBanho com shampoo/ }).click();
  await avancar.click();
  await expect(page.getByRole("heading", { name: "Serviço para Pipoca" })).toBeVisible();
  await page.locator("label").filter({ hasText: /^BanhoBanho com shampoo/ }).click();
  await page.locator("label").filter({ hasText: "Hidratação" }).click();
  await campo(page, "Observações").fill("Tem medo de secador");
  await avancar.click();

  // Etapa 3: unidade (lista da rede, com preço para os dois pets)
  await expect(page.getByRole("heading", { name: "Em qual unidade?" })).toBeVisible();
  const centro = page.getByRole("radiogroup", { name: "Unidades" }).locator("label").filter({ hasText: "Pet Feliz Centro" });
  await expect(page.getByRole("radiogroup", { name: "Unidades" }).locator("label").filter({ hasText: "Pet Feliz Zona Sul" })).toBeVisible();
  await centro.click();
  await avancar.click();

  // Etapa 4: data e hora, depois o profissional
  await page.locator("label").filter({ hasText: "Data e hora" }).click();
  await avancar.click();
  await escolherDia(page, TER);
  await page.getByRole("group", { name: "Manhã" }).getByRole("button", { name: "10:00" }).click();
  await avancar.click();
  await expect(page.getByRole("heading", { name: "Escolha o profissional" })).toBeVisible();
  await page.locator("label").filter({ hasText: "Sem profissional de preferência" }).click();
  await avancar.click();

  // Etapa 5: resumo e confirmação
  await expect(page.getByRole("heading", { name: "Resumo" })).toBeVisible();
  const [, mm, dd] = TER.split("-");
  await expect(texto(page, `${dd}/${mm}/${TER.slice(0, 4)} às 10:00`)).toBeVisible();
  await page.getByLabel(/Aceito receber lembretes/).check();
  await botao(page, "Confirmar agendamento").click();
  await expect(texto(page, "Agendamento confirmado!")).toBeVisible();

  // Meus agendamentos: um por pet, em sequência
  await page.getByRole("link", { name: "Ver meus agendamentos" }).click();
  const proximos = page.locator("section").filter({ has: page.getByRole("heading", { name: "Próximos" }) });
  await expect(proximos.getByRole("listitem")).toHaveCount(2);
  const rex = proximos.getByRole("listitem").filter({ hasText: "Rex" });
  const pipoca = proximos.getByRole("listitem").filter({ hasText: "Pipoca" });
  // Rex primeiro, às 10:00; Pipoca em seguida, depois do banho do Rex e da limpeza (o horário exato depende do
  // profissional que a loja escolheu, porque cada um tem o seu tempo).
  await expect(rex).toContainText("10:00");
  await expect(pipoca).toContainText(/, 1[12]:\d\d/);
  await expect(pipoca).toContainText("Banho + Hidratação");

  // Cancelar a Pipoca
  await pipoca.getByText("Cancelar", { exact: true }).click();
  await pipoca.getByRole("button", { name: "Confirmar cancelamento" }).click();
  await expect(texto(page, "Agendamento cancelado.")).toBeVisible();
  await expect(proximos.getByRole("listitem")).toHaveCount(1);

  // Remarcar o Rex para as 15:00 do mesmo dia
  await rex.getByRole("link", { name: "Remarcar" }).click();
  await expect(page.getByRole("heading", { name: "Remarcar" })).toBeVisible();
  await escolherDia(page, TER);
  await page.getByRole("group", { name: "Tarde" }).getByRole("button", { name: "15:00" }).click();
  await page.getByRole("button", { name: /Remarcar para .* às 15:00/ }).click();
  await expect(texto(page, "Agendamento remarcado.")).toBeVisible();
  await expect(proximos.getByRole("listitem").filter({ hasText: "Rex" })).toContainText("15:00");

  // Novo agendamento: o fluxo recomeça do início, não reabre a confirmação anterior.
  await page.getByRole("link", { name: "+ Novo agendamento" }).click();
  await page.waitForURL(/\/(pet-feliz-centro\/agendar|conta\/lojas)$/);
  if (page.url().endsWith("/conta/lojas")) await page.goto("/pet-feliz-centro/agendar");
  await expect(page.getByRole("progressbar", { name: "Etapas do agendamento" }).filter({ visible: true })).toHaveAttribute("aria-valuenow", "1");
  await expect(texto(page, "Agendamento confirmado!")).toHaveCount(0);

  // Loja com uma unidade só: a etapa de unidade é pulada.
  await page.goto("/banho-e-cia-moema/agendar");
  await page.locator("label").filter({ hasText: "Rex" }).filter({ visible: true }).click();
  await botao(page, "Avançar ›").click();
  await page.locator("label").filter({ hasText: /^BanhoBanho com shampoo/ }).filter({ visible: true }).click();
  await botao(page, "Avançar ›").click();
  await expect(page.getByRole("heading", { name: "Como prefere seguir?" }).filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Em qual unidade?" }).filter({ visible: true })).toHaveCount(0);
});
