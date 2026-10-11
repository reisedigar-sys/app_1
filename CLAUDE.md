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
**Fase 3 — Escala (meses 4–6)**: onboarding self-service, cobrança de mensalidade, 15–30 lojas.
**Fase 4 — Marketplace (6–12+ meses)**: busca por região, avaliações, comissão, app nativo se necessário.

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

## Estado atual
- Semana 1 (fundação) concluída.
- Semana 2 (onboarding da loja) concluída: migração 003, login da equipe, painel com checklist e telas de configuração,
  testes de banco e E2E (Playwright).
- Equipe: só entra quem já tem conta (convite por e-mail fica para depois).
- Semana 3 (motor de disponibilidade) concluída: migração 004 (`dias_com_vaga`, `horarios_do_dia`,
  `profissionais_disponiveis`, `criar_pedido`), `lib/disponibilidade.ts`, testes do motor e relatório de desempenho no
  README (p95 < 25 ms com 1.000 lojas; sem cache). Também: `criar_unidade` e `copiar_catalogo` (migração 005).
- Testes de agenda usam datas relativas (`tests/helpers/datas.ts`): a janela máxima da loja é de até 365 dias.
- Próximo: semana 4 (lado do tutor).
