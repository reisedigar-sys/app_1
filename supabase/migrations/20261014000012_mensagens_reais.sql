-- 012 — Mensagens de verdade (semana 7a): modelos aprovados pela Meta, push no celular (tutor e equipe), status de
-- entrega vindos do webhook, "PARAR" e resposta automática do número central, logo da loja.
--
-- Como funciona:
--   * Cada tipo de mensagem tem um modelo (`modelo_mensagem`), com o mesmo texto submetido à Meta. `app.mensagem` devolve
--     o modelo, os parâmetros, o texto já montado (o que o painel mostra) e um resumo para o push.
--   * O worker recebe, para cada mensagem, o telefone do WhatsApp (só com autorização de contato) e as inscrições de
--     push. Sem nenhum canal, a mensagem não sai (com o motivo).
--   * O push é um aviso a mais: sai na primeira tentativa; quem decide se a mensagem foi enviada é o WhatsApp (ou o
--     push, quando ele é o único canal).
--   * O webhook da Meta chama `whatsapp_status` (entregue, lida, falhou) e `whatsapp_receber` (mensagens recebidas).

-- ---------------------------------------------------------------------------
-- Colunas novas
-- ---------------------------------------------------------------------------
alter table public.petshop add column logo_url text check (length(logo_url) <= 500);

-- Quando o tutor pediu para parar (respondeu PARAR ou desligou no app). Autorizar de novo limpa.
alter table public.tutor_petshop add column consentimento_contato_revogado_em timestamptz;

alter table public.notificacao_agendada
  -- Situação no WhatsApp, atualizada pelo webhook: enviada → entregue → lida (ou falhou).
  add column entrega text check (entrega in ('enviada', 'entregue', 'lida', 'falhou')),
  add column provedor_mensagem_id text,
  -- Em quantos celulares o push chegou ao serviço de push.
  add column push_enviados smallint not null default 0;
create index notificacao_provedor_idx on public.notificacao_agendada (provedor_mensagem_id) where provedor_mensagem_id is not null;

-- Mensagens do número central não são de uma loja.
alter table public.mensagem_log alter column petshop_id drop not null;
create index mensagem_log_provedor_idx on public.mensagem_log (provedor_mensagem_id) where provedor_mensagem_id is not null;

alter table public.whatsapp_entrada
  alter column petshop_id drop not null,
  add column phone_number_id text,
  add column telefone_e164 text,
  add column respondida_em timestamptz;
create index whatsapp_entrada_telefone_idx on public.whatsapp_entrada (telefone_e164, recebido_em desc);

-- ---------------------------------------------------------------------------
-- Modelos de mensagem (templates do WhatsApp)
-- ---------------------------------------------------------------------------
-- O corpo é o mesmo submetido à Meta (idioma pt_BR, categoria Utilidade). A Meta não aceita variável no começo ou no
-- fim do texto, por isso todo modelo começa com "Olá!" (ou "Hora do Pet:") e termina com texto fixo.
create table public.modelo_mensagem (
  nome text primary key check (nome ~ '^[a-z0-9_]+$'),
  descricao text not null,
  corpo text not null
);
alter table public.modelo_mensagem enable row level security;
create policy modelo_mensagem_select on public.modelo_mensagem for select to authenticated using (true);

insert into public.modelo_mensagem (nome, descricao, corpo) values
  ('hp_confirmacao', 'Agendamento recebido ou remarcado, com o link',
   E'Olá! {{1}}: agendamento {{2}} para {{3}}, {{4}}. Para confirmar, remarcar ou cancelar: {{5}}\n\nPara não receber mais avisos, responda PARAR.'),
  ('hp_lembrete_vespera', 'Lembrete da véspera, pedindo confirmação',
   E'Olá! {{1}}: lembrete de amanhã, {{2}}, para {{3}}. Confirme sua presença: {{4}}\n\nPara não receber mais avisos, responda PARAR.'),
  ('hp_lembrete_vespera_confirmado', 'Lembrete da véspera, já confirmado',
   E'Olá! {{1}}: até amanhã! {{2}}, {{3}}. Precisa mudar? {{4}}\n\nPara não receber mais avisos, responda PARAR.'),
  ('hp_lembrete_antes', 'Lembrete algumas horas antes',
   E'Olá! {{1}}: esperamos {{2}} às {{3}}. Precisa mudar? {{4}}\n\nPara não receber mais avisos, responda PARAR.'),
  ('hp_pet_pronto', 'Pet pronto para buscar',
   E'Olá! {{1}}: {{2}} está pronto! Pode vir buscar.\n\nPara não receber mais avisos, responda PARAR.'),
  ('hp_cancelado_loja', 'A loja cancelou o agendamento',
   E'Olá! {{1}}: o agendamento de {{2}}, {{3}}, foi cancelado pela loja. Para agendar de novo: {{4}}\n\nPara não receber mais avisos, responda PARAR.'),
  ('hp_liberado_sem_confirmacao', 'Horário liberado por falta de confirmação',
   E'Olá! {{1}}: o horário de {{2}}, {{3}}, foi liberado porque não recebemos a confirmação. Para agendar de novo: {{4}}\n\nPara não receber mais avisos, responda PARAR.'),
  ('hp_vaga_lista_espera', 'Vaga para quem está na lista de espera',
   E'Olá! {{1}}: abriu horário em {{2}} ({{3}}) para {{4}}. Quem agendar primeiro leva a vaga: {{5}}\n\nPara não receber mais avisos, responda PARAR.'),
  ('hp_aviso_loja_sem_confirmacao', 'Aviso à loja: o tutor não confirmou',
   E'Hora do Pet: {{1}} ({{2}}) não confirmou {{3}}, {{4}}. Veja a agenda no painel.');

-- {{1}}, {{2}}… → parâmetros, na ordem.
create function app.montar_modelo(p_nome text, p_parametros text[]) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_texto text;
begin
  select corpo into v_texto from public.modelo_mensagem where nome = p_nome;
  for i in 1 .. coalesce(cardinality(p_parametros), 0) loop
    v_texto := replace(v_texto, '{{' || i || '}}', coalesce(p_parametros[i], ''));
  end loop;
  return v_texto;
end $$;

-- ---------------------------------------------------------------------------
-- Push: inscrições por celular
-- ---------------------------------------------------------------------------
-- Escopo: 'tutor' (avisos dos próprios agendamentos) ou 'equipe' (avisos das lojas em que a pessoa trabalha).
-- Sem petshop_id: a inscrição é do usuário. Gravada e apagada só pelas funções abaixo.
create table public.push_inscricao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  escopo text not null check (escopo in ('tutor', 'equipe')),
  endpoint text not null check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  criado_em timestamptz not null default now(),
  unique (endpoint, escopo)
);
create index push_inscricao_user_idx on public.push_inscricao (user_id, escopo);
alter table public.push_inscricao enable row level security;
create policy push_inscricao_select on public.push_inscricao for select to authenticated
  using (user_id = (select auth.uid()));

-- Liga os avisos neste celular. O celular passa a ser de quem está logado (outra pessoa pode ter usado antes).
create function public.registrar_push(p_escopo text, p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'entre na sua conta' using errcode = '42501';
  end if;
  if p_escopo = 'tutor' and app.tutor_atual() is null then
    raise exception 'complete seu cadastro antes' using errcode = '42501';
  end if;
  if p_escopo = 'equipe' and cardinality(app.lojas_visiveis()) = 0 then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  -- Só serviços de push dos navegadores (o worker faz um POST no endereço).
  if p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)/' then
    raise exception 'endereço de push não aceito' using errcode = '22023';
  end if;
  insert into public.push_inscricao (user_id, escopo, endpoint, p256dh, auth)
  values (auth.uid(), p_escopo, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint, escopo) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, criado_em = now();
end $$;

create function public.remover_push(p_escopo text, p_endpoint text) returns void
language sql volatile security definer set search_path = '' as $$
  delete from public.push_inscricao where escopo = p_escopo and endpoint = p_endpoint and user_id = auth.uid()
$$;

revoke all on function public.registrar_push(text, text, text, text), public.remover_push(text, text) from public, anon;
grant execute on function public.registrar_push(text, text, text, text), public.remover_push(text, text) to authenticated;

create function app.inscricoes(p_where_user uuid[], p_escopo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'endpoint', i.endpoint, 'p256dh', i.p256dh, 'auth', i.auth)
                            order by i.criado_em), '[]')
    from public.push_inscricao i
   where i.escopo = p_escopo and i.user_id = any(p_where_user)
$$;

-- Quem da equipe recebe avisos da loja: dono, gerente, atendente e o dono da rede; a profissional, só dos próprios
-- atendimentos.
create function app.usuarios_equipe(p_petshop_id uuid, p_profissional_id uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct u), '{}') from (
    select m.user_id as u from public.petshop_membro m
     where m.petshop_id = p_petshop_id
       and (m.papel in ('dono', 'gerente', 'atendente') or (m.papel = 'profissional' and m.profissional_id = p_profissional_id))
    union
    select r.user_id from public.rede_membro r join public.petshop p on p.rede_id = r.rede_id where p.id = p_petshop_id
  ) s
$$;

-- ---------------------------------------------------------------------------
-- Texto das mensagens: modelo, parâmetros, texto montado e resumo para o push
-- ---------------------------------------------------------------------------
-- Devolve {texto, link, modelo, parametros, push: {titulo, corpo, url}} ou null se não há o que enviar.
-- `link` e o parâmetro "{link}" são caminhos do app; o worker põe o endereço na frente.
-- Tipos só para a equipe (push) não têm modelo.
create or replace function app.mensagem(n public.notificacao_agendada) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_loja public.petshop;
  v_token uuid;
  v_inicio timestamptz;
  v_pets text[];
  v_pendente boolean;
  v_link text;
  v_tutor public.tutor;
  v_modelo text;
  v_parametros text[];
  v_titulo text;
  v_corpo text;
  v_url text;
  v_pet text;
  v_quando text;
  v_data text;
begin
  select * into v_loja from public.petshop where id = n.petshop_id;
  select * into v_tutor from public.tutor where id = n.tutor_id;
  v_titulo := v_loja.nome;
  if n.pedido_id is not null then
    select pd.token_confirmacao into v_token from public.pedido pd where pd.id = n.pedido_id;
    select min(a.inicio), array_agg(pe.nome order by a.inicio), bool_or(a.status = 'agendado')
      into v_inicio, v_pets, v_pendente
      from public.agendamento a join public.pet pe on pe.id = a.pet_id
     where a.pedido_id = n.pedido_id and a.status in ('agendado', 'confirmado');
    v_link := '/c/' || v_token;
    v_quando := app.quando_br(v_inicio, v_loja.fuso);
  end if;

  case n.tipo
    when 'confirmacao_imediata' then
      v_modelo := 'hp_confirmacao';
      v_parametros := array[v_loja.nome, case when n.dados ? 'remarcado' then 'remarcado' else 'recebido' end,
                            app.lista_br(v_pets), v_quando, '{link}'];
      v_corpo := format('Agendamento %s para %s, %s. Toque para confirmar ou mudar.', v_parametros[2], v_parametros[3], v_quando);
    when 'lembrete_d1' then
      if v_pendente then
        v_modelo := 'hp_lembrete_vespera';
        v_parametros := array[v_loja.nome, v_quando, app.lista_br(v_pets), '{link}'];
        v_corpo := format('Amanhã, %s: %s. Toque para confirmar.', v_quando, app.lista_br(v_pets));
      else
        v_modelo := 'hp_lembrete_vespera_confirmado';
        v_parametros := array[v_loja.nome, app.lista_br(v_pets), v_quando, '{link}'];
        v_corpo := format('Até amanhã! %s, %s.', app.lista_br(v_pets), v_quando);
      end if;
    when 'lembrete_antes' then
      v_modelo := 'hp_lembrete_antes';
      v_parametros := array[v_loja.nome, app.lista_br(v_pets), to_char(v_inicio at time zone v_loja.fuso, 'HH24:MI'), '{link}'];
      v_corpo := format('Esperamos %s às %s.', v_parametros[2], v_parametros[3]);
    when 'pet_pronto' then
      select pe.nome into v_pet from public.agendamento a join public.pet pe on pe.id = a.pet_id where a.id = n.agendamento_id;
      v_modelo := 'hp_pet_pronto';
      v_parametros := array[v_loja.nome, v_pet];
      v_corpo := format('%s está pronto! Pode vir buscar.', v_pet);
      v_link := null;
    when 'cancelamento' then
      v_link := '/' || v_loja.slug;
      v_modelo := case n.dados ->> 'motivo' when 'sem_confirmacao' then 'hp_liberado_sem_confirmacao' else 'hp_cancelado_loja' end;
      v_parametros := array[v_loja.nome, app.lista_br(array(select jsonb_array_elements_text(n.dados -> 'pets'))),
                            app.quando_br((n.dados ->> 'inicio')::timestamptz, v_loja.fuso), '{link}'];
      v_corpo := format(case n.dados ->> 'motivo'
                          when 'sem_confirmacao' then 'O horário de %s, %s, foi liberado porque não recebemos a confirmação.'
                          else 'O agendamento de %s, %s, foi cancelado pela loja.'
                        end, v_parametros[2], v_parametros[3]);
    when 'vaga_lista_espera' then
      v_link := '/' || v_loja.slug || '/agendar';
      select pe.nome into v_pet from public.lista_espera le join public.pet pe on pe.id = le.pet_id
       where le.id = (n.dados ->> 'lista_espera_id')::uuid;
      v_modelo := 'hp_vaga_lista_espera';
      v_parametros := array[v_loja.nome, to_char((n.dados ->> 'data')::date, 'DD/MM'),
                            case n.dados ->> 'periodo' when 'manha' then 'manhã' when 'tarde' then 'tarde' else 'qualquer horário' end,
                            v_pet, '{link}'];
      v_corpo := format('Abriu horário em %s (%s) para %s. Toque para agendar.', v_parametros[2], v_parametros[3], v_pet);
    when 'aviso_loja_sem_confirmacao' then
      v_link := null;
      v_modelo := 'hp_aviso_loja_sem_confirmacao';
      v_parametros := array[v_tutor.nome, v_tutor.telefone_e164, app.lista_br(v_pets), v_quando];
      v_titulo := 'Sem confirmação · ' || v_loja.nome;
      v_corpo := format('%s não confirmou %s, %s.', v_tutor.nome, app.lista_br(v_pets), v_quando);
      v_url := format('/painel/%s/agenda?data=%s', v_loja.id, to_char(v_inicio at time zone v_loja.fuso, 'YYYY-MM-DD'));
    when 'equipe_novo_pedido' then
      if v_inicio is null then
        return null;
      end if;
      v_link := null;
      v_titulo := 'Novo agendamento · ' || v_loja.nome;
      v_corpo := format('%s: %s, %s (%s).', v_tutor.nome, app.lista_br(v_pets), v_quando,
                        case (select canal from public.pedido where id = n.pedido_id)
                          when 'whatsapp' then 'pelo WhatsApp' when 'marketplace' then 'pelo marketplace' else 'pelo app' end);
      v_url := format('/painel/%s/agenda?data=%s', v_loja.id, to_char(v_inicio at time zone v_loja.fuso, 'YYYY-MM-DD'));
    when 'equipe_cancelamento' then
      v_link := null;
      v_data := to_char((n.dados ->> 'inicio')::timestamptz at time zone v_loja.fuso, 'YYYY-MM-DD');
      v_titulo := 'Cancelamento · ' || v_loja.nome;
      v_corpo := format('%s cancelou %s, %s.', v_tutor.nome,
                        app.lista_br(array(select jsonb_array_elements_text(n.dados -> 'pets'))),
                        app.quando_br((n.dados ->> 'inicio')::timestamptz, v_loja.fuso));
      v_url := format('/painel/%s/agenda?data=%s', v_loja.id, v_data);
    else
      return null;
  end case;

  return jsonb_build_object(
    'texto', case when v_modelo is null then v_corpo else app.montar_modelo(v_modelo, v_parametros) end,
    'link', v_link,
    'modelo', v_modelo,
    'parametros', to_jsonb(coalesce(v_parametros, '{}')),
    'push', jsonb_build_object('titulo', v_titulo, 'corpo', v_corpo,
                               'url', coalesce(v_url, v_link, '/conta/agendamentos'),
                               'icone', '/' || v_loja.slug || '/icone/192'));
end $$;

-- Motivo para NÃO enviar (a mensagem é cancelada com esse motivo) ou null. Os canais (autorização de contato,
-- telefone, push) são vistos em `reservar_fila`.
create or replace function app.motivo_para_nao_enviar(n public.notificacao_agendada, p_agora timestamptz) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if n.tipo = 'aviso_loja_sem_confirmacao' then
    if not exists (select 1 from public.agendamento a where a.pedido_id = n.pedido_id and a.status = 'agendado' and a.inicio > p_agora) then
      return 'o tutor confirmou ou o atendimento já começou';
    end if;
  elsif n.tipo in ('confirmacao_imediata', 'lembrete_d1', 'lembrete_antes') then
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
  elsif n.tipo in ('equipe_novo_pedido', 'equipe_cancelamento') then
    if p_agora > n.enviar_em + interval '2 hours' then
      return 'perdeu a hora';
    end if;
  end if;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Worker: reservar devolve os canais; concluir registra a entrega
-- ---------------------------------------------------------------------------
drop function public.worker_reservar(int, timestamptz);
drop function app.reservar_fila(int, timestamptz);
drop function public.worker_concluir(uuid, boolean, text, text, text, timestamptz);

-- Reserva o que venceu. Vários workers ao mesmo tempo nunca pegam a mesma mensagem (SKIP LOCKED).
--   destino: telefone para o WhatsApp (null = sem WhatsApp); push: inscrições que recebem o aviso.
create function app.reservar_fila(p_limite int, p_agora timestamptz)
returns table (id uuid, tipo public.tipo_notificacao, destino text, conteudo jsonb, tentativas smallint, push jsonb)
language plpgsql volatile security definer set search_path = '' as $$
declare
  n public.notificacao_agendada;
  v_motivo text;
  v_conteudo jsonb;
  v_destino text;
  v_push jsonb;
begin
  for n in
    select na.* from public.notificacao_agendada na
     where na.status = 'pendente' and coalesce(na.proxima_tentativa_em, na.enviar_em) <= p_agora
     order by coalesce(na.proxima_tentativa_em, na.enviar_em)
     for update skip locked
     limit least(greatest(p_limite, 1), 500)
  loop
    v_destino := null;
    v_push := '[]';
    v_motivo := app.motivo_para_nao_enviar(n, p_agora);

    if v_motivo is null then
      if n.tipo in ('equipe_novo_pedido', 'equipe_cancelamento') then
        v_push := app.inscricoes(app.usuarios_equipe(n.petshop_id,
                    (select a.profissional_id from public.agendamento a where a.id = n.agendamento_id)), 'equipe');
        if v_push = '[]' then
          v_motivo := 'ninguém da equipe com avisos ligados';
        end if;
      elsif n.tipo = 'aviso_loja_sem_confirmacao' then
        v_destino := (select l.telefone_e164 from public.petshop l where l.id = n.petshop_id);
        v_push := app.inscricoes(app.usuarios_equipe(n.petshop_id, null), 'equipe');
        if v_destino is null and v_push = '[]' then
          v_motivo := 'loja sem telefone';
        end if;
      else
        v_destino := (select t.telefone_e164 from public.tutor t
                       join public.tutor_petshop tp on tp.tutor_id = t.id and tp.petshop_id = n.petshop_id
                      where t.id = n.tutor_id and tp.consentimento_contato_em is not null);
        v_push := app.inscricoes((select array_agg(t.user_id) from public.tutor t where t.id = n.tutor_id and t.user_id is not null), 'tutor');
        if v_destino is null and v_push = '[]' then
          v_motivo := 'sem autorização de contato';
        end if;
      end if;
    end if;

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

    update public.notificacao_agendada na
       set status = 'processando', processando_desde = p_agora, tentativas = na.tentativas + 1,
           conteudo = v_conteudo, destino = v_destino
     where na.id = n.id;

    id := n.id;
    tipo := n.tipo;
    destino := v_destino;
    conteudo := v_conteudo;
    tentativas := n.tentativas + 1;
    push := v_push;
    return next;
  end loop;
end $$;

create function public.worker_reservar(p_limite int default 50, p_agora timestamptz default now())
returns table (id uuid, tipo public.tipo_notificacao, destino text, conteudo jsonb, tentativas smallint, push jsonb)
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

-- Resultado do envio principal (WhatsApp; ou push, quando é o único canal). Falha: nova tentativa com espera
-- crescente (2, 4, 8, 16 min) até max_tentativas. p_registrar = false quando o push já foi registrado por worker_push.
create function public.worker_concluir(
  p_id uuid,
  p_ok boolean,
  p_provedor text,
  p_provedor_mensagem_id text default null,
  p_erro text default null,
  p_agora timestamptz default now(),
  p_registrar boolean default true
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
       set status = 'enviada', enviada_em = p_agora, processando_desde = null, ultimo_erro = null,
           provedor_mensagem_id = coalesce(p_provedor_mensagem_id, provedor_mensagem_id),
           entrega = case when p_provedor = 'whatsapp' then 'enviada' else entrega end
     where id = p_id;
  else
    update public.notificacao_agendada
       set status = case when n.tentativas >= n.max_tentativas then 'falhou' else 'pendente' end::public.status_notificacao,
           proxima_tentativa_em = p_agora + make_interval(mins => power(2, n.tentativas)::int),
           processando_desde = null,
           ultimo_erro = left(p_erro, 500)
     where id = p_id;
  end if;
  if p_registrar then
    insert into public.mensagem_log (petshop_id, notificacao_id, tutor_id, direcao, categoria, provedor,
                                     provedor_mensagem_id, destino, conteudo, status, erro)
    values (n.petshop_id, n.id, n.tutor_id, 'saida', n.categoria, p_provedor, p_provedor_mensagem_id, n.destino, n.conteudo,
            case when not p_ok then 'erro' when p_provedor = 'teste' then 'simulada' else 'enviada' end, left(p_erro, 500));
  end if;
end $$;

-- Resultado do push, um item por inscrição: [{id, ok, erro, expirada}]. Inscrição expirada (o celular desligou os
-- avisos ou reinstalou o app) é apagada.
create function public.worker_push(p_id uuid, p_resultados jsonb) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  n public.notificacao_agendada;
begin
  select * into n from public.notificacao_agendada where id = p_id;
  if n.id is null then
    return;
  end if;
  delete from public.push_inscricao
   where id in (select (r ->> 'id')::uuid from jsonb_array_elements(p_resultados) r where (r ->> 'expirada')::boolean);
  update public.notificacao_agendada
     set push_enviados = push_enviados + (select count(*) from jsonb_array_elements(p_resultados) r where (r ->> 'ok')::boolean)
   where id = p_id;
  insert into public.mensagem_log (petshop_id, notificacao_id, tutor_id, direcao, categoria, provedor, destino, conteudo, status, erro)
  select n.petshop_id, n.id, n.tutor_id, 'saida', n.categoria, 'push', r ->> 'id', n.conteudo -> 'push',
         case when (r ->> 'ok')::boolean then 'enviada' else 'erro' end, left(r ->> 'erro', 500)
    from jsonb_array_elements(p_resultados) r;
end $$;

-- ---------------------------------------------------------------------------
-- Webhook do WhatsApp
-- ---------------------------------------------------------------------------
-- Status de entrega de uma mensagem enviada. Só avança (enviada → entregue → lida); falhou vale sempre.
create function public.whatsapp_status(p_provedor_mensagem_id text, p_status text, p_erro text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_status text := case p_status when 'sent' then 'enviada' when 'delivered' then 'entregue' when 'read' then 'lida'
                                  when 'failed' then 'falhou' end;
  v_ordem text[] := array['enviada', 'entregue', 'lida'];
begin
  if v_status is null then
    return;
  end if;
  update public.notificacao_agendada
     set entrega = v_status,
         ultimo_erro = case when v_status = 'falhou' then left(coalesce(p_erro, 'falha na entrega'), 500) else ultimo_erro end
   where provedor_mensagem_id = p_provedor_mensagem_id
     and (v_status = 'falhou' or entrega is null
          or array_position(v_ordem, entrega) < array_position(v_ordem, v_status));
  update public.mensagem_log
     set status = v_status, erro = case when v_status = 'falhou' then left(p_erro, 500) else erro end
   where provedor_mensagem_id = p_provedor_mensagem_id and provedor = 'whatsapp'
     and (v_status = 'falhou' or status not in ('entregue', 'lida') or (status = 'entregue' and v_status = 'lida'));
end $$;

-- "PARAR", "pare", "stop", "sair"… (sem acento, maiúsculas ou pontuação).
create function app.pediu_para_parar(p_texto text) returns boolean
language sql immutable set search_path = '' as $$
  select regexp_replace(lower(translate(coalesce(p_texto, ''), 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc')),
                        '[^a-z ]', '', 'g') ~ '^\s*(parar|pare|stop|sair|cancelar avisos|nao quero mais|descadastrar)\s*$'
$$;

-- Mensagem recebida. Devolve {resposta} (texto a responder ou null). A mesma mensagem nunca é processada duas vezes.
--   Número central: "PARAR" vale para todas as lojas que mandam avisos por ele (não dá para saber de qual loja a
--   pessoa está falando); qualquer outra mensagem recebe, no máximo a cada 12 h, o link das lojas onde ela é cliente.
--   Número da loja (7b): "PARAR" vale só para aquela loja; o resto fica para o bot.
-- Os links vêm como caminhos ("/slug"); quem envia põe o endereço do app na frente ({app}).
create function public.whatsapp_receber(
  p_mensagem_id text,
  p_phone_number_id text,
  p_de text,
  p_texto text,
  p_payload jsonb,
  p_agora timestamptz default now()
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_telefone text := '+' || regexp_replace(coalesce(p_de, ''), '\D', '', 'g');
  v_loja uuid;
  v_lojas text[];
  v_resposta text;
begin
  select pw.petshop_id into v_loja from public.petshop_whatsapp pw where pw.phone_number_id = p_phone_number_id and pw.ativo;

  insert into public.whatsapp_entrada (mensagem_id, petshop_id, phone_number_id, telefone_e164, payload, recebido_em)
  values (p_mensagem_id, v_loja, p_phone_number_id, v_telefone, p_payload, p_agora)
  on conflict (mensagem_id) do nothing;
  if not found then
    return jsonb_build_object('resposta', null, 'duplicada', true);
  end if;

  insert into public.mensagem_log (petshop_id, direcao, provedor, provedor_mensagem_id, destino, conteudo, status, criado_em)
  values (v_loja, 'entrada', 'whatsapp', p_mensagem_id, v_telefone, jsonb_build_object('texto', left(p_texto, 2000)), 'recebida', p_agora);

  if app.pediu_para_parar(p_texto) then
    with parou as (
      update public.tutor_petshop tp
         set consentimento_contato_em = null, consentimento_contato_revogado_em = p_agora
        from public.tutor t
       where t.id = tp.tutor_id and t.telefone_e164 = v_telefone and tp.consentimento_contato_em is not null
         -- Até a 7b, todas as lojas mandam avisos pelo número central.
         and (v_loja is null or tp.petshop_id = v_loja)
      returning tp.petshop_id
    )
    select array_agg(distinct p.nome order by p.nome) into v_lojas from parou join public.petshop p on p.id = parou.petshop_id;
    v_resposta := case when v_lojas is null
      then 'Este número não está recebendo avisos. Se quiser receber de novo, autorize em Minha conta, no app da loja.'
      else 'Pronto: você não vai mais receber avisos pelo WhatsApp de ' || app.lista_br(v_lojas)
           || '. Para voltar a receber, autorize em Minha conta, no app da loja.' end;
  elsif v_loja is null then
    if exists (select 1 from public.whatsapp_entrada e
                where e.telefone_e164 = v_telefone and e.respondida_em > p_agora - interval '12 hours') then
      v_resposta := null;
    else
      select array_agg(format('%s: {app}/%s', l.nome, l.slug) order by l.ultimo desc) into v_lojas
        from (select p.nome, p.slug, max(coalesce(a.inicio, tp.criado_em)) as ultimo
                from public.tutor t
                join public.tutor_petshop tp on tp.tutor_id = t.id
                join public.petshop p on p.id = tp.petshop_id and p.ativo
                left join public.agendamento a on a.tutor_id = t.id and a.petshop_id = p.id
               where t.telefone_e164 = v_telefone
               group by p.nome, p.slug
               order by 3 desc
               limit 5) l;
      v_resposta := 'Olá! Este número do Hora do Pet só envia avisos de agendamento e não lê as respostas. '
        || case when v_lojas is null then 'Para agendar ou falar com o petshop, use o link ou o telefone que ele passou.'
                else E'Para agendar, remarcar ou falar com o petshop:\n' || array_to_string(v_lojas, E'\n') end
        || E'\n\nPara não receber mais avisos, responda PARAR.';
    end if;
  end if;

  update public.whatsapp_entrada
     set processado_em = p_agora, respondida_em = case when v_resposta is not null then p_agora end
   where mensagem_id = p_mensagem_id;
  return jsonb_build_object('resposta', v_resposta);
end $$;

revoke all on function public.worker_reservar(int, timestamptz),
                       public.worker_concluir(uuid, boolean, text, text, text, timestamptz, boolean),
                       public.worker_push(uuid, jsonb),
                       public.whatsapp_status(text, text, text),
                       public.whatsapp_receber(text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.worker_reservar(int, timestamptz),
                          public.worker_concluir(uuid, boolean, text, text, text, timestamptz, boolean),
                          public.worker_push(uuid, jsonb),
                          public.whatsapp_status(text, text, text),
                          public.whatsapp_receber(text, text, text, text, jsonb, timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Avisos para a equipe (push): o tutor agendou ou cancelou
-- ---------------------------------------------------------------------------
-- Só programa quando alguém da equipe ligou os avisos (sem isso a mensagem nem entra na fila).
create function app.equipe_tem_push(p_petshop_id uuid, p_profissional_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.push_inscricao i
                  where i.escopo = 'equipe' and i.user_id = any(app.usuarios_equipe(p_petshop_id, p_profissional_id)))
$$;

create function app.agendamento_avisa_equipe() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.canal in ('app_proprio', 'whatsapp', 'marketplace') and new.status in ('agendado', 'confirmado')
       and app.equipe_tem_push(new.petshop_id, new.profissional_id) then
      -- Um aviso por pedido (a chave inclui now(), igual para todos os pets da mesma transação).
      perform app.enfileirar(new.id, 'equipe_novo_pedido', now());
    end if;
  elsif new.status = 'cancelado' and old.status is distinct from 'cancelado' and new.inicio > now()
        -- Cancelado pelo tutor (app ou link): não foi a equipe nem o prazo de confirmação (liberar_horario).
        and not (new.petshop_id = any(app.lojas_operacao()))
        and not (new.sem_confirmacao_em is not null and new.cancelado_em = new.sem_confirmacao_em)
        and app.equipe_tem_push(new.petshop_id, new.profissional_id) then
    perform app.enfileirar(new.id, 'equipe_cancelamento', clock_timestamp(), jsonb_build_object(
      'inicio', new.inicio, 'pets', jsonb_build_array((select pe.nome from public.pet pe where pe.id = new.pet_id))));
  end if;
  return new;
end $$;
-- Nome depois de agendamento_cancela_notificacoes (ordem alfabética), que cancelaria o aviso recém-criado.
create trigger agendamento_notificacoes_equipe after insert or update of status on public.agendamento
  for each row execute function app.agendamento_avisa_equipe();

-- ---------------------------------------------------------------------------
-- Tutor: minhas lojas e avisos pelo WhatsApp em cada uma
-- ---------------------------------------------------------------------------
-- Lojas em que o tutor logado é cliente, com o próximo agendamento e se recebe avisos pelo WhatsApp.
create function public.minhas_lojas() returns table (
  petshop_id uuid, nome text, slug text, logo_url text, telefone_e164 text,
  avisos_whatsapp boolean, proximo_inicio timestamptz, fuso text
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nome, p.slug, p.logo_url, p.telefone_e164, tp.consentimento_contato_em is not null,
         (select min(a.inicio) from public.agendamento a
           where a.tutor_id = tp.tutor_id and a.petshop_id = p.id and a.status in ('agendado', 'confirmado') and a.inicio > now()),
         p.fuso
    from public.tutor_petshop tp
    join public.petshop p on p.id = tp.petshop_id and p.ativo
   where tp.tutor_id = app.tutor_atual()
   order by 7 nulls last, p.nome
$$;

-- Liga ou desliga os avisos pelo WhatsApp de uma loja (o mesmo que responder PARAR, só que por loja).
create function public.definir_avisos_whatsapp(p_petshop_id uuid, p_ligado boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_tutor uuid := app.tutor_atual();
begin
  if v_tutor is null then
    raise exception 'complete seu cadastro antes' using errcode = '42501';
  end if;
  update public.tutor_petshop
     set consentimento_contato_em = case when p_ligado then coalesce(consentimento_contato_em, now()) end,
         consentimento_contato_revogado_em = case when p_ligado then null else coalesce(consentimento_contato_revogado_em, now()) end
   where petshop_id = p_petshop_id and tutor_id = v_tutor;
  if not found then
    raise exception 'você ainda não é cliente desta loja' using errcode = 'P0002';
  end if;
end $$;

revoke all on function public.minhas_lojas(), public.definir_avisos_whatsapp(uuid, boolean) from public, anon;
grant execute on function public.minhas_lojas(), public.definir_avisos_whatsapp(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Painel: quantas mensagens saíram no mês (o WhatsApp cobra por mensagem de modelo)
-- ---------------------------------------------------------------------------
create function public.mensagens_do_mes(p_petshop_id uuid, p_mes date default null)
returns table (whatsapp bigint, push bigint, simuladas bigint)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text;
  v_inicio timestamptz;
begin
  if not (p_petshop_id = any(app.lojas_operacao())) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  select fuso into v_fuso from public.petshop where id = p_petshop_id;
  v_inicio := date_trunc('month', coalesce(p_mes, (now() at time zone v_fuso)::date))::timestamp at time zone v_fuso;
  return query
    select count(*) filter (where l.provedor = 'whatsapp' and l.status <> 'erro'),
           count(*) filter (where l.provedor = 'push' and l.status <> 'erro'),
           count(*) filter (where l.provedor = 'teste')
      from public.mensagem_log l
     where l.petshop_id = p_petshop_id and l.direcao = 'saida'
       and l.criado_em >= v_inicio and l.criado_em < v_inicio + interval '1 month';
end $$;
revoke all on function public.mensagens_do_mes(uuid, date) from public, anon;
grant execute on function public.mensagens_do_mes(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Permissões das funções internas
-- ---------------------------------------------------------------------------
revoke all on function app.montar_modelo(text, text[]), app.inscricoes(uuid[], text), app.usuarios_equipe(uuid, uuid),
                       app.reservar_fila(int, timestamptz), app.equipe_tem_push(uuid, uuid), app.agendamento_avisa_equipe(),
                       app.pediu_para_parar(text)
  from public, anon, authenticated;
