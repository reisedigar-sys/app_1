-- 005 — Redes com várias unidades: criar unidade e copiar o catálogo entre unidades da mesma rede.

-- Nova unidade numa rede existente (só o dono da rede). Feito por função porque o insert direto com
-- RETURNING falha no RLS: a política de leitura ainda não enxerga a linha recém-criada.
create function public.criar_unidade(p_rede_id uuid, p_nome text, p_slug text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_loja uuid;
  v_fuso text;
begin
  if not (p_rede_id = any(app.redes_do_usuario())) then
    raise exception 'só o dono da rede abre novas unidades' using errcode = '42501';
  end if;
  -- A nova unidade herda o fuso da unidade mais antiga da rede.
  select fuso into v_fuso from public.petshop where rede_id = p_rede_id order by criado_em limit 1;
  insert into public.petshop (rede_id, nome, slug, fuso)
  values (p_rede_id, p_nome, p_slug, coalesce(v_fuso, 'America/Sao_Paulo'))
  returning id into v_loja;
  return v_loja;
end $$;

revoke all on function public.criar_unidade(uuid, text, text) from public, anon;
grant execute on function public.criar_unidade(uuid, text, text) to authenticated;

-- Copiar o catálogo (categorias, serviços, preços e durações) entre unidades da mesma rede.
-- Profissionais, habilitação e horários não são copiados: a equipe é de cada unidade.
-- Os serviços são casados pelo nome. Sem p_substituir, só cria o que falta e mantém o que a unidade já ajustou.

create function public.copiar_catalogo(p_origem uuid, p_destino uuid, p_substituir boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_categorias int;
  v_servicos_novos int;
  v_servicos_atualizados int := 0;
  v_precos int;
begin
  if p_origem = p_destino then
    raise exception 'escolha outra unidade como origem' using errcode = '22023';
  end if;
  -- Quem copia precisa configurar as duas unidades, e elas precisam ser da mesma rede.
  if not (p_origem = any(app.lojas_admin()) and p_destino = any(app.lojas_admin())) then
    raise exception 'sem permissão nas duas unidades' using errcode = '42501';
  end if;
  if (select count(distinct rede_id) from public.petshop where id in (p_origem, p_destino)) <> 1 then
    raise exception 'as unidades precisam ser da mesma rede' using errcode = '42501';
  end if;

  insert into public.categoria_servico (petshop_id, nome, ordem)
  select p_destino, c.nome, c.ordem from public.categoria_servico c where c.petshop_id = p_origem
  on conflict (petshop_id, nome) do nothing;
  get diagnostics v_categorias = row_count;

  -- Serviço de origem → serviço de destino (pelo nome), criando os que faltam.
  drop table if exists pg_temp._mapa;
  create temporary table _mapa (origem uuid primary key, destino uuid, novo boolean) on commit drop;

  insert into _mapa (origem, destino, novo)
  select so.id, sd.id, false
    from public.servico so
    join public.servico sd on sd.petshop_id = p_destino and lower(sd.nome) = lower(so.nome)
   where so.petshop_id = p_origem;

  with novos as (
    insert into public.servico (petshop_id, categoria_id, nome, descricao, tipo, ordem, ativo)
    select p_destino, cd.id, so.nome, so.descricao, so.tipo, so.ordem, so.ativo
      from public.servico so
      left join public.categoria_servico co on co.id = so.categoria_id
      left join public.categoria_servico cd on cd.petshop_id = p_destino and cd.nome = co.nome
     where so.petshop_id = p_origem
       and not exists (select 1 from _mapa m where m.origem = so.id)
    returning id, nome
  )
  insert into _mapa (origem, destino, novo)
  select so.id, n.id, true
    from novos n join public.servico so on so.petshop_id = p_origem and so.nome = n.nome;
  get diagnostics v_servicos_novos = row_count;

  if p_substituir then
    update public.servico sd
       set descricao = so.descricao, tipo = so.tipo, ordem = so.ordem,
           categoria_id = coalesce(cd.id, sd.categoria_id)
      from _mapa m
      join public.servico so on so.id = m.origem
      left join public.categoria_servico co on co.id = so.categoria_id
      left join public.categoria_servico cd on cd.petshop_id = p_destino and cd.nome = co.nome
     where sd.id = m.destino and not m.novo;
    get diagnostics v_servicos_atualizados = row_count;

    insert into public.servico_preco (petshop_id, servico_id, porte, pelagem, preco_centavos, duracao_minutos)
    select p_destino, m.destino, sp.porte, sp.pelagem, sp.preco_centavos, sp.duracao_minutos
      from public.servico_preco sp join _mapa m on m.origem = sp.servico_id
    on conflict (servico_id, porte, pelagem)
      do update set preco_centavos = excluded.preco_centavos, duracao_minutos = excluded.duracao_minutos;
  else
    insert into public.servico_preco (petshop_id, servico_id, porte, pelagem, preco_centavos, duracao_minutos)
    select p_destino, m.destino, sp.porte, sp.pelagem, sp.preco_centavos, sp.duracao_minutos
      from public.servico_preco sp join _mapa m on m.origem = sp.servico_id
    on conflict (servico_id, porte, pelagem) do nothing;
  end if;
  get diagnostics v_precos = row_count;

  return jsonb_build_object(
    'categorias', v_categorias,
    'servicos_novos', v_servicos_novos,
    'servicos_atualizados', v_servicos_atualizados,
    'precos', v_precos
  );
end $$;

revoke all on function public.copiar_catalogo(uuid, uuid, boolean) from public, anon;
grant execute on function public.copiar_catalogo(uuid, uuid, boolean) to authenticated;
