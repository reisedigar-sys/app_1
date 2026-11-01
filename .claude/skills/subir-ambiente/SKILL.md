---
name: subir-ambiente
description: Use quando o Supabase local, o Docker ou o Playwright não estão funcionando numa sessão na nuvem do Claude Code, antes de rodar testes ou o app.
---

# Subir o ambiente local

1. Docker:
   ```bash
   docker ps || (dockerd > /tmp/dockerd.log 2>&1 &)
   ```
   Espere `docker ps` responder (Monitor ou um laço curto com `until docker ps; do ...`).
2. Supabase (o registro padrão `public.ecr.aws` é bloqueado; o Docker Hub funciona):
   ```bash
   pnpm exec supabase stop --no-backup
   SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io pnpm db:start
   ```
3. Docker Hub respondeu 429 (limite de downloads)? Puxe pelo espelho do Google e renomeie:
   ```bash
   docker pull mirror.gcr.io/supabase/postgres:<versão>
   docker tag mirror.gcr.io/supabase/postgres:<versão> supabase/postgres:<versão>
   ```
   O mesmo vale para as outras imagens que falharem.
4. `.env.local`: se não existir, copie de `.env.example`. `SUPABASE_SECRET_KEY` = `SECRET_KEY` de
   `pnpm exec supabase status -o env`. Inclua `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`.
   Nunca rode `playwright install`.
5. Confira: `pnpm test tests/api/login.test.ts`.

`pnpm db:types` só com o banco local no ar.
