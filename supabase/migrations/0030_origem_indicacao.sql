-- 0030: de onde a pessoa veio (canal) e o programa "Indique e ganhe" (14/11/2026)
--
-- Origem: o canal da primeira visita (utm_source, site de origem ou link de
-- indicação), gravado na conta UMA vez, no cadastro. Sem cookie e sem IP: o
-- navegador guarda o canal e manda depois do login.
-- Visitas: só a contagem por dia e canal, somada em memória e gravada de 5 em 5 min.
-- Indicação: código pessoal; quem foi indicado ganha, junto com quem indicou,
-- +10 envios por dia por 7 dias no primeiro envio real pelo Gmail.

alter table "Users" add column if not exists "Origem" jsonb;
alter table "Users" add column if not exists "CodigoIndicacao" text;
alter table "Users" add column if not exists "IndicadoPor" uuid;
alter table "Users" add column if not exists "IndicacaoPremiadaEm" timestamptz;
alter table "Users" add column if not exists "BonusEnviosAte" timestamptz;

create unique index if not exists "Users_CodigoIndicacao_key" on "Users" ("CodigoIndicacao") where "CodigoIndicacao" is not null;
create index if not exists "Users_IndicadoPor_idx" on "Users" ("IndicadoPor") where "IndicadoPor" is not null;

create table if not exists "VisitasDiarias" (
    "Dia" date not null,
    "Canal" text not null,
    "Visitas" integer not null default 0,
    primary key ("Dia", "Canal")
);
