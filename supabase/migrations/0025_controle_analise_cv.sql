-- =========================
-- Controle da análise de currículo pelo admin (Admin › Currículo IA)
-- =========================
-- Três coisas que só existiam no código (ou nem isso):
--   1. Ligar e desligar a ferramenta para todo mundo, sem deploy.
--   2. O limite por pessoa (era a constante LIMITE_ANALISES = 3).
--   3. Por pessoa: bloquear, ou dar análises a mais.
-- E o gasto: quantos tokens cada análise usou e quanto demorou.
--
-- O código funciona sem esta migration: sem "AppSettings" vale ligada e limite 3;
-- sem "CvAnaliseAjustes" ninguém é bloqueado; sem as colunas o insert não as grava.

-- Chave-valor genérico da plataforma. A primeira chave é "analiseCv":
-- { "ativa": true, "limite": 3 }.
create table if not exists "AppSettings" (
    "Key"       text primary key,
    "Value"     jsonb not null,
    "UpdatedBy" text,
    "UpdatedAt" timestamptz not null default now()
);
alter table "AppSettings" enable row level security;

create table if not exists "CvAnaliseAjustes" (
    "UserId"    uuid primary key references "Users"("Id") on delete cascade,
    "Bloqueado" boolean not null default false,
    "Extras"    int not null default 0,
    "Motivo"    text,
    "UpdatedBy" text,
    "UpdatedAt" timestamptz not null default now()
);
alter table "CvAnaliseAjustes" enable row level security;

alter table "CvAnalyses" add column if not exists "TokensIn"   int;
alter table "CvAnalyses" add column if not exists "TokensOut"  int;
alter table "CvAnalyses" add column if not exists "DurationMs" int;

create index if not exists idx_cv_analyses_created on "CvAnalyses" ("CreatedAt" desc);
