-- =============================================================
-- Classificação persistida das vagas — o que destrava 1000 usuários.
--
-- O filtro do feed (área profissional, nível, modalidade, país) depende SÓ da
-- vaga. Mesmo assim ele era recalculado em JavaScript a cada requisição de cada
-- usuário, o que obrigava a trazer a tabela "Jobs" inteira para a memória do
-- Node: ~1,5 kB x N linhas, por usuário, por request. Com 6 mil vagas já custava
-- ~12 MB e ~1,2 s; a 50 mil vagas passa de 75 MB por requisição — a VM tem 954 MB
-- no total. Era o teto de 8 dashboards simultâneos medido em carga.
--
-- Gravando o resultado da classificação aqui, o filtro vira SQL indexado: o banco
-- devolve as dezenas de vagas compatíveis em vez das dezenas de milhares que não
-- são. O custo passa a depender do TAMANHO DA RESPOSTA, não do tamanho da base.
--
-- "ClassVersion" guarda com qual versão do classificador a linha foi escrita,
-- para reprocessar só o que ficou defasado quando as regras mudarem
-- (backend/scripts/reclassify-jobs.mjs).
-- =============================================================

alter table "Jobs" add column if not exists "Area"         text;
alter table "Jobs" add column if not exists "Level"        text;
alter table "Jobs" add column if not exists "Mods"         jsonb;   -- ['remoto','hibrido'] | null
alter table "Jobs" add column if not exists "IsBR"         boolean;
alter table "Jobs" add column if not exists "ClassVersion" integer not null default 0;

-- Caminho quente: vaga candidatável (tem email) que não é de outra profissão,
-- do país certo, ordenada por data. É exatamente o que getMatches() pede.
create index if not exists idx_jobs_feed
    on "Jobs" ("IsBR", "Area", "CreatedAt" desc)
    where "Email" is not null and "Email" <> '' and "Area" <> 'nontech';

-- Fila do reclassificador: acha as linhas defasadas sem varrer a tabela.
create index if not exists idx_jobs_classversion on "Jobs" ("ClassVersion")
    where "ClassVersion" < 1;

-- Retenção do rastro do scraper (ScraperRuns + ScrapedPosts somam 34 MB dos 53 MB
-- do banco, e crescem a cada execução). A limpeza roda no worker e precisa achar
-- as linhas velhas por data.
create index if not exists idx_scraperruns_created  on "ScraperRuns"  ("CreatedAt");
create index if not exists idx_scrapedposts_created on "ScrapedPosts" ("CreatedAt");
