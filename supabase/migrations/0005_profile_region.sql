-- Fase 9.2 — preferência de país do usuário para candidatura (BR | intl)
alter table "Profiles" add column if not exists "Region" text not null default 'br';
