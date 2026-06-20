# Changelog

Registro das alterações relevantes. Datas no formato AAAA-MM-DD.

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
