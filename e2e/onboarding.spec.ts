import { expect, test } from "@playwright/test";
import { abrir, botao, campo, texto } from "./util";

const sufixo = Date.now().toString(36);

test("loja nova se configura sozinha até o checklist ficar completo", async ({ page }) => {
  // Cadastro do dono
  await page.goto("/entrar");
  await page.getByRole("link", { name: "Criar conta" }).click();
  await campo(page, "Seu nome").fill("Fernanda Dona");
  await campo(page, "E-mail").fill(`fernanda-${sufixo}@e2e.test`);
  await campo(page, "Senha").fill("senha-segura-123");
  await botao(page, "Criar conta").click();

  // Sem loja: cai direto no cadastro da loja
  await expect(page.getByRole("heading", { name: "Cadastrar loja" })).toBeVisible();
  await campo(page, "Nome da rede ou marca").fill("Cão Limpo");
  await campo(page, "Nome da loja").fill(`E2E Cão Limpo ${sufixo}`);
  await expect(campo(page, "Endereço da página da loja")).toHaveValue(`e2e-cao-limpo-${sufixo}`);
  await botao(page, "Criar loja").click();

  await expect(page.getByRole("heading", { name: "Configuração da loja" })).toBeVisible();
  await expect(texto(page, "Complete os itens abaixo")).toBeVisible();

  // Dados da loja
  await abrir(page, "Loja");
  await campo(page, "Telefone / WhatsApp").fill("(11) 3333-4444");
  await campo(page, "Rua").fill("Rua das Flores");
  await campo(page, "Número").fill("10");
  await campo(page, "Bairro").fill("Centro");
  await campo(page, "Cidade").fill("Campinas");
  await campo(page, "UF").fill("sp");
  await campo(page, "CEP").fill("13010-000");
  await botao(page, "Salvar").click();
  await expect(texto(page, "Dados da loja salvos.")).toBeVisible();

  // Profissional
  await abrir(page, "Profissionais");
  await campo(page, "Nome").fill("Bia");
  await campo(page, "Apresentação (aparece em “Saber mais”)").fill("Tosadora há 5 anos.");
  await botao(page, "Adicionar profissional").click();
  await expect(texto(page, "Bia cadastrado(a).")).toBeVisible();

  // Serviços
  await abrir(page, "Serviços");
  await campo(page, "Nova categoria").fill("Banho");
  await botao(page, "Adicionar categoria").click();
  await expect(texto(page, "Categoria criada.")).toBeVisible();
  await campo(page, "Nome").fill("Banho");
  await campo(page, "Categoria").selectOption({ label: "Banho" });
  await botao(page, "Adicionar serviço").click();
  await expect(texto(page, /^Serviço criado/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Cadastrar preços de Banho ›" }).filter({ visible: true })).toBeVisible();
  await campo(page, "Nome").fill("Hidratação");
  await campo(page, "Tipo").selectOption("adicional");
  await botao(page, "Adicionar serviço").click();
  await expect(page.locator("summary").filter({ hasText: "Hidratação" }).filter({ visible: true })).toBeVisible();

  // Checklist aponta o que falta nos serviços
  await abrir(page, "Resumo");
  await expect(texto(page, "Serviços incompletos")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Banho: falta preço e profissional habilitado" }).filter({ visible: true })).toBeVisible();

  // Preços do banho: preenche "Pequeno" e copia para os outros portes
  await abrir(page, "Preços");
  await page.getByRole("navigation", { name: "Serviço" }).getByRole("link", { name: "Banho" }).click();
  await expect(page.getByRole("navigation", { name: "Serviço" }).getByRole("link", { name: "Banho" })).toHaveAttribute("aria-current", "page");
  // Valor base para a tabela inteira e depois as exceções do porte pequeno; "50.5" (teclado só com ponto) é R$ 50,50
  await campo(page, "Preço para todas").fill("50.5");
  await campo(page, "Duração para todas").fill("40");
  await botao(page, "Aplicar a todas").click();
  await expect(campo(page, "Preço Mini, pelagem longa")).toHaveValue("50,50");
  await expect(campo(page, "Duração em minutos Gigante, pelagem curta")).toHaveValue("40");
  for (const [pelagem, preco, min] of [["curta", "50", "45"], ["média", "55", "50"], ["longa", "60", "60"]] as const) {
    await campo(page, `Preço Pequeno, pelagem ${pelagem}`).fill(preco);
    await campo(page, `Duração em minutos Pequeno, pelagem ${pelagem}`).fill(min);
  }
  await botao(page, "Copiar para…").nth(1).click();
  const copiar = page.getByRole("group", { name: "Copiar Pequeno para" });
  for (const porte of ["Mini", "Médio", "Grande", "Gigante"]) await copiar.getByLabel(porte).check();
  await copiar.getByRole("button", { name: "Aplicar" }).click();
  await expect(campo(page, "Preço Gigante, pelagem longa")).toHaveValue("60,00");
  await campo(page, "Preço Gigante, pelagem longa").fill("120");
  await botao(page, "Salvar preços").click();
  await expect(texto(page, "Preços salvos (15 de 15 combinações).")).toBeVisible();

  // Valor inválido é recusado com mensagem clara
  await campo(page, "Duração em minutos Mini, pelagem curta").fill("2");
  await botao(page, "Salvar preços").click();
  await expect(texto(page, "Mini / pelagem curta: duração entre 5 e 600 minutos.")).toBeVisible();
  await campo(page, "Duração em minutos Mini, pelagem curta").fill("35");

  // Trocar de serviço com alteração pendente avisa antes de descartar
  const servico = page.getByRole("navigation", { name: "Serviço" });
  await servico.getByRole("link", { name: "Hidratação" }).click();
  await expect(texto(page, "Os preços de Banho ainda não foram salvos.")).toBeVisible();
  await botao(page, "Continuar editando").click();
  await botao(page, "Salvar preços").click();
  await expect(texto(page, "Preços salvos (15 de 15 combinações).")).toBeVisible();

  // Adicional sem tabela abre com um preço só para todos os portes
  await servico.getByRole("link", { name: "Hidratação" }).click();
  await expect(servico.getByRole("link", { name: "Hidratação" })).toHaveAttribute("aria-current", "page");
  await expect(campo(page, "Mesmo preço e tempo para todos os portes e pelagens")).toBeChecked();
  await campo(page, "Preço (R$)").fill("25,50");
  await campo(page, "Duração (min)").fill("15");
  await botao(page, "Salvar preços").click();
  await expect(texto(page, "Preços salvos (15 de 15 combinações).")).toBeVisible();

  // Quem faz o quê
  await abrir(page, "Quem faz o quê");
  await campo(page, "Banho").check();
  await campo(page, /^Hidratação/, false).check();
  await botao(page, "Salvar Bia").click();
  await expect(texto(page, "Serviços do profissional salvos.")).toBeVisible();

  // Horários: terça a sábado, 9h às 18h (padrão do formulário)
  await abrir(page, "Horários");
  await botao(page, "Adicionar horário").click();
  await expect(texto(page, "Horário adicionado.")).toBeVisible();
  const semana = page.getByRole("list", { name: "Horários de Bia" }).filter({ visible: true });
  await expect(semana.getByText("09:00–18:00")).toHaveCount(5);

  // Janela sobreposta é recusada
  await botao(page, "Adicionar horário").click();
  await expect(texto(page, /se sobrepõe a outro já cadastrado/)).toBeVisible();

  // Checklist completo
  await abrir(page, "Resumo");
  await expect(texto(page, "Tudo pronto!")).toBeVisible();
  await expect(texto(page, `/e2e-cao-limpo-${sufixo}`)).toBeVisible();
});
