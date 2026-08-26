# Changelog

Registro das alterações relevantes. Datas no formato AAAA-MM-DD.

## 2026-08 — Saída do Render: infraestrutura própria, inglês e correção do matching

### Hospedagem (Render → Oracle Cloud)
- O Render caiu e o site ficou **fora do ar** (503). Toda a hospedagem migrou para a **VM Oracle Cloud** (Always Free), com o nginx servindo os três papéis **no mesmo domínio**: landing estática na raiz, app React em `/login` e `/app/*`, e `/api/*` como proxy pro Node. Guia em [deploy/oracle/README.md](deploy/oracle/README.md).
- **Cloudflare Pages foi avaliado e descartado.** A razão para usá-lo era servir o apex, e o obstáculo (o Pages só aceita CNAME; a GoDaddy não faz CNAME na raiz) não existe com a VM, que tem IP fixo.
- **Mesma origem = sem CORS.** O app chama `/api/...` relativo (`VITE_API_URL` vazia em `frontend/.env.production`).
- **Deploy automático** via GitHub Action ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)): `git push` no `main` roda os testes, builda no runner, publica na VM e **verifica** que as rotas voltaram 200 e que URL inexistente ainda dá 404.

### Matching (correção do produto)
- **Vaga de outra profissão nunca entra no feed.** `detectArea` devolvia `'other'` para o que não reconhecia, e `passesFilters` deixava `'other'` passar **sempre** — a intenção era não perder vaga boa mal classificada, o efeito era liberar todo o ruído do scraper. Caso real: "Assistente Operacional de Logística" no feed de um dev.
- Novo `NONTECH` em `services/classify.js` (RH, contábil, compras, logística, saúde, jurídico, engenharias não-software…), testado **depois** de todas as áreas técnicas — título híbrido fica com o lado técnico.
- `detectArea` ganhou o que faltava: **Tech Lead / Arquiteto de Software / Analista de Sistemas** → `dev`; **DBA** → `data`; **Agile Coach/Master** → `po`; e a área nova **`suporte`** (Service Desk / Help Desk / Analista de TI), que caía inteira em `'other'`.
- Validado contra as 6270 vagas de produção: 221 reclassificações, todas na direção pretendida, zero regressão. Regressão coberta em `backend/test/classifyNonTech.test.js`.

### Landing em inglês
- `/en/` é **HTML de verdade**, gerado no deploy por [pages/build-en.mjs](pages/build-en.mjs) a partir do português e do mesmo dicionário `I18N_EN` — antes o inglês existia só como JavaScript na mesma URL, invisível para o Google.
- `hreflang` recíproco, canonical próprio, metadados do `<head>` traduzidos por chaves `meta.*`, e o seletor de idioma **navega** entre `/` e `/en/` em vez de trocar o texto no lugar.
- Domínio canônico consolidado no **apex** (`https://newdevjobs.xyz`); `www` e `landing.` dão 301 preservando o caminho.

### Canal de relato de bug
- Novo canal **privado** (migration `0013`, tabela `BugReports`) — separado de `/feedback`, que é um mural público de depoimentos.
- Anexa o **contexto do navegador** automaticamente (rota, tamanho de tela, user agent e o último erro de JS da sessão, via `lib/errorLog.js`), o que transforma "não funciona" em algo reproduzível. Os dados ficam visíveis a um clique antes do envio.

### Performance
- `getMatches` custava ~1,4 s de banco e ~12 MB por chamada (6270 vagas). Ganhou **memo curto por usuário** guardando a *promise*, então requests concorrentes compartilham uma execução. Medido em produção: dashboard **2002 ms → 31 ms**.
- `/api/jobs/matches` fazia `select * from "Jobs"` inteiro só para contar um número: **2056 ms → 139 ms**.
- Agendador de robôs consulta o crédito da Apify **antes** de reivindicar — antes enfileirava execuções que morriam 3 s depois.

### Correções de infraestrutura
- Redirect de `/app` descartava a query string (`return` no nginx não anexa `$is_args$args`), e o código do OAuth sumia — **quebrava login por email e com Google**, em silêncio.
- Spinner infinito após deploy: `index.html` sem `Cache-Control` + chunks antigos apagados. Corrigido com `no-cache` no HTML e `lazyWithReload()` nas rotas.
- Laço de redirecionamento `/login ↔ /app` quando o backend recusava a sessão.
- Headers de segurança por `location` (o `add_header` do nginx não é herdado por bloco que declara o seu); `/api/` saía com dois `X-Frame-Options` conflitantes.
- Página 404 própria e `server_tokens off`.
- `deploy-static.sh` deixou de reinstalar a config do nginx quando ela não mudou — antes derrubava o HTTPS a cada deploy.


## 2026-07 — Lançamento: billing, escala do scraper e admin

### Cobrança (pagamento único)
- Modelo mudou de assinatura recorrente para **pagamento único de 30 dias** (paga → 30 dias → volta pro Free). Migration `0010` (`PlanExpiresAt`); worker rebaixa os expirados; checkout detecta o tipo do preço em runtime (recorrente→assinatura, único→payment). **Sem cancelamento e sem downgrade** na UI.
- Lógica de decisão PURA e testada em `services/billingLogic.js` (`backend/test/billing.test.js`).
- Página **Assinatura** reformulada: histórico de pagamentos (estatísticas + filtros + tabela, via *charges*), planos em destaque com histórico minimizável, **contador de dias restantes**.

### Scraper (escala + custo)
- **Pool de contas Apify** com rotação/fallback automático do crédito grátis (`services/apifyPool.js`): usa uma conta por vez e pula quando o crédito esgota. `APIFY_TOKEN_2..5`.
- Robôs por perfil (suporte/QA/dev) — `seed-robots-roles.mjs`.
- Fila: `enqueue` em **lote** (corrige travamento do auto-envio) e `boss.send` **sequencial** (corrige 500 por estouro do pool de conexões).

### Admin
- Aba **Relatório**: gasto real da Apify (via API) × vagas coletadas, custo por vaga e projeção.
- Card **Contas Apify** com uso real (US$/mês por conta). Feedback ao rodar robôs (polling + indicador "rodando").
- Aba **Campanhas** (email marketing): envio espaçado (60–120s, teto diário), **descadastro** + header `List-Unsubscribe`, envio via **Resend** (domínio autenticado) com fallback Gmail. Migration `0011`.

### Segurança
- Headers nos sites estáticos (`render.yaml`); logout purga o token do cache; mensagem de signup genérica (anti-enumeração); `/ranking` abrevia o nome; `/jobs/:id` oculta a descrição no plano free.

### Matching
- Classificação de área extraída p/ `services/classify.js`, mais robusta (QA ≠ Dev). Vaga **sem skills e off-target não dispara auto-envio** (corrige o "email pra vaga de motorista").

### Landing / SEO
- Toggle **PT/EN**; SEO completo (meta description, Open Graph, JSON-LD, `sitemap.xml`, `robots.txt`, `og-image`); link da **comunidade no WhatsApp**.

### Docs
- `DEPLOY.md` atualizado (migrations `0001→0011`, `APIFY_TOKEN_2..4`, `RESEND_API_KEY`, preços one-time). Removidos `HANDOFF.md` e `backend/README.md` (obsoletos).

## 2026-06 — Pós-feedback de beta

- **Sessão caindo:** `request()` trata 401 refrescando a sessão do Supabase e repetindo a chamada uma vez — não desloga mais quando o access token expira mas o refresh ainda é válido.
- **Matching por área profissional:** vagas filtradas pelo CARGO, não só skills/senioridade (um QA não recebe mais vaga de Desenvolvedor). Campo "Área profissional" no perfil (Dev/QA/PO/Data/Design/DevOps/Mobile — migration `0009`); heurística `detectArea` classifica a vaga pelo título/skills; vazio = todas as áreas.
- **Auto-send com piso de match:** envio automático só dispara em vagas com match ≥ 50% (seleção manual ignora o corte).
- **Título genérico no email:** quando a vaga não tem cargo claro ("Vaga"/vazio), o assunto deixa de ser "Candidatura para Vaga" e passa a usar a área do usuário (ou headline) → "Candidatura para QA na Empresa".
- **Anti duplo-clique:** travas síncronas (useRef) + feedback nos botões de envio de vagas, upload de CV, import do LinkedIn, conectar/desconectar Google e email de teste.

## 2026-06 — Sprint de pré-lançamento

### Performance / percepção de velocidade
- Cache **stale-while-revalidate** em todas as telas (Dashboard, Candidaturas, Perfil, Feedback, Assinatura): ao voltar para uma aba já visitada, o conteúdo aparece na hora e revalida em segundo plano.
- **Code-splitting por rota** (`React.lazy`) + chunks de vendor estáveis (react/supabase) → primeiro paint mais leve.
- **Prefetch no hover** do menu (aquece chunk + dados da rota antes do clique).
- Backend: `/dashboard` paraleliza ~9 queries com `Promise.all`; `getMatches` filtra "sem email"/"já candidatada" no SQL (não traz a tabela inteira de Jobs à memória). Migration `0006` adiciona índices em `Jobs`.

### Scraper, IA e automação (robôs)
- **IA em cadeia de provedores** (`AI_PROVIDER_ORDER`, default `groq,openai`): tenta na ordem, cada um com circuit breaker próprio; fallback regex. `npm run test:ai` testa cada provedor isolado.
- **Importador** (`npm run import:jobs`): semeia Jobs + Recrutadores de um export JSON (sem IA/Apify); upsert por `JobHash` com backfill de descrição (`post_content`), sem duplicar.
- **Cadência de monitoramento**: `Recruiters` ganha `LastCheckedAt`/`CheckCount`/`Source` (migration `0007`); monitoramento `saved` rotaciona os recrutadores mais obsoletos. UI mostra "visto há X".
- **Robôs agendados** (migration `0008` + agendador no worker): tabela `ScraperSchedules`, tela Admin → Bots para criar/ativar/pausar/excluir (inclusive **em massa**), "rodar agora" e cadência.
- **Gerador de robôs** (`npm run seed:robots`): um robô por stack × nível × região, com queries **naturais extraídas de posts reais** ("Vaga para Desenvolvedor PHP Pleno"); flags `--commit/--reset/--br-only/--global-only/--maxPosts/--queries`; imprime estimativa de custo Apify.
- Fix: Apify aceita no máx. 10 `authorUrls` por execução → fatiamento automático em lotes (corrige o crash do cron). Seletor de recrutadores mostra todos (com filtro de status); `contentType=all` desliga a tag "jobs".

### Segurança
- Removido o fallback de **admin aberto** quando `ADMIN_EMAILS` vazio (qualquer logado virava admin) — agora allowlist de email ou `Users.Role='admin'`.
- `/jobs/matches` e `/jobs` **não devolvem mais o email de contato** (envio é server-side); plano free também oculta a descrição → evita coletar contatos sem usar a plataforma.
- Teto de 1 MB no corpo JSON; rate-limit estrito em `/admin/scraper/run` (custo Apify) e `/profile/import-linkedin` (parse de PDF).

### Assinatura / planos
- Corrigido o redirect do checkout (ia para `/app/perfil`, agora `/app/assinatura`).
- Novo `GET /billing/subscription`: status, renovação, cancelamento e **contagem de dias** do ciclo na UI.
- Usuário pago não vê mais "Assinar" em outro plano (criava 2ª assinatura) — troca/cancelamento vão pelo portal do Stripe.

### Paginação
- **Candidaturas** e **Admin → Vagas** paginadas (antes carregavam tudo / limitavam a 200 sem navegação).

### Landing, documentação e domínio
- Landing **funcional** (`pages/index.html`): CTAs navegam para o app; detecta o domínio (`landing.newdevjobs.xyz` → apex `newdevjobs.xyz`), com fallback para o Render.
- Páginas novas: **documentação do usuário**, **Termos de Uso** e **Política de Privacidade** (com disclosure de Uso Limitado das APIs Google) + `base.css` compartilhado.
- `render.yaml`: serviço estático `newdevjobs-site` publicando `pages/` (a landing não era deployada).
- Favicon (app + site). `SETUP_GOOGLE.md` com seção de produção (redirect, env, verificação do escopo restrito `gmail.send`).

### Design
- Modo claro menos estourado (mais profundidade entre fundo e cards).
- `.page` mais largo (1240px) — menos espaço lateral vazio no desktop.
- Navbar recolhida: logo/botão/ações do rodapé centralizados.

### Limpeza
- Removidos `database.js` (SQLite legado) e `pages/teste.html` (portfólio pessoal sem relação) + dependência `better-sqlite3`.
- README reescrito cobrindo arquitetura, scripts, robôs, IA, migrations, segurança e deploy.
