# Ambientes: teste (staging) e produção

| | Teste (staging) | Produção |
| --- | --- | --- |
| Para quê | Ver as entregas antes dos clientes; demonstração para os pilotos | Clientes reais |
| Banco | Supabase `hora-do-pet-staging` (`cwnwrpvjebtzheqbhzhj`, plano Free) | Supabase `hora-do-pet-prod` (`xddxurtmevhgxwffknyb`) |
| App | Vercel, deploy de Preview da branch `main` | Vercel, deploy de Production |
| Endereço | `staging.SEU-DOMINIO` (até lá, o endereço de Preview da `main`) | `app.SEU-DOMINIO` (até lá, `hora-do-pet.vercel.app`) |
| Origem do código | Branch `main` | Branch `producao` (atualizada por PR `main` → `producao`) |
| Migrações | `deploy-staging.yml`, a cada merge na `main` | `deploy-producao.yml`, depois da sua aprovação |
| App publicado por | Vercel, sozinha | `deploy-producao.yml`, **depois** das migrações (`vercel.json` desliga o deploy automático da `producao`) |
| Dados | Contas e lojas de teste criadas pelas telas | Nunca recebe seeds nem testes |

**Regra de ouro:** nenhuma chave ou senha é colada em chat, issue, PR ou arquivo do repositório. Elas vão direto
para os *secrets* do GitHub e para as variáveis da Vercel. Os Reference IDs e IDs da Vercel não são segredo.

## Como publicar

- **Staging:** faça o merge do PR na `main`. O workflow *Deploy staging* aplica as migrações e a Vercel publica o app.
  Os dois rodam em paralelo: por alguns minutos o app novo pode ver o banco antigo (aceitável em teste).
- **Produção:** abra um PR de `main` para `producao` (*base: producao, compare: main*) e faça o merge. O workflow
  *Deploy produção* espera a sua aprovação (*Actions → Deploy produção → Review deployments → Approve*), aplica as
  migrações e só então publica o app.

Nenhum dos dois roda o `supabase/seed.sql` (o `db push` só aplica migrações).

---

## O que já está configurado (13/10/2026)

### GitHub
- Branch padrão: `main` (era `claude/new-session-blzpj6`, da primeira sessão).
- Ruleset `main` (*Settings → Rules → Rulesets*): PR obrigatório (0 aprovações) e o check `check` (CI) verde.
- Environments (*Settings → Environments*):

| Nome | Tipo | `staging` | `production` |
| --- | --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | secret | token `github-actions` | token `github-actions-prod` |
| `SUPABASE_DB_PASSWORD` | secret | senha do banco de staging | senha do banco de produção |
| `SUPABASE_PROJECT_REF` | variable | `cwnwrpvjebtzheqbhzhj` | `xddxurtmevhgxwffknyb` |
| `VERCEL_TOKEN` | secret | — | token da Vercel (pendente) |
| `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | variable | — | IDs da Vercel (pendente) |

- `production` tem **Required reviewers** (o dono) e só aceita a branch `producao`.

### Supabase
- Dois projetos em São Paulo, organização própria (criados no supabase.com, **não** pela integração da Vercel, que
  criaria um banco só para todos os ambientes).
- Tokens de acesso por projeto, **Read-only** (a senha do banco é que aplica as migrações), válidos até
  **30/09/2027**: renovar antes disso em *Account → Access Tokens* e atualizar o secret no GitHub.
  Se o `supabase link` falhar por permissão, gere de novo só o token daquele projeto com *Full access*.
  As Edge Functions (WhatsApp, semanas 6–7) vão precisar de um token com escrita.

### Vercel
- Projeto `hora-do-pet`, plano Hobby (passar para **Pro** antes de clientes reais: o Hobby não permite uso comercial).
- *Settings → Environments → Production → Branch Tracking*: `producao`. Preview: todas as outras branches.
- Variáveis (*Settings → Environment Variables*), cada uma cadastrada uma vez em **Production** (chaves de prod) e uma
  vez em **Preview** (chaves de staging), sem **Development**:

| Variável | Tipo |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Config |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Config |
| `SUPABASE_SECRET_KEY` | **Secret** (nunca com prefixo `NEXT_PUBLIC_`) |

  As chaves ficam em *Supabase → Project Settings → API Keys* (não usar a aba *Legacy*).

---

## Falta fazer

### Vercel → GitHub (para o workflow publicar a produção)
1. *Account Settings → Tokens → Create*: nome `github-actions`, escopo da sua conta. Cadastre como **secret**
   `VERCEL_TOKEN` no environment `production`.
2. *Project Settings → General*: copie o **Project ID** → **variable** `VERCEL_PROJECT_ID` no `production`.
3. *Account Settings → General*: copie o **Team ID** (ou *User ID*) → **variable** `VERCEL_ORG_ID` no `production`.
4. No ruleset do GitHub, inclua também a branch `producao` (*Target branches → Add target → Include by pattern*),
   para que ela só mude por PR.

### Supabase Auth (cada projeto)
*Authentication → URL Configuration*: **Site URL** = endereço do app daquele ambiente (por enquanto o da Vercel) e o
mesmo endereço em **Redirect URLs**. Trocar pelo domínio quando ele existir.

### Domínio
1. Registre o domínio (ex.: `agendapet.com.br` em https://registro.br — exige CPF/CNPJ).
2. Na Vercel, *Settings → Domains*: `app.SEU-DOMINIO` (Production) e `staging.SEU-DOMINIO` atribuído à branch `main`.
   A Vercel mostra os registros DNS a criar no registro.br.

### E-mail de envio (SMTP)
O e-mail embutido do Supabase envia pouquíssimas mensagens por hora e serve só para teste. Antes de clientes reais:

1. Crie a conta em https://resend.com (plano gratuito: 3.000 e-mails/mês).
2. *Domains → Add domain*: use um subdomínio, ex.: `mail.SEU-DOMINIO`. Crie no registro.br os registros DNS
   mostrados (SPF, DKIM) e aguarde a verificação.
3. *API Keys → Create*: guarde a chave.
4. Em cada projeto Supabase: *Authentication → Emails → SMTP Settings → Enable custom SMTP*:
   host `smtp.resend.com`, porta `465`, usuário `resend`, senha = a API key, remetente `nao-responda@mail.SEU-DOMINIO`,
   nome da marca.

### Contas que demoram (iniciar já, em paralelo)
- **Meta / WhatsApp Business (semanas 6–7):** https://business.facebook.com → criar o portfólio empresarial com o CNPJ
  e o domínio, fazer a **verificação da empresa** e depois cadastrar o app no https://developers.facebook.com com o
  produto WhatsApp. A verificação e a aprovação dos modelos de mensagem podem levar dias.
- **Asaas (semana 8):** https://www.asaas.com → conta com o CNPJ da plataforma; solicitar acesso ao **sandbox** e à API de
  subcontas (split). A aprovação também leva alguns dias.

### Repositório público
No plano gratuito do GitHub, environments e rulesets só funcionam em repositório público. Se tornar o repositório
privado: com o GitHub Pro, environments e rulesets continuam, mas *Required reviewers* não (exige Enterprise); a
aprovação de produção passa a ser o próprio merge do PR `main` → `producao`.
