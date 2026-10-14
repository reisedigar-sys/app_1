-- 011 — Tipos de notificação novos (semana 7), em migração própria: um valor novo de enum só pode ser usado depois do
-- commit.
--   equipe_novo_pedido: push para a equipe quando o tutor agenda pelo app ou pelo WhatsApp.
--   equipe_cancelamento: push para a equipe quando o tutor cancela.
alter type public.tipo_notificacao add value if not exists 'equipe_novo_pedido';
alter type public.tipo_notificacao add value if not exists 'equipe_cancelamento';
