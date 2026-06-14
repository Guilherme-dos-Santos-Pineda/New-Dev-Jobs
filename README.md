# newdevjobs

SaaS de **candidaturas automáticas** para devs: um scraper (Apify) coleta posts de
recrutadores no LinkedIn, uma **IA (Groq)** classifica/extrai as vagas, o sistema calcula
o **match** com o perfil do usuário e **envia o currículo por email** (Gmail API) —
automaticamente ou com seleção manual.

🌐 Produção: app em Render · banco/auth/storage no Supabase · pagamentos no Stripe.

## Arquitetura

```
pages/index.html       # landing page (marketing) — referência de design
scraper.js             # CLI do scraper (Apify) → Postgres  (--mode=discovery|monitoring)
backend/               # API Express + worker (Node)        — porta 3001
  server.js            #   API HTTP (enfileira envios, billing, admin, dashboard)
  worker.js            #   processo separado: consome a fila pg-boss (envios + scraper)
  services/            #   ai (Groq), scraper, sender, mailer, usage, stripeClient…
  routes/              #   auth, profile, jobs, queue, billing, admin, dashboard…
  lib/                 #   sql (Postgres), supabaseAdmin, boss (pg-boss), cvStorage, circuitBreaker
frontend/              # app/dashboard (React + Vite)        — porta 5173
supabase/migrations/   # schema versionado (0001…0004)
render.yaml            # blueprint de deploy (web + worker + cron + static)
```

**Stack:** Postgres (Supabase) · Supabase Auth (Google + email/senha) · Supabase Storage
(currículos) · pg-boss (fila no Postgres) + worker · Stripe (assinaturas) · Groq (pré-análise
de IA) · Apify (scraper) · React + Vite.

## Como rodar (dev — 3 processos)

Pré-requisito: `.env` na raiz e `frontend/.env` preenchidos (veja `.env.example`).

```bash
npm install
node backend/server.js               # API   → http://localhost:3001
npm run worker                       # worker (dispara emails + roda o scraper)
npm run dev --prefix frontend        # app   → http://localhost:5173
```

> ⚠️ São **3 processos**. Sem o worker, os envios ficam na fila e nada é enviado.
> Dev: `EMAIL_MODE=mock SEND_INTERVAL_MS=3000 npm run worker` simula envio sem mandar email.

Scraper por CLI: `npm run scrape` (monitoramento) · `npm run scrape:discovery` (descoberta).

## Funcionalidades

- **Auth** real (Supabase): login com Google, email/senha e reset.
- **Perfil**: skills, senioridade, modalidade, pretensão, filtros e **CV em PDF** (Storage).
- **Conectar Gmail** (escopo `gmail.send`) para enviar como o próprio usuário.
- **Dashboard** premium: KPIs com sparkline, "próxima melhor oportunidade", central de atividades.
- **Robô de envio** (pg-boss): espaça 60–120s, retry/backoff, teto diário por plano.
- **Planos & Assinatura** (Stripe): Free / Starter / Pro, checkout + billing portal + faturas.
- **Scraper DevScout** (Apify): descoberta de recrutadores + monitoramento de posts; **IA Groq**
  classifica/extrai antes de salvar (com circuit breaker e fallback regex).
- **Admin**: Vagas (filtros), Recrutadores & Bots, Conteúdo bruto (aprovar/rejeitar/reprocessar IA),
  Estatísticas/Observabilidade.

## Deploy

Passo a passo (Render + Supabase + Stripe + Apify) em [`DEPLOY.md`](DEPLOY.md).
Variáveis em [`.env.example`](.env.example) e [`frontend/.env.example`](frontend/.env.example).
Detalhes da API em [`backend/README.md`](backend/README.md). Setup do Supabase/Google em
[`backend/SETUP_SUPABASE.md`](backend/SETUP_SUPABASE.md) e [`backend/SETUP_GOOGLE.md`](backend/SETUP_GOOGLE.md).
