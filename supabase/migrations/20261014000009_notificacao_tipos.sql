-- 009 — Tipo de notificação novo, em migração própria: um valor novo de enum só pode ser usado depois do commit.
--   cancelamento: avisa o tutor quando a loja cancela ou quando o horário é liberado por falta de confirmação.
alter type public.tipo_notificacao add value if not exists 'cancelamento';
