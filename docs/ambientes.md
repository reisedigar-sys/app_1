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

### Worker de notificações (semana 6, uma vez em cada projeto Supabase)
O banco chama o worker a cada minuto (pg_cron). O deploy publica a função `notificacoes`, mas ela só roda depois
destes passos; até lá, as mensagens ficam na fila (nada é perdido, e as atrasadas não saem fora de hora).

1. Gere um token aleatório (ex.: `openssl rand -hex 32`). Use um diferente para staging e para produção.
2. *Edge Functions → Secrets* (ou `supabase secrets set --project-ref REF ...`):
   `WORKER_TOKEN` = o token; `APP_URL` = endereço do app daquele ambiente (ex.: `https://hora-do-pet.vercel.app`).
3. *SQL Editor*, no mesmo projeto (troque REF e TOKEN):
   ```sql
   select vault.create_secret('https://REF.supabase.co/functions/v1/notificacoes', 'worker_notificacoes_url');
   select vault.create_secret('TOKEN', 'worker_notificacoes_token');
   ```
4. Confira em *Edge Functions → notificacoes → Logs* que há uma chamada por minuto com resposta 200.

Enquanto o WhatsApp oficial não está ligado (segredos abaixo), o worker usa o provedor de teste: a mensagem é
registrada (painel → Mensagens) e não chega ao celular do cliente.

### Push no celular (semana 7, uma vez em cada ambiente)
1. Gere as chaves: `pnpm vapid:gerar` (um par para o staging e outro para a produção). Não salve a chave privada em
   arquivo nem mostre em print.
2. Supabase, *Edge Functions → Secrets*: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT`
   (`mailto:` + e-mail de contato do Hora do Pet).
3. Vercel, *Settings → Environment Variables*: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` = a chave pública (Production com a da
   produção; Preview com a do staging). Publique de novo para valer.

### WhatsApp (semana 7, depois da verificação da empresa na Meta)
Um número central do Hora do Pet envia os avisos de todas as lojas. Antes da verificação, dá para testar com o número
de teste da Meta, que só envia para os telefones cadastrados no app da Meta.

1. https://developers.facebook.com → *Meus apps → Criar app* (tipo Empresa, ligado ao portfólio do Hora do Pet) →
   adicionar o produto **WhatsApp**. Anote o **Phone number ID** do número (de teste ou o central).
2. *Configurações do negócio → Usuários do sistema*: criar um usuário do sistema (Admin), dar acesso ao app e à conta
   do WhatsApp e gerar um token **sem expiração** com `whatsapp_business_messaging` e `whatsapp_business_management`.
3. *Configurações do app → Básico*: copie a **Chave secreta do app** (App secret).
4. Supabase, *Edge Functions → Secrets*: `WHATSAPP_TOKEN` (passo 2), `WHATSAPP_PHONE_NUMBER_ID` (passo 1),
   `WHATSAPP_APP_SECRET` (passo 3) e `WHATSAPP_VERIFY_TOKEN` (um texto aleatório criado por você, ex.:
   `openssl rand -hex 16`). No staging, também `WHATSAPP_SOMENTE_PARA` = telefones de teste separados por vírgula
   (os outros ficam só registrados no painel).
5. No app da Meta, *WhatsApp → Configuração → Webhook*: URL de retorno `https://REF.supabase.co/functions/v1/whatsapp`
   e o mesmo `WHATSAPP_VERIFY_TOKEN`; depois, em *Campos do webhook*, assine **messages**.
6. Cadastre os modelos de `docs/modelos-whatsapp.md` e espere a aprovação. Mensagem com modelo ainda não aprovado
   falha e é tentada de novo (o painel mostra o erro da Meta).

### Supabase Auth (cada projeto)
*Authentication → URL Configuration*: **Site URL** = endereço do app daquele ambiente (por enquanto o da Vercel) e, em
**Redirect URLs**, o mesmo endereço terminado em `/**` (ex.: `https://hora-do-pet.vercel.app/**`), para o link de
"Esqueci a senha" voltar para `/auth/confirmar`. No staging, inclua também `https://hora-do-pet-*-edigar-reis.vercel.app/**`
(prévias dos PRs). Trocar pelo domínio quando ele existir.

*Authentication → Emails → Templates → Reset password*: assunto `Hora do Pet: crie sua nova senha` e, no corpo, o
conteúdo de `supabase/templates/recuperar-senha.html`. Com esse modelo o link funciona em qualquer navegador; com o
modelo padrão, só no mesmo navegador em que a pessoa pediu o link. Sem SMTP próprio (abaixo), o e-mail só chega para
os membros da organização no Supabase.

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
- **Meta / WhatsApp Business (semana 7):** https://business.facebook.com → criar o portfólio empresarial com o CNPJ
  e o domínio, fazer a **verificação da empresa** e depois cadastrar o app no https://developers.facebook.com com o
  produto WhatsApp. A verificação e a aprovação dos modelos de mensagem podem levar dias.
- **Asaas (semana 8):** https://www.asaas.com → conta com o CNPJ da plataforma; solicitar acesso ao **sandbox** e à API de
  subcontas (split). A aprovação também leva alguns dias.

### Repositório público
No plano gratuito do GitHub, environments e rulesets só funcionam em repositório público. Se tornar o repositório
privado: com o GitHub Pro, environments e rulesets continuam, mas *Required reviewers* não (exige Enterprise); a
aprovação de produção passa a ser o próprio merge do PR `main` → `producao`.
