# Setup do Supabase (banco + auth + storage)

Siga estes passos uma vez. Depois me passe a **connection string** que eu rodo as
migrations e finalizo a migração.

## 1. Criar o projeto
1. Acesse <https://supabase.com> → **New project**.
2. Escolha um nome, **gere/salve a senha do banco** e a região (escolha a mais
   próxima, ex.: South America - São Paulo).
3. Aguarde o provisionamento (~2 min).

## 2. Pegar as chaves (Settings → API)
- **Project URL** → `SUPABASE_URL` (backend) e `VITE_SUPABASE_URL` (frontend)
- **anon public** → `VITE_SUPABASE_ANON_KEY` (frontend)
- **service_role** (secreta!) → `SUPABASE_SERVICE_ROLE_KEY` (backend)
- **JWT Secret** → `SUPABASE_JWT_SECRET` (backend)

## 3. Connection string (Settings → Database → Connection string → URI)
- Copie a URI e troque `[YOUR-PASSWORD]` pela senha do passo 1 → `DATABASE_URL`.

## 4. Ativar login com Google (Authentication → Providers → Google)
1. Habilite **Google**.
2. Use o mesmo Client ID/Secret do Google Cloud (ou crie um cliente OAuth Web).
3. Em **Authorized redirect URIs** do Google, adicione o callback do Supabase
   mostrado na tela (algo como `https://SEU-PROJETO.supabase.co/auth/v1/callback`).
4. (Opcional) Email/senha já vem habilitado por padrão.

## 5. Storage (Storage → New bucket)
- Crie um bucket **privado** chamado `cvs` (para os currículos).

## 6. Rodar as migrations
As migrations SQL estão em `supabase/migrations/`. Você pode:
- **Opção A (rápida):** SQL Editor do Supabase → cole o conteúdo de
  `supabase/migrations/0001_init.sql` → Run.
- **Opção B (CLI):** instale a Supabase CLI e rode `supabase db push`.

## 7. Preencher os `.env`
- Raiz: copie `.env.example` → `.env` e preencha.
- Frontend: copie `frontend/.env.example` → `frontend/.env` e preencha.

---

Quando tiver a `DATABASE_URL` no `.env`, me avise: eu valido a conexão, confirmo
as tabelas e sigo com a reescrita das queries (sync→async) testando contra o
banco real.
