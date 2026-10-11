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
- WhatsApp: Meta Cloud API ou Z-API
- Pix: Asaas (split) ou Mercado Pago
- Testes: Vitest (unitários), Playwright (fluxo ponta a ponta)

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

## Primeira tarefa para o Claude Code
Aplicar `schema.sql` e depois `002_requisitos_mvp.sql` como migrações em Supabase, gerar os tipos TypeScript, e criar o motor de disponibilidade (`lib/disponibilidade.ts`) com testes cobrindo: sobreposição, buffer, folga do profissional, bloqueios, fim de expediente, vários serviços em sequência, horário específico por serviço e "qualquer profissional".
