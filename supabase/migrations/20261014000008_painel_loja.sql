-- 008 — Painel da loja (semana 5): agenda do dia/semana, mudança de status, balcão, ficha do pet e tempo real.
--
-- Códigos de erro novos:
--   AG005 mudança de status não permitida

-- ---------------------------------------------------------------------------
-- Status do agendamento: transições válidas
-- ---------------------------------------------------------------------------
-- Vale para quem altera pela API (equipe e profissional, com a permissão por coluna da migração 006).
-- As funções do back-end (cancelar, remarcar) rodam como dono das funções e aplicam as próprias regras.
--
--   agendado ⇄ confirmado → em_atendimento → pronto → concluido
--   agendado/confirmado → cancelado | faltou (falta só depois do horário de início)
--   Desfazer um passo: em_atendimento → confirmado, pronto → em_atendimento, concluido → pronto, faltou → agendado.
-- A profissional (sem papel de operação) só conduz o atendimento: em_atendimento, pronto e concluido.
-- security invoker: current_user é quem fez o update (dentro das funções do back-end, o dono delas).
create function app.agendamento_valida_status() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_permitidos text[];
begin
  if new.status = old.status or current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  v_permitidos := case old.status
    when 'agendado' then '{confirmado,em_atendimento,cancelado,faltou}'
    when 'confirmado' then '{agendado,em_atendimento,cancelado,faltou}'
    when 'em_atendimento' then '{confirmado,pronto,concluido}'
    when 'pronto' then '{em_atendimento,concluido}'
    when 'concluido' then '{pronto}'
    when 'faltou' then '{agendado}'
    else '{}'
  end;
  if not new.status::text = any(v_permitidos) then
    raise exception 'não é possível passar de % para %', old.status, new.status using errcode = 'AG005';
  end if;
  if new.status = 'faltou' and new.inicio > now() then
    raise exception 'a falta só pode ser marcada depois do horário do atendimento' using errcode = 'AG005';
  end if;
  if not (new.petshop_id = any(app.lojas_operacao())) and new.status not in ('em_atendimento', 'pronto', 'concluido') then
    raise exception 'a profissional só conduz o atendimento; fale com a recepção' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger agendamento_valida_status before update of status on public.agendamento
  for each row execute function app.agendamento_valida_status();

-- Cancelado ou falta: nenhuma notificação pendente sai mais para esse agendamento (vale para todos os caminhos).
create function app.agendamento_cancela_notificacoes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.notificacao_agendada set status = 'cancelada'
   where agendamento_id = new.id and status = 'pendente';
  return new;
end $$;
create trigger agendamento_cancela_notificacoes after update of status on public.agendamento
  for each row when (new.status in ('cancelado', 'faltou') and old.status is distinct from new.status)
  execute function app.agendamento_cancela_notificacoes();

-- ---------------------------------------------------------------------------
-- Agenda da loja (dia ou semana), com o que o painel mostra em cada cartão
-- ---------------------------------------------------------------------------
-- security invoker: o RLS decide o que cada papel vê (a profissional só a própria agenda).
create function public.agenda_loja(p_petshop_id uuid, p_de date, p_ate date)
returns table (
  id uuid, pedido_id uuid, status public.status_agendamento, canal public.canal_agendamento, encaixe boolean,
  inicio timestamptz, fim timestamptz, ocupado_ate timestamptz, observacoes text, preco_total_centavos int,
  profissional_id uuid, profissional_nome text,
  pet_id uuid, pet_nome text, pet_porte public.porte, pet_pelagem public.pelagem, pet_observacoes text,
  tutor_id uuid, tutor_nome text, tutor_telefone text, tutor_faltas smallint, tutor_exige_sinal boolean,
  servicos text[]
)
language sql stable security invoker set search_path = '' as $$
  select a.id, a.pedido_id, a.status, a.canal, a.encaixe,
         a.inicio, a.fim, upper(a.ocupado), a.observacoes, a.preco_total_centavos,
         pr.id, pr.nome,
         pe.id, pe.nome, pe.porte, pe.pelagem, pp.observacoes,
         t.id, t.nome, t.telefone_e164, tp.faltas, tp.exige_sinal,
         (select array_agg(s.nome order by ai.ordem) from public.agendamento_item ai
            join public.servico s on s.id = ai.servico_id where ai.agendamento_id = a.id)
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

-- Horário informado pela equipe no fuso da loja (ex.: encaixe às 14:10) → instante em UTC.
create function public.horario_da_loja(p_petshop_id uuid, p_local timestamp) returns timestamptz
language sql stable security invoker set search_path = '' as $$
  select p_local at time zone p.fuso from public.petshop p where p.id = p_petshop_id
$$;

grant execute on function public.horario_da_loja(uuid, timestamp) to authenticated;

-- ---------------------------------------------------------------------------
-- Balcão, telefone e WhatsApp: tutor pelo telefone e cadastro mínimo
-- ---------------------------------------------------------------------------
-- A busca só encontra tutores que já são clientes desta loja: o telefone não é verificado (decisão da semana 4),
-- então digitar um número não revela o cadastro que o tutor tem em outra loja.
create function public.buscar_tutor_balcao(p_petshop_id uuid, p_telefone text)
returns table (tutor_id uuid, nome text, telefone text, tem_conta boolean, faltas smallint, exige_sinal boolean, pets jsonb)
language sql stable security definer set search_path = '' as $$
  select t.id, t.nome, t.telefone_e164, t.user_id is not null, tp.faltas, tp.exige_sinal,
         coalesce((select jsonb_agg(jsonb_build_object('id', pe.id, 'nome', pe.nome, 'porte', pe.porte,
                                                       'pelagem', pe.pelagem, 'raca', pe.raca) order by pe.nome)
                     from public.pet pe where pe.tutor_id = t.id and pe.ativo), '[]')
    from public.tutor t
    join public.tutor_petshop tp on tp.tutor_id = t.id and tp.petshop_id = p_petshop_id
   where p_petshop_id = any(app.lojas_operacao())
     and t.telefone_e164 = p_telefone
   order by t.user_id is null, t.nome
$$;

revoke all on function public.buscar_tutor_balcao(uuid, text) from public, anon;
grant execute on function public.buscar_tutor_balcao(uuid, text) to authenticated;

-- Cadastro mínimo feito pela loja (sem conta). Se já existe um cadastro sem conta com esse telefone
-- (feito por outra loja), ele passa a ser cliente desta loja também; um cadastro COM conta nunca é ligado
-- só pelo telefone (fica para a verificação por código, semanas 6–7).
create function public.cadastrar_tutor_balcao(
  p_petshop_id uuid,
  p_nome text,
  p_telefone text,
  p_consentimento_contato boolean default false
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not (p_petshop_id = any(app.lojas_operacao())) then
    raise exception 'sem permissão para cadastrar clientes nesta loja' using errcode = '42501';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'informe o nome do tutor' using errcode = 'AG002';
  end if;

  select t.id into v_id
    from public.tutor t join public.tutor_petshop tp on tp.tutor_id = t.id and tp.petshop_id = p_petshop_id
   where t.telefone_e164 = p_telefone
   order by t.user_id is null
   limit 1;
  if v_id is null then
    select id into v_id from public.tutor where telefone_e164 = p_telefone and user_id is null;
  end if;
  if v_id is null then
    insert into public.tutor (nome, telefone_e164) values (trim(p_nome), p_telefone) returning id into v_id;
  end if;

  insert into public.tutor_petshop (petshop_id, tutor_id, consentimento_contato_em)
  values (p_petshop_id, v_id, case when p_consentimento_contato then now() end)
  on conflict (petshop_id, tutor_id) do update
    set consentimento_contato_em = coalesce(public.tutor_petshop.consentimento_contato_em,
                                            case when p_consentimento_contato then now() end);
  return v_id;
end $$;

revoke all on function public.cadastrar_tutor_balcao(uuid, text, text, boolean) from public, anon;
grant execute on function public.cadastrar_tutor_balcao(uuid, text, text, boolean) to authenticated;

-- Pet cadastrado pela loja para um cliente dela.
create function public.cadastrar_pet_balcao(
  p_petshop_id uuid,
  p_tutor_id uuid,
  p_nome text,
  p_porte public.porte,
  p_pelagem public.pelagem,
  p_especie text default 'cao',
  p_raca text default null
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if not (p_petshop_id = any(app.lojas_operacao())) then
    raise exception 'sem permissão para cadastrar pets nesta loja' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tutor_petshop where petshop_id = p_petshop_id and tutor_id = p_tutor_id) then
    raise exception 'tutor não encontrado nesta loja' using errcode = 'AG002';
  end if;
  insert into public.pet (tutor_id, nome, especie, porte, pelagem, raca)
  values (p_tutor_id, trim(p_nome), p_especie, p_porte, p_pelagem, nullif(trim(p_raca), ''))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.cadastrar_pet_balcao(uuid, uuid, text, public.porte, public.pelagem, text, text) from public, anon;
grant execute on function public.cadastrar_pet_balcao(uuid, uuid, text, public.porte, public.pelagem, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Tempo real: o painel recebe as mudanças da agenda (o Realtime aplica o RLS de cada usuário)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.agendamento;
  end if;
end $$;
