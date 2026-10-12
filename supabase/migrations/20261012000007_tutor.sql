-- 007 — Lado do tutor: perfil, unidades da rede com preço e distância, profissionais com avaliação,
-- meus agendamentos, cancelar e remarcar, consentimento por loja e foto do pet.

-- ---------------------------------------------------------------------------
-- Endereços que não podem virar página de loja (rotas do próprio app)
-- ---------------------------------------------------------------------------
alter table public.petshop add constraint petshop_slug_reservado
  check (slug not in ('painel', 'entrar', 'conta', 'api', 'c', 'admin', 'ajuda', 'termos', 'privacidade', 'icons'));

-- ---------------------------------------------------------------------------
-- Telefone do tutor
-- ---------------------------------------------------------------------------
-- O telefone continua identificando o tutor, mas o cadastro feito pela loja (sem conta) e o cadastro com conta
-- podem ter o mesmo número até o tutor provar que o telefone é dele (código por WhatsApp/SMS, semanas 6–7).
-- Assim ninguém "assume" o histórico de outra pessoa só digitando um telefone.
alter table public.tutor drop constraint tutor_telefone_e164_key;
create unique index tutor_telefone_sem_conta_key on public.tutor (telefone_e164) where user_id is null;
create unique index tutor_telefone_com_conta_key on public.tutor (telefone_e164) where user_id is not null;

create function public.salvar_perfil_tutor(p_nome text, p_telefone text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'é preciso estar logado' using errcode = '42501';
  end if;
  insert into public.tutor (user_id, nome, telefone_e164, email)
  values (v_user, trim(p_nome), p_telefone, (select u.email from auth.users u where u.id = v_user))
  on conflict (user_id) do update
    set nome = excluded.nome, telefone_e164 = excluded.telefone_e164, email = excluded.email
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.salvar_perfil_tutor(text, text) from public, anon;
grant execute on function public.salvar_perfil_tutor(text, text) to authenticated;

-- Consentimento de contato (lembretes) e de marketing, por loja (LGPD).
create function public.registrar_consentimento(p_petshop_id uuid, p_contato boolean, p_marketing boolean default false)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tutor uuid := app.tutor_atual();
begin
  if v_tutor is null then
    raise exception 'complete seu cadastro antes' using errcode = '42501';
  end if;
  insert into public.tutor_petshop (petshop_id, tutor_id, consentimento_contato_em, consentimento_marketing_em)
  values (p_petshop_id, v_tutor, case when p_contato then now() end, case when p_marketing then now() end)
  on conflict (petshop_id, tutor_id) do update set
    consentimento_contato_em = case when p_contato then coalesce(public.tutor_petshop.consentimento_contato_em, now()) end,
    consentimento_marketing_em = case when p_marketing then coalesce(public.tutor_petshop.consentimento_marketing_em, now()) end;
end $$;

revoke all on function public.registrar_consentimento(uuid, boolean, boolean) from public, anon;
grant execute on function public.registrar_consentimento(uuid, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Motor: poder ignorar um agendamento (para remarcar sem colidir consigo mesmo)
-- ---------------------------------------------------------------------------
drop function app.slots(uuid, jsonb, date, date, uuid, uuid, boolean);

create function app.slots(
  p_petshop_id uuid,
  p_itens jsonb,
  p_de date,
  p_ate date,
  p_profissional_id uuid default null,
  p_tutor_id uuid default null,
  p_regras_cliente boolean default true,
  p_ignorar_agendamento uuid default null
)
returns table (profissional_id uuid, inicio timestamptz, duracao_total_minutos int)
language sql stable security definer set search_path = '' as $$
  with loja as (
    select p.id, p.fuso, make_interval(mins => p.slot_minutos) as slot, p.buffer_minutos,
           now() + make_interval(mins => p.antecedencia_minima_minutos) as primeiro_inicio,
           ((now() at time zone p.fuso)::date + p.janela_maxima_dias + 1)::timestamp at time zone p.fuso as limite
      from public.petshop p
     where p.id = p_petshop_id and p.ativo
  ),
  itens as (
    select distinct i.servico_id from app.expandir_itens(p_petshop_id, p_itens, p_tutor_id) i
  ),
  n_pets as (select jsonb_array_length(p_itens) as n),
  bloco as (
    select d.profissional_id,
           sum(d.duracao_minutos)::int + ((select n from n_pets) - 1) * (select buffer_minutos from loja) as minutos
      from app.duracoes(p_petshop_id, p_itens, p_profissional_id, p_tutor_id) d
     group by d.profissional_id
  ),
  dias as (
    select d::date as dia,
           extract(dow from d)::int as dow,
           tstzrange(d::timestamp at time zone l.fuso, (d + interval '1 day')::timestamp at time zone l.fuso) as faixa,
           d::timestamp at time zone l.fuso as meia_noite
      from loja l, generate_series(p_de, p_ate, interval '1 day') as d
  ),
  janelas_servico as (
    select b.profissional_id, dd.dia, s.servico_id,
           range_agg(tstzrange((dd.dia + h.inicio) at time zone l.fuso, (dd.dia + h.fim) at time zone l.fuso)) as mr
      from bloco b
      cross join dias dd
      cross join itens s
      cross join loja l
      join public.horario_trabalho h
        on h.profissional_id = b.profissional_id
       and h.dia_semana = dd.dow
       and h.servico_id is not distinct from (
             case when exists (select 1 from public.horario_trabalho e
                                where e.profissional_id = b.profissional_id and e.servico_id = s.servico_id)
                  then s.servico_id end)
     group by b.profissional_id, dd.dia, s.servico_id
  ),
  janelas as (
    select j.profissional_id, j.dia, range_intersect_agg(j.mr) as mr
      from janelas_servico j
     group by j.profissional_id, j.dia
    having count(*) = (select count(*) from itens)
  ),
  livres as (
    select j.profissional_id, j.dia, dd.meia_noite,
           j.mr
           - coalesce((select range_agg(bq.periodo) from public.bloqueio bq
                        where bq.petshop_id = p_petshop_id
                          and (bq.profissional_id is null or bq.profissional_id = j.profissional_id)
                          and bq.periodo && dd.faixa), '{}'::tstzmultirange)
           - coalesce(oc.mr, '{}'::tstzmultirange) as mr,
           coalesce(oc.mr, '{}'::tstzmultirange) as ocupado
      from janelas j
      join dias dd on dd.dia = j.dia
      left join lateral (
        select range_agg(a.ocupado) as mr from public.agendamento a
         where a.profissional_id = j.profissional_id
           and a.status not in ('cancelado', 'faltou')
           and a.id is distinct from p_ignorar_agendamento
           and a.ocupado && tstzrange(lower(dd.faixa) - interval '1 day', upper(dd.faixa) + interval '1 day')
      ) oc on true
  )
  select lv.profissional_id, t as inicio, b.minutos
    from livres lv
    join bloco b on b.profissional_id = lv.profissional_id
    cross join loja l
    cross join lateral unnest(lv.mr) as r
    cross join lateral generate_series(
      lv.meia_noite + l.slot * ceil(extract(epoch from lower(r) - lv.meia_noite) / extract(epoch from l.slot)),
      upper(r) - make_interval(mins => b.minutos),
      l.slot
    ) as t
   where not (lv.ocupado && tstzrange(t, t + make_interval(mins => b.minutos + l.buffer_minutos)))
     and (not p_regras_cliente or (t >= l.primeiro_inicio and t < l.limite))
$$;

revoke all on function app.slots(uuid, jsonb, date, date, uuid, uuid, boolean, uuid) from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Unidades da rede que atendem o pedido (etapa "Unidade")
-- ---------------------------------------------------------------------------
-- Os serviços são de cada unidade: o pedido montado na unidade de origem é traduzido pelo NOME do serviço.
-- Só entram unidades que têm todos os serviços com preço para o porte e a pelagem de cada pet.
create function public.unidades_para_pedido(p_petshop_id uuid, p_itens jsonb, p_lat numeric default null, p_lng numeric default null)
returns table (
  petshop_id uuid, nome text, slug text, endereco text, telefone text, distancia_km numeric,
  itens jsonb, total_centavos int
)
language sql stable security definer set search_path = '' as $$
  with origem as (
    select i.ordem, i.servico_ordem, i.porte, i.pelagem, lower(s.nome) as nome_servico
      from app.expandir_itens(p_petshop_id, p_itens) i
      join public.servico s on s.id = i.servico_id
  ),
  unidades as (
    select u.* from public.petshop u
      join public.petshop o on o.id = p_petshop_id and o.rede_id = u.rede_id
     where app.loja_publica(u.id)
  ),
  mapeados as (
    select u.id as unidade, o.ordem, o.servico_ordem, s.id as servico_id, sp.preco_centavos
      from unidades u
      cross join origem o
      left join public.servico s on s.petshop_id = u.id and s.ativo and lower(s.nome) = o.nome_servico
      left join public.servico_preco sp on sp.servico_id = s.id and sp.porte = o.porte and sp.pelagem = o.pelagem
  ),
  completos as (
    select m.unidade, sum(m.preco_centavos)::int as total
      from mapeados m
     group by m.unidade
    having count(*) = count(m.preco_centavos)
  ),
  itens_unidade as (
    select c.unidade,
           jsonb_agg(
             (p_itens -> (x.ordem - 1)) - 'servicos' || jsonb_build_object('servicos', x.servicos)
             order by x.ordem
           ) as itens
      from completos c
      join (select m.unidade, m.ordem, jsonb_agg(m.servico_id order by m.servico_ordem) as servicos
              from mapeados m group by m.unidade, m.ordem) x on x.unidade = c.unidade
     group by c.unidade
  )
  select u.id, u.nome, u.slug,
         concat_ws(', ', nullif(concat_ws(', ', u.logradouro, u.numero), ''), u.bairro, u.cidade),
         u.telefone_e164,
         case when p_lat is not null and p_lng is not null and u.latitude is not null and u.longitude is not null then
           round((6371 * 2 * asin(sqrt(
             power(sin(radians(u.latitude - p_lat) / 2), 2)
             + cos(radians(p_lat)) * cos(radians(u.latitude)) * power(sin(radians(u.longitude - p_lng) / 2), 2)
           )))::numeric, 1)
         end,
         iu.itens, c.total
    from unidades u
    join completos c on c.unidade = u.id
    join itens_unidade iu on iu.unidade = u.id
   order by 6 nulls last, (u.id <> p_petshop_id), u.nome
$$;

grant execute on function public.unidades_para_pedido(uuid, jsonb, numeric, numeric) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Profissionais com avaliação (estrelas só aparecem quando há avaliações)
-- ---------------------------------------------------------------------------
create function app.avaliacao_profissional(p_profissional_id uuid, out nota_media numeric, out avaliacoes int)
language sql stable security definer set search_path = '' as $$
  select round(avg(a.nota)::numeric, 1), count(*)::int from public.avaliacao a where a.profissional_id = p_profissional_id
$$;

-- Caminho "Profissional": todos os aptos para o pedido, antes de escolher data.
create function public.profissionais_aptos(p_petshop_id uuid, p_itens jsonb)
returns table (profissional_id uuid, nome text, foto_url text, bio text, nota_media numeric, avaliacoes int)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.nome, pr.foto_url, pr.bio, av.nota_media, av.avaliacoes
    from (select distinct d.profissional_id from app.duracoes(p_petshop_id, p_itens) d) apto
    join public.profissional pr on pr.id = apto.profissional_id
    cross join lateral app.avaliacao_profissional(pr.id) av
   order by pr.ordem, pr.nome
$$;

grant execute on function public.profissionais_aptos(uuid, jsonb) to anon, authenticated;

drop function public.profissionais_disponiveis(uuid, jsonb, timestamptz);
create function public.profissionais_disponiveis(
  p_petshop_id uuid,
  p_itens jsonb,
  p_inicio timestamptz
) returns table (
  profissional_id uuid, nome text, foto_url text, bio text, retirada_estimada timestamptz, nota_media numeric, avaliacoes int
)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.nome, pr.foto_url, pr.bio, s.inicio + make_interval(mins => s.duracao_total_minutos),
         av.nota_media, av.avaliacoes
    from public.petshop p
    cross join lateral app.slots(p_petshop_id, p_itens, (p_inicio at time zone p.fuso)::date,
                                 (p_inicio at time zone p.fuso)::date, null, null, not app.eh_equipe(p_petshop_id)) s
    join public.profissional pr on pr.id = s.profissional_id
    cross join lateral app.avaliacao_profissional(pr.id) av
   where p.id = p_petshop_id and s.inicio = p_inicio
   order by pr.ordem, pr.nome
$$;

grant execute on function public.profissionais_disponiveis(uuid, jsonb, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Meus agendamentos
-- ---------------------------------------------------------------------------
create function public.meus_agendamentos()
returns table (
  id uuid, pedido_id uuid, status public.status_agendamento, inicio timestamptz, fim timestamptz,
  petshop_id uuid, loja_nome text, loja_slug text, loja_telefone text, loja_fuso text,
  pet_id uuid, pet_nome text, profissional_id uuid, profissional_nome text, servicos text[],
  preco_total_centavos int, cancelamento_gratuito_ate timestamptz
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.pedido_id, a.status, a.inicio, a.fim,
         p.id, p.nome, p.slug, p.telefone_e164, p.fuso,
         pe.id, pe.nome, pr.id, pr.nome,
         (select array_agg(s.nome order by ai.ordem) from public.agendamento_item ai
            join public.servico s on s.id = ai.servico_id where ai.agendamento_id = a.id),
         a.preco_total_centavos,
         a.inicio - make_interval(hours => p.cancelamento_gratuito_horas)
    from public.agendamento a
    join public.petshop p on p.id = a.petshop_id
    join public.pet pe on pe.id = a.pet_id
    join public.profissional pr on pr.id = a.profissional_id
   where a.tutor_id = app.tutor_atual()
   order by a.inicio desc
$$;

grant execute on function public.meus_agendamentos() to authenticated;

-- Quem pode mexer num agendamento: o próprio tutor ou a equipe que opera a loja.
create function app.agendamento_para_alterar(p_agendamento_id uuid)
returns public.agendamento
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.agendamento;
begin
  select * into v from public.agendamento where id = p_agendamento_id;
  if v.id is null or not (v.tutor_id = app.tutor_atual() or app.eh_equipe(v.petshop_id)) then
    raise exception 'agendamento não encontrado' using errcode = 'AG002';
  end if;
  if v.status not in ('agendado', 'confirmado') then
    raise exception 'este agendamento não pode mais ser alterado' using errcode = 'AG002';
  end if;
  if not app.eh_equipe(v.petshop_id) and v.inicio <= now() then
    raise exception 'o horário já passou' using errcode = 'AG004';
  end if;
  return v;
end $$;

-- Cancela um agendamento (um pet). Fora do prazo gratuito o cancelamento continua permitido; com o pagamento
-- (semana 8), o sinal fica retido. Devolve se foi dentro do prazo.
create function public.cancelar_agendamento(p_agendamento_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.agendamento := app.agendamento_para_alterar(p_agendamento_id);
  v_horas smallint;
begin
  select cancelamento_gratuito_horas into v_horas from public.petshop where id = v.petshop_id;
  update public.agendamento set status = 'cancelado' where id = v.id;
  update public.notificacao_agendada set status = 'cancelada'
   where agendamento_id = v.id and status = 'pendente';
  return jsonb_build_object('gratuito', now() <= v.inicio - make_interval(hours => v_horas));
end $$;

revoke all on function public.cancelar_agendamento(uuid) from public, anon;
grant execute on function public.cancelar_agendamento(uuid) to authenticated;

-- Remarca um agendamento (um pet) para outro horário, pelo motor de disponibilidade.
-- Sem profissional: mantém o atual se ele estiver livre; senão, quem tiver menos minutos no dia.
create function public.remarcar_agendamento(p_agendamento_id uuid, p_inicio timestamptz, p_profissional_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.agendamento := app.agendamento_para_alterar(p_agendamento_id);
  v_loja public.petshop;
  v_itens jsonb;
  v_prof uuid;
  v_minutos int;
  v_dia date;
begin
  select * into v_loja from public.petshop where id = v.petshop_id;
  v_dia := (p_inicio at time zone v_loja.fuso)::date;
  select jsonb_build_array(jsonb_build_object('pet_id', v.pet_id,
           'servicos', jsonb_agg(ai.servico_id order by ai.ordem)))
    into v_itens
    from public.agendamento_item ai where ai.agendamento_id = v.id;

  select s.profissional_id, s.duracao_total_minutos into v_prof, v_minutos
    from app.slots(v.petshop_id, v_itens, v_dia, v_dia, p_profissional_id, v.tutor_id,
                   not app.eh_equipe(v.petshop_id), v.id) s
    join public.profissional pr on pr.id = s.profissional_id
    left join lateral (
      select coalesce(sum(extract(epoch from a.fim - a.inicio)), 0) as ocupado
        from public.agendamento a
       where a.profissional_id = s.profissional_id and a.id <> v.id
         and a.status not in ('cancelado', 'faltou')
         and (a.inicio at time zone v_loja.fuso)::date = v_dia
    ) carga on true
   where s.inicio = p_inicio
   order by (s.profissional_id = v.profissional_id) desc, carga.ocupado, pr.ordem, pr.id
   limit 1;
  if v_prof is null then
    raise exception 'horário indisponível' using errcode = 'AG001';
  end if;

  begin
    update public.agendamento
       set inicio = p_inicio,
           fim = p_inicio + make_interval(mins => v_minutos),
           profissional_id = v_prof,
           status = 'agendado'
     where id = v.id;
  exception when exclusion_violation then
    raise exception 'horário indisponível' using errcode = 'AG001';
  end;

  -- Durações dos itens passam a refletir o fator do novo profissional.
  update public.agendamento_item ai
     set duracao_minutos = ceil(sp.duracao_minutos * ps.fator_duracao)::int
    from public.pet pe, public.servico_preco sp, public.profissional_servico ps
   where ai.agendamento_id = v.id and pe.id = v.pet_id
     and sp.servico_id = ai.servico_id and sp.porte = pe.porte and sp.pelagem = pe.pelagem
     and ps.profissional_id = v_prof and ps.servico_id = ai.servico_id;

  update public.notificacao_agendada set status = 'cancelada'
   where agendamento_id = v.id and status = 'pendente';

  return jsonb_build_object('id', v.id, 'inicio', p_inicio, 'fim', p_inicio + make_interval(mins => v_minutos),
                            'profissional_id', v_prof);
end $$;

revoke all on function public.remarcar_agendamento(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.remarcar_agendamento(uuid, timestamptz, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Foto do pet: o tutor escreve só na própria pasta (fotos/tutores/{tutor_id}/…)
-- ---------------------------------------------------------------------------
create policy fotos_tutor_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = 'tutores'
              and (storage.foldername(name))[2] = (select app.tutor_atual())::text);
create policy fotos_tutor_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = 'tutores'
         and (storage.foldername(name))[2] = (select app.tutor_atual())::text);

revoke all on function app.avaliacao_profissional(uuid), app.agendamento_para_alterar(uuid) from anon, authenticated;
