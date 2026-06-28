// =========================
// Motor de matching perfil x vaga
// =========================

import { detectArea } from './classify.js';

function parseSkills(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        // fallback: separado por vírgula
        return String(value)
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
    }
}

const SENIORITY_RANK = {
    estagio: 0,
    junior: 1,
    pleno: 2,
    senior: 3,
    especialista: 4,
    lead: 4,
    manager: 5,
};

function seniorityFromText(text = '') {
    const t = text.toLowerCase();
    if (/gerente|\bmanager\b|\bhead\b/.test(t)) return 'manager';
    if (/tech lead|\blead\b|l[íi]der t[ée]cnico/.test(t)) return 'lead';
    if (/est[aá]gi|intern/.test(t)) return 'estagio';
    if (/j[uú]nior|junior|\bjr\b/.test(t)) return 'junior';
    if (/pleno|\bpl\b/.test(t)) return 'pleno';
    if (/s[eê]nior|senior|\bsr\b|especialista|staff|principal/.test(t)) return 'senior';
    return null;
}

/**
 * Calcula a compatibilidade (0-100) entre o perfil do usuário e uma vaga.
 * Combina sobreposição de skills (peso maior) com proximidade de senioridade.
 */
export function computeMatch(profile, job) {
    const userSkills = parseSkills(profile?.Skills).map((s) => s.toLowerCase());
    const jobSkills = parseSkills(job?.Skills);

    let skillScore = 50; // neutro quando não há skills declaradas na vaga
    const matched = [];
    const missing = [];

    if (jobSkills.length > 0) {
        for (const skill of jobSkills) {
            if (userSkills.includes(skill.toLowerCase())) matched.push(skill);
            else missing.push(skill);
        }
        skillScore = Math.round((matched.length / jobSkills.length) * 100);
    }

    // Ajuste por senioridade (múltiplos níveis aceitos)
    let seniorityScore = 75;
    const levels = parseSkills(profile?.Levels).map((l) => l.toLowerCase());
    const jobSen = seniorityFromText(`${job?.JobTitle || ''} ${job?.Description || ''}`);
    if (levels.length && jobSen) {
        if (levels.includes(jobSen)) seniorityScore = 100;
        else {
            // proximidade ao nível mais próximo selecionado
            const jr = SENIORITY_RANK[jobSen];
            const diffs = levels.map((l) => Math.abs((SENIORITY_RANK[l] ?? jr) - jr));
            seniorityScore = Math.max(40, 100 - Math.min(...diffs) * 25);
        }
    }

    // Skills pesam 80%, senioridade 20%
    let score = Math.round(skillScore * 0.8 + seniorityScore * 0.2);

    // Penalidade de ÁREA (defesa em profundidade): se o usuário declarou áreas e a
    // vaga é de outra área identificável (≠ 'other'), cross-área nunca pode parecer
    // um match alto — ex.: um QA não deve ver uma vaga de Dev como compatível. O
    // filtro (passesFilters) já descarta esses casos no feed; aqui garantimos o
    // mesmo na visão "ignorar filtros" e no ranking.
    const userAreas = parseSkills(profile?.Areas).map((a) => a.toLowerCase());
    const jobArea = detectArea(job);
    const areaMismatch = userAreas.length > 0 && jobArea !== 'other' && !userAreas.includes(jobArea);
    if (areaMismatch) score = Math.min(Math.round(score * 0.25), 30);

    return {
        score: Math.max(0, Math.min(100, score)),
        matched,
        missing,
        area: jobArea,
        areaMismatch,
    };
}
