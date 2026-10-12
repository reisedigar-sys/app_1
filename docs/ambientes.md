# Ambientes: teste (staging) e produção

| | Teste (staging) | Produção |
| --- | --- | --- |
| Para quê | Ver as entregas antes dos clientes; demonstração para os pilotos | Clientes reais |
| Banco | Supabase `agenda-pet-staging` (plano Free) | Supabase `agenda-pet-prod` (plano Pro) |
| App | Vercel, deploy de Preview | Vercel, deploy de Production |
| Endereço | `staging.SEU-DOMINIO` | `app.SEU-DOMINIO` |
| Origem do código | Branch `main` | Branch `producao` (atualizada por PR `main` → `producao`) |
| Migrações e deploy | Automáticos a cada merge na `main` | Só depois da sua aprovação: primeiro o banco, depois o app |
| Dados | Loja de demonstração e contas de teste | Nunca recebe seeds nem testes |

**Regra de ouro:** nenhuma chave ou senha é colada em chat, issue, PR ou arquivo do repositório. Elas vão direto
para os *secrets* do GitHub e para as variáveis da Vercel.

---

## Passo 1 — Supabase (2 projetos)

1. Crie a conta em https://supabase.com (pode entrar com o GitHub).
2. Crie uma **organização**: nome "Agenda Pet".
3. **New project** → `agenda-pet-staging`
   - **Database password**: clique em *Generate a password* e guarde num gerenciador de senhas.
   - **Region**: *South America (São Paulo)* — menor latência e dados no Brasil (LGPD).
   - Plano: Free.
4. Repita para `agenda-pet-prod`, também em São Paulo.
   - Plano: **Pro** (cerca de US$ 25/mês por organização) — backup diário e sem pausa por inatividade.
     Pode deixar para ativar perto do piloto (semana 9), mas crie o projeto já.
5. Anote o **Reference ID** de cada projeto (*Project Settings → General*). Não é segredo: pode me enviar.
6. Crie um **Access Token** (*Account → Access Tokens → Generate new token*, nome `github-actions`). Este é segredo.

## Passo 2 — GitHub (secrets e aprovação de produção)

No repositório `reisedigar-sys/app_1`:

1. *Settings → Environments → New environment*:
   - `staging` (sem regras).
   - `production` → marque **Required reviewers** e adicione você. Assim nada vai para produção sem o seu clique.
2. Em cada environment, *Add environment secret*:

| Nome | `staging` | `production` |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | token do passo 1.6 | o mesmo token |
| `SUPABASE_DB_PASSWORD` | senha do banco de staging | senha do banco de produção |
| `SUPABASE_PROJECT_REF` | Reference ID de staging | Reference ID de produção |
| `VERCEL_TOKEN` | — | token da Vercel (passo 4.5) |
| `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | — | IDs do projeto na Vercel (passo 4.5) |

3. *Settings → Branches → Add branch ruleset* para `main`: exigir PR e o check **check** (CI) passando antes do merge.

## Passo 3 — Domínio

1. Registre o domínio (ex.: `agendapet.com.br` em https://registro.br — exige CPF/CNPJ).
2. Ele será usado para: o app (`app.` e `staging.`), o e-mail de envio (passo 5) e a verificação do WhatsApp Business.
3. Os registros de DNS serão criados nos passos 4 e 5; o registro.br aceita editar o DNS no próprio painel.

## Passo 4 — Vercel

1. Crie a conta em https://vercel.com com o GitHub e importe `reisedigar-sys/app_1` (*Add New → Project*).
   Framework: Next.js (detectado sozinho). Não mude os comandos de build.
2. *Settings → Environment Variables*:

| Variável | Production | Preview |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto prod | URL do projeto staging |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key prod | publishable key staging |
| `SUPABASE_SECRET_KEY` | secret key prod | secret key staging |

   URL e chaves ficam em *Supabase → Project Settings → API Keys*. A *secret key* nunca leva o prefixo `NEXT_PUBLIC_`.
3. *Settings → Git → Production Branch*: troque para **`producao`**. Assim a `main` vira o ambiente de teste e nada
   chega aos clientes sem passar pela branch `producao`. O deploy automático da `producao` será desligado pelo próprio
   repositório (`vercel.json`, no PR de deploy): quem publica produção é o workflow do GitHub, **depois** de aplicar e
   aprovar as migrações do banco. Isso evita o app novo no ar com o banco antigo.
4. *Settings → Domains*: adicione `app.SEU-DOMINIO` (Production) e `staging.SEU-DOMINIO` atribuído à branch `main`.
   A Vercel mostra os registros DNS a criar no registro.br.
5. Para o workflow publicar: *Account Settings → Tokens → Create* (`VERCEL_TOKEN`); os IDs ficam em
   *Project Settings → General* (`Project ID`) e *Team/Account Settings → General* (`Team ID`, usado como `VERCEL_ORG_ID`).
   Cadastre os três como secrets do environment `production` (passo 2).
6. Plano: Hobby (grátis) serve para testar; para uso comercial com clientes, o plano **Pro** (US$ 20/mês por pessoa).

## Passo 5 — E-mail de envio (SMTP)

O e-mail embutido do Supabase envia pouquíssimas mensagens por hora e serve só para teste. Antes de clientes reais:

1. Crie a conta em https://resend.com (plano gratuito: 3.000 e-mails/mês).
2. *Domains → Add domain*: use um subdomínio, ex.: `mail.SEU-DOMINIO`. Crie no registro.br os registros DNS
   mostrados (SPF, DKIM) e aguarde a verificação.
3. *API Keys → Create*: guarde a chave.
4. Em cada projeto Supabase: *Authentication → Emails → SMTP Settings → Enable custom SMTP*:
   host `smtp.resend.com`, porta `465`, usuário `resend`, senha = a API key, remetente `nao-responda@mail.SEU-DOMINIO`,
   nome "Agenda Pet".
5. Em *Authentication → URL Configuration*: **Site URL** = `https://app.SEU-DOMINIO` (prod) ou
   `https://staging.SEU-DOMINIO` (staging), e adicione o mesmo endereço em **Redirect URLs**.

## Passo 6 — Contas que demoram (iniciar já, em paralelo)

- **Meta / WhatsApp Business (semanas 6–7):** https://business.facebook.com → criar o portfólio empresarial com o CNPJ
  e o domínio, fazer a **verificação da empresa** e depois cadastrar o app no https://developers.facebook.com com o
  produto WhatsApp. A verificação e a aprovação dos modelos de mensagem podem levar dias.
- **Asaas (semana 8):** https://www.asaas.com → conta com o CNPJ da plataforma; solicitar acesso ao **sandbox** e à API de
  subcontas (split). A aprovação também leva alguns dias.

---

## O que me enviar quando terminar

- Os **Reference IDs** dos dois projetos Supabase.
- O **domínio** escolhido.
- Uma confirmação de que os *secrets* do GitHub e as variáveis da Vercel foram cadastrados (não envie os valores).

Com isso eu configuro o deploy: migrações automáticas no staging a cada merge na `main`; para produção, um PR
`main` → `producao` que, depois da sua aprovação, aplica as migrações e só então publica o app; loja de demonstração
no staging e checagem de que nenhum seed de teste chega à produção.
