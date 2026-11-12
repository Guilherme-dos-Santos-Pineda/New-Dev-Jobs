-- =========================
-- Versões do currículo por área (Melhorar meu currículo › Versões por área)
-- =========================
-- Uma versão por (pessoa, área, idioma): a IA adapta o currículo original para
-- um tipo de vaga ("Back-end", "QA", "Back-end em inglês") e a pessoa APROVA antes
-- de qualquer uso. Vaga parecida reaproveita a versão: a escolha é pela área e
-- pelo idioma que a vaga já tem gravados, sem IA.
-- O currículo fica como jsonb (~5 KB), não como PDF no Storage: cada envio
-- baixaria ~190 KB de PDF e o egress do Supabase é o limite que aperta.
-- O código funciona sem esta tabela (a tela diz que ainda não está disponível).

create table if not exists "CvVersoes" (
    "Id"         bigint generated always as identity primary key,
    "UserId"     uuid not null references "Users"("Id") on delete cascade,
    "Area"       text not null,
    "Lang"       text not null default 'pt' check ("Lang" in ('pt', 'en')),
    "Curriculo"  jsonb not null,
    "Mudancas"   jsonb not null default '[]'::jsonb,
    "Status"     text not null default 'rascunho' check ("Status" in ('rascunho', 'aprovada')),
    "Model"      text,
    "TokensIn"   int,
    "TokensOut"  int,
    "CreatedAt"  timestamptz not null default now(),
    "AprovadaEm" timestamptz,
    unique ("UserId", "Area", "Lang")
);

create index if not exists idx_cv_versoes_user on "CvVersoes" ("UserId");

alter table "CvVersoes" enable row level security;
