-- Os horários oferecidos (dias com vaga e horários do dia) nunca incluem um início que já passou, nem para a equipe.
-- A equipe continua sem antecedência mínima nem janela máxima (pode agendar "daqui a 10 minutos") e ainda pode lançar
-- um atendimento passado por criar_pedido (encaixe ou horário exato); só a lista oferecida deixa de mostrá-los.
create or replace function public.dias_com_vaga(
  p_petshop_id uuid,
  p_itens jsonb,
  p_mes date,
  p_profissional_id uuid default null
) returns table (dia date)
language sql stable security definer set search_path = '' as $$
  with loja as (select fuso from public.petshop where id = p_petshop_id),
  periodo as (
    select greatest(date_trunc('month', p_mes)::date, (now() at time zone l.fuso)::date) as de,
           (date_trunc('month', p_mes) + interval '1 month - 1 day')::date as ate
      from loja l
  )
  select distinct (s.inicio at time zone l.fuso)::date
    from periodo p, loja l,
         app.slots(p_petshop_id, p_itens, p.de, p.ate, p_profissional_id, null, not app.eh_equipe(p_petshop_id)) s
   where p.de <= p.ate
     and s.inicio >= now()
   order by 1
$$;

create or replace function public.horarios_do_dia(
  p_petshop_id uuid,
  p_itens jsonb,
  p_data date,
  p_profissional_id uuid default null
) returns table (inicio timestamptz, hora text, retirada_estimada timestamptz, profissionais uuid[])
language sql stable security definer set search_path = '' as $$
  select s.inicio,
         to_char(s.inicio at time zone p.fuso, 'HH24:MI'),
         min(s.inicio + make_interval(mins => s.duracao_total_minutos)),
         array_agg(s.profissional_id order by s.profissional_id)
    from public.petshop p,
         app.slots(p_petshop_id, p_itens, p_data, p_data, p_profissional_id, null, not app.eh_equipe(p_petshop_id)) s
   where p.id = p_petshop_id
     and s.inicio >= now()
   group by s.inicio, p.fuso
   order by s.inicio
$$;
