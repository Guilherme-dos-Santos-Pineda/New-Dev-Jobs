# newdevjobs — API backend

API REST (Express + SQLite) que sustenta o SaaS de candidaturas automáticas.

## Rodar

```bash
npm start        # sobe a API em http://localhost:3001
npm run dev      # idem, com --watch (reinicia ao salvar)
npm run scrape   # roda o coletor de vagas do LinkedIn (Apify) -> jobs.db
```

## Autenticação (MOCK de desenvolvimento)

Faça login com `POST /api/auth/dev-login` e use o `token` retornado em todas as
chamadas:

```
Authorization: Bearer dev.<userId>
```

> Em produção isto será substituído pelo Google OAuth real (escopo `gmail.send`).

## Endpoints

### Auth
| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/auth/dev-login` | `{name,email}` → cria/loga usuário, retorna `{token,user}` |
| GET  | `/api/auth/me` | usuário atual + `googleConfigured` |
| GET  | `/api/auth/google/url` | URL de consentimento OAuth (frontend redireciona) |
| GET  | `/api/auth/google/callback` | callback do Google → guarda tokens e volta ao app |
| POST | `/api/auth/disconnect-google` | revoga e desconecta |
| POST | `/api/auth/connect-google` | conexão mock (só quando OAuth não configurado) |
| PUT  | `/api/auth/settings` | `{sendMode: 'review'\|'auto'}` |
| POST | `/api/auth/logout` | no-op |

### Templates de email
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/templates?lang=pt` | template do usuário (ou padrão) + variáveis |
| PUT | `/api/templates` | `{lang,subject,body}` salva o modelo |
| POST | `/api/templates/reset` | `{lang}` volta ao padrão |

Variáveis: `{job_title} {company} {sender_name} {contact_info} {whatsapp_link}
{linkedin_link} {github_link} {portfolio}` — renderizadas em HTML (links clicáveis) e texto.

### Perfil
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/profile` | perfil do usuário |
| PUT | `/api/profile` | dados + contato + **filtros** (`requiredKeywords[]`, `blockedWords[]`, `blockedDomains[]`, `levels[]`, `strictLevel`, `postingDays`) |
| POST | `/api/profile/reset` | volta as configurações ao padrão (mantém o CV) |
| POST | `/api/profile/cv` | upload do currículo para anexo (multipart `cv`, PDF até 5MB) |

> **Filtros de vaga:** aplicados em `GET /api/jobs` (keywords obrigatórias,
> palavras/domínios bloqueados, data de postagem, nível estrito). A resposta traz
> `filteredOut` (quantas foram ocultadas); `?ignoreFilters=1` lista todas.
| POST | `/api/profile/import-linkedin` | extrai dados do PDF do LinkedIn (multipart `pdf`) → `{extracted}` (não salva) |

> **Import do LinkedIn:** `services/pdfText.js` (unpdf, preservando quebras de
> linha via `hasEOL`) + `services/linkedinParser.js` (heurística do layout do
> LinkedIn — sem IA). Extrai nome, headline, senioridade, skills e contatos.
> O PDF fica só em memória e **não** é o currículo anexado nos emails.

### Vagas
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/jobs?search=&minScore=&sort=match\|recent` | lista com `matchScore` por usuário |
| GET | `/api/jobs/:id` | detalhe da vaga |

### Candidaturas
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/applications` | candidaturas do usuário |
| POST | `/api/applications` | `{jobId}` → gera email + "envia" (mock) e registra |

Pré-requisitos para candidatar: Google conectado, perfil criado, CV enviado e vaga com email.

### Procurar vagas & fila de envio
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/jobs/matches` | vagas candidatáveis (filtros + com email + não enviadas) |
| POST | `/api/queue` | `{mode:'auto'\|'manual', jobIds?}` enfileira envios. `manual` exige plano pago (402 no free) |
| GET | `/api/queue` | progresso da fila (sent/pending/failed, próximo em N s) |
| POST | `/api/queue/stop` | cancela os envios pendentes |

> **Intervalo entre envios:** 60–120s (anti-bloqueio do Gmail). Em dev, defina
> `SEND_INTERVAL_MS` no ambiente (ex.: `SEND_INTERVAL_MS=3000`) para acelerar testes.
> O scheduler roda dentro do processo do servidor.

### Stats
| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/stats` | totais do dashboard (vagas, enviadas, limite diário, match médio, recentes) |

## Matching

`backend/services/matching.js` calcula a compatibilidade 0–100:
**80% sobreposição de skills + 20% proximidade de senioridade.**

## Envio de email

`backend/services/mailer.js` é um **mock** (apenas loga no console). Ponto de
troca para a integração real com a Gmail API.

## Estrutura

```
backend/
  server.js            # app Express
  db.js                # SQLite + schema (Users, Profiles, Jobs, Applications)
  middleware/auth.js   # auth mock por Bearer token
  routes/              # auth, profile, jobs, applications, stats
  services/            # matching, mailer
scraper.js             # coletor de vagas (Apify) — gera jobs.db
```
