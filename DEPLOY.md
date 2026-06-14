# Deploy — newdevjobs (Render + Supabase)

Arquitetura em produção:
- **Supabase** — Postgres + Auth + Storage (já provisionado).
- **Render** — 3 serviços Node a partir do `render.yaml`: `newdevjobs-api` (web), `newdevjobs-worker` (worker de envio + runs do scraper) e `newdevjobs-scraper` (cron de monitoramento) + `newdevjobs-frontend` (site estático Vite).
- **Stripe** — assinaturas (checkout + webhook).
- **Apify** — scraper (descoberta + monitoramento).

---

## 0. Pré-requisitos
- Repositório no GitHub.
- Conta Render, Stripe (chaves), Apify (token + actor IDs), Google Cloud (OAuth client).

## 1. Banco (Supabase)
Aplique as migrations em ordem no **SQL Editor** (ou via Supabase CLI), caso recrie o banco:
`supabase/migrations/0001_init.sql` → `0002_sendqueue_scheduledat.sql` → `0003_scraper_billing.sql`.
Crie o bucket **privado** `cvs` em Storage (se ainda não existe).

## 2. Stripe (produtos + preços)
Com `STRIPE_SECRET_KEY` no `.env`, rode uma vez:
```
node backend/scripts/stripe-setup.js
```
Copie os `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PRO` impressos para o env group.

## 3. Render — Blueprint
1. Render → **New → Blueprint** → aponte para o repositório (lê o `render.yaml`).
2. Crie o **Env Group `newdevjobs-secrets`** e preencha (valores `sync:false`):
   - `DATABASE_URL` — **pooler em session mode** (porta 5432, `postgres.<ref>@aws-…pooler.supabase.com`;
     a conexão direta `db.<ref>` foi descontinuada). Senha com `@` → `%40`.
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET=cvs`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI=https://<api>.onrender.com/api/auth/google/callback`
   - `FRONTEND_URL=https://<frontend>.onrender.com`, `ADMIN_EMAILS`
   - `APIFY_TOKEN`, `APIFY_PROFILE_ACTOR_ID=M2FMdjRVeF1HPGFcc`, `APIFY_POST_ACTOR_ID=buIWk2uOUzTmcLsuB`
   - `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` (gerados no passo 2; `STRIPE_WEBHOOK_SECRET` vem no passo 5)
   - **IA (Groq):** `GROQ_API_KEY`, `GROQ_MODEL=llama-3.3-70b-versatile`, `AI_ENABLED=true`,
     `AI_MIN_CONFIDENCE=70`, `AI_MAX_CALLS_PER_RUN=40` (sem isso, o scraper usa só o fallback regex)
3. No serviço **frontend**, preencha as `VITE_*`:
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - `VITE_API_URL=https://<api>.onrender.com`
   - `VITE_STRIPE_PUBLISHABLE_KEY=pk_...`
4. Deploy. Confira `https://<api>.onrender.com/api/health`.

## 4. Google OAuth (login + Gmail)
No **Google Cloud Console → Credenciais → OAuth client**, em *Authorized redirect URIs* adicione:
- `https://<api>.onrender.com/api/auth/google/callback` (conectar Gmail para enviar)
- `https://<SEU-PROJETO>.supabase.co/auth/v1/callback` (login com Google via Supabase)

No **Supabase → Authentication → URL Configuration**: defina o **Site URL** e adicione `https://<frontend>.onrender.com/**` em *Redirect URLs*.

## 5. Stripe webhook
1. Stripe → **Developers → Webhooks → Add endpoint**: `https://<api>.onrender.com/api/billing/webhook`.
2. Eventos: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
3. Copie o **Signing secret** (`whsec_...`) para `STRIPE_WEBHOOK_SECRET` no env group e redeploy a API.

### Webhook em dev (opcional)
```
stripe listen --forward-to localhost:3001/api/billing/webhook
```
Use o `whsec_` que ele imprime no `.env` local.

## 6. Verificação pós-deploy
- Login (email/senha e Google) → dashboard carrega.
- Perfil → Plano → **Fazer upgrade** → checkout Stripe → após pagar, plano vira `pro/starter` (webhook).
- Admin → Bots → **Rodar descoberta/monitoramento** → recrutadores/vagas populam; histórico atualiza.
- Envio de candidatura espaçado pelo worker.

## 7. Segurança (importante)
- **Rotacione** chaves que já circularam fora do cofre: `APIFY_TOKEN` (estava hardcoded no `scraper.js`) e, se for o caso, as chaves de teste do Stripe.
- O `.env` é gitignored — nunca commitar segredos. Em produção tudo vem do env group do Render.
- RLS habilitado no Supabase; todo acesso passa pela API com `service_role`.
