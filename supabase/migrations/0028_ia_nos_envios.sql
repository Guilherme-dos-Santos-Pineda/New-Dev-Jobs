-- =========================
-- Liga/desliga o currículo da IA nos envios (plano "Automático + IA")
-- =========================
-- Pedido do dono (11/11/2026): a pessoa precisa saber e escolher se o envio vai
-- com a versão da IA ou com o PDF do perfil. Padrão ligado: quem tem o plano
-- aprovou as versões justamente para elas irem.

alter table "Users" add column if not exists "CvIaNosEnvios" boolean not null default true;
