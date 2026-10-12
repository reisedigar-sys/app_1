-- 006 — A equipe só altera status e observações de um agendamento pela API.
-- Horário, profissional, pet, preço e canal mudam apenas por funções do back-end (ex.: remarcar, semana 5),
-- que passam pelo motor de disponibilidade. A constraint de exclusão continua valendo para todos.
revoke update on public.agendamento from anon, authenticated;
grant update (status, observacoes) on public.agendamento to authenticated;
