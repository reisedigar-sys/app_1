---
name: levar-para-producao
description: Use quando o Edigar pedir para levar a main para produção. Monta o PR main → producao com o que muda e o passo a passo da aprovação.
---

# Levar para produção

O fluxo está em `docs/ambientes.md` e `.github/workflows/deploy-producao.yml`. Produção só muda por PR
`main` → `producao`, aprovado e mergeado pelo Edigar. Nunca faça push direto na `producao`.

1. Compare as branches e liste os PRs que entram (`main` à frente de `producao`).
2. Confira que o CI da `main` está verde e que o staging está no ar com a última versão.
3. Abra o PR `main` → `producao` com:
   - Lista dos PRs incluídos, uma linha cada, em linguagem de loja/tutor.
   - Migrações novas (o workflow aplica o banco antes do app).
   - Edge Functions alteradas e segredos novos que precisam existir em produção (só os nomes, nunca valores).
   - Riscos e como voltar atrás.
4. Escreva para o Edigar o passo a passo, clique a clique:
   1. Fazer o merge do PR.
   2. Abrir *Actions → Deploy produção → Review deployments* e aprovar.
   3. Depois que terminar, abrir https://hora-do-pet.vercel.app e conferir uma tela.
5. Depois do deploy, atualize a memória do projeto com a data em que staging e produção ficaram iguais.
