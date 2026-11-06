-- =========================
-- Mural de feedback: curtir, não curtir e responder
-- =========================
-- O código funciona sem estas tabelas (os botões só não aparecem), então aplicar
-- depois do deploy é seguro.

create table if not exists "FeedbackVotos" (
    "FeedbackId" bigint not null references "Feedback"("Id") on delete cascade,
    "UserId"     uuid   not null references "Users"("Id") on delete cascade,
    "Voto"       smallint not null check ("Voto" in (1, -1)),
    "CreatedAt"  timestamptz not null default now(),
    primary key ("FeedbackId", "UserId")
);

create table if not exists "FeedbackComentarios" (
    "Id"         bigint generated always as identity primary key,
    "FeedbackId" bigint not null references "Feedback"("Id") on delete cascade,
    "UserId"     uuid   not null references "Users"("Id") on delete cascade,
    "Mensagem"   text   not null check (char_length("Mensagem") between 1 and 500),
    "CreatedAt"  timestamptz not null default now()
);

create index if not exists idx_feedback_comentarios_feedback on "FeedbackComentarios" ("FeedbackId", "CreatedAt");
create index if not exists idx_feedback_comentarios_user on "FeedbackComentarios" ("UserId", "CreatedAt" desc);

alter table "FeedbackVotos"       enable row level security;
alter table "FeedbackComentarios" enable row level security;
