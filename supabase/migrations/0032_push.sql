-- 0032 (23/11/2026): notificação no celular (Web Push, app instalado).
--
-- Uma linha por aparelho inscrito. O endpoint é o endereço que o navegador dá para
-- o push; p256dh e auth são as chaves para cifrar a mensagem. Endpoint que a
-- Google/Apple/Mozilla recusa com 404/410 é apagado no envio (services/push.js).
create table if not exists "PushInscricoes" (
    "Id" bigserial primary key,
    "UserId" uuid not null,
    "Endpoint" text not null unique,
    "P256dh" text not null,
    "Auth" text not null,
    "Aparelho" text,
    "CreatedAt" timestamptz not null default now(),
    "UltimoOkEm" timestamptz
);
create index if not exists "PushInscricoes_UserId_idx" on "PushInscricoes" ("UserId");

-- Que avisos a pessoa quer ({"vagas": false} desliga um). Vazio = todos ligados.
alter table "Users" add column if not exists "NotifPrefs" jsonb not null default '{}'::jsonb;

-- Um aviso de cada tipo por pessoa por dia: o tique pode rodar de novo depois de
-- um reinício, e a chave impede mandar o mesmo aviso duas vezes.
create table if not exists "NotificacoesEnviadas" (
    "UserId" uuid not null,
    "Tipo" text not null,
    "Dia" date not null default current_date,
    "Detalhe" text,
    "CreatedAt" timestamptz not null default now(),
    primary key ("UserId", "Tipo", "Dia")
);
