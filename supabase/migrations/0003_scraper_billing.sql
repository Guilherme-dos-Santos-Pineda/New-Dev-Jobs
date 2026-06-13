-- Fase 6 — scraper DevScout + billing Stripe
-- Base própria de recrutadores, histórico de execuções do scraper,
-- dedup de vagas por hash e campos de assinatura Stripe nos usuários.

-- =============================================================
-- Recruiters — base própria (descoberta via Profile Search Scraper)
-- =============================================================
create table if not exists "Recruiters" (
    "Id"           bigint generated always as identity primary key,
    "LinkedinUrl"  text not null unique,
    "LinkedinId"   text,
    "Name"         text,
    "Email"        text,
    "Title"        text,
    "Company"      text,
    "Status"       text not null default 'discovered', -- discovered | approved | rejected
    "LastPostDate" timestamptz,
    "CreatedAt"    timestamptz not null default now(),
    "UpdatedAt"    timestamptz not null default now()
);
create index if not exists idx_recruiters_status on "Recruiters" ("Status");

-- =============================================================
-- ScraperRuns — histórico/observabilidade das execuções
-- =============================================================
create table if not exists "ScraperRuns" (
    "Id"         bigint generated always as identity primary key,
    "Type"       text not null,                 -- discovery | monitoring
    "Status"     text not null default 'queued', -- queued | running | done | failed
    "Params"     jsonb not null default '{}'::jsonb,
    "Stats"      jsonb not null default '{}'::jsonb,
    "Error"      text,
    "StartedAt"  timestamptz,
    "FinishedAt" timestamptz,
    "CreatedAt"  timestamptz not null default now()
);
create index if not exists idx_scraperruns_created on "ScraperRuns" ("CreatedAt" desc);

-- =============================================================
-- Jobs — dedup por hash (empresa+cargo+email) + vínculo ao recrutador
-- =============================================================
alter table "Jobs" add column if not exists "JobHash"     text;
alter table "Jobs" add column if not exists "PostedAt"    timestamptz;
alter table "Jobs" add column if not exists "RecruiterId" bigint references "Recruiters"("Id") on delete set null;
-- unique parcial: evita conflito em linhas antigas sem hash
create unique index if not exists idx_jobs_jobhash on "Jobs" ("JobHash") where "JobHash" is not null;

-- =============================================================
-- Users — assinatura Stripe
-- =============================================================
alter table "Users" add column if not exists "StripeCustomerId"     text;
alter table "Users" add column if not exists "StripeSubscriptionId" text;

-- =============================================================
-- RLS (acesso só pela API com service_role, igual às demais)
-- =============================================================
alter table "Recruiters"  enable row level security;
alter table "ScraperRuns" enable row level security;
