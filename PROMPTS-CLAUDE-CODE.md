# Prompts do Claude Code — Agenda Pet (MVP em 9 semanas + diferenciais)

## Como usar
- Coloque na raiz do projeto: `CLAUDE.md`, `PLANO-MVP.md`, `fluxo-agendamento-referencia.md`, `schema.sql`, `002_requisitos_mvp.sql` e os prints em `docs/referencias/`.
- Use um prompt por vez, em uma branch própria (`semana-N-nome`). Revise o diff e rode os testes antes de seguir.
- Se o Claude Code propuser algo que contradiz o `CLAUDE.md`, peça a justificativa antes de aceitar.
- Os arquivos SQL foram escritos mas **nunca executados**: a semana 1 começa validando e corrigindo.

## Regras que valem para todas as semanas (cole junto de cada prompt, se quiser)
```
Regras de trabalho:
- Siga o CLAUDE.md. Não quebre os princípios de arquitetura (multi-tenant, agenda única, regras no back-end).
- Commits pequenos, uma funcionalidade por vez. Rode lint, tipos e testes antes de concluir.
- Toda mudança de banco vai em uma nova migração em supabase/migrations/. Nunca edite migração já aplicada.
- Nunca use a chave service_role no front-end.
- Antes de fazer algo destrutivo (apagar dados, dropar tabela), pergunte.
- Ao terminar, me diga em poucas linhas o que ficou pronto, o que não ficou e o que você assumiu.
```

---

## Prompt 0 — Aquecimento (antes de tudo)
```
Leia CLAUDE.md, PLANO-MVP.md, fluxo-agendamento-referencia.md, schema.sql e 002_requisitos_mvp.sql.
Não escreva código ainda. Me entregue:
1) um resumo do que vamos construir em até 10 linhas;
2) riscos ou contradições que você encontrou nos arquivos;
3) perguntas que precisam de resposta antes da semana 1.
```

---

## Semana 1 — Fundação
```
Objetivo: projeto rodando com banco validado e isolamento entre lojas testado.

Tarefas:
1. Crie o projeto Next.js (App Router) com TypeScript e Tailwind, configurado como PWA. Estrutura sugerida:
   app/, lib/, supabase/migrations/, supabase/seed.sql, tests/.
2. Configure o Supabase local com a CLI. Transforme schema.sql na migração 001 e 002_requisitos_mvp.sql na 002.
   Esses SQLs nunca foram executados: aplique, corrija os erros que aparecerem e me liste cada correção feita.
3. Crie seeds: 2 redes de teste, 3 lojas (uma delas com 3 profissionais), serviços principais e adicionais,
   preços por porte e pelagem, 2 tutores com 2 pets cada.
4. Gere os tipos TypeScript do banco e um cliente Supabase tipado (um para o navegador, outro só para o servidor).
5. Escreva testes de isolamento (RLS): usuário da loja A não lê nem escreve nada da loja B; tutor só vê os próprios pets
   e agendamentos; visitante só lê o catálogo público (lojas ativas, serviços, preços, profissionais ativos).
6. Configure CI (GitHub Actions) com lint, tipos e testes. Crie .env.example e um README com o passo a passo para rodar.

Pronto quando: `npm test` passa, as migrações aplicam do zero sem erro e os testes de RLS cobrem todas as tabelas com petshop_id.
```

---

## Semana 2 — Onboarding da loja
```
Objetivo: uma loja nova consegue se configurar sozinha pelo painel.

Siga o CLAUDE.md e o schema. Construa, em /painel, com login por e-mail para a equipe (Supabase Auth):
1. Cadastro da rede e da unidade (nome, slug único, endereço, telefone, localização, fuso, buffer, slot_minutos,
   política de cancelamento, sinal em %).
2. Profissionais (nome, foto, bio, ativo).
3. Serviços: tipo principal ou adicional, categoria, ordem, ativo.
4. Tabela de preço e duração por serviço x porte x pelagem, com edição em grade (tabela editável) e cópia de uma linha para outras.
5. Habilitação: quais profissionais fazem quais serviços (com fator_duracao opcional).
6. Horários: janelas gerais por profissional e por dia da semana, e janelas específicas por serviço
   (a janela do serviço substitui a geral para esse serviço naquele dia).
7. Bloqueios (folga, almoço, feriado), da loja inteira ou de um profissional.
Validações: fim maior que início, sem janelas sobrepostas do mesmo profissional, todo serviço ativo precisa de ao menos um
preço e um profissional habilitado (mostrar aviso de "serviço incompleto").
Faça mobile first e deixe a tela de horários simples de usar.

Pronto quando: crio uma loja do zero, configuro tudo e vejo um checklist de onboarding completo; testes de tela principais passam.
```

---

## Semana 3 — Motor de disponibilidade
```
Objetivo: o coração do produto, bem testado. Sem telas nesta semana, só lógica e API.

Crie lib/disponibilidade (funções puras, testáveis) e as rotas/funções que as expõem:
1. diasComVaga(loja, pets+serviços, mês): dias do mês que têm ao menos um horário. Alimenta o calendário.
2. horariosDoDia(loja, pets+serviços, data, profissional?): horários na grade de slot_minutos (15 min por padrão).
3. profissionaisDisponiveis(loja, pets+serviços, data, hora): quem pode atender naquele horário.
4. criarPedido(...): transacional. Recebe loja, tutor, lista de pets com serviço principal + adicionais, profissional ou "qualquer",
   data/hora, canal e chave de idempotência. Cria 1 pedido e 1 agendamento por pet, todos em sequência.

Regras:
- Duração de cada pet = (principal + adicionais) conforme porte e pelagem, x fator_duracao do profissional.
- O profissional precisa estar habilitado em TODOS os serviços de TODOS os pets do pedido.
- Vários pets: soma das durações em um bloco contínuo com o mesmo profissional; cada agendamento termina com o buffer da loja.
- Janela específica do serviço substitui a janela geral. Respeite bloqueios, fuso da loja e antecedência mínima.
- Janela máxima de agendamento configurável (padrão 30 dias).
- Conflito é impedido pela constraint do banco; trate o erro e devolva "horário indisponível".
- Se um pet não couber, nenhum agendamento é gravado.
- Retorne o horário estimado de retirada.
Testes obrigatórios: sobreposição, buffer, folga, bloqueio, fim de expediente, janela por serviço, 1/2/3 pets, durações diferentes,
profissional escolhido, "qualquer profissional", virada de dia e de fuso, concorrência (dois pedidos no mesmo horário: só um passa),
idempotência (mesma chave não duplica).
Performance: crie um seed com 1.000 lojas e meça as três consultas de leitura. Se diasComVaga passar de 300 ms, proponha cache por loja e mês.

Pronto quando: todos os testes passam e o relatório de performance está no README.
```

---

## Semana 4 — Lado do tutor
```
Objetivo: o tutor agenda pelo celular seguindo fluxo-agendamento-referencia.md.

Use a ESTRUTURA do fluxo e dos prints em docs/referencias/. Não copie marca, logotipo, ilustrações nem identidade visual:
crie um visual próprio, limpo e mobile first. Construa:
1. Login do tutor por telefone (código) ou e-mail. O telefone identifica o tutor, inclusive se ele já foi cadastrado pelo balcão.
2. Meus pets: cadastro e edição (foto no Supabase Storage, raça, porte, pelagem, alergias, temperamento, vacinas), vários por tutor.
3. Fluxo em 5 etapas: pets (seleção múltipla) -> serviço principal (escolha única) + adicionais + observações, por pet ->
   unidade (localização, CEP ou lista, ordenada por distância, com preço do serviço) -> data e hora OU profissional ->
   resumo editável (lápis em cada item) com total e horário estimado de retirada.
4. Página pública da loja em /{slug} com o mesmo fluxo e a marca da loja.
5. Meus agendamentos: ver, remarcar, cancelar (respeitando a política da loja).
6. Perfil do profissional ("Saber mais") com foto e bio. Estrelas só aparecem quando existirem avaliações.
Estados de carregando, vazio e erro em todas as telas. Botão "Avançar" desabilitado até a etapa estar preenchida.
Chame o motor da semana 3; não duplique regra de negócio no front-end.
Nesta semana o pagamento fica fora: o fluxo termina em "Confirmar agendamento".

Pronto quando: um teste ponta a ponta (Playwright) percorre o fluxo com 2 pets e termina com agendamentos gravados.
```

---

## Semana 5 — Painel da loja
```
Objetivo: a loja opera o dia inteiro pelo painel.

Construa em /painel:
1. Agenda do dia e da semana, com uma coluna por profissional, atualizada em tempo real (Supabase Realtime).
2. Criar agendamento de balcão ou por WhatsApp/telefone (campo canal), buscando o tutor pelo telefone e criando o cadastro mínimo se não existir.
3. Modo "encaixe": a equipe pode criar atendimento fora da grade do profissional, mas nunca sobrepondo outro do mesmo profissional.
4. Mudar status (agendado -> confirmado -> em atendimento -> pronto -> concluído), remarcar, cancelar e marcar falta.
5. Ficha do pet com observações e histórico de atendimentos.
6. Filtros por profissional e por status. Indicador de quem ainda não confirmou.
Use o motor da semana 3 para remarcar. Permissões por papel: dono e gerente veem tudo; atendente opera a agenda;
profissional vê só a própria agenda.

Pronto quando: simulo um dia de loja (10 atendimentos, 2 cancelamentos, 1 falta, 1 encaixe) sem inconsistência na agenda.
```

---

## Semana 6 — Anti no-show
```
Objetivo: reduzir faltas com notificações confiáveis.

1. Crie uma interface MensagemProvider com uma implementação de teste (fake) e outra para o WhatsApp (pode ficar para a semana 7).
2. Ao criar, remarcar ou cancelar um pedido, alimente a fila notificacao_agendada: confirmação imediata, lembrete D-1
   (horário configurável pela loja), pedido de confirmação com botão/link, lembrete X horas antes.
   Com vários pets, crie a notificação só para o primeiro agendamento do pedido e liste todos os pets na mensagem.
3. Worker (pg_cron + Edge Function) que consome a fila com SKIP LOCKED, com tentativas, backoff e registro em mensagem_log.
4. Página de confirmação /c/{token}: o tutor confirma, remarca ou cancela sem fazer login. A confirmação vale para o pedido inteiro.
5. Regra de liberação: sem confirmação até confirmar_ate_horas, avisar a loja ou liberar o horário (configurável por loja)
   e oferecer o horário à lista de espera.
6. Lista de espera: tutor entra para um período; ao abrir vaga, notifique o primeiro da fila.
7. Falta: ao marcar falta, incremente tutor_petshop.faltas; quem tem faltas acima do limite da loja passa a precisar de sinal.
8. Notificação "seu pet está pronto" quando o status mudar para pronto.
Testes com relógio falso: nada é enviado duas vezes, nada é enviado depois do atendimento, cancelamento cancela as notificações pendentes.

Pronto quando: a simulação de um dia de loja dispara as mensagens certas na hora certa (com o provider fake).
```

---

## Semana 7 — WhatsApp como canal de entrada (opcional)
```
Objetivo: o tutor agenda sem sair do WhatsApp. Se o prazo apertar, pule esta semana.

1. Webhook da API oficial do WhatsApp (Meta Cloud API ou provedor oficial) em rota de servidor:
   valide a assinatura do webhook, ignore mensagens já processadas (tabela whatsapp_entrada) e roteie pela loja usando petshop_whatsapp.phone_number_id.
2. Identifique o tutor pelo telefone (telefone_e164). Se não existir, crie o cadastro mínimo (nome e pet) dentro da conversa.
3. Conversa guiada com botões e listas, sem texto livre: pet -> serviço -> profissional/horário -> confirmar.
   Estado em whatsapp_sessao, com expiração.
4. Use a mesma função criarPedido, com canal 'whatsapp' e criado_por_tipo 'bot_whatsapp'.
5. Atalhos: remarcar, cancelar, "falar com atendente" (marca a conversa para a equipe).
6. Registre o consentimento de contato (LGPD) na primeira interação e respeite pedido de parar de receber mensagens.
7. Troque o provider fake da semana 6 pelo real.
Atenção: mensagens de serviço e templates passam a ter custo por mensagem; mantenha o fluxo enxuto e registre quantas mensagens cada pedido gera.
Testes com payloads de exemplo gravados (fixtures) para cada etapa da conversa.

Pronto quando: um agendamento completo é feito por mensagens de teste, e o mesmo webhook enviado duas vezes não duplica nada.
```

---

## Semana 8 — Pagamento
```
Objetivo: sinal via Pix com split e política de cancelamento.

1. Nova migração 003: adicionar o status 'aguardando_pagamento' em status_agendamento e a coluna expira_em em agendamento.
   O horário fica reservado por 10 minutos (configurável) enquanto o tutor paga; sem pagamento, expira e libera o horário.
2. Integração com o Asaas: criação de subconta por loja (onboarding de pagamento), cobrança Pix para o pedido inteiro
   (um pagamento, vários pets), split com comissão da plataforma (comissao_marketplace_pct; zero para clientes do app próprio).
3. Webhook do gateway: valide o token, seja idempotente, atualize pagamento e agendamento, notifique tutor e loja.
4. Regras: sinal em % configurável por loja; sinal obrigatório para quem tem faltas acima do limite; cancelamento dentro do prazo
   devolve o valor, depois do prazo retém o sinal. Estorno automático quando couber.
5. Painel: conciliação (pagamentos do dia, pendentes, estornados) e extrato por loja.
6. Repasse a tarifa do Pix ao custo da loja e mostre isso no extrato.
Use o sandbox do gateway. Nenhuma chave real no repositório.
Testes: pagamento aprovado, expirado, duplicado (webhook repetido), estorno, cancelamento dentro e fora do prazo.

Pronto quando: o fluxo do tutor termina em pagamento no sandbox e o horário só fica firme com o pagamento confirmado.
```

---

## Semana 9 — Endurecimento e piloto
```
Objetivo: pronto para as primeiras lojas reais e com caminho para 1.000.

1. Teste de carga com k6 contra um seed de 1.000 lojas: consulta de horários, criação de pedido e pico de lembretes às 18h.
   Meta: leituras abaixo de 300 ms no percentil 95 e nenhuma fila crescendo sem parar. Use EXPLAIN nas consultas lentas e ajuste índices.
2. Pooler de conexões do Supabase, rate limit nas rotas públicas (login, webhook, criação de pedido), validação de entrada em todas as rotas.
3. Observabilidade: Sentry, logs estruturados, alerta de fila parada e de falha de webhook.
4. Segurança: auditoria de RLS (liste tabelas sem política), revisão de segredos, nenhuma chave service_role no front-end.
5. LGPD: política de privacidade, consentimento de contato, exportação e exclusão dos dados do tutor.
6. Backups e restauração testada (PITR). Escreva um runbook com os procedimentos de incidente.
7. Checklist de onboarding do piloto e um modo "loja de demonstração" com dados fictícios.
8. Feature flags para ligar WhatsApp bot e pagamento loja a loja.

Pronto quando: o relatório de carga está no repositório, o checklist de segurança está todo marcado e 2 a 3 lojas piloto conseguem operar.
```

---

## Fase 2 — Diferenciais (depois do piloto)
Cada prompt cria a própria migração com o próximo número disponível. Rode só os que as lojas piloto justificarem.

### Semana 10 — Painel de resultados ("faltas evitadas")
```
Objetivo: mostrar à loja o valor que o app entrega, sem exagerar.

1. Baseline: campo "taxa de falta antes do app" (%) no cadastro da loja; se vazio, mostre um banner pedindo o dado.
2. Painel /painel/resultados com filtro de período: taxa de falta atual; agendamentos confirmados após lembrete;
   horários cancelados com antecedência mínima configurável e depois reocupados (um novo agendamento criado depois do
   cancelamento que se sobrepõe ao horário liberado); receita recuperada; ocupação por profissional; ticket médio; sinais recebidos.
3. "Faltas evitadas" = (taxa antes - taxa atual) x agendamentos do período, SEMPRE rotulado como estimativa, com a fórmula
   visível ao tocar na informação. Não afirme causalidade.
4. Resumo mensal por e-mail ao dono, com os mesmos números.
5. Crie a migração do que faltar (ex.: cancelado_em, taxa de falta inicial).
Testes com dados fixos cobrindo: período vazio, cancelamento reocupado, cancelamento não reocupado, baseline ausente.

Pronto quando: um seed com 30 dias de movimento gera o painel e o e-mail com números conferidos à mão.
```

### Semana 11 — Retorno automático
```
Objetivo: trazer o tutor de volta no momento certo.

1. Tabela de regras: intervalo de retorno em dias por serviço e pelagem, editável no painel, com padrão inicial de 30 dias.
2. Job diário: para cada pet cujo último atendimento concluído passou do intervalo e sem agendamento futuro, crie uma notificação
   de retorno. No máximo uma por pet por ciclo.
3. Respeite o consentimento: só envie a quem deu consentimento de marketing (campo separado do consentimento de contato),
   inclua opt-out em toda mensagem e trate a resposta "parar" imediatamente.
4. A mensagem leva a um link pré-preenchido para reagendar em um toque (mesmo pet, mesmo serviço, mesmo profissional quando houver vaga).
5. Registre a conversão (agendou em até 7 dias) e exiba no painel de resultados.
6. Registre a categoria da mensagem (marketing) para o controle de custo por loja.
Testes com relógio falso: sem duplicar, sem enviar a quem tem agendamento futuro, sem enviar sem consentimento, opt-out efetivo.

Pronto quando: a simulação de 60 dias gera os lembretes certos e a conversão aparece no painel.
```

### Semana 12 — Financeiro leve
```
Objetivo: o dono fecha o dia e o mês sem planilha. Sem nota fiscal, sem PDV completo, sem estoque.

1. Registrar pagamento no balcão ao concluir o atendimento (dinheiro, Pix direto, maquininha); pagamentos online entram sozinhos.
2. Caixa do dia por forma de pagamento, com fechamento simples e lançamento de despesas (descrição, categoria, valor).
3. Comissão por profissional (percentual editável) sobre atendimentos concluídos, com extrato por período e exportação em CSV.
4. Relatórios: faturamento por período, serviço e profissional; ticket médio; ocupação.
5. Permissões: apenas dono e gerente acessam o financeiro.
Valores sempre em centavos inteiros. Testes: comissão com cancelamento e falta, fechamento de caixa com estorno, permissões.

Pronto quando: o fechamento do mês do seed bate com o cálculo feito à mão.
```

### Semana 13 — Pós-banho com foto e histórico
```
Objetivo: foto de antes e depois enviada ao tutor.

1. Upload pelo celular da equipe (câmera), com compressão no cliente, em storage privado com URLs assinadas e limite de tamanho por foto e por loja.
2. Associe as fotos ao agendamento e ao pet; tipo antes ou depois; a loja decide se o tutor vê.
3. Envie a galeria ao tutor junto com o aviso de "pet pronto".
4. Histórico do pet no app do tutor, com as fotos.
5. Exclusão a pedido do tutor e rotina de remoção quando o pet ou o tutor é apagado.
Testes: RLS (tutor só vê as fotos dos próprios pets e só as liberadas), URLs expiram, exclusão remove o arquivo.

Pronto quando: a equipe tira as fotos no painel e o tutor as vê no app e pelo link da mensagem.
```

### Semana 14 — Pacotes e recorrência
```
Objetivo: receita previsível e horário fixo para o cliente fiel.

1. Pacotes pré-pagos (ex.: 4 banhos): venda no painel e pelo app (pagamento pelo módulo existente), saldo por pet, validade e aviso de saldo acabando.
2. Ao agendar, o tutor pode usar o saldo; o agendamento consome uma unidade e o valor cobrado é zero.
3. Recorrência: horário fixo (dia da semana, hora, intervalo em semanas, profissional). Gere agendamentos até 8 semanas à frente de forma idempotente.
   Se o horário ou profissional estiver indisponível, proponha alternativas e avise o tutor. Permita pausar e cancelar.
4. A geração usa o motor de disponibilidade; nunca grave por fora dele.
5. Assinatura com cobrança automática: não implementar agora; deixe a estrutura pronta.
Testes: consumo e expiração de saldo, geração sem duplicar, conflito na geração, cancelamento de recorrência.

Pronto quando: um tutor de teste compra o pacote, agenda com saldo e tem um horário fixo gerado por 8 semanas.
```

### Semana 15 — Horários ociosos com desconto
```
Objetivo: preencher a agenda nos horários fracos.

1. Regras de promoção: dia da semana, faixa de horário, serviços, desconto %, validade e ativa/inativa.
2. Sugestão automática: liste os horários da próxima semana com ocupação abaixo de um limite configurável.
3. O desconto é calculado no back-end e aparece no fluxo do tutor (preço original riscado e preço final), sem quebrar o total do pedido.
4. Divulgação: botão "avisar clientes" que envia mensagem de marketing só a tutores com consentimento, segmentados por serviço e tempo sem agendar,
   com limite de frequência. Antes de enviar, mostre a quantidade de destinatários e o custo estimado.
5. Meça receita incremental e taxa de preenchimento dos horários promovidos.
Testes: desconto aplicado só na faixa certa, promoções que se sobrepõem (vale a de maior desconto), consentimento, limite de frequência.

Pronto quando: crio uma promoção para terça de manhã e vejo o desconto no fluxo, a lista de destinatários e o custo antes do envio.
```

---

## Dicas de uso
- Se um prompt estourar o contexto, divida pelas tarefas numeradas e rode uma por vez.
- Peça sempre: "liste o que você assumiu" no final. As suposições erradas aparecem aí.
- Ao fim de cada semana, atualize o CLAUDE.md com o que mudou (decisões, convenções). Ele é a memória do projeto.
