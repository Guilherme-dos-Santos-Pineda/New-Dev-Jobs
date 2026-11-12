-- =========================
-- Plano de IA (R$ 5, 30 dias, 10 usos) e teste de 48 horas
-- =========================
-- Decisão do dono (11/11/2026):
--   - todo mundo testa por 48 h a partir do primeiro uso: 1 análise e 1 currículo adaptado;
--   - depois, a IA é um plano à parte: R$ 5, 30 dias, 10 usos (análises e versões somam);
--   - quem comprou o Automático ganha a IA junto, como agradecimento.
-- A IA não mora em "Plan" porque soma com ele: dá para ter Automático E IA, ou só IA.

alter table "Users" add column if not exists "IaAte" timestamptz;           -- IA liberada até (compra, Automático ou admin)
alter table "Users" add column if not exists "IaDesde" timestamptz;         -- início do período: os 10 usos contam daqui
alter table "Users" add column if not exists "IaTesteDesde" timestamptz;    -- primeiro uso no teste; o teste vale 48 h
alter table "Users" add column if not exists "IaUltimaSessao" text;         -- última sessão da Stripe aplicada (webhook e volta não somam duas vezes)

-- Cada uso que custa IA (análise ou versão criada/refeita). As versões são
-- sobrescritas ao refazer, então contar linhas de "CvVersoes" perderia usos.
create table if not exists "CvIaUsos" (
    "Id"        bigint generated always as identity primary key,
    "UserId"    uuid not null references "Users"("Id") on delete cascade,
    "Tipo"      text not null check ("Tipo" in ('analise', 'versao')),
    "CreatedAt" timestamptz not null default now()
);
create index if not exists "CvIaUsos_user_data" on "CvIaUsos" ("UserId", "CreatedAt");
alter table "CvIaUsos" enable row level security;

-- Quem já tem plano pago ativo ganha a IA até o fim do plano (agradecimento).
update "Users" set "IaAte" = "PlanExpiresAt", "IaDesde" = now()
where "IaAte" is null and "Plan" <> 'free' and "PlanExpiresAt" > now();
