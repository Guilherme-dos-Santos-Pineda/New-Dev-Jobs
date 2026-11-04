// =========================
// Motor de matching perfil x vaga
// =========================

import { detectArea, nivelDaVaga, areaForaDeTI } from './classify.js';
import { expandirAreas, AREAS_FORA_DE_TI } from '../config/areas.js';

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

/**
 * Calcula a compatibilidade (0-100) entre o perfil do usuário e uma vaga.
 * Combina sobreposição de skills (peso maior) com proximidade de senioridade.
 */
export function computeMatch(profile, job) {
    const userSkills = parseSkills(profile?.Skills).map((s) => s.toLowerCase());
    const jobSkills = parseSkills(job?.Skills);

    let skillScore = 50; // neutro (usada só quando o usuário não declarou skills)
    const matched = [];
    const missing = [];

    if (jobSkills.length > 0) {
        for (const skill of jobSkills) {
            if (userSkills.includes(skill.toLowerCase())) matched.push(skill);
            else missing.push(skill);
        }
        skillScore = Math.round((matched.length / jobSkills.length) * 100);
    } else if (userSkills.length) {
        // Vaga SEM skills declaradas: mede a relevância pelo TEXTO (título+descrição).
        // Se nenhuma skill do usuário aparece, é provavelmente off-target (ex.: vaga de
        // motorista para um dev) → score BAIXO, não o neutro 50 (que dispararia o
        // auto-envio ≥50%). Limite de palavra evita "go" casar "governo".
        const text = `${job?.JobTitle || ''} ${job?.Description || ''}`.toLowerCase();
        const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const hits = userSkills.filter((s) => {
            if (s.length < 2) return false;
            const re = /[^a-z0-9]/.test(s) ? new RegExp(esc(s)) : new RegExp(`\\b${esc(s)}\\b`);
            return re.test(text);
        });
        for (const s of hits) matched.push(s);
        skillScore = hits.length > 0 ? Math.min(100, 45 + hits.length * 15) : 15;
    }

    // Áreas de fora de TI (opt-in): a compatibilidade não pode depender das skills.
    // O dicionário delas é de tecnologia, então quem é de vendas sairia com ~15% e
    // nada passaria do corte de 50%. Ter marcado a área é o sinal que existe.
    const userAreasCruas = parseSkills(profile?.Areas).map((a) => a.toLowerCase());
    const areaFora = userAreasCruas.some((a) => AREAS_FORA_DE_TI.includes(a)) ? areaForaDeTI(job || {}) : null;
    const foraEscolhida = areaFora && userAreasCruas.includes(areaFora) ? areaFora : null;
    if (foraEscolhida) skillScore = Math.max(skillScore, 60);

    // Ajuste por senioridade (múltiplos níveis aceitos).
    // O nível vem do TÍTULO (nivelDaVaga), igual ao filtro. Lendo título +
    // descrição, "Analista de TI Sênior / Desenvolvedor Back-end Jr" e
    // "Desenvolvedor GenAI Pleno" com "júnior" no texto davam 100% para um
    // estagiário (caso real, 02/11/2026).
    let seniorityScore = 75;
    let acimaDoNivel = 0; // quantos degraus a vaga está ACIMA do nível mais alto escolhido
    const levels = parseSkills(profile?.Levels).map((l) => l.toLowerCase());
    const jobSen = job?.Level !== undefined ? job.Level : nivelDaVaga(job || {});
    if (levels.length && jobSen) {
        if (levels.includes(jobSen)) seniorityScore = 100;
        else {
            // proximidade ao nível mais próximo selecionado
            const jr = SENIORITY_RANK[jobSen];
            const diffs = levels.map((l) => Math.abs((SENIORITY_RANK[l] ?? jr) - jr));
            seniorityScore = Math.max(40, 100 - Math.min(...diffs) * 25);
            acimaDoNivel = Math.max(0, jr - Math.max(...levels.map((l) => SENIORITY_RANK[l] ?? jr)));
        }
    }

    // Skills pesam 80%, senioridade 20%
    let score = Math.round(skillScore * 0.8 + seniorityScore * 0.2);

    // Vaga acima do nível não pode parecer feita para a pessoa: com peso de 20%,
    // um sênior para quem é júnior ainda dava 90%. Um degrau acima (júnior x
    // pleno) fica abaixo de "ótimo"; dois ou mais, abaixo do corte de 50% do
    // envio automático.
    if (acimaDoNivel === 1) score = Math.min(score, 60);
    else if (acimaDoNivel >= 2) score = Math.min(score, 35);

    // Penalidade de ÁREA (defesa em profundidade): se o usuário declarou áreas e a
    // vaga é de outra área identificável (≠ 'other'), cross-área nunca pode parecer
    // um match alto — ex.: um QA não deve ver uma vaga de Dev como compatível. O
    // filtro (passesFilters) já descarta esses casos no feed; aqui garantimos o
    // mesmo na visão "ignorar filtros" e no ranking.
    //
    // A lista EXPANDIDA, a mesma do filtro. Comparando com a escolha crua, quem
    // marcou "dev" levava a penalidade em toda vaga "backend", e quem marcou
    // "backend" em toda vaga "dev": skills 100% viravam 25%, abaixo do corte de
    // 50% do envio automático (achado em 03/11/2026, ficou assim desde a divisão
    // da família dev em 30/09).
    const userAreas = expandirAreas(userAreasCruas);
    const jobArea = foraEscolhida || detectArea(job);
    // 'nontech' é mismatch SEMPRE — mesmo sem áreas declaradas e mesmo na visão
    // "ignorar filtros", onde passesFilters não roda. Sem isto, uma vaga de outra
    // profissão poderia aparecer ali com score alto por coincidência de palavra.
    const areaMismatch = jobArea === 'nontech'
        || (userAreas.length > 0 && jobArea !== 'other' && !userAreas.includes(jobArea));
    if (areaMismatch) score = Math.min(Math.round(score * 0.25), 30);

    return {
        score: Math.max(0, Math.min(100, score)),
        matched,
        missing,
        area: jobArea,
        areaMismatch,
    };
}
