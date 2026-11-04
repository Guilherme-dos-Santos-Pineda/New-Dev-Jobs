-- =========================
-- "Alguém te respondeu?" depois dos envios
-- =========================
-- A permissão do Gmail é só de enviar, então o app nunca vê a resposta do
-- recrutador: sem perguntar, não há como saber se o produto funciona.
--
-- Uma linha por resposta, sem sobrescrever: "ainda não" e depois "consegui
-- emprego" é a história que interessa, e ela dá o tempo até a contratação.
-- O código funciona sem esta tabela (o cartão só não aparece), então aplicar
-- depois do deploy é seguro.

create table if not exists "RetornoEnvios" (
    "Id"        bigserial primary key,
    "UserId"    uuid not null references "Users"("Id") on delete cascade,
    "Resposta"  text not null check ("Resposta" in ('nada', 'sim', 'emprego')),
    "CreatedAt" timestamptz not null default now()
);

create index if not exists idx_retorno_envios_user on "RetornoEnvios" ("UserId", "CreatedAt" desc);
