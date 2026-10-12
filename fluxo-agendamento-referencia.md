# Fluxo de agendamento — referência (prints do app Pet Anjo / Cobasi)

Use a ESTRUTURA do fluxo. Não copie marca, logotipo, ilustrações, fotos nem identidade visual: o app terá visual próprio.
Prints originais: não versionados (o repositório é público e eles têm marca de terceiros e dados de pessoas reais); ficam com o time do produto.

## Comportamento geral
- Barra de progresso com 5 segmentos no topo.
- Rodapé fixo com "Voltar" e "Avançar"; "Avançar" fica desabilitado até a etapa estar preenchida.
- O pet escolhido e o serviço com preço ficam sempre visíveis no topo das etapas seguintes.

## 1. Pet
- Cards dos pets do tutor (foto, nome, raça) e botão "Cadastrar novo pet".
- **Nosso app: seleção múltipla.** O tutor marca um ou mais pets já nesta etapa. A etapa 2 se repete para cada pet
  (serviço principal, adicionais e observações por pet). Unidade e data/hora são escolhidas uma vez para o pedido.

## 2. Serviço
- **Serviço principal: escolha única.** Cada um já é um serviço completo. Vistos: Banho; Banho & Hidratação;
  Banho & Tosa Higiênica; Banho & Tosa Máquina; Banho & Tosa Tesoura; Banho & Tosa Trimming.
- **Serviços adicionais (opcionais):** ex. Escovação de dentes, Hidratação.
- Campo "Observações" em texto livre ("alguma informação importante sobre o serviço ou seu pet").

## 3. Unidade
- Três formas de achar a unidade: **Localização** (GPS), **CEP** ou **Loja** (lista).
- Lista ordenada por distância (ex.: 1 km, 3 km). Cada card mostra nome, endereço e o serviço com o preço
  daquela unidade para aquele pet.
- Implicações: existe **rede com várias unidades**; o preço depende do pet (raça/porte) e da unidade.

## 4. Como seguir: duas portas de entrada
Tela com duas opções: **Data e hora** ou **Profissional**.

### Caminho A — Data e hora
- Calendário mensal; só os dias com vaga ficam habilitados, os demais aparecem acinzentados.
  (Nos prints, só terça a sexta aparecem habilitadas; pode ser grade da loja ou do serviço.)
- Horários em intervalos de 15 min, agrupados em Manhã e Tarde. Os indisponíveis aparecem acinzentados, não somem.
- Aviso fixo: se o dia/horário não estiver disponível, ligar para o telefone da loja e pedir um **encaixe**.

### Etapa do profissional
- Lista com "Sem profissional de preferência" + profissionais com foto, nome, avaliação em estrelas e "Saber mais" (perfil).
- Após escolher data e hora, a lista mostra só quem tem vaga naquele horário (nos prints, apenas um profissional).
- Caminho B (começar por Profissional) mostra a lista completa da unidade; a tela seguinte, com as datas
  daquele profissional, **não aparece nos prints** e precisa ser definida.

## 5. Resumo
- Dados do pet e "Informações principais": serviço, unidade (nome e endereço), data e hora, profissional,
  cada um com ícone de lápis para editar a etapa correspondente.
- Total em reais.
- Botões **"Agendar mais 1 pet"** (no nosso app os pets já são escolhidos na etapa 1; o botão fica só como atalho opcional) e **"Ir para pagamento"**.
  Nos prints, "Ir para pagamento" aparece desabilitado; o motivo não está visível (pode ser um aceite de termos).

## O que isto muda no nosso produto
1. Serviço principal (escolha única) + adicionais opcionais, somando preço e duração.
2. Rede com várias unidades e busca por localização/CEP.
3. Dois caminhos de busca: por data/hora e por profissional. O motor precisa de:
   dias com vaga no mês, horários do dia (com ou sem profissional) e profissionais disponíveis num horário.
4. Perfil do profissional: foto, bio e avaliação.
5. Pedido com vários pets e um único pagamento.
6. Encaixe pela equipe: o painel deve permitir criar atendimento fora da grade (sem sobrepor outro do mesmo profissional).

## Decisões em aberto
- DECIDIDO (vários pets): cada pet é um agendamento próprio dentro de um pedido, com pagamento único. Os pets são atendidos
  sempre em sequência, um após o outro, com o mesmo profissional (que precisa estar habilitado nos serviços de todos).
  A tela mostra o horário estimado de retirada. Atendimento simultâneo com profissionais diferentes fica para uma versão futura.
  Cancelar, remarcar e marcar falta funcionam por pet.
- O pagamento é obrigatório no fluxo ou só o sinal?
- Avaliações entram no MVP ou depois? (a estrutura já está no banco)
