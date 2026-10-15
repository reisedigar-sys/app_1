# Agenda Pet — App de agendamento de banho e tosa

## Visão
SaaS multi-tenant para petshops agendarem banho e tosa. Cada petshop é um *tenant*.
Fase 1: app/PWA individual por loja (white-label leve, página pública por loja).
Fase 2 (longo prazo): marketplace estilo iFood lendo e escrevendo nas MESMAS agendas.

## Princípios de arquitetura (não violar)
1. **Multi-tenant desde o dia 1**: toda tabela de negócio tem `petshop_id`. Isolamento via Row Level Security (RLS).
2. **Agenda única**: todo agendamento tem `canal` (app_proprio, marketplace, balcao, whatsapp). A mesma lógica de disponibilidade atende todos os canais.
3. **Tutor é identidade global**; o vínculo com cada loja fica em `tutor_petshop`.
4. **Regras de negócio no back-end** (funções/API). A interface só consome.
5. **Pagamento com split** desde o início (loja recebe, plataforma retém comissão). Comissão = 0 para clientes vindos do app próprio da loja.
6. **Sem overbooking**: conflito de horário é impedido no banco (constraint de exclusão), não só no código.

## Stack
- Next.js (App Router) + TypeScript + Tailwind, PWA
- Supabase (Postgres, Auth, Realtime, RLS, Edge Functions)
- Vercel (hospedagem)
- WhatsApp: Meta Cloud API (oficial; não usar Z-API ou outras APIs não oficiais)
- Pix: Asaas (subconta por loja + split)
- Testes: Vitest (unitários e banco), Playwright (fluxo ponta a ponta)
- Node 22, pnpm, ESLint, Prettier. Next.js 16: middleware se chama `proxy.ts`; leia `AGENTS.md` e `node_modules/next/dist/docs/` antes de usar APIs do Next

## Como trabalhar no repositório
Pré-requisitos: Node 22+, pnpm 10 e Docker em execução (o Supabase roda local).

```bash
pnpm install
pnpm db:start               # sobe o Supabase local e aplica migrações + seed
cp .env.example .env.local  # SUPABASE_SECRET_KEY = SECRET_KEY de `pnpm exec supabase status -o env`
pnpm dev                    # http://localhost:3000
```

| Comando | Quando usar |
| --- | --- |
| `pnpm check` | Antes de todo commit/PR: lint + tipos + testes (o mesmo que o CI) |
| `pnpm test` | Vitest; precisa do Supabase local rodando. Um arquivo: `pnpm test tests/db/integridade.test.ts` |
| `pnpm db:reset` | Recria o banco do zero (migrações + `supabase/seed.sql`) após criar/alterar migração ou seed |
| `pnpm db:types` | Regera `lib/supabase/database.types.ts` após mudar o banco; o CI falha se estiver desatualizado (`db:types:check`) |
| `pnpm build` | Build de produção (também roda no CI) |

Onde fica cada coisa:
- `app/` — Next.js App Router (`manifest.ts` = PWA). `proxy.ts` renova a sessão do Supabase a cada requisição.
- `lib/supabase/` — `client.ts` (navegador, sujeito ao RLS), `server.ts` (servidor com a sessão do usuário),
  `admin.ts` (chave secreta, ignora RLS, `server-only`: nunca importar em componente de cliente),
  `database.types.ts` (gerado; não editar à mão), `env.ts` (leitura das variáveis).
- `supabase/migrations/` — schema, funções de autorização (schema `app`) e políticas de RLS. `supabase/seed.sql` — dados de teste
  (usuários com senha `senha123`, listados no README).
- `tests/rls/` isolamento entre lojas e por papel; `tests/db/` integridade (overbooking, buffer, faltas, horários);
  `tests/api/` login e leitura pela API real. `tests/helpers/db.ts` executa SQL como um papel (`ANON`, `usuario(id)`),
  do jeito que o PostgREST faz com o JWT.

Cuidados:
- Tabela nova com `petshop_id` precisa de RLS e de ao menos uma linha na loja Moema no seed:
  `tests/rls/cobertura.test.ts` a descobre sozinho e falha se faltar.
- Regra de disponibilidade e criação de agendamento ficam em funções SQL chamadas por RPC; o front-end só consome.
- Imports usam o alias `@/` (raiz do repositório).
- Documentação de apoio: `README.md` (setup e banco), `PLANO-MVP.md` (plano semana a semana), `PLANO-CRESCIMENTO.md` (Meta 1),
  `PROMPTS-CLAUDE-CODE.md` (prompts por semana). Ao fim de cada semana, atualize a seção "Estado atual" abaixo.

## Regras de negócio
- Duração do serviço depende de `porte` e `pelagem` (tabela `servico_preco`).
- Preço também varia por porte/pelagem.
- Agendamento ocupa o profissional de `inicio` até `fim` (+ buffer de limpeza configurável por loja).
- Cancelamento: gratuito até X horas antes (configurável por loja); depois, retém o sinal.
- Sinal via Pix opcional, configurável por loja (percentual ou valor fixo).
- Lembretes WhatsApp: D-1 (confirmar), 2h antes, e "pet pronto".
- Lista de espera: ao cancelar, oferecer o horário ao próximo da fila.
- Status do agendamento: `agendado → confirmado → em_atendimento → pronto → concluido` (ou `cancelado`, `faltou`).

## Convenções de código
- Idioma de domínio em português (tabelas e campos), código e commits em inglês é aceitável; manter consistência.
- Commits pequenos, uma branch por funcionalidade.
- Toda mudança em disponibilidade de horários exige teste.
- Migrações versionadas em `supabase/migrations/`. Nunca editar migração já aplicada; criar nova.
- Nunca expor chave `service_role` no front-end.
- LGPD: registrar consentimento de contato (WhatsApp) por loja em `tutor_petshop.consentimento_contato_em`; marketing em `tutor_petshop.consentimento_marketing_em`.

## Roadmap
**Fase 0 — Validação (semana 0–1)**: entrevistar 3–5 petshops; fechar 2–3 pilotos.
**Fase 1 — MVP (semanas 1–9, detalhe no PLANO-MVP.md)**
1. Schema + RLS + seeds
2. Auth (loja e tutor) e onboarding da loja (serviços, preços, profissionais, horários)
3. Cadastro de tutor e pet
4. Fluxo de agendamento do tutor (3–4 toques) + motor de disponibilidade (com testes)
5. Painel da loja: agenda diária/semanal, mudança de status, bloqueios
6. Lembretes WhatsApp + notificação "pet pronto"
7. Pix com sinal
**Fase 2 — Diferenciais (após o piloto, ver PLANO-MVP.md)**: painel de resultados ("faltas evitadas" sempre como estimativa), retorno automático, financeiro leve, fotos antes/depois, pacotes e recorrência, desconto em horários ociosos. Estoque, nota fiscal e taxi dog só se as lojas pedirem. Mensagens de retorno e promoção são de marketing: exigem consentimento próprio, opt-out e controle de custo.
**Fase 3 — Escala (meses 4–6)**: onboarding self-service, cobrança de mensalidade, importação de clientes, página de vendas e indicação, 15–30 lojas.
**Meta 1 — 240 lojas pagando (até ~18 meses após o piloto)**: primeira meta do projeto (decidida em 14/10/2026), com três frentes: recursos que vendem, qualidade e consistência, campanha regional e depois nacional. Detalhe em `PLANO-CRESCIMENTO.md`.
**Fase 4 — Marketplace**: depende de densidade regional de lojas (consequência da Meta 1); busca por região, avaliações, comissão, app nativo se necessário.

## Requisitos adicionais (migração 002)
- Uma visita tem UM profissional e pode ter vários serviços; só pode ser escolhido quem estiver habilitado em todos eles (`profissional_servico`). O overbooking é travado em `agendamento`.
- Canais de entrada: app próprio, WhatsApp (bot guiado + atendente), balcão e, no futuro, marketplace. Todos usam a mesma função `criar_pedido` com o campo `canal`. O tutor é identificado pelo telefone (`telefone_e164`).
- `profissional_servico` define quem faz o quê; `horario_trabalho.servico_id` define janelas por tipo de serviço: se o profissional tem janelas específicas para um serviço, só elas valem para esse serviço, em todos os dias (ex.: tosa só terça e quinta).
- Anti no-show: fila `notificacao_agendada` (worker com SKIP LOCKED), confirmação por token, contador de faltas e sinal obrigatório após faltas.
- Meta de escala: 1.000 petshops. Toda consulta filtra por `petshop_id` + intervalo de tempo.
- Fluxo do tutor segue `fluxo-agendamento-referencia.md`: serviço principal (escolha única) + adicionais, unidade por localização/CEP/lista (rede com várias unidades), data e hora OU profissional, vários pets no mesmo pedido (`pedido`), grade de 15 min (`petshop.slot_minutos`).
- Plano detalhado em `PLANO-MVP.md`.

## Decisões tomadas (antes da semana 1)
- **Motor de disponibilidade em SQL**: `dias_com_vaga`, `horarios_do_dia`, `profissionais_disponiveis` e `criar_pedido` são funções Postgres chamadas via RPC. O TypeScript não reimplementa regra de disponibilidade.
- **"Qualquer profissional"**: o horário aparece se algum profissional habilitado tiver vaga; ao confirmar, escolhe quem tem menos minutos agendados no dia; empate → `profissional.ordem`.
- **Buffer gravado no agendamento** (`agendamento.buffer_minutos`); a coluna `ocupado = [inicio, fim + buffer)` é mantida por trigger e usada na constraint `agendamento_sem_conflito`. Mudar o buffer da loja não afeta agendamentos existentes.
- **Comissão**: zero para app próprio, balcão e WhatsApp; só o canal `marketplace` paga `comissao_marketplace_pct`.
- **Consentimento LGPD por loja** em `tutor_petshop.consentimento_contato_em`; marketing em `consentimento_marketing_em` (separado).
- **Dados entre lojas**: tutor e pet são globais só no essencial. Observações (`tutor_petshop.observacoes`, `pet_petshop`), faltas e histórico ficam por loja.
- **Rede com várias unidades**: tenant = unidade (`petshop_id`); `rede_membro` dá ao dono da rede acesso a todas as unidades.
  O dono da rede abre unidades (`criar_unidade`) e pode copiar o catálogo entre unidades da mesma rede (`copiar_catalogo`):
  categorias, serviços, preços e tempos; nunca entre redes diferentes. Equipe, habilitação e horários são de cada unidade.
- **Papéis** (`petshop_membro.papel`): dono (tudo, inclusive equipe), gerente (configuração), atendente (agenda), profissional (só a própria agenda).
- **Sinal após faltas**: a semana 6 só conta faltas e marca `tutor_petshop.exige_sinal`; a cobrança entra na semana 8.
- **Encaixe**: `criar_pedido(..., encaixe => true)`, só para equipe; ignora a grade, nunca a constraint.
- **Pedido e agendamento só são criados por `criar_pedido`**: não há política de INSERT para `pedido`, `agendamento` e `agendamento_item`.
- **Edição direta de agendamento** (equipe, via RLS) só altera `status` e `observacoes` (permissão por coluna, migração 006). Horário e profissional mudam só por funções do back-end (remarcar, semana 5).

## Convenções do front-end (Next.js 16 com cacheComponents)
- Tudo que lê sessão/cookies fica dentro de `<Suspense>`; `lib/supabase/server.ts` chama `connection()`.
- Autorização: RLS no banco + `lib/painel/sessao.ts` (`exigirLoja`) nas telas. Server Actions começam com `iniciarAcao` e
  conferem linhas afetadas (`.select()`) para responder "sem permissão".
- O roteador mantém telas visitadas escondidas no DOM: não use `id` fixo em campos (o rótulo envolve o campo) e, nos
  testes E2E, use os helpers de `e2e/util.ts`, que miram só elementos visíveis.
- IDs: valide com `z.guid()` (os IDs do seed não são UUID v4).
- Horário informado pela loja é local: a conversão para UTC é feita no banco com `petshop.fuso` (ex.: `criar_bloqueio`).
- Painel: menu do dia a dia (Hoje, Agenda, Clientes, Espera, Mensagens, Configurar) fica embaixo no celular; as telas de
  configuração ficam em "Configurar" (`/painel/{loja}/configurar` + menu "Configuração da loja"). Sem `visao` na URL,
  a agenda abre em lista no celular (pelo user-agent) e em colunas no computador; os testes E2E rodam como celular.
- Clientes (migração 014): `clientes_da_loja` busca por nome do tutor ou do pet (sem acento, `app.sem_acento`) ou
  por 4+ dígitos do telefone; só dono, gerente e atendente. "Agendar de novo" abre `/agenda/novo?cliente=&pet=` com os
  serviços do último atendimento do pet.
- Resultados (migração 015): `resultados_do_mes` (só dono e gerência) e `petshop_indicador.faltas_antes_pct`
  (referência informada pela loja, fora de `petshop` porque a loja é pública). "Faltas evitadas" é sempre estimativa:
  taxa de antes × atendimentos realizados − faltas reais (`lib/painel/resultados.ts`).
- Preços (`/precos`): "Preço para todas", "Mesmo preço e tempo para todos" (abre assim em adicional sem tabela),
  copiar a tabela de outro serviço e aviso antes de trocar de serviço sem salvar (`lib/painel/precos.ts`). Valores
  aceitam vírgula ou ponto como decimal ("45.90" = R$ 45,90; `reaisParaCentavos`).

## Estado atual
- Semana 1 (fundação) concluída.
- Semana 2 (onboarding da loja) concluída: migração 003, login da equipe, painel com checklist e telas de configuração,
  testes de banco e E2E (Playwright).
- Equipe: só entra quem já tem conta (convite por e-mail fica para depois).
- Semana 3 (motor de disponibilidade) concluída: migração 004 (`dias_com_vaga`, `horarios_do_dia`,
  `profissionais_disponiveis`, `criar_pedido`), `lib/disponibilidade.ts`, testes do motor e relatório de desempenho no
  README (p95 < 25 ms com 1.000 lojas; sem cache). Também: `criar_unidade` e `copiar_catalogo` (migração 005).
- Testes de agenda usam datas relativas (`tests/helpers/datas.ts`): a janela máxima da loja é de até 365 dias.
- Semana 4 (lado do tutor) concluída: migração 007, `/{slug}`, `/{slug}/agendar` (5 etapas), `/conta` (login por
  e-mail, perfil, pets, agendamentos com remarcar/cancelar) e E2E do fluxo com 2 pets.
- Ambientes no ar (13/10/2026): staging = prévia da `main` na Vercel + Supabase `hora-do-pet-staging`; produção =
  `hora-do-pet.vercel.app` + Supabase `hora-do-pet-prod`. Migrações chegam aos bancos só pelos workflows de deploy
  (nunca rodar `db push` à mão nem o seed num banco hospedado); produção só por PR `main` → `producao`, aprovado pelo
  dono. Nunca fazer push direto na `producao`. Andamento das semanas em `PLANO-MVP.md` ("Andamento").
- Hospedado ≠ local: no Supabase online a confirmação de e-mail está ligada e, sem SMTP próprio (Resend), só chegam
  e-mails para os membros da organização. Trate `signUp` sem sessão (as telas já mostram "confirme o e-mail").
- Marca: **Hora do Pet** (provisória) nos títulos, manifesto do PWA e README; o nome do pacote continua `agenda-pet`.
- Semana 5 (painel da loja) concluída e em produção (14/10/2026): migração 008 (`agenda_loja`, transições de status por trigger, balcão com
  `buscar_tutor_balcao`/`cadastrar_tutor_balcao`/`cadastrar_pet_balcao`, `horario_da_loja`, `agendamento` no Realtime),
  `/painel/{loja}/agenda` (dia/semana, filtros, ao vivo), novo atendimento com encaixe, remarcar, ficha do pet.
- Semana 6 (anti no-show) concluída e em produção (14/10/2026): migrações 009–010 (fila programada por trigger em
  `agendamento`, worker `worker_reservar`/`worker_concluir` com SKIP LOCKED, link `/c/{token}`, prazo de confirmação,
  lista de espera, `dispensar_sinal`, pg_cron → Edge Function `notificacoes`), telas Mensagens e Lista de espera.
- Semana 7a (mensagens de verdade e app da loja) em revisão: migrações 011–012 (`modelo_mensagem`, `push_inscricao`,
  `whatsapp_status`/`whatsapp_receber`, `minhas_lojas`, `mensagens_do_mes`, `petshop.logo_url`), worker com WhatsApp
  (Meta Cloud API) e Web Push, Edge Function `whatsapp` (webhook), `/{slug}/manifest.webmanifest` e ícone por loja,
  `/conta/lojas`, avisos no celular (tutor e equipe). Sem os segredos da Meta, o worker continua no provedor de teste.
- Próximo: 7b (bot de agendamento no número da loja), depois de a 7a estar no ar e da aprovação como *Tech Provider*.

## Pendências fora do código (decisão ou ação do dono do produto)
- **Repositório público**: `reisedigar-sys/app_1` está público. Recomendado torná-lo privado
  (*Settings → General → Danger Zone → Change visibility*). Enquanto público, não versionar prints de terceiros,
  dados reais de pilotos nem segredos.
- **Ambientes (staging e produção)**: criados (Supabase, Vercel `hora-do-pet`, environments e ruleset no GitHub).
  Deploy em `.github/workflows/deploy-staging.yml` (migrações a cada merge na `main`) e `deploy-producao.yml`
  (PR `main` → `producao`, aprovação manual, banco antes do app). Estado e pendências (token da Vercel, Site URL do
  Auth, domínio, SMTP) em `docs/ambientes.md`. Nunca rodar o seed num banco hospedado.
- **Contas que demoram**: verificação da empresa na Meta (WhatsApp, semanas 6–7) e Asaas com sandbox e split (semana 8).
- **Marca da loja**: a página pública mostra nome, endereço e telefone; logo e cor ainda não existem no cadastro.
  Incluir se os pilotos pedirem (candidato para a semana 5).

## Ambiente de desenvolvimento (sessões na nuvem do Claude Code)
- O Docker do container pode parar entre sessões. Para subir de novo:
  `(dockerd > /tmp/dockerd.log 2>&1 &)`, esperar `docker ps` responder e então
  `pnpm exec supabase stop --no-backup; SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io pnpm db:start`.
  O registro padrão de imagens (public.ecr.aws) é bloqueado aqui; o Docker Hub funciona.
- Playwright: use o Chromium já instalado com `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium` (está no `.env.local`
  local, que não é versionado; recrie a partir do `.env.example` se precisar).
- Se o Docker Hub responder 429 (limite de downloads), puxe as imagens pelo espelho do Google e renomeie:
  `docker pull mirror.gcr.io/supabase/postgres:<versão> && docker tag mirror.gcr.io/supabase/postgres:<versão> supabase/postgres:<versão>`.
- Rode `pnpm db:types` só com o banco local no ar (o script não apaga mais os tipos se ele estiver fora).

## Decisões da semana 7
- **Número central só envia** (avisos de todas as lojas, nome da loja no texto). Quem escreve para ele recebe, no
  máximo a cada 12 h, o link das lojas onde é cliente. Agendar pelo WhatsApp só no número da própria loja (7b).
- **"PARAR" no número central** apaga a autorização de contato em todas as lojas (não dá para saber de qual loja a
  pessoa fala); no número da loja, só nela. Voltar: Minha conta → Minhas lojas, por loja.
- **Modelos**: o corpo em `modelo_mensagem` é o mesmo submetido à Meta (pt_BR, Utilidade); nunca começa nem termina
  com variável. Mudar o texto = novo modelo aprovado na Meta + migração.
- **Push é aviso a mais**: sai só na primeira tentativa; quem decide "enviada" é o WhatsApp (ou o push, quando é o
  único canal). A inscrição de push é a autorização do canal (não depende de `consentimento_contato_em`).
- **Avisos da equipe** (`equipe_novo_pedido`, `equipe_cancelamento`) só entram na fila se alguém da loja ligou o push;
  balcão não gera aviso. Profissional só recebe dos próprios atendimentos.
- **App da loja**: manifesto em `/{slug}/manifest.webmanifest` (`id` por loja, escopo `/`); ícone gerado com o logo
  (só PNG/JPG do bucket `fotos` do próprio projeto) ou as iniciais.
- **Staging**: `WHATSAPP_SOMENTE_PARA` limita o envio real aos telefones do número de teste da Meta.

## Decisões da semana 6
- **Mensagens são programadas no banco** (trigger `agendamento_notificacoes`), por qualquer caminho de criação,
  remarcação, cancelamento ou status. Lembretes são do PEDIDO: uma mensagem ligada ao primeiro agendamento ativo,
  listando os pets; cancelar um pet passa os lembretes para o próximo. O texto é montado na hora do envio (`app.mensagem`).
- **Nada sai** sem `consentimento_contato_em`, depois do início do atendimento, com mais de 2 h de atraso (lembretes)
  ou duas vezes. Lembrete da véspera entre 08:00 e 21:00 (constraint); o de X horas antes é pulado fora das 8h–21h.
- **Confirmação imediata e lembrete da véspera levam o link** `/c/{token}` (confirmar o pedido inteiro, remarcar ou
  cancelar sem login). Não há mensagem separada de "pedido de confirmação" (economia quando o WhatsApp cobrar).
- **Prazo de confirmação** (`confirmar_ate_horas`) só vale para quem recebeu o link antes do prazo; o pedido é tratado
  inteiro. `liberar_horario` cancela e avisa o tutor (não conta falta); `avisar_loja` manda o aviso ao telefone da loja
  e marca `sem_confirmacao_em` (selo na agenda).
- **Lista de espera sem reserva**: a cada rodada, o primeiro da fila de cada loja e dia é avisado se houver horário no
  período dele; o próximo só 30 min depois. Agendar para o mesmo dia tira o pet da fila.
- **Loja cancelou → tutor avisado**; o tutor que cancela não recebe mensagem.
- **Exigir sinal** continua automático e não volta sozinho; `dispensar_sinal` (dono/gerente) desliga.
- **Testes com relógio falso**: `worker_reservar(limite, p_agora)`. Use dias que outros testes não usam (pedidos de
  testes paralelos no mesmo horário esperam uns pelos outros).
- Worker em produção precisa de segredos configurados uma vez por projeto (`docs/ambientes.md`).
- **Deadlock entre testes paralelos**: `emTransacao` refaz a transação quando o Postgres acusa deadlock (40P01), e
  `apagarPedidos` limpa pedidos gravados de verdade (notificações antes do pedido). Não trate deadlock como resultado de teste.

## Decisões da semana 5
- **Status por trigger** (`agendamento_valida_status`): agendado ⇄ confirmado → em_atendimento → pronto → concluido;
  cancelado/falta só de agendado ou confirmado; falta só depois do início; desfazer um passo é permitido. A profissional
  só conduz o atendimento (em_atendimento, pronto, concluido). Vale para updates pela API; funções do back-end passam.
- Cancelar ou marcar falta cancela as notificações pendentes do agendamento (trigger), por qualquer caminho.
- **Balcão**: a busca por telefone só acha clientes da própria loja. Sem cliente, a loja cria um cadastro sem conta; se
  outra loja já criou um sem conta com o número, ele é reaproveitado. Cadastro com conta nunca é ligado pelo telefone.
- Telefone entra no canal `balcao` ("Balcão ou telefone"); não há canal `telefone`.
- Realtime no navegador: passar o token da sessão (`realtime.setAuth`) antes de entrar no canal, senão o RLS roda
  como anônimo e nada chega (`app/painel/[lojaId]/agenda/ao-vivo.tsx`).
- E2E: clientes de balcão criados nos testes têm nome "E2E …" e são apagados por `e2e/limpeza.ts`.

## Decisões da semana 4
- **Login do tutor só por e-mail** por enquanto. O telefone é obrigatório no perfil, mas não verificado: um cadastro
  feito no balcão (sem conta) e um com conta podem ter o mesmo número até a verificação por código (com o WhatsApp),
  que vai unir os dois. Ninguém assume o histórico de outra pessoa só digitando um telefone.
- **Unidade depois do serviço**: o catálogo é de cada unidade; o pedido é traduzido para a unidade escolhida pelo
  NOME do serviço (`unidades_para_pedido`). Só aparecem unidades com todos os serviços e preço para cada pet.
- **Pets atendidos na ordem em que foram escolhidos**; observações por pet vão juntas no campo do pedido.
- **Cancelar/remarcar é por pet** (agendamento). Remarcar passa pelo motor ignorando o próprio horário e mantém o
  profissional quando ele está livre. Fora do prazo gratuito, cancelar é permitido e o tutor é avisado.
- **Consentimento de contato** só é gravado quando o tutor marca a opção (desmarcar não apaga uma autorização anterior).
- **Depois de login/cadastro/perfil a navegação é uma carga completa** (`Estado.destino` em `FormAcao`): o cache do
  roteador guardava a tela que redirecionava para o login.
- **Avaliações**: as estrelas só aparecem quando há avaliações; a tela de avaliar fica para depois do MVP.
- **Repositório público**: os prints de referência (marca de terceiros e pessoas reais) não são versionados.
