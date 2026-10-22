---
name: abrir-pr
description: Use antes de abrir ou atualizar um pull request no app_1. Roda as verificações do CI, monta a descrição em português e atualiza a documentação do projeto quando fecha uma etapa.
---

# Abrir PR

1. **Verificações** (as mesmas do CI):
   ```bash
   pnpm check            # lint + tipos + testes (precisa do Supabase local)
   pnpm db:types:check   # se mudou o banco
   pnpm build            # se mudou telas ou config do Next
   ```
   Teste que falha não é desligado nem pulado: corrija ou explique no PR.
2. **Revisores**: rode os agentes que se aplicam ao diff e corrija o que eles acharem:
   - banco, RLS, funções SQL → `revisor-seguranca`
   - horários, pedido, agendamento, motor de disponibilidade → `revisor-disponibilidade`
   - telas → `revisor-celular`
3. **Commits** pequenos, em inglês ou português (manter o do resto do branch), uma branch por funcionalidade.
4. **Descrição do PR** em português, para quem não lê código:
   - O que muda para a loja e para o tutor (uma linha cada).
   - Migrações novas e o que fazem.
   - Como testar no preview da Vercel, passo a passo.
   - Prints: link para a pasta em `/mnt/project-files/layout/`.
5. **Documentação**: se o PR fecha uma semana ou etapa, atualize "Estado atual" no `CLAUDE.md` e o
   "Andamento" do `PLANO-MVP.md`. Decisão nova de produto vai na seção "Decisões" da semana.
6. **Nunca** faça merge: quem decide é o Edigar. Nunca faça push na `producao`.

Repositório público: nada de segredos, dados reais de pilotos, preços praticados de
verdade (planos do Hora do Pet ou de pilotos) ou prints de terceiros no diff.
