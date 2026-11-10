-- =========================
-- Análise e reescrita do currículo (Meu perfil › Melhorar meu currículo)
-- =========================
-- Uma linha por análise: a contagem dá o limite do teste (3 por pessoa) e a
-- última fica para a pessoa reabrir sem gastar outro uso. O resultado é jsonb
-- porque o formato do currículo reescrito ainda vai mudar com o feedback.
-- O código funciona sem esta tabela (a tela só não aparece), então aplicar
-- depois do deploy é seguro.

create table if not exists "CvAnalyses" (
    "Id"        bigint generated always as identity primary key,
    "UserId"    uuid not null references "Users"("Id") on delete cascade,
    "Model"     text,
    "Result"    jsonb not null,
    "CreatedAt" timestamptz not null default now()
);

create index if not exists idx_cv_analyses_user on "CvAnalyses" ("UserId", "CreatedAt" desc);

alter table "CvAnalyses" enable row level security;
