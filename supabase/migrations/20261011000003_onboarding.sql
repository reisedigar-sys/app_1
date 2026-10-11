-- 003 — Onboarding da loja: criação de rede e loja, equipe por e-mail, checklist e fotos.

-- ---------------------------------------------------------------------------
-- Criar rede + primeira loja (quem cria vira dono da rede e dono da loja)
-- ---------------------------------------------------------------------------
create function public.criar_rede_e_loja(
  p_rede_nome text,
  p_loja_nome text,
  p_slug text,
  p_fuso text default 'America/Sao_Paulo'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_rede uuid;
  v_loja uuid;
begin
  if v_user is null then
    raise exception 'é preciso estar logado' using errcode = '42501';
  end if;

  insert into public.rede (nome) values (p_rede_nome) returning id into v_rede;
  insert into public.rede_membro (rede_id, user_id) values (v_rede, v_user);
  insert into public.petshop (rede_id, nome, slug, fuso)
    values (v_rede, p_loja_nome, p_slug, coalesce(p_fuso, 'America/Sao_Paulo'))
    returning id into v_loja;
  insert into public.petshop_membro (petshop_id, user_id, papel) values (v_loja, v_user, 'dono');
  return v_loja;
end $$;

revoke all on function public.criar_rede_e_loja(text, text, text, text) from public, anon;
grant execute on function public.criar_rede_e_loja(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Adicionar membro da equipe pelo e-mail (a pessoa já precisa ter conta)
-- ---------------------------------------------------------------------------
create function public.adicionar_membro(
  p_petshop_id uuid,
  p_email text,
  p_papel public.papel_loja,
  p_profissional_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if not (p_petshop_id = any(app.lojas_dono())) then
    raise exception 'só o dono da loja administra a equipe' using errcode = '42501';
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'nenhuma conta com o e-mail %', p_email
      using errcode = 'P0002', hint = 'Peça para a pessoa criar a conta em /entrar e tente de novo.';
  end if;

  insert into public.petshop_membro (petshop_id, user_id, papel, profissional_id)
  values (p_petshop_id, v_user, p_papel, p_profissional_id)
  on conflict (petshop_id, user_id)
    do update set papel = excluded.papel, profissional_id = excluded.profissional_id;
  return v_user;
end $$;

revoke all on function public.adicionar_membro(uuid, text, public.papel_loja, uuid) from public, anon;
grant execute on function public.adicionar_membro(uuid, text, public.papel_loja, uuid) to authenticated;

-- Equipe com e-mail, para a tela de equipe (só para quem administra a equipe da loja).
create function public.listar_equipe(p_petshop_id uuid)
returns table (user_id uuid, email text, papel public.papel_loja, profissional_id uuid)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.papel, m.profissional_id
    from public.petshop_membro m
    join auth.users u on u.id = m.user_id
   where m.petshop_id = p_petshop_id
     and p_petshop_id = any(app.lojas_admin())
   order by m.papel, u.email
$$;

revoke all on function public.listar_equipe(uuid) from public, anon;
grant execute on function public.listar_equipe(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Comissão do marketplace é definida pela plataforma, não pela loja
-- ---------------------------------------------------------------------------
create function app.petshop_protege_campos_plataforma() returns trigger
language plpgsql as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.comissao_marketplace_pct := 0;
    elsif new.comissao_marketplace_pct is distinct from old.comissao_marketplace_pct then
      raise exception 'a comissão é definida pela plataforma' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger petshop_protege_campos_plataforma before insert or update on public.petshop
  for each row execute function app.petshop_protege_campos_plataforma();

-- ---------------------------------------------------------------------------
-- Checklist de onboarding
-- ---------------------------------------------------------------------------
-- Respeita o RLS (security invoker): só quem enxerga a configuração da loja recebe dados.
create function public.checklist_onboarding(p_petshop_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with loja as (
    select * from public.petshop where id = p_petshop_id and id = any(app.lojas_visiveis())
  ),
  prof as (
    select p.id, p.nome,
           exists (select 1 from public.horario_trabalho h where h.profissional_id = p.id) as tem_horario
      from public.profissional p
     where p.petshop_id = p_petshop_id and p.ativo
  ),
  serv as (
    select s.id, s.nome, s.tipo,
           exists (select 1 from public.servico_preco sp where sp.servico_id = s.id) as tem_preco,
           exists (select 1 from public.profissional_servico ps
                     join public.profissional p on p.id = ps.profissional_id and p.ativo
                    where ps.servico_id = s.id) as tem_profissional
      from public.servico s
     where s.petshop_id = p_petshop_id and s.ativo
  ),
  itens as (
    select
      (select l.telefone_e164 is not null and l.logradouro is not null and l.cidade is not null
              and l.uf is not null and l.cep is not null from loja l) as dados_loja,
      (select count(*) from prof) > 0 as tem_profissional,
      (select count(*) from serv where tipo = 'principal') > 0 as tem_servico_principal,
      coalesce((select jsonb_agg(jsonb_build_object(
                  'id', id, 'nome', nome,
                  'faltando', to_jsonb(array_remove(array[
                     case when not tem_preco then 'preco' end,
                     case when not tem_profissional then 'profissional' end], null)))
                  order by nome)
                  from serv where not (tem_preco and tem_profissional)), '[]') as servicos_incompletos,
      coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome) order by nome)
                  from prof where not tem_horario), '[]') as profissionais_sem_horario
  )
  select case when not exists (select 1 from loja) then null else
    jsonb_build_object(
      'dados_loja', coalesce(dados_loja, false),
      'tem_profissional', tem_profissional,
      'tem_servico_principal', tem_servico_principal,
      'servicos_incompletos', servicos_incompletos,
      'profissionais_sem_horario', profissionais_sem_horario,
      'completo', coalesce(dados_loja, false) and tem_profissional and tem_servico_principal
                  and jsonb_array_length(servicos_incompletos) = 0
                  and jsonb_array_length(profissionais_sem_horario) = 0
    ) end
  from itens
$$;

grant execute on function public.checklist_onboarding(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Fotos (profissionais e, depois, pets): bucket público, escrita só pela loja
-- Caminho: {petshop_id}/profissionais/{arquivo}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 2 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = any((select app.lojas_admin())::text[]));
create policy fotos_update on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = any((select app.lojas_admin())::text[]))
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = any((select app.lojas_admin())::text[]));
create policy fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = any((select app.lojas_admin())::text[]));

-- ---------------------------------------------------------------------------
-- Bloqueio informado no horário local da loja (a conversão de fuso fica no banco)
-- ---------------------------------------------------------------------------
create function public.criar_bloqueio(
  p_petshop_id uuid,
  p_inicio timestamp,
  p_fim timestamp,
  p_tipo public.tipo_bloqueio default 'outro',
  p_profissional_id uuid default null,
  p_motivo text default null
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_fuso text;
  v_id uuid;
begin
  select fuso into v_fuso from public.petshop where id = p_petshop_id;
  if v_fuso is null then
    raise exception 'loja não encontrada' using errcode = 'P0002';
  end if;
  if p_fim <= p_inicio then
    raise exception 'o fim do bloqueio deve ser depois do início' using errcode = '23514';
  end if;
  -- O insert passa pelo RLS: só quem opera a loja consegue gravar.
  insert into public.bloqueio (petshop_id, profissional_id, tipo, periodo, motivo)
  values (p_petshop_id, p_profissional_id, p_tipo,
          tstzrange(p_inicio at time zone v_fuso, p_fim at time zone v_fuso, '[)'), nullif(trim(p_motivo), ''))
  returning id into v_id;
  return v_id;
end $$;

grant execute on function public.criar_bloqueio(uuid, timestamp, timestamp, public.tipo_bloqueio, uuid, text) to authenticated;
