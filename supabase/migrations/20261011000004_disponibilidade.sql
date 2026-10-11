-- 004 — Motor de disponibilidade e criação de pedidos.
--
-- Entrada comum (p_itens, jsonb): um item por pet, na ordem em que serão atendidos.
--   [{ "pet_id": "…", "servicos": ["<principal>", "<adicional>", …] }]
--   ou, antes do login: [{ "porte": "medio", "pelagem": "longa", "servicos": [...] }]
-- O primeiro serviço de cada item é o principal (escolha única); os demais são adicionais.
--
-- Regras:
--   * duração do pet = Σ duração(serviço, porte, pelagem) × fator_duracao do profissional (arredondada para cima);
--   * um único profissional, habilitado em TODOS os serviços de TODOS os pets;
--   * vários pets em sequência, num bloco contínuo, cada agendamento seguido do buffer da loja;
--   * a janela específica do serviço substitui a geral naquele dia; o bloco precisa caber em janelas válidas
--     para todos os serviços pedidos;
--   * respeita bloqueios, agendamentos existentes (com buffer), fuso, antecedência mínima e janela máxima;
--   * horários na grade de petshop.slot_minutos, contada a partir da meia-noite local.
--
-- Códigos de erro (SQLSTATE) devolvidos ao app:
--   AG001 horário indisponível
--   AG002 pedido inválido (pet, serviço ou combinação)
--   AG003 serviço sem preço para o porte/pelagem do pet
--   AG004 fora do período de agendamento (antecedência mínima ou janela máxima)
--   42501 sem permissão

-- ---------------------------------------------------------------------------
-- Itens do pedido, validados e expandidos (um registro por pet × serviço)
-- ---------------------------------------------------------------------------
create function app.expandir_itens(p_petshop_id uuid, p_itens jsonb, p_tutor_id uuid default null)
returns table (
  ordem int,
  pet_id uuid,
  porte public.porte,
  pelagem public.pelagem,
  servico_id uuid,
  servico_ordem int,
  preco_centavos int,
  duracao_minutos int
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_item jsonb;
  v_ordem int := 0;
  v_pet record;
  v_porte public.porte;
  v_pelagem public.pelagem;
  v_servicos uuid[];
  v_servico uuid;
  v_i int;
  v_tipo public.tipo_servico;
  v_preco int;
  v_duracao int;
  v_pets uuid[] := '{}';
  v_equipe boolean := p_petshop_id = any(app.lojas_operacao()) or coalesce(auth.role(), '') = 'service_role';
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'informe ao menos um pet' using errcode = 'AG002';
  end if;
  if jsonb_array_length(p_itens) > 10 then
    raise exception 'no máximo 10 pets por pedido' using errcode = 'AG002';
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_ordem := v_ordem + 1;
    pet_id := null;

    if v_item ? 'pet_id' then
      select p.id, p.tutor_id, p.porte, p.pelagem, p.ativo into v_pet
        from public.pet p where p.id = (v_item ->> 'pet_id')::uuid;
      if v_pet.id is null or not v_pet.ativo then
        raise exception 'pet não encontrado' using errcode = 'AG002';
      end if;
      -- O pet precisa ser do tutor do pedido (ou de quem está logado); a equipe da loja pode consultar qualquer pet.
      if p_tutor_id is not null then
        if v_pet.tutor_id <> p_tutor_id then
          raise exception 'o pet não pertence ao tutor do pedido' using errcode = 'AG002';
        end if;
      elsif not v_equipe and v_pet.tutor_id is distinct from app.tutor_atual() then
        raise exception 'pet não encontrado' using errcode = 'AG002';
      end if;
      if v_pet.id = any(v_pets) then
        raise exception 'o mesmo pet aparece duas vezes no pedido' using errcode = 'AG002';
      end if;
      v_pets := v_pets || v_pet.id;
      pet_id := v_pet.id;
      v_porte := v_pet.porte;
      v_pelagem := v_pet.pelagem;
    else
      if p_tutor_id is not null then
        raise exception 'o pedido precisa dos pets cadastrados' using errcode = 'AG002';
      end if;
      begin
        v_porte := (v_item ->> 'porte')::public.porte;
        v_pelagem := (v_item ->> 'pelagem')::public.pelagem;
      exception when invalid_text_representation then
        raise exception 'porte ou pelagem inválidos' using errcode = 'AG002';
      end;
      if v_porte is null or v_pelagem is null then
        raise exception 'informe o pet ou o porte e a pelagem' using errcode = 'AG002';
      end if;
    end if;

    if jsonb_typeof(v_item -> 'servicos') <> 'array' or jsonb_array_length(v_item -> 'servicos') = 0 then
      raise exception 'escolha o serviço principal' using errcode = 'AG002';
    end if;
    select array_agg(value::uuid order by n) into v_servicos
      from jsonb_array_elements_text(v_item -> 'servicos') with ordinality as t (value, n);
    if cardinality(v_servicos) <> (select count(distinct x) from unnest(v_servicos) x) then
      raise exception 'serviço repetido para o mesmo pet' using errcode = 'AG002';
    end if;

    v_i := 0;
    foreach v_servico in array v_servicos loop
      v_i := v_i + 1;
      select s.tipo into v_tipo from public.servico s
       where s.id = v_servico and s.petshop_id = p_petshop_id and s.ativo;
      if v_tipo is null then
        raise exception 'serviço não encontrado nesta loja' using errcode = 'AG002';
      end if;
      if (v_i = 1) <> (v_tipo = 'principal') then
        raise exception 'escolha exatamente um serviço principal por pet, seguido dos adicionais' using errcode = 'AG002';
      end if;
      select sp.preco_centavos, sp.duracao_minutos into v_preco, v_duracao
        from public.servico_preco sp
       where sp.servico_id = v_servico and sp.porte = v_porte and sp.pelagem = v_pelagem;
      if v_preco is null then
        raise exception 'a loja não atende esse serviço para o porte e a pelagem do pet' using errcode = 'AG003';
      end if;

      ordem := v_ordem;
      porte := v_porte;
      pelagem := v_pelagem;
      servico_id := v_servico;
      servico_ordem := v_i;
      preco_centavos := v_preco;
      duracao_minutos := v_duracao;
      return next;
      v_tipo := null;
      v_preco := null;
    end loop;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Duração por profissional apto (habilitado em todos os serviços do pedido)
-- ---------------------------------------------------------------------------
create function app.duracoes(p_petshop_id uuid, p_itens jsonb, p_profissional_id uuid default null, p_tutor_id uuid default null)
returns table (profissional_id uuid, ordem int, duracao_minutos int)
language sql stable security definer set search_path = '' as $$
  with itens as (
    select * from app.expandir_itens(p_petshop_id, p_itens, p_tutor_id)
  ),
  aptos as (
    select ps.profissional_id
      from public.profissional_servico ps
      join public.profissional p on p.id = ps.profissional_id and p.ativo and p.petshop_id = p_petshop_id
     where ps.servico_id in (select servico_id from itens)
       and (p_profissional_id is null or ps.profissional_id = p_profissional_id)
     group by ps.profissional_id
    having count(distinct ps.servico_id) = (select count(distinct servico_id) from itens)
  )
  select a.profissional_id, i.ordem, sum(ceil(i.duracao_minutos * ps.fator_duracao))::int
    from aptos a
    cross join itens i
    join public.profissional_servico ps on ps.profissional_id = a.profissional_id and ps.servico_id = i.servico_id
   group by a.profissional_id, i.ordem
$$;

-- ---------------------------------------------------------------------------
-- Núcleo: horários livres num intervalo de datas locais
-- ---------------------------------------------------------------------------
-- Devolve, para cada profissional apto, os inícios possíveis e a duração total do bloco
-- (soma dos pets + buffers entre eles). p_regras_cliente aplica antecedência mínima e janela máxima.
create function app.slots(
  p_petshop_id uuid,
  p_itens jsonb,
  p_de date,
  p_ate date,
  p_profissional_id uuid default null,
  p_tutor_id uuid default null,
  p_regras_cliente boolean default true
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
    -- Duração total por profissional: pets em sequência com o buffer da loja entre eles.
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
  -- Janelas de cada serviço pedido: se o profissional tem janelas específicas para o serviço, só elas valem
  -- (ex.: "tosa só terça e quinta de manhã"); senão, valem as janelas gerais.
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
  -- O bloco precisa caber numa janela válida para todos os serviços.
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
           and a.ocupado && tstzrange(lower(dd.faixa) - interval '1 day', upper(dd.faixa) + interval '1 day')
      ) oc on true
  )
  select lv.profissional_id, t as inicio, b.minutos
    from livres lv
    join bloco b on b.profissional_id = lv.profissional_id
    cross join loja l
    cross join lateral unnest(lv.mr) as r
    cross join lateral generate_series(
      -- primeiro horário da grade (contada a partir da meia-noite local) dentro do trecho livre
      lv.meia_noite + l.slot * ceil(extract(epoch from lower(r) - lv.meia_noite) / extract(epoch from l.slot)),
      upper(r) - make_interval(mins => b.minutos),
      l.slot
    ) as t
   -- O buffer depois do último pet também não pode invadir o próximo agendamento.
   where not (lv.ocupado && tstzrange(t, t + make_interval(mins => b.minutos + l.buffer_minutos)))
     and (not p_regras_cliente or (t >= l.primeiro_inicio and t < l.limite))
$$;

-- Equipe da loja (ou o sistema) agenda sem antecedência mínima nem janela máxima.
create function app.eh_equipe(p_petshop_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_petshop_id = any(app.lojas_operacao()) or coalesce(auth.role(), '') = 'service_role'
$$;

-- ---------------------------------------------------------------------------
-- Consultas públicas (uma para cada tela do fluxo do tutor)
-- ---------------------------------------------------------------------------

-- Calendário: dias do mês com ao menos um horário.
create function public.dias_com_vaga(
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
   order by 1
$$;

-- Horários do dia, na grade da loja. "Qualquer profissional": basta um com vaga.
create function public.horarios_do_dia(
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
   group by s.inicio, p.fuso
   order by s.inicio
$$;

-- Quem pode atender num horário (tela "escolher profissional" / "Saber mais").
create function public.profissionais_disponiveis(
  p_petshop_id uuid,
  p_itens jsonb,
  p_inicio timestamptz
) returns table (profissional_id uuid, nome text, foto_url text, bio text, retirada_estimada timestamptz)
language sql stable security definer set search_path = '' as $$
  select pr.id, pr.nome, pr.foto_url, pr.bio, s.inicio + make_interval(mins => s.duracao_total_minutos)
    from public.petshop p
    cross join lateral app.slots(p_petshop_id, p_itens, (p_inicio at time zone p.fuso)::date,
                                 (p_inicio at time zone p.fuso)::date, null, null, not app.eh_equipe(p_petshop_id)) s
    join public.profissional pr on pr.id = s.profissional_id
   where p.id = p_petshop_id and s.inicio = p_inicio
   order by pr.ordem, pr.nome
$$;

grant execute on function public.dias_com_vaga(uuid, jsonb, date, uuid) to anon, authenticated;
grant execute on function public.horarios_do_dia(uuid, jsonb, date, uuid) to anon, authenticated;
grant execute on function public.profissionais_disponiveis(uuid, jsonb, timestamptz) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- criar_pedido: a única porta de entrada para agendar (app, balcão, WhatsApp, marketplace)
-- ---------------------------------------------------------------------------
create function public.criar_pedido(
  p_petshop_id uuid,
  p_tutor_id uuid,
  p_itens jsonb,
  p_inicio timestamptz,
  p_canal public.canal_agendamento,
  p_chave_idempotencia text,
  p_profissional_id uuid default null,
  p_observacoes text default null,
  p_encaixe boolean default false
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_loja public.petshop;
  v_equipe boolean := app.eh_equipe(p_petshop_id);
  v_servico boolean := coalesce(auth.role(), '') = 'service_role';
  v_criado_por_tipo public.criado_por_tipo;
  v_pedido uuid;
  v_prof uuid;
  v_inicio timestamptz := p_inicio;
  v_fim timestamptz;
  v_dur record;
  v_ag uuid;
  v_total int := 0;
  v_preco int;
begin
  -- Autorização ---------------------------------------------------------------
  if v_servico then
    v_criado_por_tipo := case when p_canal = 'whatsapp' then 'bot_whatsapp' else 'sistema' end;
  elsif v_equipe then
    v_criado_por_tipo := 'equipe';
  elsif p_tutor_id is not null and p_tutor_id = app.tutor_atual() then
    if p_canal not in ('app_proprio', 'marketplace') then
      raise exception 'canal não permitido para o tutor' using errcode = '42501';
    end if;
    v_criado_por_tipo := 'tutor';
  else
    raise exception 'sem permissão para agendar para este tutor' using errcode = '42501';
  end if;
  if p_encaixe and v_criado_por_tipo <> 'equipe' then
    raise exception 'só a equipe da loja faz encaixe' using errcode = '42501';
  end if;
  if coalesce(trim(p_chave_idempotencia), '') = '' then
    raise exception 'chave de idempotência obrigatória' using errcode = 'AG002';
  end if;

  select * into v_loja from public.petshop where id = p_petshop_id and ativo;
  if v_loja.id is null then
    raise exception 'loja não encontrada' using errcode = 'AG002';
  end if;

  -- Idempotência: a mesma chave devolve o pedido já criado -----------------------
  select id into v_pedido from public.pedido where petshop_id = p_petshop_id and chave_idempotencia = p_chave_idempotencia;
  if v_pedido is not null then
    return app.pedido_existente(v_pedido, p_tutor_id);
  end if;

  -- Escolha do profissional ---------------------------------------------------
  if p_encaixe then
    if p_profissional_id is null then
      raise exception 'escolha o profissional do encaixe' using errcode = 'AG002';
    end if;
    -- Só confere aptidão; a grade e os horários de trabalho são ignorados (a constraint ainda vale).
    if not exists (select 1 from app.duracoes(p_petshop_id, p_itens, p_profissional_id, p_tutor_id)) then
      raise exception 'o profissional não faz todos os serviços escolhidos' using errcode = 'AG002';
    end if;
    v_prof := p_profissional_id;
  else
    if not v_equipe and (v_inicio < now() + make_interval(mins => v_loja.antecedencia_minima_minutos)
        or (v_inicio at time zone v_loja.fuso)::date > (now() at time zone v_loja.fuso)::date + v_loja.janela_maxima_dias) then
      raise exception 'horário fora do período de agendamento da loja' using errcode = 'AG004';
    end if;
    -- "Qualquer profissional": quem tem menos minutos agendados no dia; empate pela ordem da loja.
    select s.profissional_id into v_prof
      from app.slots(p_petshop_id, p_itens, (v_inicio at time zone v_loja.fuso)::date,
                     (v_inicio at time zone v_loja.fuso)::date, p_profissional_id, p_tutor_id, false) s
      join public.profissional pr on pr.id = s.profissional_id
      left join lateral (
        select coalesce(sum(extract(epoch from a.fim - a.inicio)), 0) as ocupado
          from public.agendamento a
         where a.profissional_id = s.profissional_id
           and a.status not in ('cancelado', 'faltou')
           and (a.inicio at time zone v_loja.fuso)::date = (v_inicio at time zone v_loja.fuso)::date
      ) carga on true
     where s.inicio = v_inicio
     order by carga.ocupado, pr.ordem, pr.nome, pr.id
     limit 1;
    if v_prof is null then
      raise exception 'horário indisponível' using errcode = 'AG001';
    end if;
  end if;

  -- Gravação (tudo ou nada) ---------------------------------------------------
  begin
    insert into public.pedido (petshop_id, tutor_id, canal, chave_idempotencia, criado_por_tipo, criado_por)
    values (p_petshop_id, p_tutor_id, p_canal, p_chave_idempotencia, v_criado_por_tipo, auth.uid())
    returning id into v_pedido;
  exception when unique_violation then
    -- Outra requisição com a mesma chave chegou primeiro.
    select id into v_pedido from public.pedido where petshop_id = p_petshop_id and chave_idempotencia = p_chave_idempotencia;
    return app.pedido_existente(v_pedido, p_tutor_id);
  end;

  insert into public.tutor_petshop (petshop_id, tutor_id) values (p_petshop_id, p_tutor_id) on conflict do nothing;

  for v_dur in
    select d.ordem, d.duracao_minutos,
           (select i.pet_id from app.expandir_itens(p_petshop_id, p_itens, p_tutor_id) i where i.ordem = d.ordem limit 1) as pet_id
      from app.duracoes(p_petshop_id, p_itens, v_prof, p_tutor_id) d
     order by d.ordem
  loop
    v_fim := v_inicio + make_interval(mins => v_dur.duracao_minutos);
    select sum(i.preco_centavos) into v_preco
      from app.expandir_itens(p_petshop_id, p_itens, p_tutor_id) i where i.ordem = v_dur.ordem;

    begin
      insert into public.agendamento (petshop_id, pedido_id, tutor_id, pet_id, profissional_id, canal,
                                      inicio, fim, buffer_minutos, encaixe, preco_total_centavos, observacoes)
      values (p_petshop_id, v_pedido, p_tutor_id, v_dur.pet_id, v_prof, p_canal,
              v_inicio, v_fim, v_loja.buffer_minutos, p_encaixe, v_preco, nullif(trim(p_observacoes), ''))
      returning id into v_ag;
    exception when exclusion_violation then
      raise exception 'horário indisponível' using errcode = 'AG001';
    end;

    insert into public.agendamento_item (petshop_id, agendamento_id, servico_id, ordem, preco_centavos, duracao_minutos)
    select p_petshop_id, v_ag, i.servico_id, i.servico_ordem, i.preco_centavos,
           ceil(i.duracao_minutos * ps.fator_duracao)::int
      from app.expandir_itens(p_petshop_id, p_itens, p_tutor_id) i
      join public.profissional_servico ps on ps.profissional_id = v_prof and ps.servico_id = i.servico_id
     where i.ordem = v_dur.ordem;

    v_total := v_total + v_preco;
    v_inicio := v_fim + make_interval(mins => v_loja.buffer_minutos);
  end loop;

  update public.pedido set total_centavos = v_total where id = v_pedido;
  return app.resumo_pedido(v_pedido, p_tutor_id);
end $$;

-- Resumo devolvido ao app: pedido, agendamentos e horário estimado de retirada.
create function app.resumo_pedido(p_pedido_id uuid, p_tutor_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'pedido_id', pd.id,
    'total_centavos', pd.total_centavos,
    'token_confirmacao', pd.token_confirmacao,
    'retirada_estimada', max(a.fim),
    'agendamentos', jsonb_agg(jsonb_build_object(
      'id', a.id, 'pet_id', a.pet_id, 'profissional_id', a.profissional_id,
      'inicio', a.inicio, 'fim', a.fim, 'preco_total_centavos', a.preco_total_centavos) order by a.inicio)
  )
  from public.pedido pd
  join public.agendamento a on a.pedido_id = pd.id
  where pd.id = p_pedido_id
    -- A mesma chave usada por outro tutor não revela o pedido alheio.
    and pd.tutor_id = p_tutor_id
  group by pd.id
$$;

-- Repetição da mesma chave: devolve o pedido original; a chave usada por outro tutor é recusada.
create function app.pedido_existente(p_pedido_id uuid, p_tutor_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_resumo jsonb := app.resumo_pedido(p_pedido_id, p_tutor_id);
begin
  if v_resumo is null then
    raise exception 'chave de idempotência já usada em outro pedido' using errcode = 'AG002';
  end if;
  return v_resumo;
end $$;

revoke all on function public.criar_pedido(uuid, uuid, jsonb, timestamptz, public.canal_agendamento, text, uuid, text, boolean) from public, anon;
grant execute on function public.criar_pedido(uuid, uuid, jsonb, timestamptz, public.canal_agendamento, text, uuid, text, boolean) to authenticated, service_role;
revoke all on function app.expandir_itens(uuid, jsonb, uuid), app.duracoes(uuid, jsonb, uuid, uuid),
  app.slots(uuid, jsonb, date, date, uuid, uuid, boolean), app.resumo_pedido(uuid, uuid),
  app.pedido_existente(uuid, uuid) from anon, authenticated;
