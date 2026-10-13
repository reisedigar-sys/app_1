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
- Documentação de apoio: `README.md` (setup e banco), `PLANO-MVP.md` (plano semana a semana),
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
- LGPD: registrar consentimento de contato (WhatsApp) em `tutor.consentimento_contato_em`.

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
**Fase 3 — Escala (meses 4–6)**: onboarding self-service, cobrança de mensalidade, 15–30 lojas.
**Fase 4 — Marketplace (6–12+ meses)**: busca por região, avaliações, comissão, app nativo se necessário.

## Requisitos adicionais (migração 002)
- Uma visita tem UM profissional e pode ter vários serviços; só pode ser escolhido quem estiver habilitado em todos eles (`profissional_servico`). O overbooking é travado em `agendamento`.
- Canais de entrada: app próprio, WhatsApp (bot guiado + atendente), balcão e, no futuro, marketplace. Todos usam a mesma função `criar_agendamento` com o campo `canal`. O tutor é identificado pelo telefone (`telefone_e164`).
- `profissional_servico` define quem faz o quê; `horario_trabalho.servico_id` define janelas por tipo de serviço (janela do serviço substitui a geral).
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
- **Papéis** (`petshop_membro.papel`): dono (tudo, inclusive equipe), gerente (configuração), atendente (agenda), profissional (só a própria agenda).
- **Sinal após faltas**: a semana 6 só conta faltas e marca `tutor_petshop.exige_sinal`; a cobrança entra na semana 8.
- **Encaixe**: `criar_pedido(..., encaixe => true)`, só para equipe; ignora a grade, nunca a constraint.
- **Pedido e agendamento só são criados por `criar_pedido`**: não há política de INSERT para `pedido`, `agendamento` e `agendamento_item`.

## Estado atual
- Semana 1 (fundação) concluída: migrações `supabase/migrations/…0001_schema_base.sql` e `…0002_requisitos_mvp.sql`, seeds, tipos gerados, clientes Supabase, testes de RLS e CI. Ver README.
- Próximo: semana 2 (onboarding da loja). Pendência: criar rede/loja pelo app precisa de uma função `criar_rede_e_loja` (hoje não há política de INSERT em `rede`).
