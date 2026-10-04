-- =========================
-- Índice em Jobs(RecruiterId): quem é recrutador monitorável
-- =========================
-- Desde 04/10/2026 o scraper não pergunta mais "este recrutador foi aprovado?"
-- e sim "este recrutador já gerou vaga?". A pergunta nova é um `exists` sobre
-- Jobs por RecruiterId, e não havia índice nenhum nessa coluna.
--
-- Medido em produção, a consulta que monta o lote de 10 recrutadores
-- (ordenada por LastCheckedAt, com o exists em Jobs) levava **998 ms**. A mesma
-- contagem sem ordenação levava 35 ms: o custo estava em varrer Jobs para cada
-- candidato até juntar 10.
--
-- Não é urgente (roda 16 vezes por dia, não por requisição de usuário), mas é
-- uma linha e tira um segundo de conexão segurada do pool a cada run.
--
-- O filtro parcial repete o critério do scraper: só interessa quem tem email
-- utilizável, que é o mesmo `like '%@%.%'` usado em buscarCandidatas.

create index if not exists idx_jobs_recruiterid_com_email
    on "Jobs" ("RecruiterId")
    where "RecruiterId" is not null and "Email" like '%@%.%';
