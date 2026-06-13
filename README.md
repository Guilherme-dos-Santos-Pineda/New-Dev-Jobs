# newdevjobs

SaaS de **candidaturas automáticas** para devs: monitora vagas de recrutadores,
calcula match com o perfil do usuário e envia o currículo por email.

## Arquitetura

```
index.html            # landing page (marketing)
scraper.js            # coletor de vagas do LinkedIn (Apify) -> jobs.db
backend/              # API REST (Express + SQLite)  — porta 3001
frontend/             # app/dashboard (React + Vite) — porta 5173
jobs.db               # banco SQLite (Jobs, Users, Profiles, Applications)
uploads/              # currículos enviados (PDF)
```

## Como rodar (2 terminais)

**1) Backend**
```bash
npm install
npm start            # http://localhost:3001  (API)
```

**2) Frontend**
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173  (app)
```

O Vite faz proxy de `/api` para o backend, então basta abrir
**http://localhost:5173**, entrar com o login de desenvolvimento (mock) e usar.

## Fluxo do usuário

1. **Login** (mock — nome + email).
2. **Perfil**: skills, senioridade, modalidade, pretensão e upload do CV (PDF).
3. **Conectar Google** (mock nesta fase).
4. **Vagas**: lista ordenada por match; candidatar gera e "envia" o email.
5. **Dashboard / Candidaturas**: acompanhamento e histórico.

## Envio real (Google OAuth + Gmail)

O envio de email é **real** quando você configura as credenciais do Google
(`.env`). Sem elas, roda em **modo mock** (loga no console) e o app continua
utilizável. Passo-a-passo em [`backend/SETUP_GOOGLE.md`](backend/SETUP_GOOGLE.md).

- Escopo usado: `gmail.send` (somente envio).
- O email é montado a partir do **template** do usuário (assunto + corpo com
  variáveis) e leva o **currículo em anexo**.
- Em **Configurações**, o usuário escolhe **revisar antes** (preview + confirmar)
  ou **envio automático**, edita o template e conecta/desconecta o Google.

## Status / mocks

- **Auth do app**: login mock por Bearer token (`dev.<id>`). → trocar por sessão real.
- **Envio**: real via Gmail quando configurado; mock caso contrário.
- **Vagas**: vêm do `scraper.js` (Apify). Rode `npm run scrape` para atualizar.

Detalhes da API em [`backend/README.md`](backend/README.md).
