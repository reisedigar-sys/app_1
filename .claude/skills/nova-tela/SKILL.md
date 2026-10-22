---
name: nova-tela
description: Use ao criar ou mudar uma tela do Hora do Pet (painel da loja ou lado do tutor). Segue as convenções do Next.js 16 do projeto, autorização e testes E2E.
---

# Nova tela

Antes de usar uma API do Next, leia `AGENTS.md` e o guia em `node_modules/next/dist/docs/`. É o Next.js 16 com
`cacheComponents`: o middleware se chama `proxy.ts`.

## Checklist

- **Sessão dentro de `<Suspense>`**: tudo que lê cookies ou sessão. `lib/supabase/server.ts` já chama `connection()`.
- **Autorização em duas camadas**: RLS no banco e, nas telas do painel, `exigirLoja(lojaId)` de
  `lib/painel/sessao.ts` (`podeConfigurar`, `podeOperar` para o papel).
- **Server Actions** começam com `iniciarAcao(form)` (`lib/painel/acao.ts`) e conferem as linhas afetadas
  (`.select()`) para responder "sem permissão".
- **Regra de negócio fica no banco.** A tela só chama RPC ou lê tabelas. Não reimplemente disponibilidade em TS.
- **IDs**: valide com `z.guid()` (os IDs do seed não são UUID v4).
- **Sem `id` fixo em campos**: o roteador guarda telas visitadas escondidas no DOM. O rótulo envolve o campo.
- **Imports** com o alias `@/`.
- **Painel**: telas do dia a dia no menu de baixo no celular (Hoje, Agenda, Clientes, Espera, Mensagens,
  Configurar); configuração fica em `/painel/{loja}/configurar`.
- **Marca**: azul-tinta e coral; verde só para confirmado ou pronto. Textos em português, frases curtas.
- **Valores em reais** aceitam vírgula ou ponto (`reaisParaCentavos`).

## Testes

- E2E em `e2e/*.spec.ts`, rodando como celular (Pixel 7). Use `campo`, `botao`, `texto`, `menu`, `abrir` e
  `entrar` de `e2e/util.ts`, que miram só elementos visíveis.
- Dados criados no teste: contas `@e2e.test`, clientes "E2E …"; `e2e/limpeza.ts` apaga.
- Rodar: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e e2e/<arquivo>.spec.ts`.

## Prints

Tire prints no tamanho de celular das telas que mudaram e salve em `/mnt/project-files/layout/<assunto>/`
(fora do repositório, que é público). Antes de abrir o PR, peça a revisão do agente `revisor-celular`.
