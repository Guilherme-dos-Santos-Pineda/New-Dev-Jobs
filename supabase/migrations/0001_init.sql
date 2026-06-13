-- =============================================================
-- newdevjobs — schema inicial (Postgres / Supabase)
-- Identificadores em PascalCase CITADOS para preservar a forma
-- usada no código (row."UserId" -> row.UserId no cliente postgres).
-- =============================================================

-- Espelho de auth.users (identidade vem do Supabase Auth)
create table if not exists "Users" (
    "Id"                 uuid primary key references auth.users(id) on delete cascade,
    "Name"               text not null default '',
    "Email"              text not null unique,
    "GoogleConnected"    boolean not null default false,
    "GoogleEmail"        text,
    "GoogleRefreshToken" text,
    "GoogleAccessToken"  text,
    "GoogleTokenExpiry"  bigint,
    "SendMode"           text not null default 'review',  -- 'review' | 'auto'
    "Plan"               text not null default 'free',    -- 'free' | 'starter' | 'pro'
    "Role"               text not null default 'user',    -- 'user' | 'admin'
    "CreatedAt"          timestamptz not null default now()
);

create table if not exists "Jobs" (
    "Id"          bigint generated always as identity primary key,
    "Company"     text,
    "JobTitle"    text,
    "Email"       text,
    "Skills"      jsonb not null default '[]'::jsonb,
    "Description" text,
    "LinkedinId"  text unique,
    "CreatedAt"   timestamptz not null default now()
);

create table if not exists "Profiles" (
    "Id"               bigint generated always as identity primary key,
    "UserId"           uuid not null unique references "Users"("Id") on delete cascade,
    "Skills"           jsonb not null default '[]'::jsonb,
    "Seniority"        text,
    "Modality"         text,
    "SalaryMin"        integer,
    "SalaryMax"        integer,
    "Headline"         text,
    "Phone"            text,
    "Whatsapp"         text,
    "Linkedin"         text,
    "Github"           text,
    "Portfolio"        text,
    "RequiredKeywords" jsonb not null default '[]'::jsonb,
    "BlockedWords"     jsonb not null default '[]'::jsonb,
    "BlockedDomains"   jsonb not null default '[]'::jsonb,
    "Levels"           jsonb not null default '[]'::jsonb,
    "Modalities"       jsonb not null default '[]'::jsonb,
    "StrictLevel"      boolean not null default false,
    "PostingDays"      integer,
    "CvPath"           text,
    "CvName"           text,
    "UpdatedAt"        timestamptz not null default now()
);

create table if not exists "Applications" (
    "Id"         bigint generated always as identity primary key,
    "UserId"     uuid not null references "Users"("Id") on delete cascade,
    "JobId"      bigint not null references "Jobs"("Id") on delete cascade,
    "Status"     text not null default 'sent',
    "MatchScore" integer not null default 0,
    "Subject"    text,
    "Body"       text,
    "CreatedAt"  timestamptz not null default now(),
    "SentAt"     timestamptz,
    unique ("UserId", "JobId")
);
create index if not exists idx_apps_user on "Applications" ("UserId");
create index if not exists idx_apps_created on "Applications" ("CreatedAt");

create table if not exists "SendQueue" (
    "Id"        bigint generated always as identity primary key,
    "UserId"    uuid not null references "Users"("Id") on delete cascade,
    "JobId"     bigint not null references "Jobs"("Id") on delete cascade,
    "Status"    text not null default 'queued',  -- queued | sent | failed | skipped
    "Error"     text,
    "CreatedAt" timestamptz not null default now(),
    "SentAt"    timestamptz
);
create index if not exists idx_queue_user on "SendQueue" ("UserId", "Status");

create table if not exists "Feedback" (
    "Id"        bigint generated always as identity primary key,
    "UserId"    uuid not null references "Users"("Id") on delete cascade,
    "Rating"    integer,
    "Message"   text not null,
    "CreatedAt" timestamptz not null default now(),
    "UpdatedAt" timestamptz
);

create table if not exists "EmailTemplates" (
    "Id"        bigint generated always as identity primary key,
    "UserId"    uuid not null references "Users"("Id") on delete cascade,
    "Lang"      text not null default 'pt',
    "Subject"   text not null,
    "Body"      text not null,
    "UpdatedAt" timestamptz not null default now(),
    unique ("UserId", "Lang")
);

create table if not exists "RecruiterSources" (
    "Id"        bigint generated always as identity primary key,
    "Url"       text not null unique,
    "Label"     text,
    "Active"    boolean not null default true,
    "CreatedAt" timestamptz not null default now()
);

-- =============================================================
-- Trigger: ao criar usuário no Supabase Auth, espelha em "Users"
-- =============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into "Users" ("Id", "Name", "Email")
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
        new.email
    )
    on conflict ("Id") do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- =============================================================
-- RLS: a API usa a service_role key (bypassa RLS). Habilitamos RLS
-- e deixamos sem políticas públicas — todo acesso passa pela API.
-- =============================================================
alter table "Users"            enable row level security;
alter table "Profiles"         enable row level security;
alter table "Applications"     enable row level security;
alter table "SendQueue"        enable row level security;
alter table "Feedback"         enable row level security;
alter table "EmailTemplates"   enable row level security;
alter table "RecruiterSources" enable row level security;
alter table "Jobs"             enable row level security;
