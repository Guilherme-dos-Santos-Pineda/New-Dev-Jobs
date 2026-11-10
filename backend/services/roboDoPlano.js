import sql from '../lib/sql.js';
import { planOf } from '../config/plans.js';
import { ORDEM_NIVEIS } from '../config/niveis.js';

// =========================
// Robô de quem comprou
// =========================
// Busca vagas pelo perfil de quem tem plano ativo. É UM robô, não um por pessoa,
// e as buscas são montadas na hora de rodar:
//   - custo: um robô diário por pessoa sairia ~US$ 1,50 por mês cada, e sobram
//     ~US$ 2 por mês no crédito da Apify. Aqui o teto é CONSULTAS_POR_DIA, seja
//     qual for o número de compradores: se passar do teto, as buscas revezam.
//   - teto de runs: conta 1 no SCHEDULER_MAX_PER_DAY. Um por pessoa estouraria.
//   - plano vencido sai sozinho, e perfil editado vale na execução seguinte.
//
// A vaga encontrada entra na base comum: quem comprou recebe primeiro pelo envio
// automático, mas ela não é exclusiva.
//
// O formato `vaga <termo>` e `vaga <termo> email`, sem aspas, é o medido em
// 04/11/2026 (ver "Buscar vagas por nicho" no CLAUDE.md).

export const ROBO_DO_PLANO = 'Vagas de quem comprou';
export const CONSULTAS_POR_DIA = 8;
const AREAS_POR_PESSOA = 2;
const DIA_MS = 86400000;

const TERMO_DA_AREA = {
    frontend: 'front-end',
    backend: 'back-end',
    fullstack: 'full stack',
    dev: 'desenvolvedor',
    mobile: 'mobile desenvolvedor',
    data: 'dados',
    devops: 'devops',
    qa: 'QA',
    design: 'designer UX',
    po: 'product owner',
    erp: 'SAP',
    suporte: 'suporte TI',
    adm: 'administrativo',
    vendas: 'vendas',
    marketing: 'marketing',
    operacoes: 'logística',
    juridico: 'advogado',
};

const NIVEL_NA_BUSCA = { estagio: 'estágio', junior: 'júnior', pleno: 'pleno', senior: 'sênior' };

const lista = (v) => {
    if (Array.isArray(v)) return v;
    try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
};

/** A skill vai para a busca do LinkedIn: sem aspas nem operador, e curta. */
const termoDaSkill = (s) => String(s || '').replace(/[^\p{L}\p{N}+#. -]/gu, '').trim().slice(0, 30);

/** O nível mais baixo da pessoa: é onde falta vaga (448 sênior para 33 júnior). */
function nivelDaBusca(perfil) {
    const niveis = lista(perfil.Levels).map((n) => String(n).toLowerCase());
    const nivel = ORDEM_NIVEIS.find((n) => niveis.includes(n));
    return NIVEL_NA_BUSCA[nivel] || '';
}

/** As buscas de uma pessoa, da mais importante para a menos. */
export function consultasDoPerfil(perfil) {
    const nivel = nivelDaBusca(perfil);
    const areas = lista(perfil.Areas).map((a) => TERMO_DA_AREA[a]).filter(Boolean).slice(0, AREAS_POR_PESSOA);
    const skill = termoDaSkill(lista(perfil.Skills)[0]);
    const termos = skill ? [...areas, skill] : areas;
    return termos.flatMap((termo) => {
        const busca = ['vaga', termo, nivel].filter(Boolean).join(' ');
        return [busca, `${busca} email`];
    });
}

/**
 * As buscas de hoje. Intercala as pessoas (a primeira busca de cada uma vem antes
 * da segunda de qualquer outra) e, se passar do teto, reveza por dia, para o
 * último da lista não ficar sem busca nunca.
 */
export function consultasDoDia(perfis, agora = Date.now(), teto = CONSULTAS_POR_DIA) {
    const porPessoa = perfis.map(consultasDoPerfil);
    const maior = Math.max(0, ...porPessoa.map((c) => c.length));
    const todas = [];
    for (let i = 0; i < maior; i += 1) {
        for (const c of porPessoa) if (c[i] && !todas.includes(c[i])) todas.push(c[i]);
    }
    if (todas.length <= teto) return todas;
    const inicio = (Math.floor(agora / DIA_MS) * teto) % todas.length;
    return Array.from({ length: teto }, (_, i) => todas[(inicio + i) % todas.length]);
}

/** Chamado pelo robô a cada execução. Sem comprador, volta vazio e nada é gasto. */
export async function consultasDoPlano(agora = Date.now()) {
    const perfis = await sql`
        select u."Plan", p."Areas", p."Levels", p."Skills"
        from "Users" u join "Profiles" p on p."UserId" = u."Id"
        where u."Plan" <> 'free' and (u."PlanExpiresAt" is null or u."PlanExpiresAt" > now())
        order by u."Id" limit 500`;
    return consultasDoDia(perfis.filter((p) => planOf(p.Plan).autoSend), agora);
}

/** Cria o robô uma vez. Quem o desligar no admin continua com ele desligado. */
export async function garantirRoboDoPlano() {
    const params = {
        doPlano: true, source: 'global', region: 'br', sortBy: 'date', contentType: 'all',
        postedLimit: '24h', maxPosts: 8, creditoMinimo: 2,
    };
    await sql`
        insert into "ScraperSchedules" ("Name", "Type", "Params", "IntervalMinutes", "Active")
        select ${ROBO_DO_PLANO}, 'monitoring', ${sql.json(params)}, 1440, true
        where not exists (select 1 from "ScraperSchedules" where "Name" = ${ROBO_DO_PLANO})`;
}
