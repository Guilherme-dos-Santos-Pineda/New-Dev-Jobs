// Cliente HTTP central. O token vem da sessão do Supabase.
import { supabase } from './lib/supabase.js';

// Em dev o Vite faz proxy de /api → :3001 (VITE_API_URL vazio).
// Em produção, defina VITE_API_URL com a URL do serviço da API (ex.: https://newdevjobs-api.onrender.com).
const API_BASE = import.meta.env.VITE_API_URL || '';

async function authHeader() {
    if (!supabase) return {};
    const { data } = await supabase.auth.getSession();
    return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

async function request(method, path, body, { isForm } = {}) {
    const headers = { ...(await authHeader()) };

    let payload;
    if (isForm) {
        payload = body; // FormData — browser define o Content-Type
    } else if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        payload = JSON.stringify(body);
    }

    const res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: payload });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
        const err = new Error(data?.error || `Erro ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return data;
}

// Classifica um erro do request(): distingue "não autenticado" de "backend indisponível".
// - 401/403            → sessão recusada pelo backend → 'unauthorized'
// - sem status (TypeError de rede) ou 5xx → servidor fora/inacessível → 'unreachable'
export function classifyApiError(err) {
    const status = err?.status;
    if (status === 401 || status === 403) return 'unauthorized';
    return 'unreachable';
}

export const api = {
    // auth (identidade vem do Supabase; aqui só dados do app)
    me: () => request('GET', '/auth/me'),
    googleAuthUrl: () => request('GET', '/auth/google/url'),
    disconnectGoogle: () => request('POST', '/auth/disconnect-google'),
    updateSettings: (data) => request('PUT', '/auth/settings', data),

    // email de teste
    sendTestEmail: (to) => request('POST', '/email/test', { to }),

    // templates
    getTemplate: (lang = 'pt') => request('GET', `/templates?lang=${lang}`),
    saveTemplate: (data) => request('PUT', '/templates', data),
    resetTemplate: (lang = 'pt') => request('POST', '/templates/reset', { lang }),
    previewApplication: (data) => request('POST', '/applications/preview', data),

    // profile
    getProfile: () => request('GET', '/profile'),
    updateProfile: (data) => request('PUT', '/profile', data),
    resetProfile: () => request('POST', '/profile/reset'),
    uploadCv: (file) => {
        const fd = new FormData();
        fd.append('cv', file);
        return request('POST', '/profile/cv', fd, { isForm: true });
    },
    importLinkedin: (file) => {
        const fd = new FormData();
        fd.append('pdf', file);
        return request('POST', '/profile/import-linkedin', fd, { isForm: true });
    },

    // jobs
    getJobs: (params = {}) => {
        const qs = new URLSearchParams(
            Object.entries(params).filter(([, v]) => v !== '' && v != null)
        ).toString();
        return request('GET', `/jobs${qs ? `?${qs}` : ''}`);
    },

    // applications
    getApplications: () => request('GET', '/applications'),
    apply: (jobId) => request('POST', '/applications', { jobId }),

    // jobs matches + fila de envio
    getMatches: () => request('GET', '/jobs/matches'),
    queueStart: (mode, jobIds) => request('POST', '/queue', { mode, jobIds }),
    queueStatus: () => request('GET', '/queue'),
    queueStop: () => request('POST', '/queue/stop'),

    // admin
    adminOverview: () => request('GET', '/admin/overview'),
    adminGetSources: () => request('GET', '/admin/sources'),
    adminAddSource: (url, label) => request('POST', '/admin/sources', { url, label }),
    adminToggleSource: (id, active) => request('PATCH', `/admin/sources/${id}`, { active }),
    adminDeleteSource: (id) => request('DELETE', `/admin/sources/${id}`),
    // bots / scraper
    adminRecruiters: (status) => request('GET', `/admin/recruiters${status ? `?status=${status}` : ''}`),
    adminUpdateRecruiter: (id, status) => request('PATCH', `/admin/recruiters/${id}`, { status }),
    adminRunScraper: (type, params) => request('POST', '/admin/scraper/run', { type, params }),
    adminScraperRuns: () => request('GET', '/admin/scraper/runs'),

    // billing / planos
    getPlans: () => request('GET', '/billing/plans'),
    getUsage: () => request('GET', '/billing/me'),
    setPlan: (plan, userId) => request('POST', '/billing/set-plan', { plan, userId }),
    checkout: (plan) => request('POST', '/billing/checkout', { plan }),
    billingHistory: () => request('GET', '/billing/history'),
    billingPortal: () => request('POST', '/billing/portal'),

    // stats
    getStats: () => request('GET', '/stats'),

    // ranking
    getRanking: () => request('GET', '/ranking'),

    // feedback
    getFeedback: (limit) => request('GET', `/feedback${limit ? `?limit=${limit}` : ''}`),
    postFeedback: (data) => request('POST', '/feedback', data),
    updateFeedback: (id, data) => request('PUT', `/feedback/${id}`, data),
    deleteFeedback: (id) => request('DELETE', `/feedback/${id}`),
};
