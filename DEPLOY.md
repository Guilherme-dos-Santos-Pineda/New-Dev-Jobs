# Deploy — newdevjobs

> ## 📍 Arquitetura atual: tudo na VM Oracle
>
> A hospedagem saiu do Render. **Cloudflare Pages foi avaliado e descartado** — a
> razão para usá-lo era servir o apex, e o obstáculo (o Pages só aceita CNAME e a
> GoDaddy não faz CNAME na raiz) não existe com a VM, que tem IP fixo.
>
> | Parte | Onde | Guia |
> | --- | --- | --- |
> | Landing (PT `/` · EN `/en/`) | **nginx da VM Oracle** | [`deploy/oracle/README.md`](deploy/oracle/README.md) |
> | App React (`/login`, `/app/*`) | **nginx da VM Oracle** | idem |
> | API + worker (`/api/*`) | **Node na mesma VM** | idem |
> | Banco / Auth / Storage | **Supabase** free | seção 1 |
>
> Tudo em `https://newdevjobs.xyz` — **mesma origem, sem CORS**. O worker roda
> embutido na API, então ela precisa ficar acordada: por isso uma VM, e não um
> free tier que hiberna.
>
> **Deploy é automático**: `git push` no `main` dispara o GitHub Action
> ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)), que roda os
> testes, builda o frontend no runner, publica na VM e verifica as rotas.
>
> As seções sobre Render abaixo ficam como **referência histórica**.

--- | --- | --- |
> | API + worker | **Oracle Cloud** (Always Free, 24/7) | [`deploy/oracle/README.md`](deploy/oracle/README.md) |
> | App + landing | **Cloudflare Pages** | seção 3-B abaixo |
> | Banco / Auth / Storage | **Supabase** free | seção 1 |
>
> O worker roda **embutido na API**, então a API precisa ficar **acordada** —
> por isso uma VM (que não dorme) em vez de free tiers que hibernam.
>
> As seções sobre Render abaixo ficam como **referência histórica** (o
> `render.yaml` segue no repo e funciona no plano `free`, caso queira voltar).

---

Arquitetura anterior no Render (**custo: US$ 0/mês** no plano free):
- **Supabase** — Postgres + Auth + Storage (já provisionado).
- **Render** — **1 serviço Node** no plano `free`: `newdevjobs-api` (HTTP **+ worker embutido**:
  envios, runs do scraper e agendador de robôs, tudo no mesmo processo) + 2 sites
  estáticos grátis: `newdevjobs-frontend` (app Vite) e `newdevjobs-site` (landing).
- **GitHub Actions** — keep-alive grátis (`.github/workflows/keepalive.yml`).
- **Stripe** — assinaturas (checkout + webhook).
- **Apify** — scraper (descoberta + monitoramento).

> **Histórico:** antes eram 5 serviços (~US$14/mês) e a app caía sob carga. Duas
> mudanças resolveram: as queries passaram para o **pooler em transaction mode**
> (o session mode limita ~15 conexões no projeto todo e nós abríamos 16), e o
> **worker foi fundido na API**. Detalhes em `backend/lib/sql.js`.

### Conexões ao Postgres (o que derrubava a app)

| | Antes | Agora |
|---|---|---|
| Processos | API + worker + cron | 1 (API com worker embutido) |
| Queries da app | session 5432 (limite ~15) | **transaction 6543** (milhares) |
| Conexões em session mode | **16 → estourava** 💥 | **2** (só o pg-boss) |

O pg-boss **continua** em session mode de propósito (usa advisory locks); não
aponte ele para o 6543.

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

## 3-B. Cloudflare Pages — app + landing (grátis, sem sleep)

Os dois sites são **estáticos**, então não precisam de servidor. O Cloudflare
Pages é gratuito, com banda ilimitada e sem hibernar. Faça **dois projetos**:

| Projeto | Build command | Output | Root |
| --- | --- | --- | --- |
| `newdevjobs-app` | `npm install && npm run build` | `dist` | `frontend` |
| `newdevjobs-site` | *(nenhum)* | `pages` | *(raiz)* |

1. Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → escolha
   o repositório e preencha conforme a tabela.
2. No projeto do **app**, em *Settings → Environment variables*, defina as
   `VITE_*` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`,
   `VITE_STRIPE_PUBLISHABLE_KEY`). São lidas em **build time** — mudou, refaça o
   deploy.
3. Domínios em *Custom domains*: app → `app.newdevjobs.xyz`,
   landing → `newdevjobs.xyz` + `www` (ver seção 7.1).

Os arquivos de configuração já estão no repo e são lidos automaticamente:
`frontend/public/_redirects` (SPA fallback do React Router) e `_headers`
(X-Frame-Options / nosniff / Referrer-Policy) em `frontend/public/` e `pages/`.

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

## 6. Keep-alive (obrigatório no plano free)

No plano `free` o serviço **dorme após ~15 min sem request**. Como o worker roda
embutido, dormir não causa só cold start — **os envios param e os robôs não
disparam**. O `.github/workflows/keepalive.yml` faz um ping a cada 10 min.

1. GitHub → **Settings → Secrets and variables → Actions → New repository secret**
2. Nome `API_URL`, valor `https://newdevjobs-api.onrender.com` (sem barra no fim)
3. Aba **Actions** → workflow *keep-alive* → **Run workflow** (testa na hora)

> O free tier dá **750 horas-instância/mês**; 24/7 consome ~730h. Cabe, mas só
> para **um** serviço free — não crie um segundo serviço Node no plano free.

⚠️ **Sem o cron dedicado**, o monitoramento depende de haver **pelo menos um robô
ativo** (`ScraperSchedules`, tipo `monitoring`). Confira em **Admin → Bots**; se
não houver, rode `npm run seed:robots --commit`.

## 7. SEO / Google

O on-page já está pronto (canonical, Open Graph, JSON-LD, `robots.txt`,
`sitemap.xml`). O que faz o site **voltar a aparecer** é estar no ar + avisar o
Google — nesta ordem:

1. Confirme que `https://landing.newdevjobs.xyz` responde **200** (fora do ar, o
   Google desindexa em poucas semanas — foi o que aconteceu).
2. **Search Console → Sitemaps** → enviar `sitemap.xml`.
3. **Inspeção de URL** → colar cada página → **Solicitar indexação**
   (`/`, `/docs.html`, `/termos.html`, `/privacidade.html`).
4. Acompanhe em **Páginas** por 1–2 semanas. Reindexação **não é instantânea**:
   costuma levar de alguns dias a ~2 semanas.

### 7.1 Trocar o canônico para o apex (recomendado, decisão sua)

Hoje o apex (`newdevjobs.xyz`) serve o **app React** — uma tela de login, sem
conteúdo indexável — e a landing vive num subdomínio. É o inverso do
recomendado: o domínio de maior autoridade deveria servir o conteúdo.

| Domínio | Deve servir | Serviço |
| --- | --- | --- |
| `newdevjobs.xyz` + `www` | **landing** (estático) | `newdevjobs-site` |
| `app.newdevjobs.xyz` | **app React** | `newdevjobs-frontend` |
| `landing.newdevjobs.xyz` | mantém a landing (canonical aponta pro apex) | `newdevjobs-site` |

> **Não** transforme a landing numa rota do app: ela é HTML estático (ótimo para
> SEO); dentro do SPA viraria conteúdo renderizado por JS — pior para indexação.

O código já é **tolerante aos dois arranjos** (`appBase()` em `pages/*.html`
decide pelo hostname), então a ordem abaixo não tem janela de quebra.

1. **Render → `newdevjobs-frontend`** → Custom Domains: adicione
   `app.newdevjobs.xyz`; **remova** `newdevjobs.xyz`/`www`.
2. **Render → `newdevjobs-site`**: adicione `newdevjobs.xyz` e `www.newdevjobs.xyz`
   (mantenha `landing.newdevjobs.xyz`).
3. **DNS**: `CNAME app` → alvo do `newdevjobs-frontend`; apex/`www` → alvo do
   `newdevjobs-site`. Use os alvos que o Render mostrar; aguarde o SSL ficar verde.
4. **Google Cloud → OAuth client**: o *redirect URI* é da **API**, então não muda;
   em *Authorized JavaScript origins* troque o apex por `https://app.newdevjobs.xyz`.
5. **Supabase → Authentication → URL Configuration**: *Site URL* =
   `https://app.newdevjobs.xyz` e adicione `https://app.newdevjobs.xyz/**` em
   *Redirect URLs* (remova o apex).
6. **Env group**: `FRONTEND_URL=https://app.newdevjobs.xyz` → redeploy da API.
7. **Só depois de 1–6**: troque `canonical`, Open Graph, JSON-LD, `sitemap.xml` e
   `robots.txt` para o apex e faça o deploy da landing.

⚠️ O passo 7 **não pode vir antes** do 1–3: com o canonical apontando para o apex
enquanto o apex ainda serve o app, o Google seguiria o canonical até uma tela de
login e poderia desindexar a landing. Faça a troca **antes** de pedir
reindexação (passo 3 da seção 7), para não gastar o rastreio duas vezes.

## 8. Verificação pós-deploy
- `GET /api/health` → `{"ok":true}`.
- Nos logs do serviço deve aparecer **`🤖 worker ativo (embutido na API)`** — é a
  confirmação de que a fusão funcionou e os envios vão sair.
- Login (email/senha e Google) → dashboard carrega.
- Perfil → Plano → **Fazer upgrade** → checkout Stripe → após pagar, plano vira `pro/starter` (webhook).
- Admin → Bots → **Rodar descoberta/monitoramento** → recrutadores/vagas populam; histórico atualiza.
- Envio de candidatura espaçado pelo worker.

## 9. Segurança (importante)
- **Rotacione** chaves que já circularam fora do cofre: `APIFY_TOKEN` (estava hardcoded no `scraper.js`) e, se for o caso, as chaves de teste do Stripe.
- O `.env` é gitignored — nunca commitar segredos. Em produção tudo vem do env group do Render.
- RLS habilitado no Supabase; todo acesso passa pela API com `service_role`.
