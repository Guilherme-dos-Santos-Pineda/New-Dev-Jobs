-- Reply-To da campanha: o "De:" usa o dominio (Resend), mas as respostas vao
-- para um email real que voce le (ex.: newdevoficial@gmail.com).
alter table "Campaigns" add column if not exists "ReplyTo" text;
