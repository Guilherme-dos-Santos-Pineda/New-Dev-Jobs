# Regras do projeto — newdevjobs

Fonte única de convenções. Antes de adicionar uma regra aqui, confira se já não
existe (não duplicar nem criar regra conflitante). Mudou uma convenção? Edite a
regra existente, não acrescente uma nova que a contradiga.

## Arquitetura (resumo)
- `backend/` — API Express (`server.js`) **com o worker embutido** (`worker.js` exporta `startWorker()`; fila pg-boss: envios + scraper + agendador de robôs). Postgres via `lib/sql.js`.
  - **1 processo em produção** (`RUN_WORKER=true`, padrão) → hospedagem a custo zero. `RUN_WORKER=false` volta ao modelo de 2 processos (`npm run worker`).
  - **Nunca suba 2 processos com `RUN_WORKER=true`** na mesma fila: os envios saem duplicados.
  - Hospedagem: **tudo na VM Oracle Cloud** (Always Free, 24/7 — o worker embutido não pode hibernar). O nginx serve os três papéis no **mesmo domínio** (`newdevjobs.xyz`): landing estática na raiz, app React em `/login`, `/signup` e `/app/*`, e `/api/*` como proxy pro Node em `:3001`. Guia em [deploy/oracle/README.md](deploy/oracle/README.md).
  - **Mesma origem = sem CORS.** O front chama `/api/...` relativo (`VITE_API_URL` vazia em `frontend/.env.production`). Pôr um domínio absoluto ali reintroduz CORS à toa — e o `cors()` do `server.js` aceita **uma origem só**.
  - O app é buildado com `base: '/app/'` (só em `vite build`; o dev server segue na raiz). Rotas novas do React Router **fora** de `/app/` precisam de um `location =` correspondente no nginx, senão dão 404.
  - **Todo `return 301` no nginx precisa de `$is_args$args` (ou `$request_uri`)**: `return` não anexa a query string sozinho, ao contrário de `rewrite`. O Supabase devolve o login por email e o do Google em `/app?code=...`; sem isso o código some no redirect e a autenticação falha **em silêncio** — o app carrega sem sessão, parecendo servidor fora do ar.
  - Ao mexer no boot: `worker.js` só auto-executa quando é o entrypoint — não remova essa checagem, senão o worker sobe duas vezes e duplica envios.
  - **Deploy é automático**: `git push` no `main` dispara [.github/workflows/deploy.yml](.github/workflows/deploy.yml), que testa, builda no runner do GitHub (a VM de 1 GB não dá conta do `vite build`), publica e verifica as rotas. O Action **falha de propósito** se o `nginx-newdevjobs.conf` mudar — reinstalar a config apaga os blocos 443 do certbot; nesse caso rode `deploy-static.sh --nginx` e depois `certbot --nginx --reinstall --non-interactive`.

## Banco / conexões (não regredir)
- **Queries da app** (`lib/sql.js`) → pooler em **transaction mode (6543)**, derivado automaticamente da `DATABASE_URL`. Exige `prepare:false`.
- **pg-boss** (`lib/boss.js`) → **session mode (5432)**, porque depende de advisory locks. **Nunca** apontar o pg-boss para o 6543.
- Motivo: o session mode limita **~15 conexões no projeto todo**; abríamos 16 (API 6 + worker 6 + cron 4) e a app caía sob carga. Regressão coberta em `backend/test/sqlPool.test.js`.
- Antes de criar processo novo que fale com o banco, **refaça essa conta**.
## Escala do feed (não regredir)
- **A classificação da vaga é PERSISTIDA**, não recalculada por requisição. `classifyJob()` (em `services/classify.js`) grava `Area`/`Level`/`Mods`/`IsBR`/`ClassVersion` em `Jobs` na inserção (migration `0014`).
- **O filtro vive em dois lugares e a divisão é intencional**: o que depende só da vaga (área, nível, modalidade, país, data) e as palavras exigidas/bloqueadas vão no **SQL** (`buscarCandidatas`); o resto (domínios bloqueados) fica em `passesFilters`, que roda de novo sobre o resultado e é a **autoridade final**.
- **O SQL NUNCA pode ser mais restritivo que o JS.** Se divergirem, o JS corta o excesso; o contrário some com vaga boa **em silêncio** — sem erro e sem log. Confira com `npm run check:feed` sempre que mexer em `passesFilters`, `classify.js` ou `buscarCandidatas`.
- **Mudou regra em `classify.js`? Suba o `CLASSIFY_VERSION`.** As linhas antigas ficam com a regra antiga até serem reprocessadas — o worker reclassifica as defasadas a cada 10 min (`services/maintenance.js`), e `npm run reclassify` força na hora.
- **Toda consulta de vagas tem teto** (`MATCHES_MAX`, 1500). O custo passa a depender do tamanho da RESPOSTA, não da base: sem teto, 50 mil vagas × 1,5 kB = 75 MB por requisição numa VM de 954 MB. **Não crie consulta de `Jobs` sem `limit`** — foi assim que o `GET /api/jobs` (removido) devolvia 11 MB.
- **Retenção**: `pruneScraperHistory` apaga `ScraperRuns`/`ScrapedPosts` com mais de `RETENTION_DAYS` (45). Post `pending` nunca é apagado — é trabalho não feito, não lixo. O plano grátis do Supabase tem 500 MB e o rastro do scraper já era 34 MB de 53 MB.

- `frontend/` — React + Vite (app/dashboard).
- `pages/` — site estático. A **landing (`index.html`) tem PT/EN** (toggle próprio, ver i18n abaixo). **docs/termos/privacidade** ficam **só em PT** por enquanto.
  - **SEO**: domínio canônico **`https://newdevjobs.xyz`** (o apex serve a landing; foi consolidado ali para não dividir autoridade com um subdomínio). Cada página tem `canonical`+`robots`+Open Graph; a home tem JSON-LD (`SoftwareApplication`). `robots.txt` e `sitemap.xml` na raiz. Ao **adicionar/renomear página**, atualize o `sitemap.xml` e o `canonical` dela. Imagem de compartilhamento: `og-image.png` (gerado de `og-image.svg` via `npx sharp-cli -i og-image.svg -o og-image.png resize 1200 630`).
- `supabase/migrations/` — schema versionado.
- Detalhes completos no [README.md](README.md). Histórico em [CHANGELOG.md](CHANGELOG.md).

## i18n (PT/EN)
- **App** (`frontend/`): motor em [frontend/src/lib/i18n.jsx](frontend/src/lib/i18n.jsx). **A chave é o texto em português**; o dicionário `EN` traduz. String sem tradução cai no PT (fallback) — nunca quebra.
- Para traduzir: envolva a string em `t('texto em português')` e **adicione a entrada PT→EN no objeto `EN`** do i18n.jsx.
- **Não duplique chaves.** Procure no dicionário antes de adicionar.
- Interpolação: `t('Olá, {name} 👋', { name })`. Evite fragmentar frases (grammar quebra); prefira a frase inteira como chave.
- Seletor PT/EN vive no `Layout` (sidebar + barra mobile). Persiste em `localStorage('lang')`.
- **Landing** (`pages/index.html`): PT é o HTML original (elementos marcados com `data-i18n="chave"`), e o dicionário `I18N_EN` no `<script>` traz só o EN. Ao adicionar texto novo: ponha `data-i18n` no elemento e a entrada em `I18N_EN` (valor pode conter HTML, ex.: ícones).
  - **Cada idioma tem a sua URL**: `/` em PT e `/en/` em EN. A página EN é **gerada** por [pages/build-en.mjs](pages/build-en.mjs) no deploy — **não edite `pages/en/`, é ignorado pelo git**; editar o PT é o que atualiza os dois. O gerador avisa quando alguma chave fica sem tradução.
  - Metadados do `<head>` (description, og:*, JSON-LD) não têm `data-i18n` — traduza-os pelas chaves fixas `meta.*` do dicionário, senão a página EN sai com `<meta description>` em português.
  - O seletor 🌐 **navega** entre `/` e `/en/` (não troca o texto no lugar): a URL é a fonte da verdade, senão o canonical contradiz o que o usuário vê e o Googlebot (que se identifica como `en-US`) renderizaria inglês na URL portuguesa. Ele continua gravando `localStorage('lang')`, a **mesma** chave que o app React lê.
  - `hreflang` recíproco (`pt-BR`/`en`/`x-default`) vive no `<head>` do PT e é herdado pelo gerado. Página nova → atualize também o `sitemap.xml`.
  - docs/termos/privacidade seguem **só em PT** e são linkados a partir de `/en/` com caminho absoluto (`/docs.html`).
- O template de email tem PT/EN próprio no backend (`services/templates.js` → `DEFAULTS`).

## Migrations
- **Aditivas e idempotentes** (`add column if not exists`, `create index if not exists`). Nunca editar uma migration já aplicada — crie a próxima.
- Numeração sequencial: `0001`, `0002`, … A próxima é a maior + 1.
- Aplicar: `node backend/scripts/apply-migration.mjs supabase/migrations/<arquivo>.sql` (escrita em prod é feita pelo dono — eu não rodo).

## Testes
- `npm test` → `node --test backend/test/` (runner nativo do Node, sem dependência).
- Ao corrigir um bug em lógica pura do backend, **adicione um teste de regressão** em `backend/test/`.
- Cobertura atual (93 testes): matching (`computeMatch`), classificação de vaga (`detectArea`/`detectLevel`) **incluindo `nontech`/`suporte`**, filtros (`passesFilters`), título do email (`niceTitle` via `renderEmail`), dedup (`jobHash`), pool do Postgres (`toTransactionPooler`), memo do `getMatches`, crédito da Apify, **classificação persistida** (`classifyJob` x `detectArea/detectLevel/detectModality`), **billing** (`services/billingLogic.js` — modo do checkout, concessão/expiração de 30 dias, webhook, histórico).
- **Pagamento é área crítica**: a lógica de decisão fica PURA em `services/billingLogic.js` (sem Stripe/SQL) para ser testável. Ao mexer em cobrança, mantenha a lógica lá e **adicione teste** em `backend/test/billing.test.js`.

## Matching (não regredir)
- **Vaga de outra profissão NUNCA entra no feed.** `detectArea` (em `services/classify.js`) devolve `'nontech'` para RH, contábil, compras, logística, saúde, jurídico, engenharias não-software etc., e `passesFilters` barra isso **antes** do `if (!profile)` — vale até para quem não configurou o perfil. Foi assim que "Assistente Operacional de Logística" aparecia para um dev.
- **A ordem das checagens importa**: `NONTECH` é testado **por último**, depois de todas as áreas de tech. Assim um título híbrido ("Analista de Sistemas Comercial") fica com o lado técnico — empatar a favor de tech é o erro barato, porque perder vaga boa custa mais do que exibir uma duvidosa.
- `'other'` (não deu para classificar) **continua passando** de propósito: título ruim não quer dizer vaga ruim. Não transforme `'other'` em bloqueio — o balde tinha Tech Lead e Arquiteto de Software misturados com o lixo.
- Área nova exige mexer em **dois** lugares: o classificador e `AREA_OPTIONS` em `frontend/src/utils.js`. Área que a UI não oferece some do feed de quem filtrou por área.
- Ao mexer aqui, **valide contra os dados reais** antes de publicar (`backend/scripts/check-perf.mjs` mostra o caminho). Regressão coberta em `backend/test/classifyNonTech.test.js`.
- `getMatches` tem **memo curto por usuário** (guarda a *promise*, não o resultado). Invalide com `invalidateMatches(userId)` ao criar candidatura ou salvar perfil.

## Scraper / robôs
- Apify aceita **no máx. 10 `authorUrls` por execução** → fatiar em lotes (já feito em `runMonitoring`).
- Vagas filtradas por **área profissional** (`detectArea`) além de skills/senioridade. Auto-send só dispara em match **≥ 50%**.
- Gerador de robôs: `npm run seed:robots` (simula por padrão; `--commit` cria; queries naturais de posts reais). Cuidado: cada robô gasta crédito Apify.

## Segurança (invariantes)
- Admin = allowlist `ADMIN_EMAILS` **ou** `Users.Role='admin'`. **Sem fallback aberto.**
- `/jobs` e `/jobs/matches` **nunca** devolvem o email de contato (envio é server-side); plano free também não recebe a descrição.
- Segredos só no `.env` (gitignored) e no painel do provedor — **nunca** no código/commits. ⚠️ O repositório é **público**.
- `/ranking` **não expõe nome completo** (abrevia: "Primeiro S."). Logout do front chama `POST /api/auth/logout` (purga o token do cache do middleware — sem isso o token deslogado valeria por até 60s).
- Headers de segurança dos **sites estáticos** (app + landing) vivem no [deploy/oracle/nginx-newdevjobs.conf](deploy/oracle/nginx-newdevjobs.conf) (`add_header ... always` — X-Frame-Options etc.); o helmet cobre **só a API**. Os `_headers`/`_redirects` em `pages/` e `frontend/public/` são resquício de Render/Cloudflare Pages e o `deploy-static.sh` os remove da webroot.
- Mensagens de erro de auth no front são **genéricas** (anti-enumeração de email) — ver `frontend/src/lib/authErrors.js`.
- Botões de ação async com efeito externo: trava síncrona (`useRef`) + feedback (anti duplo-clique).
- **`/feedback` é MURAL PÚBLICO** (depoimentos, visível a todos os logados); **`/bugs` é privado** (relato de bug, só o autor e o admin). Não misture: relato de bug descreve algo quebrado e às vezes carrega dado do usuário.
- O relato de bug anexa contexto do navegador (rota, tela, user agent, último erro de JS). Esses dados ficam **visíveis ao usuário antes do envio** — mandar dado do navegador sem avisar é surpresa ruim. `lib/errorLog.js` guarda só o último erro, só em memória.

## Git / commits
- Commits terminam com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- `response.json` e arquivos com PII ficam no `.gitignore`. Não commitar dados de usuário.
- Build do front (`npm run build --prefix frontend`) e `node --check` nos arquivos de backend antes de commitar mudanças relevantes.
