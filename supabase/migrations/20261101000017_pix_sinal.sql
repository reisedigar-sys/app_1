-- Semana 8a: sinal por Pix (Asaas).
-- A loja abre a conta de recebimento (subconta no Asaas) e escolhe de quem cobra sinal: ninguém, só de quem tem
-- faltas (tutor_petshop.exige_sinal, semana 6) ou de todos. O tutor que agenda pelo app paga o sinal por Pix em até
-- 15 minutos; o horário fica segurado pela constraint de sempre. Pago, o pedido fica confirmado; vencido, o horário
-- é liberado (não conta falta). Devolução e retenção ficam para a 8b.
-- As chamadas ao Asaas ficam no servidor do app; o webhook do Asaas chega pela Edge Function `asaas`.

create type public.modo_sinal as enum ('nunca', 'faltas', 'todos');
create type public.situacao_conta_pagamento as enum ('pendente', 'em_analise', 'aprovada', 'recusada');
-- devolver: o Pix caiu depois de o horário ser liberado (vencido ou cancelado); a 8b faz o estorno.
create type public.status_pagamento as enum ('aguardando', 'pago', 'expirado', 'cancelado', 'devolver');

comment on column public.petshop.sinal_percentual is 'Sem uso: o sinal é configurado em petshop_pagamento (migração 017).';

-- ---------------------------------------------------------------------------
-- Conta de recebimento da loja e regra do sinal
-- ---------------------------------------------------------------------------
-- A chave de API da subconta fica no Vault (nome 'pagamento_conta_<petshop_id>'), nunca nesta tabela.
create table public.petshop_pagamento (
  petshop_id uuid primary key references public.petshop (id) on delete cascade,
  provedor text not null default 'asaas' check (provedor in ('asaas', 'teste')),
  situacao public.situacao_conta_pagamento not null default 'pendente',
  -- Dados informados pela loja para abrir a conta (CNPJ ou CPF, razão social, contato e endereço).
  dados_conta jsonb not null default '{}',
  conta_id text,
  wallet_id text,
  pix_chave text,
  documentos_url text check (length(documentos_url) <= 1000),
  erro text,
  modo_sinal public.modo_sinal not null default 'nunca',
  sinal_tipo text not null default 'percentual' check (sinal_tipo in ('percentual', 'fixo')),
  sinal_percentual numeric(5, 2) not null default 30 check (sinal_percentual > 0 and sinal_percentual <= 100),
  sinal_fixo_centavos integer check (sinal_fixo_centavos > 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (modo_sinal = 'nunca' or situacao = 'aprovada'),
  check (sinal_tipo = 'percentual' or sinal_fixo_centavos is not null)
);
alter table public.petshop_pagamento enable row level security;
-- Só dono e gerente veem (dados da empresa). Mudanças só pelas funções abaixo.
create policy petshop_pagamento_select on public.petshop_pagamento for select to authenticated
  using (petshop_id = any(app.lojas_admin()));
grant select on public.petshop_pagamento to authenticated;

-- ---------------------------------------------------------------------------
-- Pagamento do sinal: um por pedido
-- ---------------------------------------------------------------------------
create table public.pagamento (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshop (id),
  pedido_id uuid not null unique,
  tutor_id uuid not null references public.tutor (id),
  valor_centavos integer not null check (valor_centavos > 0),
  status public.status_pagamento not null default 'aguardando',
  provedor text not null check (provedor in ('asaas', 'teste')),
  -- QR Code Pix (estático, valor fixo, um pagamento só, com validade): id no Asaas, copia e cola e imagem (base64).
  qr_id text unique,
  qr_payload text,
  qr_imagem text,
  expira_em timestamptz not null,
  provedor_pagamento_id text,
  pago_em timestamptz,
  criado_em timestamptz not null default now(),
  foreign key (pedido_id, petshop_id) references public.pedido (id, petshop_id) on delete cascade
);
create index pagamento_petshop_idx on public.pagamento (petshop_id, criado_em desc);
create index pagamento_tutor_idx on public.pagamento (tutor_id, criado_em desc);
create index pagamento_aguardando_idx on public.pagamento (expira_em) where status = 'aguardando';
alter table public.pagamento enable row level security;
-- O tutor vê os dele; a recepção vê os da loja. Sem INSERT/UPDATE pela API: só as funções do back-end gravam.
create policy pagamento_select on public.pagamento for select to authenticated
  using (tutor_id = app.tutor_atual() or petshop_id = any(app.lojas_operacao()));
grant select on public.pagamento to authenticated;

-- Eventos do webhook já processados (o Asaas reenvia; o mesmo evento nunca é aplicado duas vezes).
create table public.pagamento_evento (
  id text primary key,
  tipo text not null,
  payload jsonb not null,
  recebido_em timestamptz not null default now()
);
alter table public.pagamento_evento enable row level security;

-- ---------------------------------------------------------------------------
-- Valor do sinal
-- ---------------------------------------------------------------------------
-- 0 = sem sinal. Percentual do pedido ou valor fixo por pet, nunca acima do total.
create function app.valor_sinal(p_petshop_id uuid, p_tutor_id uuid, p_total_centavos int, p_pets int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select least(p_total_centavos,
                 case c.sinal_tipo
                   when 'percentual' then round(p_total_centavos * c.sinal_percentual / 100)::int
                   else c.sinal_fixo_centavos * greatest(p_pets, 1)
                 end)
      from public.petshop_pagamento c
     where c.petshop_id = p_petshop_id and c.situacao = 'aprovada'
       and (c.modo_sinal = 'todos'
            or (c.modo_sinal = 'faltas' and exists (
                  select 1 from public.tutor_petshop tp
                   where tp.petshop_id = p_petshop_id and tp.tutor_id = p_tutor_id and tp.exige_sinal)))
  ), 0)
$$;

-- Para a revisão do agendamento: quanto o tutor logado vai pagar de sinal neste pedido.
create function public.sinal_previsto(p_petshop_id uuid, p_total_centavos int, p_pets int) returns int
language sql stable security definer set search_path = '' as $$
  select app.valor_sinal(p_petshop_id, app.tutor_atual(), greatest(p_total_centavos, 0), p_pets)
$$;
revoke all on function public.sinal_previsto(uuid, int, int) from public, anon;
grant execute on function public.sinal_previsto(uuid, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Pedido feito pelo tutor no app: cria o pagamento do sinal
-- ---------------------------------------------------------------------------
-- criar_pedido grava o total no fim; é aí que o sinal é calculado. Os avisos do pedido (confirmação, aviso à
-- equipe) esperam o Pix: a próxima tentativa fica para depois do prazo de pagamento. Pago, saem na hora
-- (app.confirmar_pagamento); vencido, são cancelados com o pedido (app.expirar_pagamentos).
create function app.pedido_cria_pagamento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_valor int;
  v_expira timestamptz := now() + interval '15 minutes';
  v_provedor text;
begin
  v_valor := app.valor_sinal(new.petshop_id, new.tutor_id, new.total_centavos,
                             (select count(*)::int from public.agendamento a where a.pedido_id = new.id));
  if v_valor <= 0 then
    return new;
  end if;
  select provedor into v_provedor from public.petshop_pagamento where petshop_id = new.petshop_id;
  insert into public.pagamento (petshop_id, pedido_id, tutor_id, valor_centavos, provedor, expira_em)
  values (new.petshop_id, new.id, new.tutor_id, v_valor, v_provedor, v_expira);
  update public.notificacao_agendada set proxima_tentativa_em = v_expira + interval '3 minutes'
   where pedido_id = new.id and status = 'pendente';
  return new;
end $$;
create trigger pedido_cria_pagamento after update of total_centavos on public.pedido
  for each row when (old.total_centavos = 0 and new.total_centavos > 0
                     and new.canal = 'app_proprio' and new.criado_por_tipo = 'tutor')
  execute function app.pedido_cria_pagamento();

-- Todos os pets do pedido cancelados antes do Pix: não há mais o que pagar.
create function app.agendamento_cancela_pagamento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.agendamento a
                  where a.pedido_id = new.pedido_id and a.status not in ('cancelado', 'faltou')) then
    update public.pagamento set status = 'cancelado' where pedido_id = new.pedido_id and status = 'aguardando';
  end if;
  return new;
end $$;
create trigger agendamento_cancela_pagamento after update of status on public.agendamento
  for each row when (new.status = 'cancelado' and old.status is distinct from new.status)
  execute function app.agendamento_cancela_pagamento();

-- ---------------------------------------------------------------------------
-- Pix pago ou vencido
-- ---------------------------------------------------------------------------
-- Pix pago confirma o pedido inteiro (o prazo de confirmação da semana 6 não vale para ele) e libera os avisos.
-- Pago depois de o horário ser liberado: fica para devolver.
create function app.confirmar_pagamento(p_qr_id text, p_provedor_pagamento_id text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.pagamento;
begin
  select * into v from public.pagamento where qr_id = p_qr_id for update;
  if v.id is null then
    return 'desconhecido';
  end if;
  if v.status = 'aguardando' then
    update public.pagamento set status = 'pago', pago_em = now(), provedor_pagamento_id = p_provedor_pagamento_id
     where id = v.id;
    update public.agendamento set status = 'confirmado'
     where pedido_id = v.pedido_id and status = 'agendado';
    update public.notificacao_agendada set proxima_tentativa_em = null
     where pedido_id = v.pedido_id and status = 'pendente' and tentativas = 0 and proxima_tentativa_em is not null;
    return 'pago';
  elsif v.status in ('expirado', 'cancelado') then
    update public.pagamento set status = 'devolver', pago_em = now(), provedor_pagamento_id = p_provedor_pagamento_id
     where id = v.id;
    return 'devolver';
  end if;
  return 'repetido';
end $$;

-- Pix não pago no prazo (com 2 minutos de folga para o banco do tutor): libera o horário. Não conta falta, não avisa
-- o tutor (ele viu o prazo na tela) nem a equipe.
create function app.expirar_pagamentos(p_agora timestamptz) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.pagamento;
begin
  for v in
    select * from public.pagamento
     where status = 'aguardando' and expira_em + interval '2 minutes' <= p_agora
     order by expira_em
     for update skip locked
     limit 500
  loop
    update public.pagamento set status = 'expirado' where id = v.id;
    update public.agendamento set status = 'cancelado', cancelado_em = p_agora
     where pedido_id = v.pedido_id and status in ('agendado', 'confirmado');
    update public.notificacao_agendada set status = 'cancelada', ultimo_erro = 'Pix não pago no prazo'
     where pedido_id = v.pedido_id and status = 'pendente';
  end loop;
end $$;

-- Mesmo corpo da migração 012, com a liberação dos Pix vencidos antes de reservar a fila.
create or replace function public.worker_reservar(p_limite int default 50, p_agora timestamptz default now())
returns table (id uuid, tipo public.tipo_notificacao, destino text, conteudo jsonb, tentativas smallint, push jsonb)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if pg_try_advisory_xact_lock(hashtext('worker_notificacoes')) then
    perform app.expirar_pagamentos(p_agora);
    perform app.aplicar_prazo_confirmacao(p_agora);
    perform app.oferecer_vagas(p_agora);
    -- Reservada por um worker que caiu: volta para a fila.
    update public.notificacao_agendada na set status = 'pendente', processando_desde = null
     where na.status = 'processando' and na.processando_desde < p_agora - interval '10 minutes';
  end if;
  return query select * from app.reservar_fila(p_limite, p_agora);
end $$;

-- ---------------------------------------------------------------------------
-- Webhook do Asaas (Edge Function `asaas`, chave de serviço)
-- ---------------------------------------------------------------------------
-- Devolve o que foi feito: 'repetido', 'ignorado', 'desconhecido', 'pago' ou 'devolver'.
create function public.pagamento_webhook(p_evento jsonb) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id text := p_evento ->> 'id';
  v_tipo text := coalesce(p_evento ->> 'event', '');
  v_qr text := p_evento #>> '{payment,pixQrCodeId}';
begin
  if coalesce(v_id, '') = '' then
    raise exception 'evento sem id' using errcode = '22023';
  end if;
  insert into public.pagamento_evento (id, tipo, payload) values (v_id, v_tipo, p_evento) on conflict do nothing;
  if not found then
    return 'repetido';
  end if;
  if v_tipo in ('PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED') and coalesce(v_qr, '') <> '' then
    return app.confirmar_pagamento(v_qr, p_evento #>> '{payment,id}');
  end if;
  return 'ignorado';
end $$;
revoke all on function public.pagamento_webhook(jsonb) from public, anon, authenticated;
grant execute on function public.pagamento_webhook(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Conta de recebimento: pedido da loja, registro feito pelo servidor e regra do sinal
-- ---------------------------------------------------------------------------
-- Dono ou gerente informa os dados. Depois que a conta foi criada no provedor, os dados não mudam por aqui.
create function public.solicitar_conta_pagamento(p_petshop_id uuid, p_dados jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not (p_petshop_id = any(app.lojas_admin())) then
    raise exception 'só o dono ou o gerente abre a conta de recebimento' using errcode = '42501';
  end if;
  if jsonb_typeof(p_dados) <> 'object' then
    raise exception 'dados inválidos' using errcode = '22023';
  end if;
  insert into public.petshop_pagamento (petshop_id, dados_conta) values (p_petshop_id, p_dados)
  on conflict (petshop_id) do update set dados_conta = excluded.dados_conta, erro = null, atualizado_em = now()
   where public.petshop_pagamento.conta_id is null;
  if not found then
    raise exception 'a conta de recebimento já foi aberta' using errcode = 'P0002';
  end if;
end $$;
revoke all on function public.solicitar_conta_pagamento(uuid, jsonb) from public, anon;
grant execute on function public.solicitar_conta_pagamento(uuid, jsonb) to authenticated;

-- Servidor do app: conta criada no provedor. A chave de API da subconta vai para o Vault.
create function public.registrar_conta_pagamento(
  p_petshop_id uuid,
  p_provedor text,
  p_conta_id text,
  p_wallet_id text,
  p_api_key text,
  p_situacao public.situacao_conta_pagamento,
  p_pix_chave text default null,
  p_documentos_url text default null
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_nome text := 'pagamento_conta_' || p_petshop_id;
  v_segredo uuid;
begin
  select id into v_segredo from vault.secrets where name = v_nome;
  if v_segredo is null then
    perform vault.create_secret(p_api_key, v_nome, 'Chave de API da subconta da loja');
  else
    perform vault.update_secret(v_segredo, p_api_key);
  end if;
  update public.petshop_pagamento
     set provedor = p_provedor, conta_id = p_conta_id, wallet_id = p_wallet_id, pix_chave = p_pix_chave,
         situacao = p_situacao, documentos_url = p_documentos_url, erro = null, atualizado_em = now()
   where petshop_id = p_petshop_id;
end $$;

-- Servidor do app: situação da conta (consultada no provedor), chave Pix e erros.
create function public.atualizar_conta_pagamento(
  p_petshop_id uuid,
  p_situacao public.situacao_conta_pagamento,
  p_pix_chave text default null,
  p_documentos_url text default null,
  p_erro text default null
) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.petshop_pagamento
     set situacao = p_situacao,
         pix_chave = coalesce(p_pix_chave, pix_chave),
         documentos_url = coalesce(p_documentos_url, documentos_url),
         erro = p_erro,
         -- Conta que deixou de estar aprovada não cobra sinal.
         modo_sinal = case when p_situacao = 'aprovada' then modo_sinal else 'nunca' end,
         atualizado_em = now()
   where petshop_id = p_petshop_id;
end $$;

create function public.chave_conta_pagamento(p_petshop_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'pagamento_conta_' || p_petshop_id
$$;

-- Servidor do app: QR Code criado para o pagamento.
create function public.registrar_qr_pagamento(p_pagamento_id uuid, p_qr_id text, p_payload text, p_imagem text) returns void
language sql volatile security definer set search_path = '' as $$
  update public.pagamento set qr_id = p_qr_id, qr_payload = p_payload, qr_imagem = p_imagem
   where id = p_pagamento_id and status = 'aguardando' and qr_id is null
$$;

revoke all on function public.registrar_conta_pagamento(uuid, text, text, text, text, public.situacao_conta_pagamento, text, text),
  public.atualizar_conta_pagamento(uuid, public.situacao_conta_pagamento, text, text, text),
  public.chave_conta_pagamento(uuid), public.registrar_qr_pagamento(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.registrar_conta_pagamento(uuid, text, text, text, text, public.situacao_conta_pagamento, text, text),
  public.atualizar_conta_pagamento(uuid, public.situacao_conta_pagamento, text, text, text),
  public.chave_conta_pagamento(uuid), public.registrar_qr_pagamento(uuid, text, text, text)
  to service_role;

-- Dono ou gerente escolhe de quem cobrar e quanto. Ligar exige a conta aprovada.
create function public.configurar_sinal(
  p_petshop_id uuid,
  p_modo public.modo_sinal,
  p_tipo text,
  p_percentual numeric default null,
  p_fixo_centavos int default null
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.petshop_pagamento;
begin
  if not (p_petshop_id = any(app.lojas_admin())) then
    raise exception 'só o dono ou o gerente configura o sinal' using errcode = '42501';
  end if;
  select * into v from public.petshop_pagamento where petshop_id = p_petshop_id for update;
  if p_modo <> 'nunca' and v.situacao is distinct from 'aprovada' then
    raise exception 'a conta de recebimento ainda não foi aprovada' using errcode = 'P0002';
  end if;
  if v.petshop_id is null then
    return;
  end if;
  -- Desligar não mexe no valor guardado (volta igual quando a loja ligar de novo).
  update public.petshop_pagamento
     set modo_sinal = p_modo,
         sinal_tipo = case when p_modo = 'nunca' then sinal_tipo else p_tipo end,
         sinal_percentual = case when p_modo = 'nunca' then sinal_percentual else coalesce(p_percentual, sinal_percentual) end,
         sinal_fixo_centavos = case when p_modo <> 'nunca' and p_tipo = 'fixo' then p_fixo_centavos else sinal_fixo_centavos end,
         atualizado_em = now()
   where petshop_id = p_petshop_id;
end $$;
revoke all on function public.configurar_sinal(uuid, public.modo_sinal, text, numeric, int) from public, anon;
grant execute on function public.configurar_sinal(uuid, public.modo_sinal, text, numeric, int) to authenticated;
