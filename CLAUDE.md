# Regras do projeto — newdevjobs

Fonte única de convenções. Antes de adicionar uma regra aqui, confira se já não
existe (não duplicar nem criar regra conflitante). Mudou uma convenção? Edite a
regra existente, não acrescente uma nova que a contradiga.

## Arquitetura (resumo)
- `backend/` — API Express (`server.js`) + worker (`worker.js`, fila pg-boss: envios + scraper + agendador de robôs). Postgres via `lib/sql.js`.
- `frontend/` — React + Vite (app/dashboard).
- `pages/` — site estático. A **landing (`index.html`) tem PT/EN** (toggle próprio, ver i18n abaixo). **docs/termos/privacidade** ficam **só em PT** por enquanto.
  - **SEO**: domínio canônico **`https://landing.newdevjobs.xyz`**. Cada página tem `canonical`+`robots`+Open Graph; a home tem JSON-LD (`SoftwareApplication`). `robots.txt` e `sitemap.xml` na raiz. Ao **adicionar/renomear página**, atualize o `sitemap.xml` e o `canonical` dela. Imagem de compartilhamento: `og-image.png` (gerado de `og-image.svg` via `npx sharp-cli -i og-image.svg -o og-image.png resize 1200 630`).
- `supabase/migrations/` — schema versionado.
- Detalhes completos no [README.md](README.md). Histórico em [CHANGELOG.md](CHANGELOG.md).

## i18n (PT/EN)
- **App** (`frontend/`): motor em [frontend/src/lib/i18n.jsx](frontend/src/lib/i18n.jsx). **A chave é o texto em português**; o dicionário `EN` traduz. String sem tradução cai no PT (fallback) — nunca quebra.
- Para traduzir: envolva a string em `t('texto em português')` e **adicione a entrada PT→EN no objeto `EN`** do i18n.jsx.
- **Não duplique chaves.** Procure no dicionário antes de adicionar.
- Interpolação: `t('Olá, {name} 👋', { name })`. Evite fragmentar frases (grammar quebra); prefira a frase inteira como chave.
- Seletor PT/EN vive no `Layout` (sidebar + barra mobile). Persiste em `localStorage('lang')`.
- **Landing** (`pages/index.html`): i18n próprio e independente do app — PT é o HTML original (marcado com `data-i18n="chave"`), o dicionário `I18N_EN` no `<script>` traz só o EN. Toggle 🌐 no header, detecta idioma do navegador, persiste na **mesma** `localStorage('lang')`. Ao adicionar texto novo: ponha `data-i18n` no elemento e a entrada em `I18N_EN` (valor pode conter HTML, ex.: ícones). docs/termos/privacidade seguem só em PT.
- O template de email tem PT/EN próprio no backend (`services/templates.js` → `DEFAULTS`).

## Migrations
- **Aditivas e idempotentes** (`add column if not exists`, `create index if not exists`). Nunca editar uma migration já aplicada — crie a próxima.
- Numeração sequencial: `0001`, `0002`, … A próxima é a maior + 1.
- Aplicar: `node backend/scripts/apply-migration.mjs supabase/migrations/<arquivo>.sql` (escrita em prod é feita pelo dono — eu não rodo).

## Testes
- `npm test` → `node --test backend/test/` (runner nativo do Node, sem dependência).
- Ao corrigir um bug em lógica pura do backend, **adicione um teste de regressão** em `backend/test/`.
- Cobertura atual: matching (`computeMatch`), classificação de vaga (`detectArea`/`detectLevel`), filtros (`passesFilters`), título do email (`niceTitle` via `renderEmail`), dedup (`jobHash`), **billing** (`services/billingLogic.js` — modo do checkout, concessão/expiração de 30 dias, webhook, histórico).
- **Pagamento é área crítica**: a lógica de decisão fica PURA em `services/billingLogic.js` (sem Stripe/SQL) para ser testável. Ao mexer em cobrança, mantenha a lógica lá e **adicione teste** em `backend/test/billing.test.js`.

## Scraper / robôs
- Apify aceita **no máx. 10 `authorUrls` por execução** → fatiar em lotes (já feito em `runMonitoring`).
- Vagas filtradas por **área profissional** (`detectArea`) além de skills/senioridade. Auto-send só dispara em match **≥ 50%**.
- Gerador de robôs: `npm run seed:robots` (simula por padrão; `--commit` cria; queries naturais de posts reais). Cuidado: cada robô gasta crédito Apify.

## Segurança (invariantes)
- Admin = allowlist `ADMIN_EMAILS` **ou** `Users.Role='admin'`. **Sem fallback aberto.**
- `/jobs` e `/jobs/matches` **nunca** devolvem o email de contato (envio é server-side); plano free também não recebe a descrição.
- Segredos só no `.env` (gitignored) e no Render — **nunca** no código/commits.
- `/ranking` **não expõe nome completo** (abrevia: "Primeiro S."). Logout do front chama `POST /api/auth/logout` (purga o token do cache do middleware — sem isso o token deslogado valeria por até 60s).
- Headers de segurança dos **sites estáticos** (app + landing) vivem no `render.yaml` (`headers:` — X-Frame-Options etc.); o helmet cobre **só a API**.
- Mensagens de erro de auth no front são **genéricas** (anti-enumeração de email) — ver `frontend/src/lib/authErrors.js`.
- Botões de ação async com efeito externo: trava síncrona (`useRef`) + feedback (anti duplo-clique).

## Git / commits
- Commits terminam com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- `response.json` e arquivos com PII ficam no `.gitignore`. Não commitar dados de usuário.
- Build do front (`npm run build --prefix frontend`) e `node --check` nos arquivos de backend antes de commitar mudanças relevantes.
