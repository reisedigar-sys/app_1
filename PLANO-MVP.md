# Plano do MVP — Agenda Pet (9 semanas)

Premissa: 15 a 20 h/semana com Claude Code. Em dedicação integral, cerca de 5 a 6 semanas.
Escopo: vários profissionais (um por visita, filtrado pelos serviços em que está habilitado), serviços estilo Cobasi
(catálogo por categoria, vários serviços na mesma visita), horários por tipo de serviço, anti no-show, tutor com N pets,
agendamento por vários canais (app próprio, WhatsApp, balcão e, no futuro, marketplace) e arquitetura pronta para 1.000 petshops.

Se quiser cortar para 8 semanas: pule a semana 7 (bot de WhatsApp). O WhatsApp ainda funciona como canal, com a
atendente registrando o pedido pelo painel e enviando o link de agendamento no chat.

## Andamento (atualizado em 13/10/2026)

| Etapa | Situação |
| --- | --- |
| Semanas 1 a 4 (fundação, onboarding, motor de disponibilidade, lado do tutor) | ✅ concluídas |
| Ambientes de teste e produção | ✅ no ar: staging (prévia da `main`) e produção (`hora-do-pet.vercel.app`), com deploy automático (ver `docs/ambientes.md`) |
| **Semana 5 — Painel da loja** | **em revisão** (PR da semana 5) |
| Semanas 6 a 9 | a fazer |

Como cada entrega chega aos clientes: PR da semana → merge na `main` (o staging se atualiza sozinho) → PR `main` →
`producao` → aprovação do dono em *Actions → Deploy produção*.

## Em paralelo desde a semana 1 (não dependem de código)
- Submeter os templates de WhatsApp para aprovação (pode levar dias). **Pendente**: começar pela verificação da empresa
  na Meta (passo a passo em `docs/ambientes.md`)
- Abrir conta no gateway Pix com split (Asaas) e entender o cadastro de cada loja. **Pendente**
- Fechar 2–3 petshops piloto e mostrar o progresso toda semana
- Marca: **Hora do Pet** (decisão provisória do dono, 13/10/2026). Já aparece no app desde a semana 5

## Semana 1 — Fundação ✅
- Repositório, Next.js + TypeScript, Supabase, deploy na Vercel (ambientes de teste e produção criados em 13/10/2026)
- Aplicar `schema.sql` e `002_requisitos_mvp.sql` como migrações
- Seeds: 2 lojas de teste, cada uma com 2–3 profissionais
- **Testes de isolamento entre lojas (RLS)**: a loja A nunca enxerga dados da loja B
- Entrega: banco rodando, tipos gerados, CI com testes

## Semana 2 — Onboarding da loja ✅
- Cadastro da rede com várias unidades, de cada loja (com localização) e da equipe (dono, atendente, profissional, com foto e bio)
- Profissionais; serviços por categoria (banho, tosa, extras)
- Tabela de preço e duração por serviço × porte × pelagem
- Habilitação: quais profissionais fazem quais serviços
- Horários gerais do profissional + horários específicos por serviço (ex.: tosa só terça e quinta)
- Bloqueios (folga, almoço, feriado)
- Entrega: uma loja consegue se configurar sozinha

## Semana 3 — Motor de disponibilidade (o coração do produto) ✅
- Três consultas, uma para cada tela do fluxo de referência: **dias com vaga no mês** (calendário),
  **horários do dia** em intervalos de 15 min (com ou sem profissional escolhido) e
  **profissionais disponíveis** num dado horário. Dados: loja + pet + serviço principal + adicionais
- A consulta de dias com vaga é a mais pesada: medir desde já e, se preciso, guardar o resultado em cache por loja e mês
- Vários pets no mesmo pedido: o motor soma as durações e procura um bloco contínuo com um único profissional,
  atendendo os pets em sequência. Testes: 2 e 3 pets, durações diferentes, profissional escolhido, e falha parcial
  (nenhum agendamento é gravado se um pet não couber). Atendimento simultâneo fica para depois do MVP
- Casos que precisam de teste: vários serviços em sequência com um único profissional (só aparecem os habilitados
  em todos os serviços escolhidos), horário específico do serviço, buffer entre atendimentos, bloqueios,
  duração por porte, fuso horário, "qualquer profissional"
- `criar_agendamento` transacional: valida, grava agendamento + itens, e a trava do banco impede conflito.
  Recebe o canal de origem e é a única porta de entrada (app, WhatsApp, balcão, futuro marketplace)
- Teste de concorrência: dois tutores tentando o mesmo horário ao mesmo tempo
- Entrega: API de horários e de criação de agendamento, bem testada

## Semana 4 — Lado do tutor ✅
- Referência: `fluxo-agendamento-referencia.md` (fluxo descrito em texto) e os prints em `docs/referencias/`.
  Copiar a estrutura do fluxo, não a marca nem o visual
- Login por telefone (código) ou e-mail; o telefone identifica o tutor, mesmo que ele já tenha sido cadastrado pelo balcão ou WhatsApp
- Cadastro do tutor e de **N pets** (raça, porte, pelagem, alergias, temperamento, vacinas)
- Fluxo de agendamento em 5 etapas: pet → serviço principal (escolha única) + adicionais + observações →
  unidade (localização, CEP ou lista, com distância e preço) → data e hora **ou** profissional → resumo editável
- Seleção múltipla de pets na primeira etapa: um agendamento por pet, no mesmo pedido, com um único pagamento;
  a etapa de serviço se repete para cada pet e a tela de resumo mostra o horário estimado de retirada
- Perfil do profissional ("Saber mais") com foto e bio; estrelas só aparecem quando houver avaliações
  (avaliações podem ficar para depois do MVP; o banco já comporta)
- Meus agendamentos: ver, remarcar, cancelar
- Página pública da loja (`/{slug}`)
- Entrega: tutor agenda pelo celular em poucos toques

## Semana 5 — Painel da loja
- Agenda do dia e da semana, com colunas por profissional, atualizada em tempo real
- Criar agendamento de balcão e por telefone/WhatsApp
- Mudar status (confirmado → em atendimento → pronto → concluído), remarcar, cancelar
- Marcar falta; ficha do pet com observações
- Encaixe pela equipe (`criar_pedido(..., encaixe => true)`)
- Trocar o nome do app para **Hora do Pet** (títulos, manifesto do PWA, textos e README)
- Se os pilotos pedirem: logo e cor da loja na página pública
- Entrega: a loja opera o dia inteiro pelo painel

## Semana 6 — Anti no-show
- Fila de notificações alimentada ao criar/remarcar/cancelar agendamento
- Worker (pg_cron + Edge Function) consumindo com SKIP LOCKED, com reenvio em falha
- Sequência: confirmação imediata → lembrete D-1 → pedido de confirmação (botão/link) → lembrete 2 h antes
- Com vários pets, enviar uma única mensagem por pedido listando os pets (criar a notificação só para o primeiro
  agendamento do pedido); a confirmação vale para o pedido inteiro
- Sem confirmação até o prazo: avisar a loja ou liberar o horário (configurável) e acionar a lista de espera
- Mensagem "seu pet está pronto"
- Contador de faltas por tutor e sinal obrigatório após faltas
- Entrega: o fluxo que mais reduz falta, funcionando

## Semana 7 — WhatsApp como canal de entrada (bot guiado)
- Webhook da API do WhatsApp, idempotente pelo id da mensagem e roteado pelo número de cada loja
- Identifica o tutor pelo telefone; se não existir, cria o cadastro mínimo (nome e pet) na própria conversa
- Conversa guiada com botões e listas, sem texto livre: pet → serviço → profissional/horário → confirmar
- Usa a mesma `criar_agendamento`, com canal `whatsapp`; atalhos para remarcar, cancelar e "falar com atendente"
- Texto livre com IA fica para depois do MVP
- Entrega: o tutor agenda sem sair do WhatsApp

## Semana 8 — Pagamento
- Pix com sinal configurável por loja, com split e comissão zero para o app próprio
- Webhook do gateway, conciliação, estorno
- Política de cancelamento aplicada automaticamente (devolve ou retém o sinal)
- Entrega: tutor paga o sinal e o horário só fica firme com o pagamento

## Semana 9 — Endurecimento e piloto
- Teste de carga simulando 1.000 lojas (k6): consulta de horários, criação de agendamento, pico de lembretes
- Revisão de índices, pooling de conexões, rate limit, backup, monitoramento (Sentry)
- LGPD: consentimento, política de privacidade, exclusão de dados
- Onboarding dos 2–3 pilotos e treinamento rápido das equipes
- Infraestrutura antes do primeiro cliente real (ações do dono, detalhe em `docs/ambientes.md`):
  domínio próprio (`app.` e `staging.`), e-mail de envio (Resend) nos dois projetos Supabase, Vercel Pro (o plano
  gratuito não permite uso comercial), Supabase Pro na produção (backup diário) e proteção das prévias da Vercel
  revista para a demonstração aos pilotos
- Entrega: piloto no ar

## Fase 2 — Diferenciais (após o piloto, semanas 10–15)
O foco é provar valor e encher a agenda da loja. Ordem por impacto esperado; reavalie com o feedback dos pilotos
e pule o que as lojas não pedirem. Cada item é uma fatia que funciona sozinha.

### Semana 10 — Painel de resultados ("faltas evitadas")
- Baseline: a loja informa a taxa de falta que tinha antes do app (banner no painel, se ainda não informou)
- Métricas: taxa de falta atual, agendamentos confirmados após lembrete, horários cancelados com antecedência e reocupados,
  receita recuperada, ocupação por profissional, ticket médio, sinais recebidos
- "Faltas evitadas" é uma ESTIMATIVA: (taxa antes − taxa atual) × agendamentos do período. Mostrar a fórmula na tela
  e nunca apresentar como medida exata
- Resumo mensal por e-mail para o dono

### Semana 11 — Retorno automático
- Intervalo de retorno por serviço e pelagem (editável pela loja), com padrão inicial de 30 dias
- Job diário: tutor cujo pet passou do intervalo e não tem agendamento futuro recebe lembrete com link para reagendar em um toque
- Atenção: é mensagem de marketing. Exige consentimento específico, opt-out em toda mensagem, no máximo um lembrete
  por pet por ciclo, e custa mais que a mensagem de utilidade (confirme a tarifa em reais na tabela da Meta)
- Medir conversão (agendou em até 7 dias) e mostrar no painel de resultados

### Semana 12 — Financeiro leve
- Pagamento registrado no balcão (dinheiro, Pix direto, maquininha); pagamentos online entram sozinhos
- Caixa do dia por forma de pagamento e lançamento simples de despesas
- Comissão por profissional sobre atendimentos concluídos, com extrato e exportação em CSV
- Relatórios de faturamento por período, serviço e profissional
- Fora do escopo: nota fiscal, PDV completo e estoque

### Semana 13 — Pós-banho com foto e histórico
- Foto de antes e depois pelo celular da equipe, enviada ao tutor com o aviso de "pet pronto"
- Histórico do pet no app do tutor; controle de visibilidade e exclusão a pedido (LGPD)

### Semana 14 — Pacotes e recorrência
- Pacote pré-pago (ex.: 4 banhos) com saldo por pet e validade
- Horário fixo recorrente (ex.: toda terça às 10h, a cada 2 semanas), gerando agendamentos até 8 semanas à frente
- Assinatura com cobrança automática só se os pilotos pedirem

### Semana 15 — Horários ociosos com desconto
- Regras de desconto por dia, faixa de horário e serviço; sugestão automática dos horários com baixa ocupação
- Divulgação por mensagem de marketing só para tutores com consentimento, mostrando o custo estimado antes de enviar
- Medir receita incremental e preenchimento

## Depois (conforme a demanda)
Onboarding self-service, cobrança de mensalidade, taxi dog, estoque (só se as lojas pedirem, ou por integração
com o sistema que já usam) e avaliações com estrelas. Marketplace só depois de provar retenção nas lojas.

Impacto no preço: retorno automático e promoções são mensagens de marketing, mais caras que as de utilidade.
Reserve uma cota separada no plano e cobre o excedente.

## Sobre a capacidade de 1.000 petshops
Estimativa: 1.000 lojas × ~30 atendimentos/dia = cerca de 30 mil agendamentos/dia (~1 milhão/mês).
Para um Postgres bem indexado isso é tranquilo. O que exige cuidado:
1. Toda consulta filtra por loja + intervalo de tempo (índices já criados na migração 002)
2. Lembretes em pico (ex.: 18h, todas as lojas) → fila com worker, nunca envio direto na requisição
3. Custo de mensagens: cerca de 3 por agendamento ≈ 90 mil/dia; confirme o preço por mensagem do provedor antes de definir a mensalidade
4. Conexões: usar o pooler do Supabase desde o início
5. Particionar `agendamento` e `mensagem_log` por mês só quando passar de dezenas de milhões de linhas
