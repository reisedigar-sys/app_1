-- 001 — Schema base do Agenda Pet
-- Multi-tenant: toda tabela de negócio tem petshop_id e RLS habilitado.
-- Chaves estrangeiras compostas (id, petshop_id) garantem que um registro nunca
-- aponte para dados de outra loja, mesmo que a política de RLS permita a escrita.

create extension if not exists btree_gist with schema extensions;

-- Funções auxiliares de autorização ficam fora do schema exposto pela API.
create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.porte as enum ('mini', 'pequeno', 'medio', 'grande', 'gigante');
create type public.pelagem as enum ('curta', 'media', 'longa');
create type public.canal_agendamento as enum ('app_proprio', 'marketplace', 'balcao', 'whatsapp');
create type public.status_agendamento as enum (
  'agendado', 'confirmado', 'em_atendimento', 'pronto', 'concluido', 'cancelado', 'faltou'
);
create type public.papel_loja as enum ('dono', 'gerente', 'atendente', 'profissional');
create type public.tipo_servico as enum ('principal', 'adicional');
create type public.tipo_bloqueio as enum ('folga', 'almoco', 'feriado', 'outro');
create type public.criado_por_tipo as enum ('tutor', 'equipe', 'bot_whatsapp', 'sistema');

-- Faixa de horário do dia (sem data), usada nas janelas de trabalho.
create type public.timerange as range (subtype = time);

-- ---------------------------------------------------------------------------
-- Rede, loja e equipe
-- ---------------------------------------------------------------------------
create table public.rede (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table public.petshop (
  id uuid primary key default gen_random_uuid(),
  rede_id uuid not null references public.rede (id),
  nome text not null check (length(trim(nome)) > 0),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  telefone_e164 text check (telefone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  logradouro text,
  numero text,
  bairro text,
  cidade text,
  uf char(2),
  cep text check (cep ~ '^[0-9]{8}$'),
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  fuso text not null default 'America/Sao_Paulo',
  slot_minutos smallint not null default 15 check (slot_minutos in (5, 10, 15, 20, 30, 60)),
  buffer_minutos smallint not null default 10 check (buffer_minutos between 0 and 120),
  antecedencia_minima_minutos integer not null default 60 check (antecedencia_minima_minutos >= 0),
  janela_maxima_dias smallint not null default 30 check (janela_maxima_dias between 1 and 365),
  cancelamento_gratuito_horas smallint not null default 24 check (cancelamento_gratuito_horas >= 0),
  sinal_percentual numeric(5, 2) not null default 0 check (sinal_percentual between 0 and 100),
  limite_faltas smallint not null default 2 check (limite_faltas >= 0),
  comissao_marketplace_pct numeric(5, 2) not null default 0 check (comissao_marketplace_pct between 0 and 100),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (id, rede_id)
);
create index petshop_rede_idx on public.petshop (rede_id);

-- Valida o fuso horário contra o catálogo do Postgres.
create function app.valida_fuso() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.fuso) then
    raise exception 'fuso horário inválido: %', new.fuso using errcode = '22023';
  end if;
  return new;
end $$;
create trigger petshop_valida_fuso before insert or update of fuso on public.petshop
  for each row execute function app.valida_fuso();

-- Dono da rede enxerga e administra todas as unidades da rede.
create table public.rede_membro (
  rede_id uuid not null references public.rede (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (rede_id, user_id)
);
create index rede_membro_user_idx on public.rede_membro (user_id);

create table public.profissional (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshop (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  foto_url text,
  bio text,
  ordem smallint not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (id, petshop_id)
);
create index profissional_petshop_idx on public.profissional (petshop_id);

-- Equipe da unidade. Um membro com papel 'profissional' aponta para o seu cadastro.
create table public.petshop_membro (
  petshop_id uuid not null references public.petshop (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  papel public.papel_loja not null,
  profissional_id uuid,
  criado_em timestamptz not null default now(),
  primary key (petshop_id, user_id),
  foreign key (profissional_id, petshop_id) references public.profissional (id, petshop_id) on delete set null (profissional_id),
  check (papel <> 'profissional' or profissional_id is not null)
);
create index petshop_membro_user_idx on public.petshop_membro (user_id);

-- ---------------------------------------------------------------------------
-- Catálogo de serviços
-- ---------------------------------------------------------------------------
create table public.categoria_servico (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshop (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  ordem smallint not null default 0,
  unique (id, petshop_id),
  unique (petshop_id, nome)
);

create table public.servico (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshop (id) on delete cascade,
  categoria_id uuid,
  nome text not null check (length(trim(nome)) > 0),
  descricao text,
  tipo public.tipo_servico not null,
  ordem smallint not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (id, petshop_id),
  foreign key (categoria_id, petshop_id) references public.categoria_servico (id, petshop_id)
);
create index servico_petshop_idx on public.servico (petshop_id);

-- Preço e duração por porte e pelagem.
create table public.servico_preco (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null,
  servico_id uuid not null,
  porte public.porte not null,
  pelagem public.pelagem not null,
  preco_centavos integer not null check (preco_centavos >= 0),
  duracao_minutos smallint not null check (duracao_minutos between 5 and 600),
  unique (servico_id, porte, pelagem),
  foreign key (servico_id, petshop_id) references public.servico (id, petshop_id) on delete cascade
);
create index servico_preco_petshop_idx on public.servico_preco (petshop_id);

-- Quais profissionais fazem quais serviços; fator_duracao ajusta a duração (ex.: 1.2 = 20% mais lento).
create table public.profissional_servico (
  petshop_id uuid not null,
  profissional_id uuid not null,
  servico_id uuid not null,
  fator_duracao numeric(3, 2) not null default 1.00 check (fator_duracao between 0.50 and 3.00),
  primary key (profissional_id, servico_id),
  foreign key (profissional_id, petshop_id) references public.profissional (id, petshop_id) on delete cascade,
  foreign key (servico_id, petshop_id) references public.servico (id, petshop_id) on delete cascade
);
create index profissional_servico_petshop_idx on public.profissional_servico (petshop_id);
create index profissional_servico_servico_idx on public.profissional_servico (servico_id);

-- ---------------------------------------------------------------------------
-- Horários e bloqueios
-- ---------------------------------------------------------------------------
-- Janela de trabalho no horário local da loja. servico_id nulo = janela geral;
-- preenchido = janela específica que substitui a geral para aquele serviço naquele dia.
create table public.horario_trabalho (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null,
  profissional_id uuid not null,
  servico_id uuid,
  dia_semana smallint not null check (dia_semana between 0 and 6), -- 0 = domingo
  inicio time not null,
  fim time not null,
  check (fim > inicio),
  foreign key (profissional_id, petshop_id) references public.profissional (id, petshop_id) on delete cascade,
  foreign key (servico_id, petshop_id) references public.servico (id, petshop_id) on delete cascade,
  -- Janelas do mesmo profissional, dia e escopo (geral ou mesmo serviço) não se sobrepõem.
  exclude using gist (
    profissional_id with =,
    dia_semana with =,
    (coalesce(servico_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
    (public.timerange(inicio, fim)) with &&
  )
);
create index horario_trabalho_petshop_idx on public.horario_trabalho (petshop_id, profissional_id);

-- Bloqueio da loja inteira (profissional_id nulo) ou de um profissional.
create table public.bloqueio (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshop (id) on delete cascade,
  profissional_id uuid,
  tipo public.tipo_bloqueio not null default 'outro',
  periodo tstzrange not null check (not isempty(periodo) and lower_inc(periodo) and not upper_inf(periodo) and not lower_inf(periodo)),
  motivo text,
  criado_em timestamptz not null default now(),
  foreign key (profissional_id, petshop_id) references public.profissional (id, petshop_id) on delete cascade
);
create index bloqueio_petshop_periodo_idx on public.bloqueio using gist (petshop_id, periodo);

-- ---------------------------------------------------------------------------
-- Tutor e pet (identidade global) e vínculo com a loja
-- ---------------------------------------------------------------------------
create table public.tutor (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  nome text not null check (length(trim(nome)) > 0),
  telefone_e164 text not null unique check (telefone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  email text,
  criado_em timestamptz not null default now()
);

-- Dados do tutor que pertencem à loja: faltas, consentimentos e observações internas.
create table public.tutor_petshop (
  petshop_id uuid not null references public.petshop (id) on delete cascade,
  tutor_id uuid not null references public.tutor (id) on delete cascade,
  faltas smallint not null default 0 check (faltas >= 0),
  exige_sinal boolean not null default false,
  consentimento_contato_em timestamptz,     -- LGPD: mensagens de serviço (lembretes)
  consentimento_marketing_em timestamptz,   -- LGPD: retorno e promoções (separado)
  observacoes text,
  criado_em timestamptz not null default now(),
  primary key (petshop_id, tutor_id)
);
create index tutor_petshop_tutor_idx on public.tutor_petshop (tutor_id);

create table public.pet (
  id uuid primary key default gen_random_uuid(),
  tutor_id uuid not null references public.tutor (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  especie text not null default 'cao' check (especie in ('cao', 'gato')),
  raca text,
  porte public.porte not null,
  pelagem public.pelagem not null,
  nascimento date,
  alergias text,
  temperamento text,
  vacinas text,
  foto_url text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index pet_tutor_idx on public.pet (tutor_id);

-- Observações da loja sobre o pet (não visíveis para outras lojas nem para o tutor).
create table public.pet_petshop (
  petshop_id uuid not null references public.petshop (id) on delete cascade,
  pet_id uuid not null references public.pet (id) on delete cascade,
  observacoes text,
  atualizado_em timestamptz not null default now(),
  primary key (petshop_id, pet_id)
);

-- ---------------------------------------------------------------------------
-- Pedido e agendamento
-- ---------------------------------------------------------------------------
-- Um pedido agrupa os agendamentos de vários pets do mesmo tutor feitos de uma vez.
create table public.pedido (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshop (id),
  tutor_id uuid not null references public.tutor (id),
  canal public.canal_agendamento not null,
  chave_idempotencia text not null,
  total_centavos integer not null default 0 check (total_centavos >= 0),
  criado_por_tipo public.criado_por_tipo not null,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (id, petshop_id),
  unique (petshop_id, chave_idempotencia)
);
create index pedido_tutor_idx on public.pedido (tutor_id, criado_em desc);

create table public.agendamento (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null,
  pedido_id uuid not null,
  tutor_id uuid not null references public.tutor (id),
  pet_id uuid not null references public.pet (id),
  profissional_id uuid not null,
  canal public.canal_agendamento not null,
  status public.status_agendamento not null default 'agendado',
  inicio timestamptz not null,
  fim timestamptz not null,
  -- Buffer gravado no próprio agendamento: mudar a configuração da loja não afeta o que já foi marcado.
  buffer_minutos smallint not null check (buffer_minutos between 0 and 120),
  -- Intervalo que o profissional fica ocupado (fim + buffer), mantido por trigger.
  ocupado tstzrange not null,
  encaixe boolean not null default false,
  preco_total_centavos integer not null default 0 check (preco_total_centavos >= 0),
  observacoes text,
  cancelado_em timestamptz,
  criado_em timestamptz not null default now(),
  check (fim > inicio),
  unique (id, petshop_id),
  foreign key (pedido_id, petshop_id) references public.pedido (id, petshop_id) on delete cascade,
  foreign key (profissional_id, petshop_id) references public.profissional (id, petshop_id),
  -- Sem overbooking: o mesmo profissional nunca tem dois atendimentos ativos sobrepostos.
  constraint agendamento_sem_conflito exclude using gist (
    profissional_id with =,
    ocupado with &&
  ) where (status not in ('cancelado', 'faltou'))
);
create index agendamento_petshop_inicio_idx on public.agendamento (petshop_id, inicio);
create index agendamento_profissional_inicio_idx on public.agendamento (profissional_id, inicio);
create index agendamento_tutor_idx on public.agendamento (tutor_id, inicio desc);
create index agendamento_pedido_idx on public.agendamento (pedido_id);

create function app.agendamento_calcula_ocupado() returns trigger
language plpgsql as $$
begin
  if new.fim <= new.inicio then
    raise exception 'o fim do agendamento deve ser depois do início' using errcode = '23514';
  end if;
  new.ocupado := tstzrange(new.inicio, new.fim + make_interval(mins => new.buffer_minutos), '[)');
  if new.status = 'cancelado' and new.cancelado_em is null then
    new.cancelado_em := now();
  end if;
  return new;
end $$;
create trigger agendamento_calcula_ocupado
  before insert or update of inicio, fim, buffer_minutos, status on public.agendamento
  for each row execute function app.agendamento_calcula_ocupado();

-- Serviços de cada agendamento (principal + adicionais), com preço e duração congelados.
create table public.agendamento_item (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null,
  agendamento_id uuid not null,
  servico_id uuid not null,
  ordem smallint not null default 0,
  preco_centavos integer not null check (preco_centavos >= 0),
  duracao_minutos smallint not null check (duracao_minutos > 0),
  foreign key (agendamento_id, petshop_id) references public.agendamento (id, petshop_id) on delete cascade,
  foreign key (servico_id, petshop_id) references public.servico (id, petshop_id)
);
create index agendamento_item_agendamento_idx on public.agendamento_item (agendamento_id);
create index agendamento_item_petshop_idx on public.agendamento_item (petshop_id);

-- A loja não muda de rede pela API (só via service_role/manutenção).
create function app.petshop_bloqueia_troca_rede() returns trigger
language plpgsql as $$
begin
  if new.rede_id is distinct from old.rede_id and current_user in ('anon', 'authenticated') then
    raise exception 'não é permitido trocar a rede da loja' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger petshop_bloqueia_troca_rede before update of rede_id on public.petshop
  for each row execute function app.petshop_bloqueia_troca_rede();

-- ---------------------------------------------------------------------------
-- Autorização (RLS)
-- ---------------------------------------------------------------------------
-- Funções SECURITY DEFINER leem as tabelas de vínculo sem passar pelo RLS (evita recursão).
-- Devolvem arrays para serem usadas como `coluna = any((select app.f())::uuid[])`, avaliadas uma vez por consulta.

-- Redes em que o usuário é dono.
create function app.redes_do_usuario() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(rede_id), '{}') from public.rede_membro where user_id = auth.uid()
$$;

-- Lojas em que o usuário tem um dos papéis informados (dono da rede conta como dono em todas as unidades).
create function app.lojas_com_papel(papeis public.papel_loja[]) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct id), '{}') from (
    select m.petshop_id as id from public.petshop_membro m
     where m.user_id = auth.uid() and m.papel = any(papeis)
    union
    select p.id from public.petshop p
      join public.rede_membro r on r.rede_id = p.rede_id
     where r.user_id = auth.uid()
  ) s
$$;

-- Qualquer papel: enxerga os dados de configuração e cadastro da loja.
create function app.lojas_visiveis() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select app.lojas_com_papel('{dono,gerente,atendente,profissional}')
$$;

-- Opera a agenda inteira: dono, gerente e atendente.
create function app.lojas_operacao() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select app.lojas_com_papel('{dono,gerente,atendente}')
$$;

-- Configura a loja: dono e gerente.
create function app.lojas_admin() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select app.lojas_com_papel('{dono,gerente}')
$$;

-- Administra a equipe: só o dono.
create function app.lojas_dono() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select app.lojas_com_papel('{dono}')
$$;

-- Cadastros de profissional ligados ao usuário (para o profissional ver a própria agenda).
create function app.profissionais_do_usuario() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(profissional_id), '{}') from public.petshop_membro
   where user_id = auth.uid() and profissional_id is not null
$$;

-- Tutor ligado ao usuário logado.
create function app.tutor_atual() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.tutor where user_id = auth.uid()
$$;

-- Loja ativa no catálogo público.
create function app.loja_publica(p_petshop_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.petshop p join public.rede r on r.id = p.rede_id
     where p.id = p_petshop_id and p.ativo and r.ativo
  )
$$;

-- Tutor tem vínculo com alguma loja visível ao usuário.
create function app.tutor_visivel_para_equipe(p_tutor_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tutor_petshop tp
     where tp.tutor_id = p_tutor_id and tp.petshop_id = any(app.lojas_visiveis())
  )
$$;

revoke all on all functions in schema app from public;
grant execute on all functions in schema app to anon, authenticated, service_role;

alter table public.rede enable row level security;
alter table public.petshop enable row level security;
alter table public.rede_membro enable row level security;
alter table public.petshop_membro enable row level security;
alter table public.profissional enable row level security;
alter table public.categoria_servico enable row level security;
alter table public.servico enable row level security;
alter table public.servico_preco enable row level security;
alter table public.profissional_servico enable row level security;
alter table public.horario_trabalho enable row level security;
alter table public.bloqueio enable row level security;
alter table public.tutor enable row level security;
alter table public.tutor_petshop enable row level security;
alter table public.pet enable row level security;
alter table public.pet_petshop enable row level security;
alter table public.pedido enable row level security;
alter table public.agendamento enable row level security;
alter table public.agendamento_item enable row level security;

-- Rede
create policy rede_select on public.rede for select to anon, authenticated
  using (ativo or id = any((select app.redes_do_usuario())::uuid[]));
create policy rede_update on public.rede for update to authenticated
  using (id = any((select app.redes_do_usuario())::uuid[]))
  with check (id = any((select app.redes_do_usuario())::uuid[]));

create policy rede_membro_select on public.rede_membro for select to authenticated
  using (user_id = (select auth.uid()) or rede_id = any((select app.redes_do_usuario())::uuid[]));
create policy rede_membro_insert on public.rede_membro for insert to authenticated
  with check (rede_id = any((select app.redes_do_usuario())::uuid[]));
create policy rede_membro_delete on public.rede_membro for delete to authenticated
  using (rede_id = any((select app.redes_do_usuario())::uuid[]));

-- Loja
create policy petshop_select on public.petshop for select to anon, authenticated
  using (app.loja_publica(id) or id = any((select app.lojas_visiveis())::uuid[]));
create policy petshop_insert on public.petshop for insert to authenticated
  with check (rede_id = any((select app.redes_do_usuario())::uuid[]));
create policy petshop_update on public.petshop for update to authenticated
  using (id = any((select app.lojas_admin())::uuid[]))
  with check (id = any((select app.lojas_admin())::uuid[]));

create policy petshop_membro_select on public.petshop_membro for select to authenticated
  using (user_id = (select auth.uid()) or petshop_id = any((select app.lojas_admin())::uuid[]));
create policy petshop_membro_insert on public.petshop_membro for insert to authenticated
  with check (petshop_id = any((select app.lojas_dono())::uuid[]));
create policy petshop_membro_update on public.petshop_membro for update to authenticated
  using (petshop_id = any((select app.lojas_dono())::uuid[]))
  with check (petshop_id = any((select app.lojas_dono())::uuid[]));
create policy petshop_membro_delete on public.petshop_membro for delete to authenticated
  using (petshop_id = any((select app.lojas_dono())::uuid[]));

-- Catálogo público (leitura) + configuração pela loja (escrita: dono e gerente)
create policy profissional_select on public.profissional for select to anon, authenticated
  using ((ativo and app.loja_publica(petshop_id)) or petshop_id = any((select app.lojas_visiveis())::uuid[]));
create policy profissional_write on public.profissional for all to authenticated
  using (petshop_id = any((select app.lojas_admin())::uuid[]))
  with check (petshop_id = any((select app.lojas_admin())::uuid[]));

create policy categoria_servico_select on public.categoria_servico for select to anon, authenticated
  using (app.loja_publica(petshop_id) or petshop_id = any((select app.lojas_visiveis())::uuid[]));
create policy categoria_servico_write on public.categoria_servico for all to authenticated
  using (petshop_id = any((select app.lojas_admin())::uuid[]))
  with check (petshop_id = any((select app.lojas_admin())::uuid[]));

create policy servico_select on public.servico for select to anon, authenticated
  using ((ativo and app.loja_publica(petshop_id)) or petshop_id = any((select app.lojas_visiveis())::uuid[]));
create policy servico_write on public.servico for all to authenticated
  using (petshop_id = any((select app.lojas_admin())::uuid[]))
  with check (petshop_id = any((select app.lojas_admin())::uuid[]));

create policy servico_preco_select on public.servico_preco for select to anon, authenticated
  using (app.loja_publica(petshop_id) or petshop_id = any((select app.lojas_visiveis())::uuid[]));
create policy servico_preco_write on public.servico_preco for all to authenticated
  using (petshop_id = any((select app.lojas_admin())::uuid[]))
  with check (petshop_id = any((select app.lojas_admin())::uuid[]));

create policy profissional_servico_select on public.profissional_servico for select to anon, authenticated
  using (app.loja_publica(petshop_id) or petshop_id = any((select app.lojas_visiveis())::uuid[]));
create policy profissional_servico_write on public.profissional_servico for all to authenticated
  using (petshop_id = any((select app.lojas_admin())::uuid[]))
  with check (petshop_id = any((select app.lojas_admin())::uuid[]));

-- Horários: só a equipe vê; o público consulta disponibilidade pelas funções do motor.
create policy horario_trabalho_select on public.horario_trabalho for select to authenticated
  using (petshop_id = any((select app.lojas_visiveis())::uuid[]));
create policy horario_trabalho_write on public.horario_trabalho for all to authenticated
  using (petshop_id = any((select app.lojas_admin())::uuid[]))
  with check (petshop_id = any((select app.lojas_admin())::uuid[]));

create policy bloqueio_select on public.bloqueio for select to authenticated
  using (petshop_id = any((select app.lojas_visiveis())::uuid[]));
create policy bloqueio_write on public.bloqueio for all to authenticated
  using (petshop_id = any((select app.lojas_operacao())::uuid[]))
  with check (petshop_id = any((select app.lojas_operacao())::uuid[]));

-- Tutor: vê e edita o próprio cadastro; a equipe vê tutores vinculados à loja.
create policy tutor_select on public.tutor for select to authenticated
  using (user_id = (select auth.uid()) or app.tutor_visivel_para_equipe(id));
create policy tutor_insert on public.tutor for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy tutor_update on public.tutor for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy tutor_petshop_select on public.tutor_petshop for select to authenticated
  using (petshop_id = any((select app.lojas_visiveis())::uuid[]) or tutor_id = (select app.tutor_atual()));
create policy tutor_petshop_insert on public.tutor_petshop for insert to authenticated
  with check (petshop_id = any((select app.lojas_operacao())::uuid[]));
create policy tutor_petshop_update on public.tutor_petshop for update to authenticated
  using (petshop_id = any((select app.lojas_operacao())::uuid[]))
  with check (petshop_id = any((select app.lojas_operacao())::uuid[]));

create policy pet_select on public.pet for select to authenticated
  using (tutor_id = (select app.tutor_atual()) or app.tutor_visivel_para_equipe(tutor_id));
create policy pet_write on public.pet for all to authenticated
  using (tutor_id = (select app.tutor_atual()))
  with check (tutor_id = (select app.tutor_atual()));

create policy pet_petshop_select on public.pet_petshop for select to authenticated
  using (petshop_id = any((select app.lojas_visiveis())::uuid[]));
create policy pet_petshop_write on public.pet_petshop for all to authenticated
  using (petshop_id = any((select app.lojas_operacao())::uuid[]))
  with check (petshop_id = any((select app.lojas_operacao())::uuid[]));

-- Pedido e agendamento: criação só pela função criar_pedido (semana 3), nunca por insert direto.
create policy pedido_select on public.pedido for select to authenticated
  using (petshop_id = any((select app.lojas_operacao())::uuid[]) or tutor_id = (select app.tutor_atual()));

create policy agendamento_select on public.agendamento for select to authenticated
  using (
    petshop_id = any((select app.lojas_operacao())::uuid[])
    or profissional_id = any((select app.profissionais_do_usuario())::uuid[])
    or tutor_id = (select app.tutor_atual())
  );
create policy agendamento_update on public.agendamento for update to authenticated
  using (
    petshop_id = any((select app.lojas_operacao())::uuid[])
    or profissional_id = any((select app.profissionais_do_usuario())::uuid[])
  )
  with check (
    petshop_id = any((select app.lojas_operacao())::uuid[])
    or profissional_id = any((select app.profissionais_do_usuario())::uuid[])
  );

create policy agendamento_item_select on public.agendamento_item for select to authenticated
  using (exists (select 1 from public.agendamento a where a.id = agendamento_id));
