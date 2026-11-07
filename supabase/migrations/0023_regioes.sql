-- =========================
-- Filtro por região para quem procura vaga fora do Brasil
-- =========================
-- Pedido do dono (07/11/2026). Vazio mantém a lista como está.
--
-- Pode ser aplicada depois do deploy: sem a coluna, o campo fica escondido e o
-- PUT do perfil não a grava (ver gravaRegioes em routes/profile.js).

alter table "Profiles" add column if not exists "Regions" jsonb not null default '[]'::jsonb;
