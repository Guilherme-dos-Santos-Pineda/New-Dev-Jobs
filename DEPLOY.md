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
Aplique **todas** as migrations em ordem (`0001` → `0011`) no **SQL Editor** (ou via Supabase CLI / `node backend/scripts/apply-migration.mjs <arquivo>`), caso recrie o banco.
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
   - `APIFY_TOKEN_2` / `APIFY_TOKEN_3` / `APIFY_TOKEN_4` — contas extras (fallback do crédito grátis, opcionais; rotação automática)
   - `RESEND_API_KEY` — email marketing / campanhas (domínio verificado no Resend; senão a campanha cai no Gmail conectado)
   - `STRIPE_SECRET_KEY`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` — **preços ONE-TIME** (pagamento único de 30 dias, não recorrente). `STRIPE_WEBHOOK_SECRET` vem no passo 5
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

## 7. Troca de domínios (landing no apex, app em `app.`) — SEO

Hoje o apex (`newdevjobs.xyz`) serve o **app React** (uma tela de login, sem
conteúdo indexável) e a **landing** vive num subdomínio. Isso é o inverso do
recomendado: o domínio de maior autoridade deveria servir o conteúdo.

| Domínio | Deve servir | Serviço no Render |
| --- | --- | --- |
| `newdevjobs.xyz` + `www` | **landing** (estático) | `newdevjobs-site` |
| `app.newdevjobs.xyz` | **app React** | `newdevjobs-frontend` |
| `landing.newdevjobs.xyz` | mantém a landing (canonical aponta pro apex) | `newdevjobs-site` |

> **Não** transforme a landing numa rota do app: ela é HTML estático (ótimo para
> SEO); dentro do SPA viraria conteúdo renderizado por JS — pior para indexação.

O código já é **tolerante aos dois arranjos** (`appBase()` em `pages/*.html`
decide pelo hostname), então a ordem abaixo não tem janela de quebra.

### Ordem (nesta sequência)
1. **Render → `newdevjobs-frontend`** → Settings → Custom Domains: adicione
   `app.newdevjobs.xyz`; **remova** `newdevjobs.xyz`/`www`.
2. **Render → `newdevjobs-site`**: adicione `newdevjobs.xyz` e `www.newdevjobs.xyz`
   (mantenha `landing.newdevjobs.xyz`).
3. **DNS** (no registrador): `CNAME app` → alvo do `newdevjobs-frontend`;
   apex/`www` → alvo do `newdevjobs-site`. Use exatamente os alvos que o Render
   mostrar. Aguarde o SSL ficar verde nos dois serviços.
4. **Google Cloud → OAuth client** → *Authorized redirect URIs*: o callback é da
   **API** (`https://<api>.onrender.com/...`), então **não muda**; mas em
   *Authorized JavaScript origins* troque o apex por `https://app.newdevjobs.xyz`.
5. **Supabase → Authentication → URL Configuration**: *Site URL* =
   `https://app.newdevjobs.xyz`; em *Redirect URLs* adicione
   `https://app.newdevjobs.xyz/**` (remova o apex).
6. **Render → env group**: `FRONTEND_URL=https://app.newdevjobs.xyz` → redeploy
   da **API** (o backend usa isso nos redirects do OAuth e do Stripe).
7. **Só depois de 1–6**, aplique o *flip de SEO* (canonical/OG/JSON-LD/sitemap/
   robots apontando para o apex) e faça o deploy da landing.

⚠️ O passo 7 **não pode vir antes** do 1–3: com o canonical apontando para o apex
enquanto o apex ainda serve o app, o Google seguiria o canonical até uma página
de login e poderia desindexar a landing.

### Depois da virada
- **Google Search Console**: adicione a propriedade de domínio `newdevjobs.xyz`
  (verificação por DNS TXT), envie `https://newdevjobs.xyz/sitemap.xml` e use
  *Inspeção de URL → Solicitar indexação* na home.
- `landing.newdevjobs.xyz` continua respondendo; o `canonical` consolida a
  autoridade no apex (não é preciso 301).
- Confira o login ponta a ponta (email/senha **e** Google) em `app.` antes de
  divulgar.

## 8. Segurança (importante)
- **Rotacione** chaves que já circularam fora do cofre: `APIFY_TOKEN` (estava hardcoded no `scraper.js`) e, se for o caso, as chaves de teste do Stripe.
- O `.env` é gitignored — nunca commitar segredos. Em produção tudo vem do env group do Render.
- RLS habilitado no Supabase; todo acesso passa pela API com `service_role`.
