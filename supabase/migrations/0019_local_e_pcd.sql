-- =========================
-- Filtro por estado e cidade, e preferência de vaga exclusiva PCD
-- =========================
-- Pedido de usuário (05/11/2026): recebeu vaga híbrida em Recife sem morar lá, e
-- vaga exclusiva para PCD sem ser PCD. Vazio e false mantêm o feed como está.
--
-- Aplique ANTES do deploy: o PUT do perfil grava estas colunas. O código antigo
-- não as lê, então a ordem inversa é que derrubaria o salvamento do perfil.

alter table "Profiles" add column if not exists "States"  jsonb   not null default '[]'::jsonb;
alter table "Profiles" add column if not exists "Cities"  jsonb   not null default '[]'::jsonb;
alter table "Profiles" add column if not exists "ShowPcd" boolean not null default false;
