-- Validade do plano pago (modelo de pagamento ÚNICO: paga → 30 dias → volta pro Free).
-- Preenchido pelo webhook a cada compra (mode=payment). O worker rebaixa quem expira.
alter table "Users" add column if not exists "PlanExpiresAt" timestamptz;
create index if not exists "idx_users_plan_expires"
    on "Users" ("PlanExpiresAt") where "PlanExpiresAt" is not null;
