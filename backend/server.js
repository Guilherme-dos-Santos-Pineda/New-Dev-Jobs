import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { config } from './config.js';
import { attachUser } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import jobsRoutes from './routes/jobs.js';
import applicationsRoutes from './routes/applications.js';
import statsRoutes from './routes/stats.js';
import templatesRoutes from './routes/templates.js';
import feedbackRoutes from './routes/feedback.js';
import bugsRoutes from './routes/bugs.js';
import rankingRoutes from './routes/ranking.js';
import queueRoutes from './routes/queue.js';
import emailRoutes from './routes/email.js';
import adminRoutes from './routes/admin.js';
import billingRoutes from './routes/billing.js';
import dashboardRoutes from './routes/dashboard.js';
import publicRoutes from './routes/public.js';
import { getBoss } from './lib/boss.js';
import { startWorker } from './worker.js';

const app = express();
const PORT = config.port || 3001;

app.set('trust proxy', 1); // atrás de proxy (Render) — rate-limit lê o IP real

app.use(helmet());
// CORS restrito ao frontend. Em dev o Vite faz proxy, então o Origin pode não vir;
// liberamos requests sem Origin (curl/healthcheck) e o FRONTEND_URL configurado.
app.use(cors({
    origin: (origin, cb) => cb(null, !origin || origin === config.frontendUrl),
    credentials: true,
}));

// ⚠️ Webhook do Stripe precisa do corpo CRU → registrar ANTES do express.json().
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '1mb' })); // teto de payload (anti-DoS); uploads usam multer à parte

// Rate limiting: limite geral generoso (cobre polling) + limite estrito em rotas sensíveis.
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false });
const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});
app.use('/api', apiLimiter);
app.use('/api/email', strictLimiter);                 // envio de email de teste
app.use('/api/billing/checkout', strictLimiter);      // criação de checkout
app.use('/api/billing/set-plan', strictLimiter);      // troca de plano (admin)
app.use('/api/admin/scraper/run', strictLimiter);     // dispara Apify (custo) — evita rajada
app.use('/api/profile/import-linkedin', strictLimiter); // parse de PDF (CPU)
// (o webhook do Stripe NÃO entra no strictLimiter — pode vir em rajada)

app.use(attachUser);

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'newdevjobs-api' }));

app.use('/api/public', publicRoutes); // rotas sem auth (ex.: descadastro de campanha)

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/bugs', bugsRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 404 para rotas /api desconhecidas
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Handler de erro genérico
app.use((err, _req, res, _next) => {
    console.error('Erro:', err.message);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

// RUN_WORKER=true (padrão) → a API também PROCESSA a fila, no mesmo processo.
// É o que permite rodar tudo em 1 serviço. Defina RUN_WORKER=false para voltar
// ao modelo de processos separados (`npm run worker` à parte), caso o volume
// cresça a ponto de os envios competirem com o HTTP por CPU.
const RUN_WORKER = process.env.RUN_WORKER !== 'false';

// Preenchido quando o worker embutido sobe; usado no shutdown ordenado.
let stopWorker = null;

const server = app.listen(PORT, async () => {
    console.log(`🚀 newdevjobs API rodando em http://localhost:${PORT}`);

    if (RUN_WORKER) {
        // startWorker já inicia o pg-boss (migrations + filas) internamente.
        try {
            stopWorker = await startWorker({ standalone: false });
        } catch (e) {
            // Falha no worker não derruba a API: HTTP continua servindo.
            console.error('Falha ao iniciar o worker embutido:', e.message);
        }
    } else {
        // Só enfileira; quem consome é o worker separado.
        getBoss()
            .then((boss) => console.log(boss ? '📮 Fila pg-boss pronta (envios processados pelo worker separado)' : '⚠️  pg-boss desligado (sem DATABASE_URL)'))
            .catch((e) => console.error('Falha ao iniciar pg-boss:', e.message));
    }
});

// Shutdown ordenado: para de aceitar requests, deixa as em andamento drenarem e
// só então encerra a fila — evita marcar como falha um envio que estava no meio.
const shutdown = async (sig) => {
    console.log(`\n${sig} recebido — encerrando…`);
    server.close();
    if (stopWorker) await stopWorker();
    process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
