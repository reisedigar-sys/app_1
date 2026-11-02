-- Semana 8b: devolver ou reter o sinal, conferência com o Asaas e o que a loja e o tutor veem do sinal.
-- O sinal do pedido é dividido entre os pets (pagamento_parte), na proporção do valor de cada um. Cada parte segue o
-- seu atendimento:
--   tutor cancela dentro do prazo gratuito → devolvida; fora do prazo → retida (fica com a loja);
--   a loja cancela → devolvida; falta → retida; atendimento concluído → abatida do valor a pagar na loja;
--   remarcar não mexe (o prazo passa a contar do horário novo, porque é o mesmo agendamento).
-- Devoluções entram na fila `estorno`; o worker da semana 6 (Edge Function `notificacoes`) faz o estorno no Asaas
-- com a chave da subconta da loja. O mesmo worker confere uma vez, uma hora depois do vencimento, se um Pix dado como
-- não pago caiu sem o webhook avisar (vira devolução, porque o horário já foi liberado).

create type public.situacao_sinal as enum ('aguardando', 'pago', 'cancelado', 'devolver', 'devolvido', 'retido', 'abatido');

-- ---------------------------------------------------------------------------
-- Parte do sinal de cada pet
-- ---------------------------------------------------------------------------
create table public.pagamento_parte (
  agendamento_id uuid primary key references public.agendamento (id) on delete cascade,
  pagamento_id uuid not null references public.pagamento (id) on delete cascade,
  petshop_id uuid not null references public.petshop (id),
  tutor_id uuid not null references public.tutor (id),
  valor_centavos integer not null check (valor_centavos >= 0),
  situacao public.situacao_sinal not null default 'aguardando',
  atualizado_em timestamptz not null default now()
);
create index pagamento_parte_pagamento_idx on public.pagamento_parte (pagamento_id);
create index pagamento_parte_petshop_idx on public.pagamento_parte (petshop_id, atualizado_em desc);
alter table public.pagamento_parte enable row level security;
create policy pagamento_parte_select on public.pagamento_parte for select to authenticated
  using (tutor_id = app.tutor_atual() or petshop_id = any(app.lojas_operacao()));
grant select on public.pagamento_parte to authenticated;

-- ---------------------------------------------------------------------------
-- Devoluções (estornos no provedor)
-- ---------------------------------------------------------------------------
-- agendamento_id nulo = o pagamento inteiro (Pix que caiu depois de o horário ser liberado).
create table public.estorno (
  id uuid primary key default gen_random_uuid(),
  pagamento_id uuid not null references public.pagamento (id) on delete cascade,
  agendamento_id uuid references public.agendamento (id) on delete set null,
  petshop_id uuid not null references public.petshop (id),
  valor_centavos integer not null check (valor_centavos > 0),
  motivo text not null check (motivo in ('tutor_no_prazo', 'loja_cancelou', 'pago_depois')),
  status text not null default 'pendente' check (status in ('pendente', 'processando', 'feito', 'erro')),
  tentativas smallint not null default 0,
  proxima_tentativa_em timestamptz not null default now(),
  processando_desde timestamptz,
  provedor_estorno_id text,
  erro text,
  criado_em timestamptz not null default now(),
  feito_em timestamptz
);
create index estorno_fila_idx on public.estorno (proxima_tentativa_em) where status = 'pendente';
create index estorno_petshop_idx on public.estorno (petshop_id, criado_em desc);
alter table public.estorno enable row level security;
-- Dono e gerente acompanham (ex.: devolução que o Asaas recusou e precisa ser feita à mão).
create policy estorno_select on public.estorno for select to authenticated
  using (petshop_id = any(app.lojas_admin()));
grant select on public.estorno to authenticated;

-- Conferência com o provedor: quando o Pix vencido foi conferido (uma vez só).
alter table public.pagamento add column conferido_em timestamptz;

-- ---------------------------------------------------------------------------
-- Divisão do sinal entre os pets
-- ---------------------------------------------------------------------------
-- Proporcional ao valor de cada atendimento; o resto dos centavos fica com o último.
create function app.dividir_sinal(p_pagamento_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.pagamento;
  a record;
  v_total bigint;
  v_n int;
  v_i int := 0;
  v_resto int;
  v_parte int;
begin
  select * into v from public.pagamento where id = p_pagamento_id;
  select coalesce(sum(preco_total_centavos), 0), count(*) into v_total, v_n
    from public.agendamento where pedido_id = v.pedido_id;
  v_resto := v.valor_centavos;
  for a in select id, preco_total_centavos from public.agendamento where pedido_id = v.pedido_id order by inicio, id loop
    v_i := v_i + 1;
    if v_i = v_n then
      v_parte := v_resto;
    elsif v_total > 0 then
      v_parte := floor(v.valor_centavos::numeric * a.preco_total_centavos / v_total)::int;
    else
      v_parte := v.valor_centavos / v_n;
    end if;
    v_resto := v_resto - v_parte;
    insert into public.pagamento_parte (agendamento_id, pagamento_id, petshop_id, tutor_id, valor_centavos)
    values (a.id, v.id, v.petshop_id, v.tutor_id, v_parte)
    on conflict (agendamento_id) do nothing;
  end loop;
end $$;

-- Mesmo corpo da migração 017, agora dividindo o sinal entre os pets.
create or replace function app.pedido_cria_pagamento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_valor int;
  v_expira timestamptz := now() + interval '15 minutes';
  v_provedor text;
  v_id uuid;
begin
  v_valor := app.valor_sinal(new.petshop_id, new.tutor_id, new.total_centavos,
                             (select count(*)::int from public.agendamento a where a.pedido_id = new.id));
  if v_valor <= 0 then
    return new;
  end if;
  select provedor into v_provedor from public.petshop_pagamento where petshop_id = new.petshop_id;
  insert into public.pagamento (petshop_id, pedido_id, tutor_id, valor_centavos, provedor, expira_em)
  values (new.petshop_id, new.id, new.tutor_id, v_valor, v_provedor, v_expira)
  returning id into v_id;
  perform app.dividir_sinal(v_id);
  update public.notificacao_agendada set proxima_tentativa_em = v_expira + interval '3 minutes'
   where pedido_id = new.id and status = 'pendente';
  return new;
end $$;

-- Pagamentos que já existem (da 8a): partes criadas com a situação equivalente.
do $$
declare
  v record;
begin
  for v in select id, status from public.pagamento loop
    perform app.dividir_sinal(v.id);
    update public.pagamento_parte pp
       set situacao = case
             when v.status = 'aguardando' then 'aguardando'
             when v.status in ('expirado', 'cancelado') then 'cancelado'
             when v.status = 'devolver' then 'devolver'
             when a.status = 'faltou' then 'retido'
             when a.status = 'concluido' then 'abatido'
             else 'pago' end::public.situacao_sinal
      from public.agendamento a
     where pp.pagamento_id = v.id and a.id = pp.agendamento_id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Pedir devolução
-- ---------------------------------------------------------------------------
create function app.pedir_estorno(p_pagamento_id uuid, p_agendamento_id uuid, p_valor int, p_motivo text) returns void
language sql volatile security definer set search_path = '' as $$
  insert into public.estorno (pagamento_id, agendamento_id, petshop_id, valor_centavos, motivo)
  select p.id, p_agendamento_id, p.petshop_id, p_valor, p_motivo
    from public.pagamento p
   where p.id = p_pagamento_id and p_valor > 0
$$;

-- ---------------------------------------------------------------------------
-- O sinal segue o atendimento
-- ---------------------------------------------------------------------------
-- Quem cancelou: a equipe da loja (ou o sistema, sem usuário) → devolve; o tutor (logado ou pelo link, sem login)
-- → devolve dentro do prazo gratuito, retém fora dele. O prazo conta do horário de antes do cancelamento.
create function app.agendamento_sinal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.pagamento_parte;
  v_horas smallint;
  v_loja boolean;
  v_nova public.situacao_sinal;
begin
  select * into p from public.pagamento_parte where agendamento_id = new.id for update;
  if p.agendamento_id is null then
    return new;
  end if;
  if new.status = 'cancelado' then
    if p.situacao = 'aguardando' then
      v_nova := 'cancelado';
    elsif p.situacao = 'pago' then
      v_loja := new.petshop_id = any(app.lojas_operacao())
                or coalesce(auth.role(), '') not in ('anon', 'authenticated');
      select cancelamento_gratuito_horas into v_horas from public.petshop where id = new.petshop_id;
      if v_loja or now() <= old.inicio - make_interval(hours => v_horas) then
        v_nova := case when p.valor_centavos > 0 then 'devolver' else 'devolvido' end;
        perform app.pedir_estorno(p.pagamento_id, new.id, p.valor_centavos,
                                  case when v_loja then 'loja_cancelou' else 'tutor_no_prazo' end);
      else
        v_nova := 'retido';
      end if;
    end if;
  elsif new.status = 'faltou' and p.situacao = 'pago' then
    v_nova := 'retido';
  elsif new.status = 'concluido' and p.situacao = 'pago' then
    v_nova := 'abatido';
  elsif new.status not in ('faltou', 'concluido', 'cancelado') and p.situacao in ('retido', 'abatido') then
    -- Desfazer um passo (ex.: falta marcada por engano): o sinal volta a ser do atendimento.
    v_nova := 'pago';
  end if;
  if v_nova is not null and v_nova <> p.situacao then
    update public.pagamento_parte set situacao = v_nova, atualizado_em = now() where agendamento_id = new.id;
  end if;
  return new;
end $$;
create trigger agendamento_sinal after update of status on public.agendamento
  for each row when (old.status is distinct from new.status)
  execute function app.agendamento_sinal();

-- ---------------------------------------------------------------------------
-- Pix pago (mesmo corpo da migração 017, agora com as partes)
-- ---------------------------------------------------------------------------
-- Pago no prazo: as partes dos pets ainda ativos ficam pagas; a de um pet cancelado antes do Pix é devolvida.
-- Pago depois de o horário ser liberado: o Pix inteiro é devolvido.
create or replace function app.confirmar_pagamento(p_qr_id text, p_provedor_pagamento_id text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.pagamento;
  p record;
begin
  select * into v from public.pagamento where qr_id = p_qr_id for update;
  if v.id is null then
    return 'desconhecido';
  end if;
  if v.status = 'aguardando' then
    update public.pagamento set status = 'pago', pago_em = now(), provedor_pagamento_id = p_provedor_pagamento_id
     where id = v.id;
    for p in
      select pp.agendamento_id, pp.valor_centavos, a.status in ('cancelado', 'faltou') as cancelado
        from public.pagamento_parte pp
        join public.agendamento a on a.id = pp.agendamento_id
       where pp.pagamento_id = v.id and pp.situacao in ('aguardando', 'cancelado')
    loop
      update public.pagamento_parte
         set situacao = case when not p.cancelado then 'pago'
                             when p.valor_centavos > 0 then 'devolver'
                             else 'devolvido' end::public.situacao_sinal,
             atualizado_em = now()
       where agendamento_id = p.agendamento_id;
      if p.cancelado then
        perform app.pedir_estorno(v.id, p.agendamento_id, p.valor_centavos, 'pago_depois');
      end if;
    end loop;
    update public.agendamento set status = 'confirmado'
     where pedido_id = v.pedido_id and status = 'agendado';
    update public.notificacao_agendada set proxima_tentativa_em = null
     where pedido_id = v.pedido_id and status = 'pendente' and tentativas = 0 and proxima_tentativa_em is not null;
    return 'pago';
  elsif v.status in ('expirado', 'cancelado') then
    update public.pagamento set status = 'devolver', pago_em = now(), provedor_pagamento_id = p_provedor_pagamento_id
     where id = v.id;
    update public.pagamento_parte set situacao = 'devolver', atualizado_em = now() where pagamento_id = v.id;
    perform app.pedir_estorno(v.id, null, v.valor_centavos, 'pago_depois');
    return 'devolver';
  end if;
  return 'repetido';
end $$;

-- ---------------------------------------------------------------------------
-- Worker: devoluções e conferência (chave de serviço)
-- ---------------------------------------------------------------------------
-- Reserva as devoluções vencidas. Uma devolução que ficou "processando" (o worker caiu no meio) NÃO é refeita: o
-- estorno pode ter saído no provedor. Ela vira erro para a loja conferir no Asaas.
create function public.estornos_reservar(p_limite int default 20, p_agora timestamptz default now())
returns table (id uuid, petshop_id uuid, provedor text, provedor_pagamento_id text, valor_centavos int, descricao text)
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.estorno e set status = 'erro', processando_desde = null,
         erro = 'O worker parou no meio da devolução. Confira no Asaas se o Pix foi devolvido.'
   where e.status = 'processando' and e.processando_desde < p_agora - interval '10 minutes';
  return query
    with r as (
      select e.id from public.estorno e
       where e.status = 'pendente' and e.proxima_tentativa_em <= p_agora
       order by e.proxima_tentativa_em
       for update skip locked
       limit p_limite
    )
    update public.estorno e
       set status = 'processando', processando_desde = p_agora, tentativas = e.tentativas + 1
      from r, public.pagamento p, public.petshop l
     where e.id = r.id and p.id = e.pagamento_id and l.id = e.petshop_id
    returning e.id, e.petshop_id, p.provedor, p.provedor_pagamento_id, e.valor_centavos,
              left('Devolução do sinal (' || l.nome || ')', 100);
end $$;

-- Resultado do estorno. Falha: tenta de novo mais tarde (ex.: saldo insuficiente na subconta), até 5 vezes.
create function public.estorno_concluir(
  p_id uuid, p_ok boolean, p_provedor_estorno_id text default null, p_erro text default null, p_agora timestamptz default now()
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  e public.estorno;
begin
  select * into e from public.estorno where id = p_id and status = 'processando' for update;
  if e.id is null then
    return;
  end if;
  if p_ok then
    update public.estorno set status = 'feito', feito_em = p_agora, processando_desde = null,
           provedor_estorno_id = p_provedor_estorno_id, erro = null
     where id = e.id;
    update public.pagamento_parte set situacao = 'devolvido', atualizado_em = p_agora
     where situacao = 'devolver'
       and (agendamento_id = e.agendamento_id or (e.agendamento_id is null and pagamento_id = e.pagamento_id));
  elsif e.tentativas >= 5 then
    update public.estorno set status = 'erro', processando_desde = null, erro = left(p_erro, 500) where id = e.id;
  else
    update public.estorno set status = 'pendente', processando_desde = null, erro = left(p_erro, 500),
           proxima_tentativa_em = p_agora + make_interval(mins => 15 * e.tentativas)
     where id = e.id;
  end if;
end $$;

-- Pix do Asaas dados como não pagos (vencidos ou cancelados) há mais de uma hora e há menos de 7 dias, ainda não
-- conferidos. Cada um é conferido uma vez; se o Pix tiver caído, o worker repassa como um evento do webhook.
create function public.conferencia_reservar(p_limite int default 20, p_agora timestamptz default now())
returns table (id uuid, petshop_id uuid, qr_id text)
language sql volatile security definer set search_path = '' as $$
  with r as (
    select p.id from public.pagamento p
     where p.provedor = 'asaas' and p.qr_id is not null and p.status in ('expirado', 'cancelado')
       and p.conferido_em is null
       and p.expira_em < p_agora - interval '1 hour' and p.expira_em > p_agora - interval '7 days'
     order by p.expira_em
     for update skip locked
     limit p_limite
  )
  update public.pagamento p set conferido_em = p_agora from r where p.id = r.id
  returning p.id, p.petshop_id, p.qr_id
$$;

revoke all on function public.estornos_reservar(int, timestamptz), public.estorno_concluir(uuid, boolean, text, text, timestamptz),
  public.conferencia_reservar(int, timestamptz) from public, anon, authenticated;
grant execute on function public.estornos_reservar(int, timestamptz), public.estorno_concluir(uuid, boolean, text, text, timestamptz),
  public.conferencia_reservar(int, timestamptz) to service_role;
revoke all on function app.dividir_sinal(uuid), app.pedir_estorno(uuid, uuid, int, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sinais do mês (dono e gerente)
-- ---------------------------------------------------------------------------
-- Pix recebidos no mês (pelo fuso da loja) e o que aconteceu com cada parte.
create function public.sinais_do_mes(p_petshop_id uuid, p_mes date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text;
  v_de date;
  v_inicio timestamptz;
  v_fim timestamptz;
begin
  if not (p_petshop_id = any(app.lojas_admin())) then
    raise exception 'só o dono e a gerência veem os sinais' using errcode = '42501';
  end if;
  select fuso into v_fuso from public.petshop where id = p_petshop_id;
  v_de := date_trunc('month', coalesce(p_mes, (now() at time zone v_fuso)::date))::date;
  v_inicio := v_de::timestamp at time zone v_fuso;
  v_fim := (v_de + interval '1 month')::timestamp at time zone v_fuso;
  return (
    with partes as (
      select pp.*, p.pago_em, a.inicio, pe.nome as pet_nome, t.nome as tutor_nome
        from public.pagamento p
        join public.pagamento_parte pp on pp.pagamento_id = p.id
        join public.agendamento a on a.id = pp.agendamento_id
        left join public.pet pe on pe.id = a.pet_id
        left join public.tutor t on t.id = p.tutor_id
       where p.petshop_id = p_petshop_id and p.pago_em >= v_inicio and p.pago_em < v_fim
    )
    select jsonb_build_object(
      'recebidos_centavos', coalesce(sum(valor_centavos), 0),
      'quantidade', count(distinct pagamento_id),
      'devolvidos_centavos', coalesce(sum(valor_centavos) filter (where situacao in ('devolver', 'devolvido')), 0),
      'retidos_centavos', coalesce(sum(valor_centavos) filter (where situacao = 'retido'), 0),
      'abatidos_centavos', coalesce(sum(valor_centavos) filter (where situacao = 'abatido'), 0),
      'a_realizar_centavos', coalesce(sum(valor_centavos) filter (where situacao = 'pago'), 0),
      'itens', coalesce(jsonb_agg(jsonb_build_object(
                 'agendamento_id', agendamento_id, 'pago_em', pago_em, 'inicio', inicio, 'pet_nome', pet_nome,
                 'tutor_nome', tutor_nome, 'valor_centavos', valor_centavos, 'situacao', situacao)
               order by pago_em desc, inicio), '[]'::jsonb)
    )
    from partes
  );
end $$;
revoke all on function public.sinais_do_mes(uuid, date) from public, anon;
grant execute on function public.sinais_do_mes(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Agenda da loja com o sinal (mesmo corpo da migração 010, mais duas colunas)
-- ---------------------------------------------------------------------------
drop function public.agenda_loja(uuid, date, date);
create function public.agenda_loja(p_petshop_id uuid, p_de date, p_ate date)
returns table (
  id uuid, pedido_id uuid, status public.status_agendamento, canal public.canal_agendamento, encaixe boolean,
  inicio timestamptz, fim timestamptz, ocupado_ate timestamptz, observacoes text, preco_total_centavos int,
  profissional_id uuid, profissional_nome text,
  pet_id uuid, pet_nome text, pet_porte public.porte, pet_pelagem public.pelagem, pet_observacoes text,
  tutor_id uuid, tutor_nome text, tutor_telefone text, tutor_faltas smallint, tutor_exige_sinal boolean,
  servicos text[], sem_confirmacao_em timestamptz, contato_autorizado boolean,
  sinal public.situacao_sinal, sinal_centavos int
)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.pedido_id, a.status, a.canal, a.encaixe,
         a.inicio, a.fim, upper(a.ocupado), a.observacoes, a.preco_total_centavos,
         pr.id, pr.nome,
         pe.id, pe.nome, pe.porte, pe.pelagem, pp.observacoes,
         t.id, t.nome, t.telefone_e164, tp.faltas, tp.exige_sinal,
         (select array_agg(s.nome order by ai.ordem) from public.agendamento_item ai
            join public.servico s on s.id = ai.servico_id where ai.agendamento_id = a.id),
         a.sem_confirmacao_em, tp.consentimento_contato_em is not null,
         sp.situacao, sp.valor_centavos
    from public.petshop l
    join public.agendamento a
      on a.petshop_id = l.id
     and a.inicio >= p_de::timestamp at time zone l.fuso
     and a.inicio < (p_ate + 1)::timestamp at time zone l.fuso
    join public.profissional pr on pr.id = a.profissional_id
    left join public.pet pe on pe.id = a.pet_id
    left join public.pet_petshop pp on pp.petshop_id = a.petshop_id and pp.pet_id = a.pet_id
    left join public.tutor t on t.id = a.tutor_id
    left join public.tutor_petshop tp on tp.petshop_id = a.petshop_id and tp.tutor_id = a.tutor_id
    left join public.pagamento_parte sp on sp.agendamento_id = a.id
   where l.id = p_petshop_id
     and p_ate >= p_de and p_ate - p_de <= 31
   order by a.inicio, pr.ordem, pr.nome
$$;
grant execute on function public.agenda_loja(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Link de confirmação: o sinal pago de cada pet (para mostrar antes de cancelar). Mesmo corpo da migração 010.
-- ---------------------------------------------------------------------------
create or replace function public.pedido_por_token(p_token uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'pedido_id', pd.id,
    'confirmado_em', pd.confirmado_em,
    'tutor_nome', split_part(t.nome, ' ', 1),
    'loja', jsonb_build_object('id', l.id, 'nome', l.nome, 'slug', l.slug, 'telefone', l.telefone_e164, 'fuso', l.fuso,
                               'slot_minutos', l.slot_minutos,
                               'endereco', concat_ws(', ', nullif(concat_ws(', ', l.logradouro, l.numero), ''), l.bairro, l.cidade)),
    'agendamentos', (
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'status', a.status, 'inicio', a.inicio, 'fim', a.fim,
               'pet_nome', pe.nome, 'porte', pe.porte, 'pelagem', pe.pelagem,
               'profissional_id', pr.id, 'profissional_nome', pr.nome,
               'servicos', (select jsonb_agg(s.nome order by ai.ordem) from public.agendamento_item ai
                              join public.servico s on s.id = ai.servico_id where ai.agendamento_id = a.id),
               'servico_ids', (select jsonb_agg(ai.servico_id order by ai.ordem) from public.agendamento_item ai
                                where ai.agendamento_id = a.id),
               'alteravel', a.status in ('agendado', 'confirmado') and a.inicio > now(),
               'cancelamento_gratuito_ate', a.inicio - make_interval(hours => l.cancelamento_gratuito_horas),
               'sinal_centavos', (select sp.valor_centavos from public.pagamento_parte sp
                                   where sp.agendamento_id = a.id and sp.situacao = 'pago'))
             order by a.inicio)
        from public.agendamento a
        join public.pet pe on pe.id = a.pet_id
        join public.profissional pr on pr.id = a.profissional_id
       where a.pedido_id = pd.id)
  )
  from public.pedido pd
  join public.petshop l on l.id = pd.petshop_id
  join public.tutor t on t.id = pd.tutor_id
  where pd.token_confirmacao = p_token
$$;
