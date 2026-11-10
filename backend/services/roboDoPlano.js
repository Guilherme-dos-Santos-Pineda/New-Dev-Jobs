import sql from '../lib/sql.js';
import { planOf } from '../config/plans.js';
import { ORDEM_NIVEIS } from '../config/niveis.js';
import { expandirAreas, AREAS_FORA_DE_TI } from '../config/areas.js';
import { recrutadoresDasAreas } from './recrutadorMonitoravel.js';

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
// Duas frentes, medidas em 10/11/2026:
//   1. Busca no LinkedIn todo: `vaga <termo> <nível>` e a hashtag do termo. A
//      variante `... email` voltava com ZERO post em toda execução (metade das
//      buscas, jogada fora). A hashtag é o que rende quando existe: `#dotnet`
//      trouxe 20 posts na semana, 8 com email; `#vagafrontend`, 1 post.
//   2. Visita diária aos recrutadores que mais postam nas áreas de quem comprou
//      (RECRUTADORES_POR_DIA). É onde está o volume: os 30 primeiros postaram 529
//      vagas dessas áreas em 30 dias. O monitoramento geral passa por eles uma
//      vez por semana com teto de 80 posts por lote, e em 7 dias 6 lotes bateram
//      o teto (só esses 6 trouxeram 145 vagas): o que passa do teto se perde.
//      Com janela de 24h todo dia, nada passa. O carimbo de LastCheckedAt tira
//      esses recrutadores do monitoramento geral, então ninguém é comprado duas vezes.

export const ROBO_DO_PLANO = 'Vagas de quem comprou';
// 16 desde 10/11/2026, com 4 pagantes: 8 revezava as buscas e alguém ficava dias sem a sua.
export const CONSULTAS_POR_DIA = 16;
const AREAS_POR_PESSOA = 2;
// 3 chamadas à Apify por dia (10 por lote). Custo: ~US$ 0,001 por chamada mais
// US$ 0,002 por post; esses 30 postam perto de 40 por dia, ~US$ 0,08.
export const RECRUTADORES_POR_DIA = 30;
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

// Onde o termo da busca não dá uma hashtag que alguém usa.
const HASHTAG_DA_AREA = { mobile: 'mobile', design: 'uxdesign', suporte: 'suporteti', fullstack: 'fullstack' };

/** `#vagadotnet OR #vagasdotnet OR #dotnet`, a partir do termo da busca. */
export function hashtagDoTermo(termo) {
    const t = String(termo || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\.net/g, 'dotnet').replace(/c#/g, 'csharp').replace(/[^a-z0-9]/g, '');
    return t ? `#vaga${t} OR #vagas${t} OR #${t}` : '';
}

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
    const areas = lista(perfil.Areas).filter((a) => TERMO_DA_AREA[a]).slice(0, AREAS_POR_PESSOA)
        .map((a) => ({ termo: TERMO_DA_AREA[a], hashtag: hashtagDoTermo(HASHTAG_DA_AREA[a] || TERMO_DA_AREA[a]) }));
    const skill = termoDaSkill(lista(perfil.Skills)[0]);
    const termos = skill ? [...areas, { termo: skill, hashtag: hashtagDoTermo(skill) }] : areas;
    return termos.flatMap(({ termo, hashtag }) => [['vaga', termo, nivel].filter(Boolean).join(' '), hashtag].filter(Boolean));
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

/** As áreas de TI dos compradores, já expandidas como no feed. */
export function areasDosPerfis(perfis) {
    const todas = perfis.flatMap((p) => expandirAreas(lista(p.Areas)));
    // As de fora de TI ficam gravadas como 'nontech' (ver CLAUDE.md), e o
    // recrutador de logística que mais posta não é o que interessa aqui.
    return [...new Set(todas)].filter((a) => !AREAS_FORA_DE_TI.includes(a));
}

/** Chamado pelo robô a cada execução. Sem comprador, volta vazio e nada é gasto. */
export async function planoDoDia(agora = Date.now()) {
    const perfis = (await sql`
        select u."Plan", p."Areas", p."Levels", p."Skills"
        from "Users" u join "Profiles" p on p."UserId" = u."Id"
        where u."Plan" <> 'free' and (u."PlanExpiresAt" is null or u."PlanExpiresAt" > now())
        order by u."Id" limit 500`).filter((p) => planOf(p.Plan).autoSend);
    if (!perfis.length) return { consultas: [], recrutadores: [] };
    return {
        consultas: consultasDoDia(perfis, agora),
        recrutadores: await recrutadoresDasAreas(areasDosPerfis(perfis), RECRUTADORES_POR_DIA),
    };
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
