import { expect, type Page, test } from "@playwright/test";
import { proximo } from "../tests/helpers/datas";
import { botao, campo, entrar, texto } from "./util";

const CENTRO = "20000000-0000-0000-0000-000000000001";
const DIA = proximo(3, 15); // quarta com a agenda livre

const coluna = (page: Page, nome: string) => page.getByRole("region", { name: `Agenda de ${nome}` }).filter({ visible: true });
// No celular a agenda abre em lista (um atendimento por linha, com o profissional no texto).
const linha = (page: Page, pet: string) =>
  page.getByRole("list", { name: "Atendimentos do dia" }).filter({ visible: true }).getByRole("listitem").filter({ hasText: pet });
const cartao = (page: Page, pet: string) => linha(page, pet).getByRole("link", { name: new RegExp(pet) });

async function entrarNaAgenda(page: Page, email: string, data = DIA) {
  await entrar(page, email);
  await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
  await page.goto(`/painel/${CENTRO}/agenda?data=${data}`);
}

test("balcão: cliente novo, pet novo, horário pelo motor e o atendimento segue até concluído", async ({ page }) => {
  const sufixo = Date.now().toString().slice(-7);
  await entrarNaAgenda(page, "alice@petfeliz.test");
  await page.getByRole("link", { name: "Novo atendimento" }).click();
  await expect(page.getByRole("heading", { name: "Novo atendimento" })).toBeVisible();

  // Cliente pelo telefone: não existe → cadastro mínimo.
  await campo(page, "Telefone do tutor").fill(`(11) 97${sufixo}`);
  await botao(page, "Buscar").click();
  await expect(texto(page, /Nenhum cliente da loja com/)).toBeVisible();
  await campo(page, "Nome do tutor").fill(`E2E Balcão ${sufixo}`);
  await campo(page, "O tutor autoriza lembretes por WhatsApp").check();
  await botao(page, "Cadastrar tutor").click();

  // Pet novo (o formulário já abre para quem não tem pets).
  await campo(page, "Nome do pet").fill("Paçoca");
  await campo(page, "Porte").selectOption("pequeno");
  await campo(page, "Pelagem").selectOption("curta");
  await botao(page, "Cadastrar pet").click();
  await expect(campo(page, /^Paçoca · Pequeno/, false)).toBeChecked();

  // Serviço, profissional e horário do motor.
  await campo(page, "Serviço principal de Paçoca").selectOption({ label: "Banho · R$ 50,00 · 45 min" });
  await campo(page, "Profissional").selectOption({ label: "Marcos" });
  await campo(page, "Data").fill(DIA);
  await page.getByRole("button", { name: "10:00", exact: true }).click();
  await botao(page, "Agendar às 10:00").click();

  // Volta para a agenda do dia (lista no celular), com o Marcos, a confirmar.
  await expect(page).toHaveURL(new RegExp(`/agenda\\?data=${DIA}`));
  await expect(cartao(page, "Paçoca")).toContainText("10:00–10:54");
  await expect(cartao(page, "Paçoca")).toContainText("Marcos");
  await expect(cartao(page, "Paçoca")).toContainText("A confirmar");

  // WhatsApp com o pedido de confirmação já escrito, e confirmar a um toque (com desfazer).
  await expect(linha(page, "Paçoca").getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/5511.*Podemos%20confirmar/);
  await expect(linha(page, "Paçoca").getByRole("link", { name: "Ligar" })).toHaveAttribute("href", /^tel:\+5511/);
  await linha(page, "Paçoca").getByRole("button", { name: "Confirmar" }).click();
  await expect(cartao(page, "Paçoca")).toContainText("Confirmado");
  await linha(page, "Paçoca").getByRole("button", { name: "Desfazer" }).click();
  await expect(cartao(page, "Paçoca")).toContainText("A confirmar");
  await expect(linha(page, "Paçoca").getByRole("button", { name: "Desfazer" })).toHaveCount(0);

  // Ficha do atendimento: confirmar → iniciar → pronto → concluir.
  await cartao(page, "Paçoca").click();
  await expect(page.getByRole("heading", { name: /Paçoca · 10:00–10:54/ })).toBeVisible();
  for (const [acao, status] of [
    ["Confirmar", "Confirmado"],
    ["Iniciar atendimento", "Em atendimento"],
    ["Pet pronto", "Pronto"],
    ["Concluir (retirado)", "Concluído"],
  ]) {
    await botao(page, acao).click();
    await expect(texto(page, status).first()).toBeVisible();
  }
  await expect(botao(page, "Remarcar")).toHaveCount(0);

  // Ficha do pet: observação da loja e o histórico.
  await page.getByRole("link", { name: "Ficha do pet" }).click();
  await campo(page, "Observações do pet").fill("Medroso com secador");
  await botao(page, "Salvar observações do pet").click();
  await expect(texto(page, "Observações salvas.")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Concluído" }).filter({ visible: true })).toContainText("Marcos");
});

test("encaixe fora da grade, remarcar e cancelar", async ({ page }) => {
  const sufixo = Date.now().toString().slice(-7);
  await entrarNaAgenda(page, "alice@petfeliz.test");
  await page.goto(`/painel/${CENTRO}/agenda/novo?data=${DIA}`);
  await campo(page, "WhatsApp").check();
  await campo(page, "Telefone do tutor").fill(`(11) 96${sufixo}`);
  await botao(page, "Buscar").click();
  await campo(page, "Nome do tutor").fill(`E2E Encaixe ${sufixo}`);
  await botao(page, "Cadastrar tutor").click();
  await campo(page, "Nome do pet").fill("Biscoito");
  await botao(page, "Cadastrar pet").click();
  await campo(page, "Serviço principal de Biscoito").selectOption({ label: "Banho · R$ 65,00 · 60 min" });

  await campo(page, "Encaixe (fora da grade, com um profissional escolhido)").check();
  await campo(page, "Profissional").selectOption({ label: "Júlia" });
  await campo(page, "Data").fill(DIA);
  await campo(page, "Hora do encaixe").fill("08:05");
  await botao(page, "Agendar encaixe").click();

  await expect(cartao(page, "Biscoito")).toContainText("08:05–09:05");
  await expect(cartao(page, "Biscoito")).toContainText("encaixe");
  await expect(cartao(page, "Biscoito")).toContainText("Júlia");

  // Remarcar pelo motor (mantendo a Júlia).
  await cartao(page, "Biscoito").click();
  await page.getByRole("link", { name: "Remarcar" }).click();
  await expect(page.getByRole("heading", { name: "Remarcar" })).toBeVisible();
  const [, m, d] = DIA.split("-").map(Number);
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  for (let i = 0; i < 2 && !(await page.getByText(new RegExp(`^${MESES[m - 1]} de`)).isVisible()); i++) {
    await page.getByRole("button", { name: "Próximo mês" }).click();
  }
  const dia = page.getByRole("button", { name: `${d} de ${MESES[m - 1]}`, exact: true });
  await expect(dia).toBeEnabled();
  await dia.click();
  await page.getByRole("button", { name: "15:00", exact: true }).click();
  await botao(page, /^Remarcar para/).click();
  await expect(cartao(page, "Biscoito")).toContainText("15:00–16:00");
  await expect(cartao(page, "Biscoito")).toContainText("Júlia");

  // Cancelar: some da agenda (o filtro padrão esconde cancelados).
  await cartao(page, "Biscoito").click();
  await botao(page, "Cancelar atendimento").click();
  await botao(page, "Sim, cancelar").click();
  // Depois de cancelar não há mais ações: a ficha mostra só o status.
  await expect(texto(page, "Cancelado")).toBeVisible();
  await expect(botao(page, "Cancelar atendimento")).toHaveCount(0);
  await page.goto(`/painel/${CENTRO}/agenda?data=${DIA}`);
  await expect(texto(page, /Biscoito/)).toHaveCount(0);
  await page.goto(`/painel/${CENTRO}/agenda?data=${DIA}&status=cancelado`);
  await expect(cartao(page, "Biscoito")).toContainText("Cancelado");
  // Na grade por profissional, o mesmo atendimento fica na coluna da Júlia.
  await page.goto(`/painel/${CENTRO}/agenda?data=${DIA}&status=cancelado&visao=dia`);
  await expect(coluna(page, "Júlia").getByRole("link", { name: /Biscoito/ })).toContainText("Cancelado");
});

test("a profissional vê só a própria coluna; a agenda atualiza ao vivo", async ({ page, browser }) => {
  await entrar(page, "paula@petfeliz.test");
  await expect(page.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
  // Menu da profissional: sem lista de espera nem mensagens (são da recepção).
  await expect(page.getByRole("navigation", { name: "Painel da loja" }).getByRole("link", { name: "Espera" })).toHaveCount(0);
  await page.goto(`/painel/${CENTRO}/agenda?data=${DIA}&visao=dia`);
  await expect(coluna(page, "Paula")).toBeVisible();
  await expect(coluna(page, "Júlia")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Novo atendimento" })).toHaveCount(0);

  // Outra pessoa da equipe cria um atendimento para a Paula; a tela dela atualiza sem recarregar.
  await expect(texto(page, "Ao vivo")).toBeVisible();
  const recepcao = await browser.newPage();
  const sufixo = Date.now().toString().slice(-7);
  await entrar(recepcao, "alice@petfeliz.test");
  await expect(recepcao.getByRole("heading", { name: "Hoje", exact: true })).toBeVisible();
  await recepcao.goto(`/painel/${CENTRO}/agenda/novo?data=${DIA}`);
  await campo(recepcao, "Telefone do tutor").fill(`(11) 95${sufixo}`);
  await botao(recepcao, "Buscar").click();
  await campo(recepcao, "Nome do tutor").fill(`E2E Ao Vivo ${sufixo}`);
  await botao(recepcao, "Cadastrar tutor").click();
  await campo(recepcao, "Nome do pet").fill("Faísca");
  await botao(recepcao, "Cadastrar pet").click();
  await campo(recepcao, "Serviço principal de Faísca").selectOption({ index: 1 });
  await campo(recepcao, "Encaixe (fora da grade, com um profissional escolhido)").check();
  await campo(recepcao, "Profissional").selectOption({ label: "Paula" });
  await campo(recepcao, "Hora do encaixe").fill("16:40");
  await botao(recepcao, "Agendar encaixe").click();
  await expect(recepcao).toHaveURL(/\/agenda\?data=/);
  await recepcao.close();

  await expect(coluna(page, "Paula").getByRole("link", { name: /Faísca/ })).toBeVisible({ timeout: 15_000 });
});
