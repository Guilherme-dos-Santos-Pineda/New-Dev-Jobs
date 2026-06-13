-- Fase 4 — robô de envio com pg-boss
-- Guarda o horário em que cada item da fila está agendado para envio,
-- usado pelo getStatus para o contador "próximo envio em ~Xs" na UI.
-- A fila de execução em si vive no schema "pgboss" (criado pelo pg-boss no start).

alter table "SendQueue" add column if not exists "ScheduledAt" timestamptz;

create index if not exists idx_queue_scheduled on "SendQueue" ("UserId", "Status", "ScheduledAt");
