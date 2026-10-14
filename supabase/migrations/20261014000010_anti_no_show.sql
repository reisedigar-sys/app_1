-- 010 — Anti no-show (semana 6): fila de notificações alimentada pelo banco, worker com SKIP LOCKED,
-- confirmação/remarcação/cancelamento pelo link /c/{token}, prazo de confirmação, lista de espera e faltas.
--
-- Como funciona:
--   * Triggers em `agendamento` programam as mensagens do pedido (confirmação imediata, lembrete da véspera e
--     lembrete X horas antes) e "pet pronto". Lembretes são do PEDIDO: uma mensagem só, ligada ao primeiro
--     agendamento ativo, listando todos os pets. Remarcar ou cancelar um pet reprograma o pedido.
--   * O texto é montado na hora do envio (sempre com os dados atuais).
--   * `worker_reservar` (só service_role) aplica o prazo de confirmação, oferece vagas à lista de espera e reserva
--     o que venceu com FOR UPDATE SKIP LOCKED; o worker envia e chama `worker_concluir` (sucesso ou nova tentativa).
--   * Nada sai sem autorização de contato, depois do atendimento, fora de hora (lembrete atrasado) ou duas vezes.
--   * Os horários usam o parâmetro p_agora para os testes simularem o relógio.

-- ---------------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------------
alter table public.notificacao_agendada
  add column dados jsonb not null default '{}',
  -- Texto e destino gravados quando o worker reserva a mensagem (o painel mostra o que foi enviado).
  add column conteudo jsonb,
  add column destino text,
  add column proxima_tentativa_em timestamptz,
  add column processando_desde timestamptz;

drop index public.notificacao_fila_idx;
create index notificacao_fila_idx on public.notificacao_agendada ((coalesce(proxima_tentativa_em, enviar_em)))
  where status = 'pendente';
create index notificacao_pedido_idx on public.notificacao_agendada (pedido_id) where pedido_id is not null;
create index notificacao_agendamento_idx on public.notificacao_agendada (agendamento_id) where agendamento_id is not null;
create index notificacao_petshop_envio_idx on public.notificacao_agendada (petshop_id, enviar_em);

-- Quando o prazo de confirmação venceu sem resposta do tutor (marcado uma vez pelo worker).
alter table public.agendamento add column sem_confirmacao_em timestamptz;
create index agendamento_aguardando_confirmacao_idx on public.agendamento (inicio)
  where status = 'agendado' and sem_confirmacao_em is null;

alter table public.lista_espera add column verificado_em timestamptz;

-- Lembrete da véspera só em horário comercial (nada de madrugada).
alter table public.petshop add constraint petshop_lembrete_d1_horario
  check (lembrete_d1_hora between '08:00' and '21:00');

-- ---------------------------------------------------------------------------
-- Utilitários de texto e horário
-- ---------------------------------------------------------------------------
-- Mensagens só entre 8h e 21h (hora da loja).
create function app.fora_do_horario_de_mensagem(p_instante timestamptz, p_fuso text) returns boolean
language sql stable set search_path = '' as $$
  select extract(hour from p_instante at time zone p_fuso) not between 8 and 20
$$;

-- "qui, 16/10 às 10:00"
create function app.quando_br(p_instante timestamptz, p_fuso text) returns text
language sql stable set search_path = '' as $$
  select (array['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'])[extract(dow from p_instante at time zone p_fuso)::int + 1]
         || ', ' || to_char(p_instante at time zone p_fuso, 'DD/MM "às" HH24:MI')
$$;

-- {Thor} → "Thor"; {Thor, Mel, Bob} → "Thor, Mel e Bob"
create function app.lista_br(p_itens text[]) returns text
language sql immutable set search_path = '' as $$
  select case
    when coalesce(cardinality(p_itens), 0) = 0 then ''
    when cardinality(p_itens) = 1 then p_itens[1]
    else array_to_string(p_itens[1:cardinality(p_itens) - 1], ', ') || ' e ' || p_itens[cardinality(p_itens)]
  end
$$;

-- ---------------------------------------------------------------------------
-- Programação das mensagens
-- ---------------------------------------------------------------------------
-- Enfileira uma mensagem do agendamento. A chave (pedido, tipo, enviar_em) impede duplicar; uma mensagem cancelada
-- com a mesma chave volta para a fila (ex.: o pet que tinha o lembrete foi cancelado e o próximo do pedido herda).
create function app.enfileirar(p_agendamento_id uuid, p_tipo public.tipo_notificacao, p_quando timestamptz,
                               p_dados jsonb default '{}')
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  insert into public.notificacao_agendada (petshop_id, pedido_id, agendamento_id, tutor_id, tipo, enviar_em, dados)
  select a.petshop_id, a.pedido_id, a.id, a.tutor_id, p_tipo, p_quando, p_dados
    from public.agendamento a where a.id = p_agendamento_id
  on conflict (pedido_id, tipo, enviar_em) do update
    set status = 'pendente', agendamento_id = excluded.agendamento_id, dados = excluded.dados,
        tentativas = 0, ultimo_erro = null, proxima_tentativa_em = null
    where public.notificacao_agendada.status = 'cancelada';
end $$;

-- (Re)programa os lembretes do pedido a partir do primeiro agendamento ativo. Só programa o que ainda vai acontecer:
-- quem agenda depois da hora do lembrete da véspera não recebe esse lembrete.
create function app.programar_lembretes(p_pedido_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_ag public.agendamento;
  v_loja public.petshop;
  v_quando timestamptz;
begin
  delete from public.notificacao_agendada
   where pedido_id = p_pedido_id and tipo in ('lembrete_d1', 'lembrete_antes') and status = 'pendente';

  select a.* into v_ag from public.agendamento a
   where a.pedido_id = p_pedido_id and a.status in ('agendado', 'confirmado')
   order by a.inicio, a.id
   limit 1;
  if v_ag.id is null then
    update public.notificacao_agendada set status = 'cancelada'
     where pedido_id = p_pedido_id and tipo = 'confirmacao_imediata' and status = 'pendente';
    return;
  end if;
  if v_ag.inicio <= now() then
    return;
  end if;
  select * into v_loja from public.petshop where id = v_ag.petshop_id;

  v_quando := (((v_ag.inicio at time zone v_loja.fuso)::date - 1) + v_loja.lembrete_d1_hora) at time zone v_loja.fuso;
  if v_quando > now() then
    perform app.enfileirar(v_ag.id, 'lembrete_d1', v_quando);
  end if;

  if v_loja.lembrete_antes_horas > 0 then
    v_quando := v_ag.inicio - make_interval(hours => v_loja.lembrete_antes_horas);
    if v_quando > now() + interval '30 minutes' and not app.fora_do_horario_de_mensagem(v_quando, v_loja.fuso) then
      perform app.enfileirar(v_ag.id, 'lembrete_antes', v_quando);
    end if;
  end if;
end $$;

-- Cancelado ou falta: as mensagens do PET pendentes são canceladas. As do pedido (confirmação e lembretes) ficam
-- com `programar_lembretes`, que as passa para o próximo pet ativo; sem nenhum, o worker não as envia.
create or replace function app.agendamento_cancela_notificacoes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.notificacao_agendada set status = 'cancelada'
   where agendamento_id = new.id and status = 'pendente'
     and tipo not in ('confirmacao_imediata', 'lembrete_d1', 'lembrete_antes');
  return new;
end $$;

-- Mensagens disparadas pelo agendamento, por qualquer caminho (app, balcão, painel, link, worker).
-- Roda depois de `agendamento_cancela_notificacoes` (ordem alfabética), que cancela as pendentes do pet.
create function app.agendamento_notificacoes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ativo boolean := new.status in ('agendado', 'confirmado') and new.inicio > now();
begin
  if tg_op = 'INSERT' then
    if v_ativo then
      -- Uma confirmação por pedido (a chave inclui now(), igual para todos os pets da mesma transação).
      perform app.enfileirar(new.id, 'confirmacao_imediata', now());
      perform app.programar_lembretes(new.pedido_id);
    end if;
    -- Quem estava na lista de espera e agendou para o mesmo dia sai da fila.
    update public.lista_espera le set status = 'atendido'
      from public.petshop p
     where p.id = new.petshop_id and le.petshop_id = new.petshop_id
       and le.tutor_id = new.tutor_id and le.pet_id = new.pet_id
       and le.status in ('aguardando', 'notificado')
       and le.data = (new.inicio at time zone p.fuso)::date;
    return new;
  end if;

  if new.inicio is distinct from old.inicio then
    if v_ativo then
      perform app.enfileirar(new.id, 'confirmacao_imediata', clock_timestamp(), '{"remarcado": true}');
    end if;
    perform app.programar_lembretes(new.pedido_id);
  elsif new.status is distinct from old.status then
    if new.status = 'pronto' and not exists (
         select 1 from public.notificacao_agendada n
          where n.agendamento_id = new.id and n.tipo = 'pet_pronto' and n.status in ('pendente', 'processando', 'enviada')) then
      perform app.enfileirar(new.id, 'pet_pronto', now());
    end if;
    if new.status in ('cancelado', 'faltou') or old.status in ('cancelado', 'faltou') then
      perform app.programar_lembretes(new.pedido_id);
    end if;
    -- A loja cancelou: o tutor é avisado. Quando o próprio tutor cancela, não há mensagem.
    if new.status = 'cancelado' and new.inicio > now() and new.petshop_id = any(app.lojas_operacao()) then
      perform app.enfileirar(new.id, 'cancelamento', now(), jsonb_build_object(
        'motivo', 'loja', 'inicio', new.inicio,
        'pets', jsonb_build_array((select pe.nome from public.pet pe where pe.id = new.pet_id))));
    end if;
  end if;
  return new;
end $$;

create trigger agendamento_notificacoes after insert or update of inicio, status on public.agendamento
  for each row execute function app.agendamento_notificacoes();

-- ---------------------------------------------------------------------------
-- Cancelar e remarcar: as mensagens agora são reprogramadas pelo trigger
-- ---------------------------------------------------------------------------
create function app.cancelar(v public.agendamento) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_horas smallint;
begin
  select cancelamento_gratuito_horas into v_horas from public.petshop where id = v.petshop_id;
  update public.agendamento set status = 'cancelado', cancelado_em = now() where id = v.id;
  return jsonb_build_object('gratuito', now() <= v.inicio - make_interval(hours => v_horas));
end $$;

create or replace function public.cancelar_agendamento(p_agendamento_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  return app.cancelar(app.agendamento_para_alterar(p_agendamento_id));
end $$;

-- Remarca pelo motor de disponibilidade. Sem profissional: mantém o atual se ele estiver livre; senão, quem tiver
-- menos minutos no dia.
create function app.remarcar(v public.agendamento, p_inicio timestamptz, p_profissional_id uuid, p_regras_cliente boolean)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
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
    from app.slots(v.petshop_id, v_itens, v_dia, v_dia, p_profissional_id, v.tutor_id, p_regras_cliente, v.id) s
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
           status = 'agendado',
           sem_confirmacao_em = null
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

  return jsonb_build_object('id', v.id, 'inicio', p_inicio, 'fim', p_inicio + make_interval(mins => v_minutos),
                            'profissional_id', v_prof);
end $$;

create or replace function public.remarcar_agendamento(p_agendamento_id uuid, p_inicio timestamptz, p_profissional_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.agendamento := app.agendamento_para_alterar(p_agendamento_id);
begin
  return app.remarcar(v, p_inicio, p_profissional_id, not app.eh_equipe(v.petshop_id));
end $$;

-- ---------------------------------------------------------------------------
-- Link de confirmação /c/{token}: o tutor confirma, remarca ou cancela sem login
-- ---------------------------------------------------------------------------
-- O token (uuid aleatório do pedido) é o segredo. A página não mostra telefone nem e-mail do tutor.
create function public.pedido_por_token(p_token uuid) returns jsonb
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
               'cancelamento_gratuito_ate', a.inicio - make_interval(hours => l.cancelamento_gratuito_horas))
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

create function app.agendamento_do_token(p_token uuid, p_agendamento_id uuid) returns public.agendamento
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.agendamento;
begin
  select a.* into v from public.agendamento a join public.pedido pd on pd.id = a.pedido_id
   where pd.token_confirmacao = p_token and a.id = p_agendamento_id;
  if v.id is null then
    raise exception 'agendamento não encontrado' using errcode = 'AG002';
  end if;
  if v.status not in ('agendado', 'confirmado') then
    raise exception 'este agendamento não pode mais ser alterado' using errcode = 'AG002';
  end if;
  if v.inicio <= now() then
    raise exception 'o horário já passou' using errcode = 'AG004';
  end if;
  return v;
end $$;

-- Confirma o pedido inteiro (todos os pets que ainda vão ser atendidos). Devolve quantos foram confirmados.
create function public.confirmar_por_token(p_token uuid) returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_pedido uuid;
  v_n int;
begin
  select id into v_pedido from public.pedido where token_confirmacao = p_token;
  if v_pedido is null then
    raise exception 'pedido não encontrado' using errcode = 'AG002';
  end if;
  update public.agendamento set status = 'confirmado'
   where pedido_id = v_pedido and status = 'agendado' and inicio > now();
  get diagnostics v_n = row_count;
  if v_n > 0 or exists (select 1 from public.agendamento where pedido_id = v_pedido and status = 'confirmado' and inicio > now()) then
    update public.pedido set confirmado_em = now() where id = v_pedido;
  else
    raise exception 'não há atendimento a confirmar neste pedido' using errcode = 'AG002';
  end if;
  return v_n;
end $$;

create function public.cancelar_por_token(p_token uuid, p_agendamento_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  return app.cancelar(app.agendamento_do_token(p_token, p_agendamento_id));
end $$;

create function public.remarcar_por_token(p_token uuid, p_agendamento_id uuid, p_inicio timestamptz,
                                          p_profissional_id uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  return app.remarcar(app.agendamento_do_token(p_token, p_agendamento_id), p_inicio, p_profissional_id, true);
end $$;

grant execute on function public.pedido_por_token(uuid), public.confirmar_por_token(uuid),
  public.cancelar_por_token(uuid, uuid), public.remarcar_por_token(uuid, uuid, timestamptz, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Prazo de confirmação: avisar a loja ou liberar o horário
-- ---------------------------------------------------------------------------
-- Vale para quem recebeu o link antes do prazo (sem mensagem, não há o que cobrar do tutor). O pedido é tratado
-- inteiro quando vence o prazo do primeiro pet. Liberar não conta como falta.
create function app.aplicar_prazo_confirmacao(p_agora timestamptz) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
  v_ultimo uuid;
  v_pets jsonb;
begin
  for r in
    select a.id, a.pedido_id, a.inicio, p.acao_sem_confirmacao as acao,
           exists (select 1 from public.notificacao_agendada n
                    where n.pedido_id = a.pedido_id and n.status = 'enviada'
                      and n.tipo in ('confirmacao_imediata', 'lembrete_d1')
                      and n.enviada_em <= a.inicio - make_interval(hours => p.confirmar_ate_horas)) as avisado
      from public.agendamento a
      join public.petshop p on p.id = a.petshop_id
     where a.status = 'agendado' and a.sem_confirmacao_em is null
       and a.inicio > p_agora and a.inicio <= p_agora + interval '73 hours'
       and p.confirmar_ate_horas > 0
       and a.inicio - make_interval(hours => p.confirmar_ate_horas) <= p_agora
     order by a.pedido_id, a.inicio
     for update of a skip locked
     limit 500
  loop
    if r.pedido_id is not distinct from v_ultimo then
      continue;
    end if;
    v_ultimo := r.pedido_id;

    update public.agendamento set sem_confirmacao_em = p_agora
     where pedido_id = r.pedido_id and status = 'agendado' and sem_confirmacao_em is null and inicio > p_agora;
    if not r.avisado then
      continue;
    end if;

    if r.acao = 'liberar_horario' then
      select jsonb_agg(pe.nome order by a.inicio) into v_pets
        from public.agendamento a join public.pet pe on pe.id = a.pet_id
       where a.pedido_id = r.pedido_id and a.status = 'agendado' and a.sem_confirmacao_em = p_agora;
      update public.agendamento set status = 'cancelado', cancelado_em = p_agora
       where pedido_id = r.pedido_id and status = 'agendado' and sem_confirmacao_em = p_agora;
      perform app.enfileirar(r.id, 'cancelamento', p_agora,
                             jsonb_build_object('motivo', 'sem_confirmacao', 'inicio', r.inicio, 'pets', v_pets));
    else
      perform app.enfileirar(r.id, 'aviso_loja_sem_confirmacao', p_agora);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Lista de espera
-- ---------------------------------------------------------------------------
-- O tutor (ou a equipe, pelo balcão) entra na fila para um dia e período. Uma entrada por pet e dia.
create function public.entrar_lista_espera(
  p_petshop_id uuid,
  p_tutor_id uuid,
  p_pet_id uuid,
  p_servico_id uuid,
  p_data date,
  p_periodo public.periodo_dia default 'qualquer'
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_loja public.petshop;
  v_hoje date;
  v_id uuid;
begin
  if not (app.eh_equipe(p_petshop_id) or (p_tutor_id = app.tutor_atual() and app.loja_publica(p_petshop_id))) then
    raise exception 'sem permissão para entrar na lista de espera' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pet where id = p_pet_id and tutor_id = p_tutor_id and ativo) then
    raise exception 'pet não encontrado' using errcode = 'AG002';
  end if;
  if not exists (select 1 from public.servico where id = p_servico_id and petshop_id = p_petshop_id and ativo and tipo = 'principal') then
    raise exception 'serviço não encontrado nesta loja' using errcode = 'AG002';
  end if;
  select * into v_loja from public.petshop where id = p_petshop_id;
  v_hoje := (now() at time zone v_loja.fuso)::date;
  if p_data < v_hoje or p_data > v_hoje + v_loja.janela_maxima_dias then
    raise exception 'data fora do período de agendamento da loja' using errcode = 'AG004';
  end if;

  select id into v_id from public.lista_espera
   where petshop_id = p_petshop_id and pet_id = p_pet_id and data = p_data and status in ('aguardando', 'notificado');
  if v_id is not null then
    update public.lista_espera set servico_id = p_servico_id, periodo = p_periodo where id = v_id;
    return v_id;
  end if;
  insert into public.tutor_petshop (petshop_id, tutor_id) values (p_petshop_id, p_tutor_id) on conflict do nothing;
  insert into public.lista_espera (petshop_id, tutor_id, pet_id, servico_id, data, periodo)
  values (p_petshop_id, p_tutor_id, p_pet_id, p_servico_id, p_data, p_periodo)
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.entrar_lista_espera(uuid, uuid, uuid, uuid, date, public.periodo_dia) from public, anon;
grant execute on function public.entrar_lista_espera(uuid, uuid, uuid, uuid, date, public.periodo_dia) to authenticated;

-- A cada rodada: para cada loja e dia com fila, o primeiro da fila é avisado se houver horário no período dele.
-- Um aviso por dia de loja a cada 30 minutos; quem agendar primeiro leva a vaga (sem reserva).
create function app.oferecer_vagas(p_agora timestamptz) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  c record;
  v_tem boolean;
begin
  update public.lista_espera le set status = 'expirado'
    from public.petshop p
   where p.id = le.petshop_id and le.status in ('aguardando', 'notificado')
     and le.data < (p_agora at time zone p.fuso)::date;

  for c in
    select * from (
      select distinct on (le.petshop_id, le.data) le.*, p.fuso
        from public.lista_espera le
        join public.petshop p on p.id = le.petshop_id and p.ativo
       where le.status = 'aguardando'
         and not app.fora_do_horario_de_mensagem(p_agora, p.fuso)
         and not exists (select 1 from public.lista_espera x
                          where x.petshop_id = le.petshop_id and x.data = le.data and x.status = 'notificado'
                            and x.notificado_em > p_agora - interval '30 minutes')
       order by le.petshop_id, le.data, le.criado_em
    ) primeiro
     where primeiro.verificado_em is null or primeiro.verificado_em < p_agora - interval '5 minutes'
     limit 100
  loop
    update public.lista_espera set verificado_em = p_agora where id = c.id;
    begin
      select exists (
        select 1 from app.slots(c.petshop_id,
                                jsonb_build_array(jsonb_build_object('pet_id', c.pet_id, 'servicos', jsonb_build_array(c.servico_id))),
                                c.data, c.data, c.profissional_id, c.tutor_id, true) s
         where s.inicio > p_agora
           and (c.periodo = 'qualquer' or (c.periodo = 'manha') = (extract(hour from s.inicio at time zone c.fuso) < 12))
      ) into v_tem;
    exception when sqlstate 'AG002' or sqlstate 'AG003' then
      -- Pet ou serviço não existe mais (ou mudou de porte sem preço): a entrada sai da fila.
      update public.lista_espera set status = 'expirado' where id = c.id;
      continue;
    end;
    if v_tem then
      update public.lista_espera set status = 'notificado', notificado_em = p_agora where id = c.id;
      insert into public.notificacao_agendada (petshop_id, tutor_id, tipo, enviar_em, dados)
      values (c.petshop_id, c.tutor_id, 'vaga_lista_espera', p_agora,
              jsonb_build_object('lista_espera_id', c.id, 'data', c.data, 'periodo', c.periodo));
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Texto das mensagens (montado na hora do envio)
-- ---------------------------------------------------------------------------
-- Devolve {texto, link} (link é um caminho do app; o worker põe o endereço na frente) ou null se não há o que
-- enviar. `link` sempre leva à página de confirmação do pedido ou à página de agendamento da loja.
create function app.mensagem(n public.notificacao_agendada) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_loja public.petshop;
  v_token uuid;
  v_inicio timestamptz;
  v_pets text[];
  v_pendente boolean;
  v_texto text;
  v_link text;
  v_tutor public.tutor;
begin
  select * into v_loja from public.petshop where id = n.petshop_id;
  select * into v_tutor from public.tutor where id = n.tutor_id;
  if n.pedido_id is not null then
    select pd.token_confirmacao into v_token from public.pedido pd where pd.id = n.pedido_id;
    select min(a.inicio), array_agg(pe.nome order by a.inicio), bool_or(a.status = 'agendado')
      into v_inicio, v_pets, v_pendente
      from public.agendamento a join public.pet pe on pe.id = a.pet_id
     where a.pedido_id = n.pedido_id and a.status in ('agendado', 'confirmado');
    v_link := '/c/' || v_token;
  end if;

  case n.tipo
    when 'confirmacao_imediata' then
      v_texto := format('%s: agendamento %s para %s, %s. Para confirmar, remarcar ou cancelar: {link}',
                        v_loja.nome, case when n.dados ? 'remarcado' then 'remarcado' else 'recebido' end,
                        app.lista_br(v_pets), app.quando_br(v_inicio, v_loja.fuso));
    when 'lembrete_d1' then
      if v_pendente then
        v_texto := format('%s: lembrete de amanhã, %s, para %s. Confirme sua presença: {link}',
                          v_loja.nome, app.quando_br(v_inicio, v_loja.fuso), app.lista_br(v_pets));
      else
        v_texto := format('%s: até amanhã! %s, %s. Precisa mudar? {link}',
                          v_loja.nome, app.lista_br(v_pets), app.quando_br(v_inicio, v_loja.fuso));
      end if;
    when 'lembrete_antes' then
      v_texto := format('%s: esperamos %s às %s. Precisa mudar? {link}',
                        v_loja.nome, app.lista_br(v_pets), to_char(v_inicio at time zone v_loja.fuso, 'HH24:MI'));
    when 'pet_pronto' then
      v_texto := format('%s: %s está pronto! Pode vir buscar.', v_loja.nome,
                        (select pe.nome from public.agendamento a join public.pet pe on pe.id = a.pet_id where a.id = n.agendamento_id));
      v_link := null;
    when 'cancelamento' then
      v_link := '/' || v_loja.slug;
      v_texto := format(case n.dados ->> 'motivo'
                          when 'sem_confirmacao' then '%s: o horário de %s, %s, foi liberado porque não recebemos a confirmação. Para agendar de novo: {link}'
                          else '%s: o agendamento de %s, %s, foi cancelado pela loja. Para agendar de novo: {link}'
                        end,
                        v_loja.nome,
                        app.lista_br(array(select jsonb_array_elements_text(n.dados -> 'pets'))),
                        app.quando_br((n.dados ->> 'inicio')::timestamptz, v_loja.fuso));
    when 'vaga_lista_espera' then
      v_link := '/' || v_loja.slug || '/agendar';
      v_texto := format('%s: abriu horário em %s (%s) para %s. Quem agendar primeiro leva a vaga: {link}',
                        v_loja.nome, to_char((n.dados ->> 'data')::date, 'DD/MM'),
                        case n.dados ->> 'periodo' when 'manha' then 'manhã' when 'tarde' then 'tarde' else 'qualquer horário' end,
                        (select pe.nome from public.lista_espera le join public.pet pe on pe.id = le.pet_id
                          where le.id = (n.dados ->> 'lista_espera_id')::uuid));
    when 'aviso_loja_sem_confirmacao' then
      v_link := null;
      v_texto := format('Hora do Pet: %s (%s) não confirmou %s, %s.', v_tutor.nome, v_tutor.telefone_e164,
                        app.lista_br(v_pets), app.quando_br(v_inicio, v_loja.fuso));
    else
      return null;
  end case;
  return jsonb_build_object('texto', v_texto, 'link', v_link);
end $$;

-- Motivo para NÃO enviar (a mensagem é cancelada com esse motivo) ou null.
create function app.motivo_para_nao_enviar(n public.notificacao_agendada, p_agora timestamptz) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if n.tipo = 'aviso_loja_sem_confirmacao' then
    if not exists (select 1 from public.agendamento a where a.pedido_id = n.pedido_id and a.status = 'agendado' and a.inicio > p_agora) then
      return 'o tutor confirmou ou o atendimento já começou';
    end if;
    if (select telefone_e164 from public.petshop where id = n.petshop_id) is null then
      return 'loja sem telefone';
    end if;
    return null;
  end if;

  if not exists (select 1 from public.tutor_petshop tp
                  where tp.petshop_id = n.petshop_id and tp.tutor_id = n.tutor_id and tp.consentimento_contato_em is not null) then
    return 'sem autorização de contato';
  end if;
  if (select telefone_e164 from public.tutor where id = n.tutor_id) is null then
    return 'tutor sem telefone';
  end if;

  if n.tipo in ('confirmacao_imediata', 'lembrete_d1', 'lembrete_antes') then
    if not exists (select 1 from public.agendamento a
                    where a.pedido_id = n.pedido_id and a.status in ('agendado', 'confirmado') and a.inicio > p_agora) then
      return 'o atendimento já começou ou foi cancelado';
    end if;
    if n.tipo <> 'confirmacao_imediata' and p_agora > n.enviar_em + interval '2 hours' then
      return 'perdeu a hora';
    end if;
  elsif n.tipo = 'pet_pronto' then
    if (select status from public.agendamento where id = n.agendamento_id) <> 'pronto' or p_agora > n.enviar_em + interval '2 hours' then
      return 'o pet já foi entregue';
    end if;
  elsif n.tipo = 'vaga_lista_espera' then
    if (select status from public.lista_espera where id = (n.dados ->> 'lista_espera_id')::uuid) <> 'notificado' then
      return 'o tutor já agendou ou saiu da fila';
    end if;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Worker: reservar (SKIP LOCKED) e concluir
-- ---------------------------------------------------------------------------
-- Reserva o que venceu. Vários workers ao mesmo tempo nunca pegam a mesma mensagem (SKIP LOCKED).
create function app.reservar_fila(p_limite int, p_agora timestamptz)
returns table (id uuid, tipo public.tipo_notificacao, destino text, conteudo jsonb, tentativas smallint)
language plpgsql volatile security definer set search_path = '' as $$
declare
  n public.notificacao_agendada;
  v_motivo text;
  v_conteudo jsonb;
  v_destino text;
begin
  for n in
    select na.* from public.notificacao_agendada na
     where na.status = 'pendente' and coalesce(na.proxima_tentativa_em, na.enviar_em) <= p_agora
     order by coalesce(na.proxima_tentativa_em, na.enviar_em)
     for update skip locked
     limit least(greatest(p_limite, 1), 500)
  loop
    v_motivo := app.motivo_para_nao_enviar(n, p_agora);
    if v_motivo is null then
      v_conteudo := app.mensagem(n);
      if v_conteudo is null then
        v_motivo := 'tipo sem mensagem';
      end if;
    end if;
    if v_motivo is not null then
      update public.notificacao_agendada na set status = 'cancelada', ultimo_erro = v_motivo where na.id = n.id;
      continue;
    end if;

    v_destino := case when n.tipo = 'aviso_loja_sem_confirmacao'
                      then (select l.telefone_e164 from public.petshop l where l.id = n.petshop_id)
                      else (select t.telefone_e164 from public.tutor t where t.id = n.tutor_id) end;
    update public.notificacao_agendada na
       set status = 'processando', processando_desde = p_agora, tentativas = na.tentativas + 1,
           conteudo = v_conteudo, destino = v_destino
     where na.id = n.id;

    id := n.id;
    tipo := n.tipo;
    destino := v_destino;
    conteudo := v_conteudo;
    tentativas := n.tentativas + 1;
    return next;
  end loop;
end $$;

-- Uma rodada do worker. Prazo de confirmação, lista de espera e recuperação de mensagens travadas rodam em um
-- worker por vez (trava consultiva); a reserva da fila, em qualquer número deles.
create function public.worker_reservar(p_limite int default 50, p_agora timestamptz default now())
returns table (id uuid, tipo public.tipo_notificacao, destino text, conteudo jsonb, tentativas smallint)
language plpgsql volatile security definer set search_path = '' as $$
begin
  if pg_try_advisory_xact_lock(hashtext('worker_notificacoes')) then
    perform app.aplicar_prazo_confirmacao(p_agora);
    perform app.oferecer_vagas(p_agora);
    -- Reservada por um worker que caiu: volta para a fila.
    update public.notificacao_agendada na set status = 'pendente', processando_desde = null
     where na.status = 'processando' and na.processando_desde < p_agora - interval '10 minutes';
  end if;
  return query select * from app.reservar_fila(p_limite, p_agora);
end $$;

-- Resultado do envio. Falha: nova tentativa com espera crescente (2, 4, 8, 16 min) até max_tentativas.
create function public.worker_concluir(
  p_id uuid,
  p_ok boolean,
  p_provedor text,
  p_provedor_mensagem_id text default null,
  p_erro text default null,
  p_agora timestamptz default now()
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  n public.notificacao_agendada;
begin
  select * into n from public.notificacao_agendada where id = p_id and status = 'processando' for update;
  if n.id is null then
    return;
  end if;
  if p_ok then
    update public.notificacao_agendada
       set status = 'enviada', enviada_em = p_agora, processando_desde = null, ultimo_erro = null
     where id = p_id;
  else
    update public.notificacao_agendada
       set status = case when n.tentativas >= n.max_tentativas then 'falhou' else 'pendente' end::public.status_notificacao,
           proxima_tentativa_em = p_agora + make_interval(mins => power(2, n.tentativas)::int),
           processando_desde = null,
           ultimo_erro = left(p_erro, 500)
     where id = p_id;
  end if;
  insert into public.mensagem_log (petshop_id, notificacao_id, tutor_id, direcao, categoria, provedor,
                                   provedor_mensagem_id, destino, conteudo, status, erro)
  values (n.petshop_id, n.id, n.tutor_id, 'saida', n.categoria, p_provedor, p_provedor_mensagem_id, n.destino, n.conteudo,
          case when not p_ok then 'erro' when p_provedor = 'teste' then 'simulada' else 'enviada' end, left(p_erro, 500));
end $$;

revoke all on function public.worker_reservar(int, timestamptz), public.worker_concluir(uuid, boolean, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.worker_reservar(int, timestamptz), public.worker_concluir(uuid, boolean, text, text, text, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Faltas: dono ou gerente pode dispensar o sinal obrigatório
-- ---------------------------------------------------------------------------
create function public.dispensar_sinal(p_petshop_id uuid, p_tutor_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not (p_petshop_id = any(app.lojas_admin())) then
    raise exception 'só o dono ou o gerente dispensa o sinal' using errcode = '42501';
  end if;
  update public.tutor_petshop set exige_sinal = false where petshop_id = p_petshop_id and tutor_id = p_tutor_id;
end $$;

revoke all on function public.dispensar_sinal(uuid, uuid) from public, anon;
grant execute on function public.dispensar_sinal(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Agenda da loja: mais o prazo de confirmação vencido e a autorização de contato
-- ---------------------------------------------------------------------------
drop function public.agenda_loja(uuid, date, date);
create function public.agenda_loja(p_petshop_id uuid, p_de date, p_ate date)
returns table (
  id uuid, pedido_id uuid, status public.status_agendamento, canal public.canal_agendamento, encaixe boolean,
  inicio timestamptz, fim timestamptz, ocupado_ate timestamptz, observacoes text, preco_total_centavos int,
  profissional_id uuid, profissional_nome text,
  pet_id uuid, pet_nome text, pet_porte public.porte, pet_pelagem public.pelagem, pet_observacoes text,
  tutor_id uuid, tutor_nome text, tutor_telefone text, tutor_faltas smallint, tutor_exige_sinal boolean,
  servicos text[], sem_confirmacao_em timestamptz, contato_autorizado boolean
)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.pedido_id, a.status, a.canal, a.encaixe,
         a.inicio, a.fim, upper(a.ocupado), a.observacoes, a.preco_total_centavos,
         pr.id, pr.nome,
         pe.id, pe.nome, pe.porte, pe.pelagem, pp.observacoes,
         t.id, t.nome, t.telefone_e164, tp.faltas, tp.exige_sinal,
         (select array_agg(s.nome order by ai.ordem) from public.agendamento_item ai
            join public.servico s on s.id = ai.servico_id where ai.agendamento_id = a.id),
         a.sem_confirmacao_em, tp.consentimento_contato_em is not null
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
   where l.id = p_petshop_id
     and p_ate >= p_de and p_ate - p_de <= 31
   order by a.inicio, pr.ordem, pr.nome
$$;

grant execute on function public.agenda_loja(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Permissões das funções internas
-- ---------------------------------------------------------------------------
revoke all on function app.fora_do_horario_de_mensagem(timestamptz, text), app.quando_br(timestamptz, text),
  app.lista_br(text[]), app.enfileirar(uuid, public.tipo_notificacao, timestamptz, jsonb),
  app.programar_lembretes(uuid), app.cancelar(public.agendamento),
  app.remarcar(public.agendamento, timestamptz, uuid, boolean), app.agendamento_do_token(uuid, uuid),
  app.aplicar_prazo_confirmacao(timestamptz), app.oferecer_vagas(timestamptz),
  app.mensagem(public.notificacao_agendada), app.motivo_para_nao_enviar(public.notificacao_agendada, timestamptz),
  app.reservar_fila(int, timestamptz)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Agendador: a cada minuto o banco chama o worker (Edge Function `notificacoes`)
-- ---------------------------------------------------------------------------
-- O endereço e o token do worker ficam no Vault de cada projeto (passo a passo em docs/ambientes.md).
-- Sem o endereço (ex.: banco local), a chamada não faz nada.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create function app.disparar_worker() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_token text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'worker_notificacoes_url';
  if v_url is null then
    return;
  end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'worker_notificacoes_token';
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-token', coalesce(v_token, '')),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end $$;

revoke all on function app.disparar_worker() from public, anon, authenticated;

select cron.schedule('notificacoes', '* * * * *', 'select app.disparar_worker()');
