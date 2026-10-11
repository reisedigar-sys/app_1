-- Seeds de desenvolvimento e teste. IDs fixos para facilitar os testes.
--
-- Rede "Pet Feliz" (dona da rede: Renata)
--   ├─ Pet Feliz Centro      (3 profissionais; gerente Gabriel, atendente Alice, profissional Paula)
--   └─ Pet Feliz Zona Sul    (2 profissionais)
-- Rede "Banho & Cia" (dono da loja: Diego)
--   └─ Banho & Cia Moema     (2 profissionais)
-- Tutores: Ana (Centro e Moema) e Bruno (Zona Sul e Moema), com 2 pets cada.
-- Senha de todos os usuários: senha123

-- ---------------------------------------------------------------------------
-- Usuários (Supabase Auth)
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('senha123', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', jsonb_build_object('nome', u.nome), now(), now(),
       '', '', '', ''
  from (values
    ('a0000000-0000-0000-0000-000000000001'::uuid, 'renata@petfeliz.test', 'Renata (dona da rede Pet Feliz)'),
    ('a0000000-0000-0000-0000-000000000002'::uuid, 'gabriel@petfeliz.test', 'Gabriel (gerente Centro)'),
    ('a0000000-0000-0000-0000-000000000003'::uuid, 'alice@petfeliz.test', 'Alice (atendente Centro)'),
    ('a0000000-0000-0000-0000-000000000004'::uuid, 'paula@petfeliz.test', 'Paula (profissional Centro)'),
    ('a0000000-0000-0000-0000-000000000005'::uuid, 'diego@banhoecia.test', 'Diego (dono Banho & Cia)'),
    ('a0000000-0000-0000-0000-000000000006'::uuid, 'ana@tutor.test', 'Ana (tutora)'),
    ('a0000000-0000-0000-0000-000000000007'::uuid, 'bruno@tutor.test', 'Bruno (tutor)')
  ) as u (id, email, nome);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
  from auth.users where email like '%.test';

-- ---------------------------------------------------------------------------
-- Redes, lojas e equipe
-- ---------------------------------------------------------------------------
insert into public.rede (id, nome) values
  ('10000000-0000-0000-0000-000000000001', 'Pet Feliz'),
  ('10000000-0000-0000-0000-000000000002', 'Banho & Cia');

insert into public.petshop (id, rede_id, nome, slug, telefone_e164, logradouro, numero, bairro, cidade, uf, cep, latitude, longitude, buffer_minutos, sinal_percentual) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Pet Feliz Centro', 'pet-feliz-centro',
   '+5511900000001', 'Rua Direita', '100', 'Sé', 'São Paulo', 'SP', '01002000', -23.548900, -46.633900, 10, 0),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'Pet Feliz Zona Sul', 'pet-feliz-zona-sul',
   '+5511900000002', 'Av. Santo Amaro', '2000', 'Brooklin', 'São Paulo', 'SP', '04506000', -23.610000, -46.690000, 15, 20),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'Banho & Cia Moema', 'banho-e-cia-moema',
   '+5511900000003', 'Av. Ibirapuera', '3000', 'Moema', 'São Paulo', 'SP', '04029000', -23.600000, -46.665000, 10, 30);

insert into public.rede_membro (rede_id, user_id) values
  ('10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');

insert into public.profissional (id, petshop_id, nome, bio, ordem) values
  ('30000000-0000-0000-0000-000000000101', '20000000-0000-0000-0000-000000000001', 'Paula', 'Especialista em tosa na tesoura.', 1),
  ('30000000-0000-0000-0000-000000000102', '20000000-0000-0000-0000-000000000001', 'Marcos', 'Banho e hidratação.', 2),
  ('30000000-0000-0000-0000-000000000103', '20000000-0000-0000-0000-000000000001', 'Júlia', 'Cães de grande porte.', 3),
  ('30000000-0000-0000-0000-000000000201', '20000000-0000-0000-0000-000000000002', 'Rafael', null, 1),
  ('30000000-0000-0000-0000-000000000202', '20000000-0000-0000-0000-000000000002', 'Sofia', null, 2),
  ('30000000-0000-0000-0000-000000000301', '20000000-0000-0000-0000-000000000003', 'Carla', 'Tosadora há 10 anos.', 1),
  ('30000000-0000-0000-0000-000000000302', '20000000-0000-0000-0000-000000000003', 'Pedro', null, 2);

insert into public.petshop_membro (petshop_id, user_id, papel, profissional_id) values
  ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'gerente', null),
  ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'atendente', null),
  ('20000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'profissional', '30000000-0000-0000-0000-000000000101'),
  ('20000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', 'dono', null);

-- ---------------------------------------------------------------------------
-- Catálogo: mesmas categorias e serviços nas 3 lojas, preços diferentes por loja
-- ---------------------------------------------------------------------------
insert into public.categoria_servico (petshop_id, nome, ordem)
select p.id, c.nome, c.ordem
  from public.petshop p
 cross join (values ('Banho', 1), ('Tosa', 2), ('Extras', 3)) as c (nome, ordem);

insert into public.servico (petshop_id, categoria_id, nome, descricao, tipo, ordem)
select p.id, c.id, s.nome, s.descricao, s.tipo::public.tipo_servico, s.ordem
  from public.petshop p
 cross join (values
   ('Banho', 'Banho', 'Banho com shampoo neutro e secagem.', 'principal', 1),
   ('Banho', 'Banho e tosa higiênica', 'Banho + tosa da região íntima, patas e rosto.', 'principal', 2),
   ('Tosa', 'Tosa completa', 'Banho + tosa na máquina ou tesoura.', 'principal', 3),
   ('Extras', 'Hidratação', 'Hidratação dos pelos.', 'adicional', 4),
   ('Extras', 'Corte de unhas', null, 'adicional', 5),
   ('Extras', 'Escovação de dentes', null, 'adicional', 6)
 ) as s (categoria, nome, descricao, tipo, ordem)
  join public.categoria_servico c on c.petshop_id = p.id and c.nome = s.categoria;

-- Preço base × multiplicador de porte × multiplicador de pelagem × ajuste da loja.
-- Duração arredondada para múltiplos de 5 minutos.
insert into public.servico_preco (petshop_id, servico_id, porte, pelagem, preco_centavos, duracao_minutos)
select s.petshop_id, s.id, po.porte::public.porte, pe.pelagem::public.pelagem,
       (round(b.preco * po.mp * pe.mp * l.ajuste / 100) * 100)::int,
       (ceil(b.duracao * po.md * pe.md / 5) * 5)::smallint
  from public.servico s
  join (values
    ('Banho', 5000, 45), ('Banho e tosa higiênica', 6500, 60), ('Tosa completa', 9000, 90),
    ('Hidratação', 2500, 15), ('Corte de unhas', 1500, 10), ('Escovação de dentes', 1500, 10)
  ) as b (nome, preco, duracao) on b.nome = s.nome
  cross join (values ('mini', 0.8, 0.8), ('pequeno', 1.0, 1.0), ('medio', 1.3, 1.25), ('grande', 1.7, 1.5), ('gigante', 2.2, 2.0))
    as po (porte, mp, md)
  cross join (values ('curta', 1.0, 1.0), ('media', 1.15, 1.15), ('longa', 1.3, 1.3)) as pe (pelagem, mp, md)
  join (values
    ('20000000-0000-0000-0000-000000000001'::uuid, 1.0),
    ('20000000-0000-0000-0000-000000000002'::uuid, 1.1),
    ('20000000-0000-0000-0000-000000000003'::uuid, 0.95)
  ) as l (petshop_id, ajuste) on l.petshop_id = s.petshop_id;

-- Todos fazem banho e adicionais; tosa completa só alguns. Marcos é 20% mais lento.
insert into public.profissional_servico (petshop_id, profissional_id, servico_id, fator_duracao)
select pr.petshop_id, pr.id, s.id, case when pr.nome = 'Marcos' then 1.20 else 1.00 end
  from public.profissional pr
  join public.servico s on s.petshop_id = pr.petshop_id
 where s.nome <> 'Tosa completa' or pr.nome in ('Paula', 'Júlia', 'Rafael', 'Carla');

-- ---------------------------------------------------------------------------
-- Horários e bloqueios
-- ---------------------------------------------------------------------------
-- Terça a sábado, 9h às 18h, para todos.
insert into public.horario_trabalho (petshop_id, profissional_id, dia_semana, inicio, fim)
select pr.petshop_id, pr.id, d, '09:00', '18:00'
  from public.profissional pr
 cross join generate_series(2, 6) as d;

-- Paula (Centro) só faz tosa completa terça e quinta de manhã (janela específica do serviço).
insert into public.horario_trabalho (petshop_id, profissional_id, servico_id, dia_semana, inicio, fim)
select s.petshop_id, '30000000-0000-0000-0000-000000000101', s.id, d, '09:00', '13:00'
  from public.servico s
 cross join (values (2), (4)) as dias (d)
 where s.petshop_id = '20000000-0000-0000-0000-000000000001' and s.nome = 'Tosa completa';

-- Almoço de Marcos todo dia útil da próxima semana, folga de Pedro e feriado na Zona Sul.
insert into public.bloqueio (petshop_id, profissional_id, tipo, periodo, motivo)
select '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000102', 'almoco',
       tstzrange(((current_date + d) + time '12:00') at time zone 'America/Sao_Paulo',
                 ((current_date + d) + time '13:00') at time zone 'America/Sao_Paulo'), 'Almoço'
  from generate_series(1, 7) as d;

insert into public.bloqueio (petshop_id, profissional_id, tipo, periodo, motivo) values
  ('20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000302', 'folga',
   tstzrange((current_date + 3)::timestamp at time zone 'America/Sao_Paulo',
             (current_date + 4)::timestamp at time zone 'America/Sao_Paulo'), 'Folga'),
  ('20000000-0000-0000-0000-000000000002', null, 'feriado',
   tstzrange((current_date + 10)::timestamp at time zone 'America/Sao_Paulo',
             (current_date + 11)::timestamp at time zone 'America/Sao_Paulo'), 'Feriado municipal');

-- ---------------------------------------------------------------------------
-- Tutores e pets
-- ---------------------------------------------------------------------------
insert into public.tutor (id, user_id, nome, telefone_e164, email) values
  ('40000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000006', 'Ana Souza', '+5511988880001', 'ana@tutor.test'),
  ('40000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000007', 'Bruno Lima', '+5511988880002', 'bruno@tutor.test');

insert into public.tutor_petshop (petshop_id, tutor_id, consentimento_contato_em, observacoes) values
  ('20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', now(), 'Prefere WhatsApp à tarde.'),
  ('20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', now(), 'Cliente desde 2024.'),
  ('20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', now(), null),
  ('20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', null, 'Atrasa com frequência.');

insert into public.pet (id, tutor_id, nome, raca, porte, pelagem, temperamento, alergias) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Thor', 'Golden Retriever', 'grande', 'longa', 'Dócil', null),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'Mel', 'Pinscher', 'pequeno', 'curta', 'Agitada', 'Shampoo com perfume'),
  ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', 'Luna', 'Border Collie', 'medio', 'media', 'Dócil', null),
  ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000002', 'Bob', 'Shih Tzu', 'mini', 'longa', 'Medroso', null);

insert into public.pet_petshop (petshop_id, pet_id, observacoes) values
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Não gosta de secador.'),
  ('20000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000002', 'Usar shampoo hipoalergênico.'),
  ('20000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000004', 'Morde ao cortar unhas.');

-- ---------------------------------------------------------------------------
-- Pedidos e agendamentos (gravados direto aqui; no app passam por criar_pedido)
-- ---------------------------------------------------------------------------
insert into public.pedido (id, petshop_id, tutor_id, canal, chave_idempotencia, criado_por_tipo, total_centavos) values
  ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'app_proprio', 'seed-1', 'tutor', 0),
  ('60000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'whatsapp', 'seed-2', 'equipe', 0),
  ('60000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'balcao', 'seed-3', 'equipe', 0),
  ('60000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', 'app_proprio', 'seed-4', 'tutor', 0),
  ('60000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'app_proprio', 'seed-5', 'tutor', 0);

-- Agendamentos: (id, pedido, pet, profissional, dias a partir de hoje, hora local, serviço principal, status)
with dados (id, pedido_id, pet_id, profissional_id, dias, hora, servico, status) as (
  values
    ('70000000-0000-0000-0000-000000000001'::uuid, '60000000-0000-0000-0000-000000000001'::uuid, '50000000-0000-0000-0000-000000000001'::uuid, '30000000-0000-0000-0000-000000000103'::uuid, 2, time '10:00', 'Banho', 'agendado'),
    ('70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000301', 2, time '14:00', 'Banho e tosa higiênica', 'confirmado'),
    ('70000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000201', 3, time '09:00', 'Tosa completa', 'agendado'),
    ('70000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000302', -7, time '11:00', 'Banho', 'concluido'),
    ('70000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000005', '50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000101', -14, time '15:00', 'Banho', 'concluido')
), calc as (
  select d.*, pe.tutor_id, pd.petshop_id, pd.canal, sp.preco_centavos, sp.duracao_minutos, s.id as servico_id, ps.buffer_minutos,
         ((current_date + d.dias) + d.hora) at time zone ps.fuso as inicio
    from dados d
    join public.pet pe on pe.id = d.pet_id
    join public.pedido pd on pd.id = d.pedido_id
    join public.petshop ps on ps.id = pd.petshop_id
    join public.servico s on s.petshop_id = pd.petshop_id and s.nome = d.servico
    join public.servico_preco sp on sp.servico_id = s.id and sp.porte = pe.porte and sp.pelagem = pe.pelagem
), ag as (
  insert into public.agendamento (id, petshop_id, pedido_id, tutor_id, pet_id, profissional_id, canal, status,
                                  inicio, fim, buffer_minutos, preco_total_centavos)
  select id, petshop_id, pedido_id, tutor_id, pet_id, profissional_id, canal, status::public.status_agendamento,
         inicio, inicio + make_interval(mins => duracao_minutos), buffer_minutos, preco_centavos
    from calc
  returning id
)
insert into public.agendamento_item (petshop_id, agendamento_id, servico_id, ordem, preco_centavos, duracao_minutos)
select petshop_id, id, servico_id, 0, preco_centavos, duracao_minutos from calc;

update public.pedido p
   set total_centavos = (select sum(a.preco_total_centavos) from public.agendamento a where a.pedido_id = p.id);

-- ---------------------------------------------------------------------------
-- Anti no-show, lista de espera, WhatsApp e avaliações
-- ---------------------------------------------------------------------------
insert into public.notificacao_agendada (petshop_id, pedido_id, agendamento_id, tutor_id, tipo, enviar_em)
select a.petshop_id, a.pedido_id, a.id, a.tutor_id, 'lembrete_d1', a.inicio - interval '1 day'
  from public.agendamento a where a.status in ('agendado', 'confirmado');

insert into public.mensagem_log (petshop_id, tutor_id, direcao, destino, conteudo, status) values
  ('20000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'saida', '+5511988880001', '{"template":"confirmacao"}', 'entregue'),
  ('20000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000001', 'saida', '+5511988880001', '{"template":"confirmacao"}', 'entregue'),
  ('20000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'saida', '+5511988880002', '{"template":"confirmacao"}', 'entregue');

insert into public.lista_espera (petshop_id, tutor_id, pet_id, servico_id, data, periodo)
select s.petshop_id, t.tutor_id, t.pet_id, s.id, current_date + 2, 'manha'
  from public.servico s
  join (values
    ('20000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000001'::uuid, '50000000-0000-0000-0000-000000000002'::uuid),
    ('20000000-0000-0000-0000-000000000003'::uuid, '40000000-0000-0000-0000-000000000002'::uuid, '50000000-0000-0000-0000-000000000003'::uuid)
  ) as t (petshop_id, tutor_id, pet_id) on t.petshop_id = s.petshop_id
 where s.nome = 'Banho';

insert into public.petshop_whatsapp (petshop_id, phone_number_id, waba_id, telefone_e164) values
  ('20000000-0000-0000-0000-000000000001', 'pnid-centro', 'waba-petfeliz', '+5511900000001'),
  ('20000000-0000-0000-0000-000000000002', 'pnid-zona-sul', 'waba-petfeliz', '+5511900000002'),
  ('20000000-0000-0000-0000-000000000003', 'pnid-moema', 'waba-banhoecia', '+5511900000003');

insert into public.whatsapp_entrada (mensagem_id, petshop_id, payload) values
  ('wamid.seed-1', '20000000-0000-0000-0000-000000000001', '{"text":"oi"}'),
  ('wamid.seed-2', '20000000-0000-0000-0000-000000000003', '{"text":"quero agendar"}');

insert into public.whatsapp_sessao (petshop_id, telefone_e164, tutor_id, estado, expira_em) values
  ('20000000-0000-0000-0000-000000000001', '+5511988880001', '40000000-0000-0000-0000-000000000001', '{"etapa":"pet"}', now() + interval '1 hour'),
  ('20000000-0000-0000-0000-000000000003', '+5511988880002', '40000000-0000-0000-0000-000000000002', '{"etapa":"servico"}', now() + interval '1 hour');

insert into public.avaliacao (petshop_id, agendamento_id, profissional_id, tutor_id, nota, comentario)
select petshop_id, id, profissional_id, tutor_id, 5, 'Ótimo atendimento!'
  from public.agendamento where status = 'concluido';
