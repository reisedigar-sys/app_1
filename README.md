# Agenda Pet

SaaS multi-tenant para petshops agendarem banho e tosa. Visão, regras de negócio e decisões de arquitetura estão em
[`CLAUDE.md`](CLAUDE.md); o plano do MVP, em [`PLANO-MVP.md`](PLANO-MVP.md).

Stack: Next.js 16 (App Router, PWA) + TypeScript + Tailwind · Supabase (Postgres, Auth, RLS) · Vitest · pnpm.

## Como rodar

Pré-requisitos: Node 22+, pnpm 10 e Docker em execução.

```bash
pnpm install
pnpm db:start              # sobe o Supabase local e aplica migrações + seed
cp .env.example .env.local # preencha SUPABASE_SECRET_KEY com o SECRET_KEY de `pnpm exec supabase status -o env`
pnpm dev                   # http://localhost:3000
```

| Comando | O que faz |
| --- | --- |
| `pnpm test` | Testes (precisa do Supabase local rodando) |
| `pnpm test:e2e` | Testes ponta a ponta (Playwright, celular). Sobe o `pnpm dev` sozinho se nada estiver na porta 3100 |
| `pnpm check` | Lint + tipos + testes |
| `pnpm db:reset` | Recria o banco do zero: migrações + `supabase/seed.sql` |
| `pnpm db:types` | Regera `lib/supabase/database.types.ts` depois de mudar o banco |
| `pnpm db:stop` | Para o Supabase local |

Studio, e-mail de teste e Edge Functions ficam desligados no `db:start` para subir mais rápido. Para usá-los, rode
`pnpm exec supabase start` sem `-x`.

Sem download de navegador (ex.: container sem acesso), aponte o Playwright para um Chromium local com
`PW_CHROMIUM_PATH=/caminho/do/chrome` no `.env.local` ou no ambiente.

## Painel da loja (`/painel`)

Login por e-mail em `/entrar`. Quem ainda não tem loja cai em `/painel/nova-loja`. Em `/painel/{loja}`:
checklist de onboarding, dados da loja, profissionais (com foto), serviços e categorias, grade de preço/duração por
porte × pelagem (com cópia entre portes), quem faz o quê, horários (gerais e por serviço), bloqueios e equipe.
Dono e gerente configuram; atendente vê e cria bloqueios; só o dono administra a equipe.

## Estrutura

```
app/                       Next.js (App Router); manifest.ts = PWA
  entrar/                  login e cadastro da equipe
  painel/                  painel da loja (Server Components + Server Actions)
components/                componentes de interface
lib/painel/                sessão/autorização, validação e formatos do painel
e2e/                       testes ponta a ponta (Playwright)
lib/supabase/
  client.ts                cliente do navegador (chave pública, sujeito ao RLS)
  server.ts                cliente do servidor com a sessão do usuário (cookies)
  admin.ts                 chave secreta, ignora RLS — só servidor ("server-only")
  database.types.ts        tipos gerados do banco (não editar à mão)
proxy.ts                   renova a sessão do Supabase a cada requisição
supabase/
  migrations/              migrações versionadas — nunca editar uma já aplicada
  seed.sql                 dados de teste
tests/
  rls/                     isolamento entre lojas e por papel
  db/                      integridade: overbooking, buffer, faltas, horários
  api/                     login e leitura pela API real (Auth + PostgREST)
```

## Banco de dados

- `20261011000001_schema_base.sql`: rede, loja, equipe, catálogo, preços por porte × pelagem, horários, bloqueios,
  tutor/pet, pedido e agendamento, funções de autorização (schema `app`) e políticas de RLS.
- `20261011000002_requisitos_mvp.sql`: fila de notificações, log de mensagens, contador de faltas, lista de espera,
  WhatsApp (número por loja, idempotência do webhook, sessão do bot) e avaliações.
- `20261011000003_onboarding.sql`: `criar_rede_e_loja`, `adicionar_membro`/`listar_equipe`, `checklist_onboarding`,
  `criar_bloqueio` (horário local da loja → UTC no banco), bucket `fotos` e proteção da comissão da plataforma.
- `20261011000004_disponibilidade.sql`: motor de disponibilidade (`dias_com_vaga`, `horarios_do_dia`,
  `profissionais_disponiveis`) e `criar_pedido`.
- `20261011000005_copiar_catalogo.sql`: `criar_unidade` e `copiar_catalogo` entre unidades da mesma rede.

Garantias no próprio banco:

- **Isolamento**: toda tabela de negócio tem `petshop_id` e RLS. Chaves estrangeiras compostas `(id, petshop_id)`
  impedem que um registro aponte para dados de outra loja.
- **Sem overbooking**: constraint de exclusão `agendamento_sem_conflito` sobre `[inicio, fim + buffer)` por profissional,
  ignorando cancelados e faltas.
- **Faltas**: marcar `faltou` incrementa `tutor_petshop.faltas`; acima de `petshop.limite_faltas`, `exige_sinal = true`.

## Motor de disponibilidade

Funções SQL chamadas via RPC; `lib/disponibilidade.ts` é só a camada tipada (e traduz os códigos de erro).

| Função | Para quê |
| --- | --- |
| `dias_com_vaga(loja, itens, mês, profissional?)` | Calendário: dias do mês com ao menos um horário |
| `horarios_do_dia(loja, itens, data, profissional?)` | Horários na grade da loja; sem profissional = "qualquer" |
| `profissionais_disponiveis(loja, itens, início)` | Quem pode atender naquele horário, com a retirada estimada |
| `criar_pedido(loja, tutor, itens, início, canal, chave, …)` | Única porta de entrada para agendar (app, balcão, WhatsApp, marketplace) |

`itens` = um objeto por pet, na ordem de atendimento: `{ "pet_id": "…", "servicos": [principal, adicionais…] }` (ou
`porte`/`pelagem` no lugar de `pet_id`, para quem ainda não fez login). Erros: `AG001` horário indisponível, `AG002`
pedido inválido, `AG003` serviço sem preço para o porte/pelagem, `AG004` fora do período de agendamento.

### Desempenho (1.000 lojas)

Seed de carga em `supabase/perf/seed_1000_lojas.sql`: 1.000 lojas, 3 profissionais cada, agenda aberta por 60 dias
com metade ocupada (451 mil agendamentos, 60 mil preços). Medição com `node scripts/perf-disponibilidade.mjs 300`
(300 lojas sorteadas, consulta como visitante, banho + hidratação), Supabase local:

| Consulta | p50 | p95 | máx |
| --- | --- | --- | --- |
| `dias_com_vaga` (mês inteiro) | 14 ms | 18 ms | 23 ms |
| `dias_com_vaga` (mês atual) | 11 ms | 16 ms | 18 ms |
| `horarios_do_dia` | 10 ms | 14 ms | 17 ms |
| `profissionais_disponiveis` | 10 ms | 13 ms | 16 ms |

Bem abaixo da meta de 300 ms: **não há cache por loja e mês** por enquanto. Refazer a medição na semana 9 (k6, com
rede e pooler) antes do piloto. Para limpar o banco depois do seed de carga: `pnpm db:reset`.

### Usuários do seed (senha `senha123`)

| E-mail | Papel |
| --- | --- |
| renata@petfeliz.test | dona da rede Pet Feliz (Centro e Zona Sul) |
| gabriel@petfeliz.test | gerente da Pet Feliz Centro |
| alice@petfeliz.test | atendente da Pet Feliz Centro |
| paula@petfeliz.test | profissional da Pet Feliz Centro |
| diego@banhoecia.test | dono da Banho & Cia Moema |
| ana@tutor.test | tutora (pets Thor e Mel), cliente da Centro e da Moema |
| bruno@tutor.test | tutor (pets Luna e Bob), cliente da Zona Sul e da Moema |

## Testes de RLS

`tests/rls/cobertura.test.ts` descobre sozinho todas as tabelas com `petshop_id` e verifica, para cada uma, que a equipe
de uma loja, a dona de outra rede e a tutora não leem nem alteram nada da loja Moema além do catálogo público, e que
visitantes só leem o catálogo. Uma tabela nova entra no teste automaticamente; o seed precisa ter ao menos uma linha
dela na loja Moema (o próprio teste avisa).
