-- Clientes da loja (painel): lista com busca por nome do tutor, nome do pet ou telefone.
-- Só a recepção, a gerência e o dono (lojas_operacao) veem a carteira de clientes; a profissional não.
-- A busca ignora acentos e maiúsculas ("joao" acha "João"). Consulta sempre por petshop_id (PK de tutor_petshop).

create function app.sem_acento(p_texto text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select translate(lower(p_texto), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
$$;

create function public.clientes_da_loja(
  p_petshop_id uuid,
  p_busca text default null,
  p_limite int default 30,
  p_pular int default 0
) returns table (
  tutor_id uuid, nome text, telefone text, tem_conta boolean,
  faltas smallint, exige_sinal boolean, contato_autorizado boolean,
  pets text[], ultimo_atendimento timestamptz, proximo_atendimento timestamptz, atendimentos int,
  total bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_termo text := app.sem_acento(nullif(trim(p_busca), ''));
  -- Com 4 dígitos ou mais, a busca também procura no telefone.
  v_digitos text := nullif(regexp_replace(coalesce(p_busca, ''), '\D', '', 'g'), '');
begin
  if not (p_petshop_id = any(app.lojas_operacao())) then
    raise exception 'sem permissão para ver os clientes desta loja' using errcode = '42501';
  end if;
  if length(v_digitos) < 4 then
    v_digitos := null;
  end if;

  return query
  with base as (
    select t.id, t.nome, t.telefone_e164, t.user_id is not null as tem_conta,
           tp.faltas, tp.exige_sinal, tp.consentimento_contato_em is not null as contato_autorizado,
           coalesce((select array_agg(pe.nome order by pe.nome) from public.pet pe where pe.tutor_id = t.id), '{}') as pets
      from public.tutor_petshop tp
      join public.tutor t on t.id = tp.tutor_id
     where tp.petshop_id = p_petshop_id
       and (v_termo is null
            or app.sem_acento(t.nome) like '%' || v_termo || '%'
            or exists (select 1 from public.pet pe where pe.tutor_id = t.id and app.sem_acento(pe.nome) like '%' || v_termo || '%')
            or (v_digitos is not null and t.telefone_e164 like '%' || v_digitos || '%'))
  ),
  com_agenda as (
    select b.*,
           (select max(a.inicio) from public.agendamento a
             where a.petshop_id = p_petshop_id and a.tutor_id = b.id and a.inicio <= now()
               and a.status not in ('cancelado', 'faltou')) as ultimo,
           (select min(a.inicio) from public.agendamento a
             where a.petshop_id = p_petshop_id and a.tutor_id = b.id and a.inicio > now()
               and a.status in ('agendado', 'confirmado')) as proximo,
           (select count(*)::int from public.agendamento a
             where a.petshop_id = p_petshop_id and a.tutor_id = b.id and a.status = 'concluido') as concluidos
      from base b
  )
  select c.id, c.nome, c.telefone_e164, c.tem_conta, c.faltas, c.exige_sinal, c.contato_autorizado,
         c.pets, c.ultimo, c.proximo, c.concluidos, count(*) over ()
    from com_agenda c
   -- Sem busca: quem tem atendimento marcado, depois os mais recentes. Com busca: ordem alfabética.
   order by case when v_termo is null then c.proximo end asc nulls last,
            case when v_termo is null then c.ultimo end desc nulls last,
            c.nome
   limit least(greatest(p_limite, 1), 100) offset greatest(p_pular, 0);
end $$;

revoke all on function public.clientes_da_loja(uuid, text, int, int) from public, anon;
grant execute on function public.clientes_da_loja(uuid, text, int, int) to authenticated;
revoke all on function app.sem_acento(text) from public;
grant execute on function app.sem_acento(text) to authenticated, service_role;
