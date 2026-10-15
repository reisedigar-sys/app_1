-- Resultados do mês para o dono e a gerência: atendimentos, faltas, confirmações, faturamento, canais, ocupação
-- e a estimativa de faltas evitadas. Tudo calculado no banco, sempre por petshop_id + intervalo do mês.

-- Referência informada pela loja: quantas faltas tinha a cada 100 atendimentos antes do Hora do Pet (as 4 semanas
-- antes do piloto). Fica numa tabela própria, e não em `petshop`, porque a loja é pública para o anônimo e esse
-- número é só da gestão.
create table public.petshop_indicador (
  petshop_id uuid primary key references public.petshop (id) on delete cascade,
  faltas_antes_pct numeric(4, 1) check (faltas_antes_pct between 0 and 100),
  atualizado_em timestamptz not null default now()
);
alter table public.petshop_indicador enable row level security;
create policy petshop_indicador_select on public.petshop_indicador for select to authenticated
  using (petshop_id = any((select app.lojas_admin())::uuid[]));
create policy petshop_indicador_insert on public.petshop_indicador for insert to authenticated
  with check (petshop_id = any((select app.lojas_admin())::uuid[]));
create policy petshop_indicador_update on public.petshop_indicador for update to authenticated
  using (petshop_id = any((select app.lojas_admin())::uuid[]))
  with check (petshop_id = any((select app.lojas_admin())::uuid[]));

create function public.resultados_do_mes(p_petshop_id uuid, p_mes date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text;
  v_de date;
  v_ate date;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_r jsonb;
begin
  if not (p_petshop_id = any(app.lojas_admin())) then
    raise exception 'só o dono e a gerência veem os resultados' using errcode = '42501';
  end if;
  select fuso into v_fuso from public.petshop where id = p_petshop_id;
  v_de := date_trunc('month', coalesce(p_mes, (now() at time zone v_fuso)::date))::date;
  v_ate := (v_de + interval '1 month')::date;
  v_inicio := v_de::timestamp at time zone v_fuso;
  v_fim := v_ate::timestamp at time zone v_fuso;

  with ag as (
    select a.* from public.agendamento a
     where a.petshop_id = p_petshop_id and a.inicio >= v_inicio and a.inicio < v_fim
  ),
  pedidos as (
    -- Pedidos do mês que não foram cancelados por inteiro; confirmado pelo cliente = usou o link de confirmação.
    select p.id, p.confirmado_em is not null as confirmado
      from public.pedido p
     where p.petshop_id = p_petshop_id
       and exists (select 1 from ag where ag.pedido_id = p.id and ag.status <> 'cancelado')
  ),
  dias as (
    select d::date as dia from generate_series(v_de, v_ate - 1, interval '1 day') d
  ),
  -- Horas de trabalho do mês por profissional (janelas da semana em cada dia), menos bloqueios.
  disponivel as (
    select h.profissional_id,
           range_agg(tstzrange((d.dia + h.inicio) at time zone v_fuso, (d.dia + h.fim) at time zone v_fuso)) as m
      from public.horario_trabalho h
      join dias d on extract(dow from d.dia) = h.dia_semana
     where h.petshop_id = p_petshop_id
     group by h.profissional_id
  ),
  bloqueado as (
    select pr.id as profissional_id, range_agg(b.periodo) as m
      from public.profissional pr
      join public.bloqueio b on b.petshop_id = pr.petshop_id and (b.profissional_id is null or b.profissional_id = pr.id)
     where pr.petshop_id = p_petshop_id and b.periodo && tstzrange(v_inicio, v_fim)
     group by pr.id
  ),
  ocupacao as (
    select pr.id, pr.nome, pr.ordem,
           coalesce((select sum(extract(epoch from upper(r) - lower(r)) / 60)
                       from unnest(di.m - coalesce(bl.m, '{}'::tstzmultirange)) r), 0)::int as minutos_disponiveis,
           coalesce((select sum(extract(epoch from ag.fim - ag.inicio) / 60) from ag
                      where ag.profissional_id = pr.id and ag.status not in ('cancelado', 'faltou')), 0)::int as minutos_ocupados
      from public.profissional pr
      left join disponivel di on di.profissional_id = pr.id
      left join bloqueado bl on bl.profissional_id = pr.id
     where pr.petshop_id = p_petshop_id and pr.ativo
  )
  select jsonb_build_object(
    'mes', to_char(v_de, 'YYYY-MM'),
    'faltas_antes_pct', (select i.faltas_antes_pct from public.petshop_indicador i where i.petshop_id = p_petshop_id),
    'agendados', (select count(*) from ag where status <> 'cancelado'),
    'concluidos', (select count(*) from ag where status = 'concluido'),
    'faltas', (select count(*) from ag where status = 'faltou'),
    'cancelados', (select count(*) from ag where status = 'cancelado'),
    'a_realizar', (select count(*) from ag where status in ('agendado', 'confirmado', 'em_atendimento', 'pronto')),
    'pedidos', (select count(*) from pedidos),
    'pedidos_confirmados', (select count(*) from pedidos where confirmado),
    'faturado_centavos', (select coalesce(sum(preco_total_centavos), 0) from ag where status = 'concluido'),
    'previsto_centavos', (select coalesce(sum(preco_total_centavos), 0) from ag
                           where status in ('agendado', 'confirmado', 'em_atendimento', 'pronto')),
    'clientes_atendidos', (select count(distinct tutor_id) from ag where status = 'concluido'),
    'clientes_novos', (select count(*) from public.tutor_petshop tp
                        where tp.petshop_id = p_petshop_id and tp.criado_em >= v_inicio and tp.criado_em < v_fim),
    'por_canal', (select coalesce(jsonb_object_agg(canal, n), '{}') from (
                    select canal, count(*) as n from ag where status <> 'cancelado' group by canal) c),
    'mensagens', (select jsonb_build_object(
                    'whatsapp', count(*) filter (where l.provedor = 'whatsapp' and l.status <> 'erro'),
                    'push', count(*) filter (where l.provedor = 'push' and l.status <> 'erro'))
                    from public.mensagem_log l
                   where l.petshop_id = p_petshop_id and l.direcao = 'saida'
                     and l.criado_em >= v_inicio and l.criado_em < v_fim),
    'ocupacao', (select coalesce(jsonb_agg(jsonb_build_object(
                    'profissional_id', o.id, 'nome', o.nome,
                    'minutos_disponiveis', o.minutos_disponiveis, 'minutos_ocupados', o.minutos_ocupados)
                    order by o.ordem, o.nome), '[]') from ocupacao o)
  ) into v_r;
  return v_r;
end $$;

revoke all on function public.resultados_do_mes(uuid, date) from public, anon;
grant execute on function public.resultados_do_mes(uuid, date) to authenticated;
