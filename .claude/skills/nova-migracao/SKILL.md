---
name: nova-migracao
description: Use ao mudar o banco do Hora do Pet (tabela, coluna, função SQL, RLS, trigger). Cria a migração nova com RLS, seed da loja Moema, tipos e testes.
---

# Nova migração

Regras que não mudam (CLAUDE.md, "Princípios de arquitetura"):
- Nunca edite uma migração que já está em `supabase/migrations/`. Crie um arquivo novo.
- Toda tabela de negócio tem `petshop_id` e RLS. Regra de disponibilidade e criação de pedido ficam em SQL (RPC).
- `pedido`, `agendamento` e `agendamento_item` só são criados por `criar_pedido`: não crie política de INSERT para eles.

## Passos

1. Nome do arquivo: `supabase/migrations/AAAAMMDD0000NN_<assunto>.sql`, com `NN` = último número + 1
   (`ls supabase/migrations | tail -1`). Comece com um comentário em português dizendo o que a migração faz.
2. Tabela nova com `petshop_id`:
   - `alter table ... enable row level security` e políticas usando as funções do schema `app`
     (veja as migrações anteriores antes de inventar uma nova).
   - Índice que comece por `petshop_id` (toda consulta filtra loja + intervalo de tempo).
   - Pelo menos uma linha da loja Moema (`LOJA.moema` em `tests/helpers/ids.ts`) em `supabase/seed.sql`. Sem isso `tests/rls/cobertura.test.ts` falha.
3. Função chamada pelo front-end: `security definer` só quando necessário, com `set search_path = ''`, e
   conferindo o papel com as funções de `app` (dono, gerente, atendente, profissional).
4. Horário informado pela loja é local: converta com `petshop.fuso` no banco.
5. Rode, nesta ordem (Supabase local no ar; se não estiver, use a skill `subir-ambiente`):
   ```bash
   pnpm db:reset
   pnpm db:types
   pnpm test tests/rls tests/db
   ```
6. Escreva o teste em `tests/db/` (integridade) ou `tests/rls/` (quem vê o quê), usando `emTransacao` e
   `usuario(id)` / `ANON` de `tests/helpers/db.ts` e datas de `tests/helpers/datas.ts`. Mudança em
   disponibilidade de horários sempre exige teste.
7. Antes do PR, peça a revisão do agente `revisor-seguranca` (e do `revisor-disponibilidade` se mexeu em
   horários, pedido ou agendamento).

Lembrete: migrações só chegam aos bancos hospedados pelos workflows de deploy. Nunca rode `db push` nem o seed
em staging ou produção.
