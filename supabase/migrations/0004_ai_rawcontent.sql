-- Fase 7 (B) — pré-análise de IA + conteúdo bruto do scraper

-- Campos extraídos/classificados pela IA nas vagas
alter table "Jobs" add column if not exists "AiScore"          int;
alter table "Jobs" add column if not exists "AiClassification" text;
alter table "Jobs" add column if not exists "Seniority"        text;
alter table "Jobs" add column if not exists "Modality"         text;
alter table "Jobs" add column if not exists "Location"         text;
alter table "Jobs" add column if not exists "Salary"           text;

-- Conteúdo bruto coletado pelo scraper (tela "Conteúdo Bruto" no admin)
create table if not exists "ScrapedPosts" (
    "Id"         bigint generated always as identity primary key,
    "Source"     text not null default 'monitoring',
    "Author"     text,
    "AuthorUrl"  text,
    "Url"        text,
    "LinkedinId" text unique,
    "Content"    text,
    "PostedAt"   timestamptz,
    "Status"     text not null default 'pending', -- pending | approved | rejected
    "AiResult"   jsonb,
    "CreatedAt"  timestamptz not null default now()
);
create index if not exists idx_scrapedposts_status on "ScrapedPosts" ("Status", "CreatedAt" desc);

alter table "ScrapedPosts" enable row level security;
