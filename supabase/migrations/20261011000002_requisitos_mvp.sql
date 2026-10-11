-- 002 — Requisitos do MVP: anti no-show, confirmação por token, lista de espera,
-- WhatsApp como canal de entrada e avaliações.

-- ---------------------------------------------------------------------------
-- Configuração de lembretes e confirmação por loja
-- ---------------------------------------------------------------------------
create type public.acao_sem_confirmacao as enum ('avisar_loja', 'liberar_horario');

alter table public.petshop
  add column lembrete_d1_hora time not null default '18:00',
  add column lembrete_antes_horas smallint not null default 2 check (lembrete_antes_horas between 0 and 24),
  add column confirmar_ate_horas smallint not null default 12 check (confirmar_ate_horas between 0 and 72),
  add column acao_sem_confirmacao public.acao_sem_confirmacao not null default 'avisar_loja';

-- Confirmação vale para o pedido inteiro, sem login, pelo link /c/{token}.
alter table public.pedido
  add column token_confirmacao uuid not null default gen_random_uuid() unique,
  add column confirmado_em timestamptz;

-- ---------------------------------------------------------------------------
-- Fila de notificações (worker com FOR UPDATE SKIP LOCKED)
-- ---------------------------------------------------------------------------
create type public.tipo_notificacao as enum (
  'confirmacao_imediata', 'lembrete_d1', 'pedido_confirmacao', 'lembrete_antes',
  'pet_pronto', 'vaga_lista_espera', 'aviso_loja_sem_confirmacao'
);
create type public.status_notificacao as enum ('pendente', 'processando', 'enviada', 'falhou', 'cancelada');
create type public.categoria_mensagem as enum ('utilidade', 'marketing', 'servico');

create table public.notificacao_agendada (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null,
  pedido_id uuid,
  agendamento_id uuid,
  tutor_id uuid references public.tutor (id) on delete cascade,
  tipo public.tipo_notificacao not null,
  categoria public.categoria_mensagem not null default 'utilidade',
  enviar_em timestamptz not null,
  status public.status_notificacao not null default 'pendente',
  tentativas smallint not null default 0,
  max_tentativas smallint not null default 5,
  ultimo_erro text,
  enviada_em timestamptz,
  criado_em timestamptz not null default now(),
  foreign key (pedido_id, petshop_id) references public.pedido (id, petshop_id) on delete cascade,
  foreign key (agendamento_id, petshop_id) references public.agendamento (id, petshop_id) on delete cascade,
  unique (pedido_id, tipo, enviar_em)
);
-- Índice parcial pequeno para o worker buscar o que vence.
create index notificacao_fila_idx on public.notificacao_agendada (enviar_em) where status = 'pendente';
create index notificacao_petshop_idx on public.notificacao_agendada (petshop_id, criado_em desc);

create table public.mensagem_log (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshop (id) on delete cascade,
  notificacao_id uuid references public.notificacao_agendada (id) on delete set null,
  tutor_id uuid references public.tutor (id) on delete set null,
  direcao text not null check (direcao in ('saida', 'entrada')),
  categoria public.categoria_mensagem not null default 'utilidade',
  provedor text not null default 'whatsapp',
  provedor_mensagem_id text,
  destino text,
  conteudo jsonb,
  status text not null,
  custo_centavos integer check (custo_centavos >= 0),
  erro text,
  criado_em timestamptz not null default now()
);
create index mensagem_log_petshop_idx on public.mensagem_log (petshop_id, criado_em desc);

-- ---------------------------------------------------------------------------
-- Faltas: contador por tutor e loja, e sinal obrigatório acima do limite
-- ---------------------------------------------------------------------------
create function app.agendamento_conta_falta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  delta smallint := 0;
begin
  if new.status = 'faltou' and old.status <> 'faltou' then
    delta := 1;
  elsif old.status = 'faltou' and new.status <> 'faltou' then
    delta := -1;
  end if;
  if delta <> 0 then
    insert into public.tutor_petshop (petshop_id, tutor_id) values (new.petshop_id, new.tutor_id)
      on conflict do nothing;
    update public.tutor_petshop tp
       set faltas = greatest(tp.faltas + delta, 0),
           exige_sinal = tp.exige_sinal or greatest(tp.faltas + delta, 0) > p.limite_faltas
      from public.petshop p
     where p.id = tp.petshop_id and tp.petshop_id = new.petshop_id and tp.tutor_id = new.tutor_id;
  end if;
  return new;
end $$;
create trigger agendamento_conta_falta after update of status on public.agendamento
  for each row execute function app.agendamento_conta_falta();

-- ---------------------------------------------------------------------------
-- Lista de espera
-- ---------------------------------------------------------------------------
create type public.periodo_dia as enum ('manha', 'tarde', 'qualquer');
create type public.status_lista_espera as enum ('aguardando', 'notificado', 'atendido', 'expirado', 'cancelado');

create table public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshop (id) on delete cascade,
  tutor_id uuid not null references public.tutor (id) on delete cascade,
  pet_id uuid not null references public.pet (id) on delete cascade,
  servico_id uuid not null,
  profissional_id uuid,
  data date not null,
  periodo public.periodo_dia not null default 'qualquer',
  status public.status_lista_espera not null default 'aguardando',
  notificado_em timestamptz,
  criado_em timestamptz not null default now(),
  foreign key (servico_id, petshop_id) references public.servico (id, petshop_id) on delete cascade,
  foreign key (profissional_id, petshop_id) references public.profissional (id, petshop_id) on delete cascade
);
create index lista_espera_fila_idx on public.lista_espera (petshop_id, data, criado_em) where status = 'aguardando';
create index lista_espera_tutor_idx on public.lista_espera (tutor_id);

-- ---------------------------------------------------------------------------
-- WhatsApp como canal de entrada
-- ---------------------------------------------------------------------------
-- Número de WhatsApp de cada loja (roteamento do webhook pelo phone_number_id da Meta).
create table public.petshop_whatsapp (
  petshop_id uuid primary key references public.petshop (id) on delete cascade,
  phone_number_id text not null unique,
  waba_id text,
  telefone_e164 text not null check (telefone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Idempotência do webhook: cada mensagem recebida é registrada uma única vez.
create table public.whatsapp_entrada (
  mensagem_id text primary key,
  petshop_id uuid not null references public.petshop (id) on delete cascade,
  payload jsonb not null,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz
);
create index whatsapp_entrada_petshop_idx on public.whatsapp_entrada (petshop_id, recebido_em desc);

-- Estado da conversa guiada do bot.
create table public.whatsapp_sessao (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshop (id) on delete cascade,
  telefone_e164 text not null check (telefone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  tutor_id uuid references public.tutor (id) on delete set null,
  estado jsonb not null default '{}',
  atendente_solicitado boolean not null default false,
  expira_em timestamptz not null,
  atualizado_em timestamptz not null default now(),
  unique (petshop_id, telefone_e164)
);

-- ---------------------------------------------------------------------------
-- Avaliações (as estrelas só aparecem no app quando existirem)
-- ---------------------------------------------------------------------------
create table public.avaliacao (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null,
  agendamento_id uuid not null unique,
  profissional_id uuid not null,
  tutor_id uuid not null references public.tutor (id) on delete cascade,
  nota smallint not null check (nota between 1 and 5),
  comentario text,
  criado_em timestamptz not null default now(),
  foreign key (agendamento_id, petshop_id) references public.agendamento (id, petshop_id) on delete cascade,
  foreign key (profissional_id, petshop_id) references public.profissional (id, petshop_id) on delete cascade
);
create index avaliacao_profissional_idx on public.avaliacao (profissional_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.notificacao_agendada enable row level security;
alter table public.mensagem_log enable row level security;
alter table public.lista_espera enable row level security;
alter table public.petshop_whatsapp enable row level security;
alter table public.whatsapp_entrada enable row level security;
alter table public.whatsapp_sessao enable row level security;
alter table public.avaliacao enable row level security;

-- Fila e log são escritos só pelo worker (service_role); a equipe consulta.
create policy notificacao_select on public.notificacao_agendada for select to authenticated
  using (petshop_id = any((select app.lojas_operacao())::uuid[]));
create policy mensagem_log_select on public.mensagem_log for select to authenticated
  using (petshop_id = any((select app.lojas_admin())::uuid[]));

create policy lista_espera_select on public.lista_espera for select to authenticated
  using (petshop_id = any((select app.lojas_operacao())::uuid[]) or tutor_id = (select app.tutor_atual()));
create policy lista_espera_insert on public.lista_espera for insert to authenticated
  with check (
    petshop_id = any((select app.lojas_operacao())::uuid[])
    or (tutor_id = (select app.tutor_atual()) and app.loja_publica(petshop_id)
        and exists (select 1 from public.pet p where p.id = pet_id and p.tutor_id = lista_espera.tutor_id))
  );
create policy lista_espera_update on public.lista_espera for update to authenticated
  using (petshop_id = any((select app.lojas_operacao())::uuid[]) or tutor_id = (select app.tutor_atual()))
  with check (petshop_id = any((select app.lojas_operacao())::uuid[]) or tutor_id = (select app.tutor_atual()));

create policy petshop_whatsapp_select on public.petshop_whatsapp for select to authenticated
  using (petshop_id = any((select app.lojas_admin())::uuid[]));

-- whatsapp_entrada: sem políticas (só o webhook com service_role).
create policy whatsapp_sessao_select on public.whatsapp_sessao for select to authenticated
  using (petshop_id = any((select app.lojas_operacao())::uuid[]));
create policy whatsapp_sessao_update on public.whatsapp_sessao for update to authenticated
  using (petshop_id = any((select app.lojas_operacao())::uuid[]))
  with check (petshop_id = any((select app.lojas_operacao())::uuid[]));

create policy avaliacao_select on public.avaliacao for select to anon, authenticated
  using (app.loja_publica(petshop_id) or petshop_id = any((select app.lojas_visiveis())::uuid[]));
