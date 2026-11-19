-- 0031 (19/11/2026)
--
-- 1. "Esse email voltou": quem mandou currículo pelo Gmail avisa que o endereço não
--    existe. Com 2 pessoas diferentes (ou o admin) o endereço é bloqueado: a vaga sai
--    do feed de todos e o envio recusa. Nada é apagado de "Jobs" (Enviadas continua
--    mostrando para quem foi); desbloquear é apagar a linha de "EmailsBloqueados".
create table if not exists "EmailsVoltaram" (
    "Id" bigserial primary key,
    "Email" text not null,
    "UserId" uuid not null,
    "ApplicationId" bigint,
    "CreatedAt" timestamptz not null default now(),
    unique ("UserId", "Email")
);
create index if not exists "EmailsVoltaram_Email_idx" on "EmailsVoltaram" ("Email");

create table if not exists "EmailsBloqueados" (
    "Email" text primary key,
    "Motivo" text,
    "CreatedAt" timestamptz not null default now()
);

-- 2. "Só vagas que dizem a modalidade": sem isto, vaga que não diz remoto, híbrido
--    nem presencial passa para todo mundo (erra para o lado de mostrar).
alter table "Profiles" add column if not exists "StrictModality" boolean not null default false;

-- 3. Compras e suprimentos saiu de "operacoes": quem marcou operações continua
--    recebendo essas vagas no dia da mudança (desmarca se não quiser).
update "Profiles" set "Areas" = "Areas" || '["compras"]'::jsonb
where "Areas" ? 'operacoes' and not ("Areas" ? 'compras');
