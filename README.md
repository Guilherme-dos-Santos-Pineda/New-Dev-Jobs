# newdevjobs

SaaS de **candidaturas automáticas** para devs: robôs coletam posts de recrutadores no
LinkedIn (via Apify), uma **IA (Groq → OpenAI)** classifica/extrai as vagas, o sistema
calcula o **match** com o perfil do usuário e **envia o currículo por email** (Gmail API) —
automaticamente ou com seleção manual.

🌐 Produção: app em Render · banco/auth/storage no Supabase · pagamentos no Stripe.

## Arquitetura

```
pages/                 # SITE estático (marketing + docs) — serviço Render "newdevjobs-site"
  index.html           #   landing (CTAs → app; detecta o domínio: landing.X → www.X)
  docs.html            #   guia do usuário · termos.html · privacidade.html
  base.css             #   tokens/nav/footer compartilhados das páginas
scraper.js             # CLI do scraper (Apify) → Postgres  (--mode=discovery|monitoring)
backend/               # API Express + worker (Node)        — porta 3001
  server.js            #   API HTTP (enfileira envios, billing, admin, dashboard)
  worker.js            #   processo separado: consome a fila pg-boss (envios + scraper + AGENDADOR de robôs)
  services/            #   ai (Groq/OpenAI), scraper, sender, mailer, jobsQuery, matching, usage, stripeClient…
  routes/              #   auth, profile, jobs, queue, billing, admin, dashboard…
  lib/                 #   sql (Postgres), supabaseAdmin, boss (pg-boss), cvStorage, circuitBreaker
  scripts/             #   import-jobs, seed-robots, apply-migration, test-ai
frontend/              # app/dashboard (React + Vite)        — porta 5173, serviço "newdevjobs-frontend"
supabase/migrations/   # schema versionado (0001…0008)
render.yaml            # blueprint de deploy (api + worker + cron + frontend + site)
```

**Stack:** Postgres (Supabase) · Supabase Auth (Google + email/senha) · Supabase Storage
(currículos) · pg-boss (fila no Postgres) + worker · Stripe (assinaturas) · IA Groq→OpenAI
(pré-análise) · Apify (scraper) · React + Vite.

## Como rodar (dev — 3 processos)

Pré-requisito: `.env` na raiz e `frontend/.env` preenchidos (veja `.env.example`).

```bash
npm install
node backend/server.js               # API   → http://localhost:3001
npm run worker                       # worker (envios + scraper + agendador de robôs)
npm run dev --prefix frontend        # app   → http://localhost:5173
```

> ⚠️ São **3 processos**. Sem o worker, os envios ficam na fila, nada é enviado e os robôs não disparam.
> Dev: `EMAIL_MODE=mock SEND_INTERVAL_MS=3000 npm run worker` simula envio sem mandar email.

## Scripts (CLI)

| Comando | O que faz |
|---|---|
| `npm run scrape` / `scrape:discovery` | Roda o scraper por CLI (monitoramento / descoberta). |
| `npm run db:migrate -- <arquivo.sql>` | Aplica uma migration no banco (usa `DATABASE_URL`). |
| `npm run import:jobs <arquivo.json>` | Semeia Jobs + Recrutadores de um export JSON (sem IA/Apify). `--dry`/`--limit=N`. |
| `npm run seed:robots` | Gera robôs de coleta (ver abaixo). Simula por padrão; `--commit` cria. |
| `npm run test:ai` | Testa cada provedor de IA (Groq/OpenAI) isolado. |

## Robôs de coleta (automação)

Cada robô é uma linha em `ScraperSchedules` (tipo `discovery|monitoring` + params + intervalo).
O **worker roda um tick a cada minuto**, reivindica os robôs vencidos de forma atômica e
enfileira o run. Gerencie na aba **Admin → Bots** (criar, ativar/pausar/excluir — inclusive
**em massa**, selecionados ou todos; "rodar agora").

**Gerar robôs granulares** (1 por stack × nível × região, com queries naturais extraídas de
posts reais — ex.: `Vaga para Desenvolvedor PHP Pleno`):

```bash
npm run seed:robots                                            # simula (mostra contagem + custo Apify)
npm run seed:robots -- --commit --reset --br-only --maxPosts=40   # limpa e recria (BR)
npm run seed:robots -- --commit --global-only                     # adiciona as gringas
```

Flags: `--reset` (apaga antes) · `--br-only`/`--global-only` · `--maxPosts=N` · `--queries=1..5`
· `--interval=min` · `--inactive`. **Custo Apify escala com nº de robôs × maxPosts** — o script
imprime a estimativa antes de criar.

Modos de monitoramento: `global` (busca todo o LinkedIn pela query), `saved` (recrutadores
aprovados, rotacionando os mais obsoletos por `LastCheckedAt`, em lotes de 10), `selected` (ids
escolhidos). O Apify aceita **no máx. 10 authorUrls por execução** → lotes automáticos.

## IA (pré-análise)

Cadeia de provedores configurável: `AI_PROVIDER_ORDER=groq,openai` (default). Tenta na ordem;
cada provedor tem seu **circuit breaker** (3 falhas → 2 min aberto → cai para o próximo). Se
todos falharem, usa o fallback regex. Groq é barato/rápido (volume); OpenAI (`gpt-4o-mini`) é a
rede de segurança. `AI_MAX_CALLS_PER_RUN` limita o gasto por run; `AI_MIN_CONFIDENCE` é o corte
para um post virar vaga.

## Funcionalidades

- **Auth** real (Supabase): login com Google, email/senha e reset.
- **Perfil**: skills, senioridade, modalidade, pretensão, filtros, região e **CV em PDF** (Storage).
- **Conectar Gmail** (escopo `gmail.send`) para enviar como o próprio usuário.
- **Dashboard** premium (cache stale-while-revalidate, code-splitting, prefetch no hover).
- **Robô de envio** (pg-boss): espaça 60–120s, retry/backoff, teto diário por plano.
- **Planos & Assinatura** (Stripe): Free / Starter / Pro, checkout + portal + faturas + status/renovação.
- **Scraper** (Apify): descoberta de recrutadores + monitoramento de posts; IA classifica/extrai.
- **Admin**: Vagas, Recrutadores (cadência "visto há X"), **Robôs agendados**, Conteúdo bruto, Estatísticas.

## Migrations

`0001` schema base · `0002` sendqueue scheduledAt · `0003` scraper+billing (Recruiters/ScraperRuns/dedup)
· `0004` IA + ScrapedPosts · `0005` região no perfil · `0006` índices de performance ·
`0007` cadência de recrutadores (LastCheckedAt/Source, LinkedinUrl opcional) · `0008` ScraperSchedules.
Aplique em ordem com `npm run db:migrate -- supabase/migrations/<arquivo>.sql`.

## Segurança (resumo)

helmet · CORS restrito ao frontend · rate-limit (geral + estrito em rotas caras/sensíveis) ·
JWT validado no Supabase · SQL parametrizado · webhook Stripe assinado · **admin = allowlist
`ADMIN_EMAILS` ou `Users.Role='admin'`** (sem fallback aberto — defina `ADMIN_EMAILS` em prod).

## Deploy

Passo a passo (Render + Supabase + Stripe + Apify) em [`DEPLOY.md`](DEPLOY.md). O `render.yaml`
define 5 serviços: **api** (web), **worker**, **cron** (scraper 6h), **frontend** (estático) e
**site** (estático, `pages/`). Domínios customizados: adicione `www.<domínio>` no frontend e
`landing.<domínio>` no site (Settings → Custom Domains). Variáveis em
[`.env.example`](.env.example) e [`frontend/.env.example`](frontend/.env.example). Setup do
Supabase/Google em [`backend/SETUP_SUPABASE.md`](backend/SETUP_SUPABASE.md) e
[`backend/SETUP_GOOGLE.md`](backend/SETUP_GOOGLE.md).
