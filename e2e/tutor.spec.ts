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
  await page.getByRole("link", { name: "Agendar banho e tosa" }).click();
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
  await expect(texto(page, "Quem vai tomar banho?")).toBeVisible();
  await expect(texto(page, "Você ainda não cadastrou nenhum pet.")).toBeVisible();

  await cadastrarPet(page, "Rex", "Grande", "Longa");
  await cadastrarPet(page, "Pipoca", "Pequeno", "Curta");

  // Tela 1: os dois pets, o serviço de cada um (na ordem em que foram escolhidos, que é a ordem de atendimento) e a
  // unidade (lista da rede, com o total para os dois pets).
  await page.goto("/pet-feliz-centro/agendar");
  const verHorarios = botao(page, "Ver horários");
  await expect(verHorarios).toBeDisabled();
  await page.locator("label").filter({ hasText: "Rex" }).click();
  await page.locator("label").filter({ hasText: "Pipoca" }).click();
  const paraRex = page.locator("section").filter({ has: page.getByRole("heading", { name: "Para Rex" }) });
  const paraPipoca = page.locator("section").filter({ has: page.getByRole("heading", { name: "Para Pipoca" }) });
  await paraRex.locator("label").filter({ hasText: /^Banho\d/ }).click();
  await expect(verHorarios).toBeDisabled();
  await paraPipoca.locator("label").filter({ hasText: /^Banho\d/ }).click();
  await paraPipoca.locator("label").filter({ hasText: "Hidratação" }).click();
  await campo(page, "Algo que a loja deve saber sobre Pipoca? (opcional)").fill("Tem medo de secador");
  await expect(page.getByRole("heading", { name: "Em qual unidade?" })).toBeVisible();
  const unidades = page.getByRole("radiogroup", { name: "Unidades" });
  await expect(unidades.locator("label").filter({ hasText: "Pet Feliz Zona Sul" })).toBeVisible();
  await unidades.locator("label").filter({ hasText: "Pet Feliz Centro" }).click();
  await verHorarios.click();

  // Tela 2: dia na faixa de dias com vaga, horário (profissional fica em "Qualquer") e revisão
  await expect(page.getByRole("heading", { name: "Quando fica bom?" })).toBeVisible();
  const [, mm, dd] = TER.split("-");
  await page.getByRole("radiogroup", { name: "Dias com vaga" }).getByRole("radio", { name: `Terça ${dd}/${mm}` }).click();
  await page.getByRole("group", { name: "Manhã" }).getByRole("button", { name: "10:00" }).click();
  await botao(page, "Revisar").click();
  const revisao = page.getByRole("dialog", { name: "Tudo certo?" });
  await expect(revisao.getByText(`Terça ${dd}/${mm} às 10:00`)).toBeVisible();
  await expect(revisao.getByText("Quem estiver livre")).toBeVisible();
  await revisao.getByLabel(/Aceito receber lembretes/).check();
  await revisao.getByRole("button", { name: /^Confirmar · R\$/ }).click();
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
  await expect(page.getByRole("heading", { name: "Quem vai tomar banho?" }).filter({ visible: true })).toBeVisible();
  await expect(texto(page, "Agendamento confirmado!")).toHaveCount(0);

  // Repetir o último pela página da loja: pets e serviços já vêm escolhidos (a rede tem 2 unidades, então a escolha
  // da unidade continua na tela).
  await page.goto("/pet-feliz-centro");
  await page.getByRole("link", { name: /Repetir o banho/ }).click();
  const repetirRex = page.locator("section").filter({ has: page.getByRole("heading", { name: "Para Rex" }) }).filter({ visible: true });
  await expect(repetirRex.locator("label").filter({ hasText: /^Banho\d/ }).getByRole("radio")).toBeChecked();
  await expect(page.getByRole("heading", { name: "Em qual unidade?" }).filter({ visible: true })).toBeVisible();

  // Loja com uma unidade só: a lista de unidades nem aparece.
  await page.goto("/banho-e-cia-moema/agendar");
  await page.locator("label").filter({ hasText: "Rex" }).filter({ visible: true }).click();
  await page.locator("label").filter({ hasText: /^Banho\d/ }).filter({ visible: true }).click();
  await expect(page.getByRole("heading", { name: "Em qual unidade?" }).filter({ visible: true })).toHaveCount(0);
  await botao(page, "Ver horários").click();
  await expect(page.getByRole("heading", { name: "Quando fica bom?" }).filter({ visible: true })).toBeVisible();
});
