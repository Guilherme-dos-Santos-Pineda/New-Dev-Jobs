-- Canal de relato de bug.
--
-- Separado de "Feedback" de propósito: aquele é um MURAL PÚBLICO de depoimentos
-- ("o que a comunidade está achando"), exibido a todos os usuários logados.
-- Relato de bug frequentemente descreve algo quebrado, e às vezes com dado do
-- próprio usuário no meio — não pode ir para uma vitrine.
--
-- Aditiva e idempotente, conforme a convenção do projeto.

create table if not exists "BugReports" (
    "Id"        bigint generated always as identity primary key,
    "UserId"    uuid not null references "Users"("Id") on delete cascade,
    "Message"   text not null,
    -- Contexto capturado automaticamente pelo navegador. É o que transforma
    -- "não funciona" em algo reproduzível, sem depender de o usuário saber
    -- descrever onde estava.
    "Page"      text,          -- rota em que o usuário estava
    "UserAgent" text,
    "Viewport"  text,          -- ex.: "375x812" — muito bug é só no mobile
    "AppError"  text,          -- último erro de JS capturado na sessão, se houve
    -- Triagem: new → triaged → resolved | wontfix
    "Status"    text not null default 'new',
    "AdminNote" text,
    "CreatedAt" timestamptz not null default now(),
    "UpdatedAt" timestamptz
);

-- A listagem do admin é sempre "mais recentes primeiro, filtrando por status".
create index if not exists idx_bugs_status_created
    on "BugReports" ("Status", "CreatedAt" desc);

-- Para o limite anti-spam por usuário (quantos relatos nas últimas 24h).
create index if not exists idx_bugs_user_created
    on "BugReports" ("UserId", "CreatedAt" desc);
