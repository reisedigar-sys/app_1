-- Marca: "Hora do Pet" passa a se chamar "Salão do Pet" (domínio salaodopet.com.br, 01/11/2026).
-- Só textos: o modelo de aviso à loja (ainda não submetido à Meta) e a resposta do número central. Os nomes internos
-- dos modelos (hp_*) continuam iguais.

update public.modelo_mensagem
   set corpo = replace(corpo, 'Hora do Pet', 'Salão do Pet')
 where corpo like '%Hora do Pet%';

-- Mesmo corpo da migração 012, com a marca nova na resposta do número central.
-- Mensagem recebida. Devolve {resposta} (texto a responder ou null). A mesma mensagem nunca é processada duas vezes.
--   Número central: "PARAR" vale para todas as lojas que mandam avisos por ele (não dá para saber de qual loja a
--   pessoa está falando); qualquer outra mensagem recebe, no máximo a cada 12 h, o link das lojas onde ela é cliente.
--   Número da loja (7b): "PARAR" vale só para aquela loja; o resto fica para o bot.
-- Os links vêm como caminhos ("/slug"); quem envia põe o endereço do app na frente ({app}).
create or replace function public.whatsapp_receber(
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
      v_resposta := 'Olá! Este número do Salão do Pet só envia avisos de agendamento e não lê as respostas. '
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
