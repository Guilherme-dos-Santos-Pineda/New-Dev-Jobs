-- =============================================================
-- Escala do scraper — cadência de monitoramento + recrutadores por email
-- =============================================================
-- 1) Controle de "há quanto tempo não vejo esse recrutador": LastCheckedAt +
--    CheckCount. O monitoramento carimba quem varreu; o seletor prioriza os
--    mais antigos / nunca checados (rotação justa da base).
-- 2) Recrutadores vindos de import por email (arquivo de vagas) não têm URL do
--    LinkedIn: tornamos "LinkedinUrl" opcional e marcamos a origem em "Source".

alter table "Recruiters" add column if not exists "LastCheckedAt" timestamptz;
alter table "Recruiters" add column if not exists "CheckCount"    int not null default 0;
alter table "Recruiters" add column if not exists "Source"        text not null default 'linkedin'; -- linkedin | import | post

-- Permite recrutadores/contatos sem perfil do LinkedIn (chaveados por email).
-- O índice unique de "LinkedinUrl" continua valendo (Postgres permite múltiplos NULL).
alter table "Recruiters" alter column "LinkedinUrl" drop not null;

-- Seleção "mais obsoletos primeiro" (nulls = nunca checados vêm na frente).
create index if not exists idx_recruiters_lastchecked on "Recruiters" ("LastCheckedAt" asc nulls first);

-- Lookup/dedup por email no import (case-insensitive). Não-unique de propósito:
-- a base atual pode ter emails repetidos entre perfis distintos do LinkedIn.
create index if not exists idx_recruiters_email_lower on "Recruiters" (lower("Email")) where "Email" is not null and "Email" <> '';
