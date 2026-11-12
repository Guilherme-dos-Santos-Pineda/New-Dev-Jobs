-- =========================
-- Qual versão do currículo foi em cada envio (Enviadas)
-- =========================
-- Com o plano "Automático + IA" o anexo pode ser a versão aprovada do tipo da
-- vaga (services/cvVersoes.js, versaoParaEnvio). Sem estas colunas, a pessoa não
-- tinha como saber em Enviadas qual currículo foi: só o log do servidor sabia.
-- O nome fica gravado à parte: a versão pode ser refeita ou apagada depois, e o
-- envio continua dizendo qual foi.

alter table "Applications" add column if not exists "CvVersaoId" bigint references "CvVersoes"("Id") on delete set null;
alter table "Applications" add column if not exists "CvVersaoNome" text;
