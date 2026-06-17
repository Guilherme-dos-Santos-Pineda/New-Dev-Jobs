-- =============================================================
-- Automação do scraper — robôs agendados (ScraperSchedules)
-- =============================================================
-- Cada linha é um "robô": um tipo (discovery|monitoring) + params salvos +
-- um intervalo. O worker roda um tick a cada minuto, reivindica os vencidos
-- (NextRunAt <= now) de forma atômica e enfileira o run correspondente.

create table if not exists "ScraperSchedules" (
    "Id"              bigint generated always as identity primary key,
    "Name"            text not null,
    "Type"            text not null,                 -- discovery | monitoring
    "Params"          jsonb not null default '{}'::jsonb,
    "IntervalMinutes" int not null default 360,      -- dispara a cada N minutos
    "Active"          boolean not null default true,
    "LastRunAt"       timestamptz,
    "NextRunAt"       timestamptz,                   -- null = roda no próximo tick
    "CreatedAt"       timestamptz not null default now(),
    "UpdatedAt"       timestamptz not null default now()
);
-- Seleção dos vencidos no tick do worker.
create index if not exists idx_schedules_due on "ScraperSchedules" ("Active", "NextRunAt");

alter table "ScraperSchedules" enable row level security;
