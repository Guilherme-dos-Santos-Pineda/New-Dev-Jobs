-- Email marketing / campanhas de divulgação (envio espaçado, opt-out).
create table if not exists "Campaigns" (
    "Id" bigserial primary key,
    "Name" text not null,
    "Subject" text not null,
    "Body" text not null,
    "FromEmail" text not null,          -- conta Google conectada que envia
    "DailyCap" int not null default 50,
    "GapMinSec" int not null default 60,
    "GapMaxSec" int not null default 120,
    "Status" text not null default 'draft',  -- draft | running | paused | done
    "CreatedAt" timestamptz default now(),
    "UpdatedAt" timestamptz default now()
);

create table if not exists "CampaignRecipients" (
    "Id" bigserial primary key,
    "CampaignId" bigint not null references "Campaigns"("Id") on delete cascade,
    "Email" text not null,
    "Status" text not null default 'pending',  -- pending | sent | failed | unsubscribed
    "Token" uuid not null default gen_random_uuid(),
    "SentAt" timestamptz,
    "Error" text,
    "CreatedAt" timestamptz default now()
);
create index if not exists "idx_camprecip_campaign" on "CampaignRecipients" ("CampaignId", "Status");
create unique index if not exists "idx_camprecip_uniq" on "CampaignRecipients" ("CampaignId", "Email");
create index if not exists "idx_camprecip_token" on "CampaignRecipients" ("Token");

-- Lista global de descadastro (opt-out) — nunca mais enviar para estes emails.
create table if not exists "Unsubscribes" (
    "Email" text primary key,
    "CampaignId" bigint,
    "CreatedAt" timestamptz default now()
);
