-- Horário de funcionamento da loja ("Aberto agora").
-- É só informação para o tutor: quem decide se há vaga continua sendo a agenda da equipe (horario_trabalho).
-- A loja cadastra as faixas de cada dia (ex.: 08:00–12:00 e 13:00–18:00). Para as lojas que já existem, o horário
-- começa igual à união das janelas da equipe, e a loja ajusta em Configurar → Funcionamento.

create table public.horario_funcionamento (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshop (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6), -- 0 = domingo
  abre time not null,
  fecha time not null,
  check (fecha > abre),
  -- Faixas do mesmo dia não se sobrepõem (encostar pode: 08–12 e 12–18).
  exclude using gist (petshop_id with =, dia_semana with =, (public.timerange(abre, fecha)) with &&)
);
create index horario_funcionamento_petshop_idx on public.horario_funcionamento (petshop_id, dia_semana);

alter table public.horario_funcionamento enable row level security;

-- O horário de funcionamento é público (como o endereço); só dono e gerente mudam.
create policy horario_funcionamento_select on public.horario_funcionamento for select to anon, authenticated
  using (app.loja_publica(petshop_id) or petshop_id = any((select app.lojas_visiveis())::uuid[]));
create policy horario_funcionamento_write on public.horario_funcionamento for all to authenticated
  using (petshop_id = any((select app.lojas_admin())::uuid[]))
  with check (petshop_id = any((select app.lojas_admin())::uuid[]));

grant select on public.horario_funcionamento to anon;
grant select, insert, update, delete on public.horario_funcionamento to authenticated;

-- Faixas de cada dia em que alguém da equipe (ativo) trabalha, com janelas que se tocam juntadas.
create function app.funcionamento_da_equipe(p_petshop_id uuid)
returns table (dia_semana smallint, abre time, fecha time)
language sql stable security definer set search_path = '' as $$
  select x.dia_semana, lower(f), upper(f)
    from (select ht.dia_semana, range_agg(public.timerange(ht.inicio, ht.fim)) as faixas
            from public.horario_trabalho ht
            join public.profissional pr on pr.id = ht.profissional_id and pr.ativo
           where ht.petshop_id = p_petshop_id
           group by ht.dia_semana) x
   cross join lateral unnest(x.faixas) f
$$;

revoke all on function app.funcionamento_da_equipe(uuid) from public, anon, authenticated;

-- "Usar o horário da equipe": troca o horário de funcionamento pela união das janelas da equipe.
create function public.copiar_horario_da_equipe(p_petshop_id uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_linhas integer;
begin
  if not (p_petshop_id = any(app.lojas_admin())) then
    raise exception 'sem permissão para alterar o horário desta loja' using errcode = '42501';
  end if;
  delete from public.horario_funcionamento where petshop_id = p_petshop_id;
  insert into public.horario_funcionamento (petshop_id, dia_semana, abre, fecha)
  select p_petshop_id, e.dia_semana, e.abre, e.fecha from app.funcionamento_da_equipe(p_petshop_id) e;
  get diagnostics v_linhas = row_count;
  return v_linhas;
end;
$$;

revoke all on function public.copiar_horario_da_equipe(uuid) from public, anon;
grant execute on function public.copiar_horario_da_equipe(uuid) to authenticated;

-- Aberto agora? Para cada loja pública com horário cadastrado: se está aberta, quando fecha e quando abre de novo.
-- Calculado no fuso da loja; um bloqueio da loja inteira (feriado, reforma) fecha a loja nesse período.
-- Lojas sem horário não aparecem no resultado (a tela não mostra selo). Até 50 lojas por chamada.
-- O relógio (p_agora) só é escolhido pelos testes: a versão pública usa sempre now(), senão um visitante varreria o
-- calendário e descobriria os bloqueios da loja (privados) em qualquer data.
create function app.situacao_lojas(p_lojas uuid[], p_agora timestamptz)
returns table (petshop_id uuid, aberto boolean, fecha_em timestamptz, abre_em timestamptz)
language sql stable security definer set search_path = '' as $$
  with agora as (select p_agora as t),
  loja as (
    select p.id, p.fuso
      from public.petshop p
      join public.rede r on r.id = p.rede_id and r.ativo
     where p.id = any(p_lojas[1:50]) and p.ativo
  ),
  livre as (
    select l.id,
           coalesce((select range_agg(tstzrange((d.dia + h.abre) at time zone l.fuso, (d.dia + h.fecha) at time zone l.fuso))
              from generate_series(0, 7) n
             cross join lateral (select ((a.t at time zone l.fuso)::date + n) as dia) d
              join public.horario_funcionamento h on h.petshop_id = l.id and h.dia_semana = extract(dow from d.dia)), '{}'::tstzmultirange)
           - coalesce((select range_agg(b.periodo)
                         from public.bloqueio b
                        where b.petshop_id = l.id and b.profissional_id is null
                          and b.periodo && tstzrange(a.t, a.t + interval '9 days')), '{}'::tstzmultirange) as faixas
      from loja l, agora a
     where exists (select 1 from public.horario_funcionamento h where h.petshop_id = l.id)
  )
  select lv.id,
         lv.faixas @> a.t,
         (select upper(f) from unnest(lv.faixas) f where f @> a.t),
         (select min(lower(f)) from unnest(lv.faixas) f where lower(f) > a.t)
    from livre lv, agora a
$$;

revoke all on function app.situacao_lojas(uuid[], timestamptz) from public, anon, authenticated;

create function public.situacao_lojas(p_lojas uuid[])
returns table (petshop_id uuid, aberto boolean, fecha_em timestamptz, abre_em timestamptz)
language sql stable security definer set search_path = '' as $$
  select * from app.situacao_lojas(p_lojas, now())
$$;

revoke all on function public.situacao_lojas(uuid[]) from public;
grant execute on function public.situacao_lojas(uuid[]) to anon, authenticated;

-- Lojas que já existem: começam com o horário da equipe (nada é apagado; a loja revisa no painel).
insert into public.horario_funcionamento (petshop_id, dia_semana, abre, fecha)
select p.id, e.dia_semana, e.abre, e.fecha
  from public.petshop p
 cross join lateral app.funcionamento_da_equipe(p.id) e;
