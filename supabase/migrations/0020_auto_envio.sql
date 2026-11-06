-- =========================
-- Envio automático (plano pago)
-- =========================
-- Colunas novas, e não o "SendMode": ele foi gravado por telas antigas e nunca
-- significou concordar com envio sem clique.
--
-- "AutoEnvioDesde" guarda quando a pessoa ligou. "AutoEnvioUltimo" é o último dia
-- em que o agendador passou por ela, para não enviar duas vezes no mesmo dia.
--
-- Aplique ANTES do deploy: o agendador lê estas colunas.

alter table "Users" add column if not exists "AutoEnvio"       boolean not null default false;
alter table "Users" add column if not exists "AutoEnvioDesde"  timestamptz;
alter table "Users" add column if not exists "AutoEnvioUltimo" date;
