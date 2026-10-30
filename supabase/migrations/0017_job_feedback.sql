-- =========================
-- 👍 / 👎 do usuário em cada vaga
-- =========================
-- Pedido do dono em 29/10/2026: o usuário diz se a vaga serve para ele.
-- O 👎 TIRA a vaga do feed daquela pessoa (é o "não é pra mim"), e o motivo
-- vira sinal para o admin: vaga com vários "não é de TI" é candidata ao botão
-- "Não é TI", que tira do feed de todos.
--
-- Uma linha por (usuário, vaga): mudar de ideia sobrescreve, não acumula.
-- O código funciona sem esta tabela (o recurso só fica escondido), então
-- aplicar depois do deploy é seguro.

create table if not exists "JobFeedback" (
    "UserId"    uuid not null references "Users"("Id") on delete cascade,
    "JobId"     bigint not null references "Jobs"("Id") on delete cascade,
    "Voto"      smallint not null check ("Voto" in (-1, 1)),
    "Motivo"    text,
    "CreatedAt" timestamptz not null default now(),
    primary key ("UserId", "JobId")
);

-- Admin: "quantos 👎 esta vaga tem".
create index if not exists idx_jobfeedback_job on "JobFeedback" ("JobId");
