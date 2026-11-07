-- =========================
-- Filtro por tipo de contrato (CLT / PJ)
-- =========================
-- Pedido no Reddit (06/11/2026). Vazio mantém o feed como está.
--
-- Pode ser aplicada depois do deploy: sem a coluna, o campo fica escondido e o
-- PUT do perfil não a grava (ver gravaContratos em routes/profile.js).

alter table "Profiles" add column if not exists "Contracts" jsonb not null default '[]'::jsonb;
