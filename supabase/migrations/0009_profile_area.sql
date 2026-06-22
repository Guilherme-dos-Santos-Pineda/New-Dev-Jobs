-- Área(s) profissional(is) do usuário (dev, qa, po, data, design, devops, mobile…)
-- para filtrar as vagas pelo CARGO, não só por skills/senioridade.
-- Vazio = todas as áreas (compatível com perfis existentes).
alter table "Profiles" add column if not exists "Areas" jsonb not null default '[]'::jsonb;
