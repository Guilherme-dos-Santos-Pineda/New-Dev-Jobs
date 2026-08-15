# Recuperação — voltar o newdevjobs ao ar

Diagnóstico feito em **09/08/2026**, com o sistema fora do ar. Siga **na ordem**:
os passos dependem uns dos outros e o passo 1 bloqueia todo o resto.

## Estado encontrado

| Componente | Status | Evidência |
|---|---|---|
| **Supabase** (banco/auth/storage) | ❌ **pausado** | pooler responde `XX000: tenant/user postgres.<ref-do-projeto> not found` |
| API (Render) | ❌ fora | `HTTP 503` em `/api/health` |
| App — `newdevjobs.xyz` | ❌ fora | `HTTP 503` |
| Landing — `landing.newdevjobs.xyz` | ❌ fora | `HTTP 503` |
| Domínio (DNS) | ✅ **ok** | resolve e chega no Render (503 é do Render, não NXDOMAIN) |

**Leitura:** o domínio está saudável — o que caiu foi a infra. E o Google não te
encontra porque **todas as páginas devolvem 503** há tempo demais: o crawler
tenta, recebe erro, e após semanas remove do índice. Não é penalidade nem falta
de meta tag (o SEO on-page está correto); é ausência de conteúdo servido.

> **Por que o banco pausou:** projeto Supabase no plano free **pausa após ~7 dias
> sem atividade**. Ao tirar o SaaS do ar, o banco parou de receber tráfego e
> pausou sozinho. O erro *"tenant not found"* é a assinatura disso.

---

## 1. Restaurar o Supabase ⛔ bloqueia todo o resto

**Só você pode fazer** (exige login na sua conta).

1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard)
2. Abra o projeto correspondente (o ref está na sua `SUPABASE_URL`; região `sa-east-1`)
3. Clique em **Restore** / **Resume project** e aguarde (leva alguns minutos)

⏳ **Prazo importante:** projetos pausados são **retidos por ~90 dias**; depois os
dados podem ser removidos definitivamente. Se o botão de restaurar não aparecer,
o projeto foi excluído — nesse caso veja *1b*.

**Como confirmar que voltou** (rode e espere `Postgres 15.x`):

```bash
node -e "const p=require('postgres');const s=p(process.env.DATABASE_URL,{ssl:'require',prepare:false,max:1});s\`select version()\`.then(r=>console.log('OK',r[0].version)).catch(e=>console.log('FALHOU',e.message)).finally(()=>s.end())"
```

### 1b. Se o projeto foi excluído (sem volta)

Você perdeu os dados, mas o sistema é recriável:
1. Crie um projeto Supabase novo (região `sa-east-1`)
2. Aplique as migrations **em ordem**: `supabase/migrations/0001…` até a última
   (`node backend/scripts/apply-migration.mjs supabase/migrations/<arquivo>.sql`)
3. Crie o bucket **privado** `cvs` em Storage
4. Atualize `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` e
   `SUPABASE_SERVICE_ROLE_KEY` (as chaves antigas não servem no projeto novo)
5. Repopule vagas com `npm run import:jobs` ou rode uma descoberta pelo /admin

---

## 2. Subir a infra no Render (agora grátis)

O `render.yaml` foi reescrito: **1 serviço Node no plano free + 2 estáticos**,
em vez dos 5 anteriores. Antes eram ~US$14/mês; agora **US$ 0**.

1. No Render, **delete** os serviços antigos `newdevjobs-worker` e
   `newdevjobs-scraper` — o worker agora roda dentro da API e o cron virou
   redundante (ver `render.yaml`).
2. Blueprint → **Sync** para aplicar o `render.yaml` novo.
3. No env group `newdevjobs-secrets`, confira/adicione:
   - `RUN_WORKER=true` — faz a API processar a fila no mesmo processo
   - `DATABASE_URL` — **mantenha na porta 5432** (session mode). O backend deriva
     sozinho a porta 6543 para as queries; não troque na mão.
4. Deploy e confira `https://newdevjobs-api.onrender.com/api/health` → `{"ok":true}`
5. **Nos logs deve aparecer `🤖 worker ativo (embutido na API)`** — é a prova de
   que os envios vão sair. Sem essa linha, a fila fica parada.

⚠️ **O free tier dá 750 horas-instância/mês no total.** Um serviço acordado 24/7
gasta ~730h. Cabe, mas só para **um** serviço Node free — não crie um segundo.

---

## 3. Keep-alive (obrigatório, não opcional)

No plano free o serviço **dorme após ~15 min sem request**. Como o worker vive
dentro da API, dormir significa **envios parados e robôs sem disparar** — não é
só a lentidão do primeiro acesso.

1. GitHub → **Settings → Secrets and variables → Actions → New repository secret**
2. `API_URL` = `https://newdevjobs-api.onrender.com` (sem barra no final)
3. Aba **Actions** → *keep-alive* → **Run workflow** para testar na hora

---

## 4. 🔴 Robôs de coleta — o verdadeiro problema de custo

O banco foi restaurado com **todos os dados intactos** (12 usuários, 4.166 vagas,
2.565 recrutadores). Mas a auditoria revelou algo mais grave que o custo do Render:

| Métrica | Valor |
|---|---|
| Robôs ativos | **305**, quase todos a cada 24h |
| Runs tentados | **~311/dia ≈ 9.330/mês** |
| Runs `failed` | **12.887** |
| Runs `done` | 653 |
| Último run **bem-sucedido** | **08/07/2026** |

**Causa das falhas** (agrupada de `ScraperRuns.Error`):

```
8.515x  Todas as contas Apify estão sem crédito este mês
4.358x  Monthly usage hard limit exceeded
```

**Leitura:** 305 robôs diários consomem ordens de grandeza mais crédito do que as
4 contas Apify gratuitas fornecem. O crédito estourava, tudo passava a falhar, e
**o scraper estava efetivamente morto desde 08/07** — semanas antes de você tirar
o sistema do ar. Ou seja: o produto já não coletava vagas novas havia um bom
tempo. Isso pesa tanto quanto o pool do banco na sensação de "não aguentava".

### 4.1 Avalanche no primeiro boot (já corrigido no código)

Os 305 robôs estão **todos vencidos** (o mais antigo desde 31/07). O agendador
reivindicava *todos os vencidos de uma vez*, então o primeiro boot dispararia
**305 runs simultâneos** e torraria qualquer crédito na hora.

Corrigido em `backend/worker.js`: o agendador agora reivindica no máximo
`SCHEDULER_MAX_PER_TICK` (padrão **3**) por tick de 60s, com `for update skip
locked`. Nada a fazer — só não aumente esse valor sem refazer a conta de crédito.

### 4.2 Redimensionar (script pronto) ⬅️ **execute isto**

O orçamento real saiu do histórico, não de estimativa: o melhor mês pagou
**457 runs `done`** (jul/2026, contra 9.116 `failed`). Esse é o teto das contas free.

**Configuração escolhida:** 12 robôs diários (5 stacks BR × Júnior/Pleno + os 2 de
recrutadores salvos) = **~360 runs/mês**, ~21% abaixo do teto, mantendo
atualização diária.

```bash
node backend/scripts/rightsize-robots.mjs --stacks="Frontend,Backend,Fullstack,Java,Python" --interval=1440 --commit
```

Rode **sem** `--commit` primeiro para revisar (é o padrão do script). Ele desativa
em vez de apagar; `--restore --commit` reverte tudo.

> Não executei: a escrita em produção ficou bloqueada pelo classificador de
> permissões, o que aliás coincide com a regra do `CLAUDE.md` (*escrita em prod é
> feita pelo dono*). **Enquanto não rodar, os 305 robôs seguem ativos** — o teto
> por tick evita a avalanche, mas o crédito ainda estoura.

### 4.3 Outras opções, se quiser calibrar diferente

**Isto é uma escolha de produto e o número atual não é sustentável.** O histórico
prova que ~9.330 runs/mês não cabem em 4 contas free. Alternativas:

**(a) Menos robôs, mesma frequência** — mantenha só os de maior retorno:

```sql
-- Desativa tudo e reativa apenas os robôs "BR" de stacks principais (~40).
update "ScraperSchedules" set "Active" = false;
update "ScraperSchedules" set "Active" = true
where "Name" like '%· BR' and "Type" = 'monitoring'
  and split_part("Name", ' · ', 1) in
      ('Java','Python','React','Node.js','TypeScript','Frontend','Backend','Fullstack','QA','Dados');
```

**(b) Mesmos robôs, muito menos frequência** — de diário para ~quinzenal:

```sql
update "ScraperSchedules" set "IntervalMinutes" = 20160 where "Active" = true; -- 14 dias
```

**(c) Assinar o Apify** — se a coleta é o core do produto, um plano pago pode
fazer mais sentido que cortar cobertura. Aí o gargalo deixa de ser crédito.

Depois de escolher, **espalhe os disparos** para não concentrar tudo num dia:

```sql
update "ScraperSchedules"
set "NextRunAt" = now() + (random() * interval '14 days')
where "Active" = true;
```

> Seguindo o `CLAUDE.md` do projeto (*"escrita em prod é feita pelo dono"*), **não
> rodei nenhum desses comandos** — a escolha e a execução são suas.

### 4.4 Bug menor observado

4 runs falharam com `input.authorUrls must NOT have more than 10 items`, apesar
de o `runMonitoring` já fatiar em lotes de 10. Sugere um caminho de código que
escapa do fatiamento. Baixo impacto perto do resto, mas vale investigar depois.

---

## 5. Reindexar no Google

Só depois de **tudo respondendo 200**. Pedir indexação com o site fora do ar
gasta o rastreio à toa.

1. Confirme `curl -I https://landing.newdevjobs.xyz` → **200** (não 503)
2. Search Console → **Sitemaps** → enviar `sitemap.xml`
3. **Inspeção de URL** → cada página → **Solicitar indexação**
   (`/`, `/docs.html`, `/termos.html`, `/privacidade.html`)
4. Acompanhe em **Páginas** por 1–2 semanas

⏳ Reindexação leva **de dias a ~2 semanas**. Como o site ficou meses em 503, a
recuperação é gradual — não espere voltar ao índice no dia seguinte.

---

## 6. Decisão pendente: landing no domínio raiz

Hoje a arquitetura de domínios está **invertida para SEO**:

| URL | Serve hoje | Problema |
|---|---|---|
| `newdevjobs.xyz` (raiz) | **app React (SPA)** | é o domínio mais forte, mas serve uma casca JS sem conteúdo indexável |
| `landing.newdevjobs.xyz` | **landing (conteúdo real)** | todo o conteúdo que ranqueia está num subdomínio, que herda menos autoridade |

O padrão recomendado é o inverso: **landing na raiz** e **app em `app.newdevjobs.xyz`**.

**Este é o melhor momento possível para trocar** — o site já está fora do ar, então
não há tráfego a perder nem redirecionamento a quebrar. Fazer depois de reindexar
significaria jogar fora o trabalho de indexação e recomeçar.

**Não apliquei sozinho** porque a troca mexe no seu fluxo de login e exige ações
suas em 3 painéis externos (Google Cloud, Supabase Auth, DNS). Se quiser seguir:

- Código: `canonical`, `og:url`, `sitemap.xml`, `robots.txt` em `pages/` + `FRONTEND_URL`
- Google Cloud Console → OAuth → *Authorized redirect URIs*
- Supabase → Authentication → **Site URL** e *Redirect URLs*
- DNS/Render → domínios customizados + **301** de `landing.` para a raiz

Me peça e eu preparo o diff completo.

---

## 7. Segurança — rotacionar chaves

O arquivo `newdevjobs-secrets.env` (Downloads) contém **chaves de produção
LIVE**. Ele saiu do cofre e circulou fora dele.

**Rotacione, por ordem de risco:**

| Chave | Risco se vazar | Onde rotacionar |
|---|---|---|
| `STRIPE_SECRET_KEY` (`sk_live_…`) | 🔴 movimentar dinheiro real | Stripe → Developers → API keys → *Roll key* |
| `SUPABASE_SERVICE_ROLE_KEY` | 🔴 ignora RLS: lê/apaga **todos** os dados | Supabase → Settings → API |
| `DATABASE_URL` (senha) | 🔴 acesso total ao banco | Supabase → Settings → Database → *Reset password* |
| `OPENAI_API_KEY`, `GROQ_API_KEY` | 🟠 gasto na sua conta | painel de cada provedor |
| `APIFY_TOKEN`(+2,3,4), `RESEND_API_KEY` | 🟠 gasto/envio em seu nome | painel de cada provedor |
| `GOOGLE_CLIENT_SECRET` | 🟠 falsificar o fluxo OAuth | Google Cloud → Credenciais |

**Depois de rotacionar**, atualize o env group do Render e redeploy.

**Higiene:** apague o `.env` do Downloads quando terminar. O `.gitignore` agora
cobre `*.env` (antes **não** cobria — um arquivo com esse nome dentro do repo
teria sido commitado).
