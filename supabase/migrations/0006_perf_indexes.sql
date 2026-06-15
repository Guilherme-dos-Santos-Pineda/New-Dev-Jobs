-- =============================================================
-- Índices de performance — sustentam o crescimento da tabela "Jobs".
-- A listagem de vagas e o cálculo de matches ordenam por "CreatedAt" desc
-- e, em getMatches(), filtram vagas com email. Sem índice, cada request faz
-- seq scan da tabela inteira (o gargalo principal conforme a base cresce).
-- =============================================================

-- Ordenação padrão de Jobs (listForUser / getMatches / dashboard recentJobs).
create index if not exists idx_jobs_created on "Jobs" ("CreatedAt" desc, "Id" desc);

-- getMatches() varre apenas vagas com email preenchido — índice parcial enxuto.
create index if not exists idx_jobs_email on "Jobs" ("CreatedAt" desc)
    where "Email" is not null and "Email" <> '';

-- O NOT EXISTS de getMatches casa (UserId, JobId); a constraint unique de
-- "Applications" já cobre isso, então não criamos índice redundante.
