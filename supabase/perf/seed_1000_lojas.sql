-- Seed de carga: 1.000 lojas com agenda aberta por 60 dias, metade ocupada. Só para medir desempenho.
-- Uso: psql "$DATABASE_URL" -f supabase/perf/seed_1000_lojas.sql   (depois: pnpm db:reset para limpar)
--
-- Por loja: 3 profissionais (ter–sáb, 9h–18h), 2 serviços principais + 2 adicionais com preço para todos os
-- portes/pelagens, 10 tutores com 1 pet, e 3 a 4 atendimentos de 60 min por profissional por dia útil (meia agenda).

set client_min_messages = warning;

insert into public.rede (id, nome)
select ('f0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'Rede carga ' || i
  from generate_series(1, 1000) i;

insert into public.petshop (id, rede_id, nome, slug, telefone_e164, logradouro, cidade, uf, cep, janela_maxima_dias)
select ('f1000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       ('f0000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       'Loja carga ' || i, 'loja-carga-' || i, '+5511900' || lpad(i::text, 6, '0'), 'Rua', 'São Paulo', 'SP', '01000000', 60
  from generate_series(1, 1000) i;

insert into public.profissional (petshop_id, nome, ordem)
select p.id, 'Profissional ' || n, n
  from public.petshop p cross join generate_series(1, 3) n
 where p.slug like 'loja-carga-%';

insert into public.servico (petshop_id, nome, tipo, ordem)
select p.id, s.nome, s.tipo::public.tipo_servico, s.ordem
  from public.petshop p
 cross join (values ('Banho', 'principal', 1), ('Tosa', 'principal', 2), ('Hidratação', 'adicional', 3), ('Unhas', 'adicional', 4))
       as s (nome, tipo, ordem)
 where p.slug like 'loja-carga-%';

insert into public.servico_preco (petshop_id, servico_id, porte, pelagem, preco_centavos, duracao_minutos)
select s.petshop_id, s.id, po::public.porte, pe::public.pelagem, 5000,
       case s.nome when 'Banho' then 45 when 'Tosa' then 90 else 15 end
  from public.servico s
  join public.petshop p on p.id = s.petshop_id and p.slug like 'loja-carga-%'
 cross join unnest(enum_range(null::public.porte)) po
 cross join unnest(enum_range(null::public.pelagem)) pe;

insert into public.profissional_servico (petshop_id, profissional_id, servico_id)
select pr.petshop_id, pr.id, s.id
  from public.profissional pr
  join public.servico s on s.petshop_id = pr.petshop_id
  join public.petshop p on p.id = pr.petshop_id and p.slug like 'loja-carga-%';

insert into public.horario_trabalho (petshop_id, profissional_id, dia_semana, inicio, fim)
select pr.petshop_id, pr.id, d, '09:00', '18:00'
  from public.profissional pr
  join public.petshop p on p.id = pr.petshop_id and p.slug like 'loja-carga-%'
 cross join generate_series(2, 6) d;

insert into public.tutor (id, nome, telefone_e164)
select ('f2000000-0000-0000-' || lpad(l::text, 4, '0') || '-' || lpad(t::text, 12, '0'))::uuid,
       'Tutor ' || l || '-' || t, '+55119' || lpad((l * 100 + t)::text, 8, '0')
  from generate_series(1, 1000) l cross join generate_series(1, 10) t;

insert into public.pet (tutor_id, nome, porte, pelagem)
select t.id, 'Pet', 'medio', 'curta' from public.tutor t where t.nome like 'Tutor %-%';

insert into public.tutor_petshop (petshop_id, tutor_id)
select ('f1000000-0000-0000-0000-' || lpad(l::text, 12, '0'))::uuid,
       ('f2000000-0000-0000-' || lpad(l::text, 4, '0') || '-' || lpad(t::text, 12, '0'))::uuid
  from generate_series(1, 1000) l cross join generate_series(1, 10) t;

-- Agenda: para cada profissional e dia útil dos próximos 30 dias, metade dos horários 09:00, 10:15, … ocupada.
create temporary table _ag as
select gen_random_uuid() as pedido_id, pr.petshop_id, pr.id as profissional_id,
       ((d::date + time '09:00' + make_interval(mins => k * 75)) at time zone 'America/Sao_Paulo') as inicio,
       ('f2000000-0000-0000-' || lpad(substring(p.slug from 12)::text, 4, '0') || '-' || lpad(((k % 10) + 1)::text, 12, '0'))::uuid as tutor_id,
       k
  from public.profissional pr
  join public.petshop p on p.id = pr.petshop_id and p.slug like 'loja-carga-%'
 cross join generate_series(current_date + 1, current_date + 60, interval '1 day') d
 cross join generate_series(0, 6) k
 where extract(dow from d) between 2 and 6
   and (k + extract(doy from d)::int + pr.ordem) % 2 = 0;

insert into public.pedido (id, petshop_id, tutor_id, canal, chave_idempotencia, criado_por_tipo, total_centavos)
select pedido_id, petshop_id, tutor_id, 'app_proprio', pedido_id::text, 'tutor', 5000 from _ag;

insert into public.agendamento (petshop_id, pedido_id, tutor_id, pet_id, profissional_id, canal, inicio, fim, buffer_minutos)
select a.petshop_id, a.pedido_id, a.tutor_id, pe.id, a.profissional_id, 'app_proprio', a.inicio, a.inicio + interval '60 minutes', 10
  from _ag a join public.pet pe on pe.tutor_id = a.tutor_id;

analyze;

select (select count(*) from public.petshop) as lojas,
       (select count(*) from public.agendamento) as agendamentos,
       (select count(*) from public.servico_preco) as precos;
