import sql from '../lib/sql.js';

// =========================
// Vagas em destaque + post pronto para o LinkedIn
// =========================
// A base de vagas não é só o produto: é conteúdo. Uma lista de vagas remotas de
// verdade vale por si — a pessoa lê, confere que são reais, e só então o "quer
// que a gente mande seu currículo?" faz sentido. É o inverso de pedir cadastro
// antes de entregar qualquer coisa.
//
// O que NUNCA entra no post: o email de contato do recrutador. É o mesmo
// invariante do /jobs e do /jobs/matches, e aqui pesa ainda mais — o texto vai
// para uma rede social pública. Publicar os emails entregaria de graça a única
// coisa que a plataforma tem de próprio, além de expor contato de terceiro sem
// permissão nenhuma.

const QUANTAS = 10;          // no post: o LinkedIn corta o texto longo mesmo
const TAMANHO_DA_URNA = 120; // de onde as QUANTAS do dia são sorteadas

// Título que não diz nada não pode ir para um post público: "Vaga",
// "Oportunidade", "Estamos contratando". No feed eles passam de propósito (título
// ruim não é vaga ruim), mas aqui a lista É a propaganda — uma linha escrita
// "Vaga · Empresa" não convence ninguém a clicar.
const TITULO_VAGO = /^(vaga|vagas|oportunidade|estamos contratando|contratando|urgente|nova vaga)[\s!.:-]*$/i;

// Um anuncio unico que lista quatro cargos ("Desenvolvedor Fullstack, Analista
// de QA Pleno, Engenheiro de Software Senior, ...") vira uma linha ilegivel. No
// feed ele e uma vaga legitima; num post publico, so atrapalha.
const TITULO_LONGO = 64;
const ehTituloUsavel = (t) => t.length <= TITULO_LONGO && (t.match(/,/g) || []).length < 2;

const AREA_LABEL = {
    dev: 'Desenvolvimento', qa: 'QA', data: 'Dados', devops: 'DevOps',
    mobile: 'Mobile', design: 'Design', po: 'Produto', suporte: 'Suporte',
};
const NIVEL_LABEL = {
    estagio: 'Estágio', junior: 'Júnior', pleno: 'Pleno',
    senior: 'Sênior', lead: 'Tech Lead', manager: 'Gerência',
};

/**
 * Índice de início da janela do dia. Determinístico: a lista muda quando o dia
 * muda, e NÃO muda a cada recarga — quem copiou o post de manhã e conferiu à
 * tarde precisa ver a mesma coisa. Sorteio por request faria o usuário achar
 * que copiou errado.
 */
export function janelaDoDia(data, tamanhoDaUrna, quantas) {
    if (tamanhoDaUrna <= quantas) return 0;
    const dias = Math.floor(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()) / 86400000);
    const passos = Math.ceil(tamanhoDaUrna / quantas);
    return (dias % passos) * quantas;
}

// O campo "Company" cai no NOME DO AUTOR do post quando a extração não achou
// empresa. No feed isso é inofensivo; num post público de LinkedIn é o nome de
// uma pessoa real virando material de divulgação de terceiro, sem ela ter pedido
// nada. Na dúvida, omitimos: uma linha sem empresa é só menos informativa, uma
// linha com o nome errado é um problema com gente de verdade.
const MARCA_DE_EMPRESA = /\b(ltda|s\.?a\.?|me|eireli|inc|corp|llc|group|grupo|tech|technolog|digital|solutions?|solu[çc][õo]es|consultor|sistemas?|software|labs?|studio|agency|ag[êe]ncia|servi[çc]os?|holding|partners?|company|brasil|it|ti)\b|[&@|/]|\d/i;

export function pareceNomeDePessoa(nome) {
    const limpo = String(nome || '').trim();
    if (!limpo) return false;
    if (MARCA_DE_EMPRESA.test(limpo)) return false;
    const palavras = limpo.split(/\s+/);
    if (palavras.length < 2 || palavras.length > 4) return false;
    return palavras.every((p) => (
        /^(de|da|do|dos|das|e)$/i.test(p)        // "Juliana Batista de Souza"
        || /^\p{Lu}\.?$/u.test(p)                // "Richardyson S." — inicial de sobrenome
        || /^\p{Lu}\p{Ll}+$/u.test(p)
    ));
}

// O campo também recebe descrição em vez de nome ("consultoria de TI
// multinacional"). Nome de empresa começa com maiúscula e é curto; o resto é
// texto que a extração não soube o que fazer.
export function pareceNomeDeEmpresa(nome) {
    const limpo = String(nome || '').trim();
    return limpo.length >= 2 && limpo.length <= 40 && /^[\p{Lu}\p{N}]/u.test(limpo);
}

// detectLevel roda sobre título + DESCRIÇÃO, e a descrição mente: um anúncio que
// cita "também temos vaga de estágio" marcava a vaga sênior como estágio. No feed
// isso só desloca um pouco o match; num post público é informação errada com o
// nosso nome embaixo. Aqui o nível só aparece quando o TÍTULO confirma.
const NIVEL_NO_TITULO = [
    [/\b(est[áa]gi|intern)/i, 'estagio'],
    [/\b(j[uú]nior|junior|jr)\b/i, 'junior'],
    [/\b(pleno|pl)\b/i, 'pleno'],
    [/\b(s[êe]nior|senior|sr)\b/i, 'senior'],
    [/\b(tech lead|l[íi]der t[ée]cnic|staff|principal)\b/i, 'lead'],
];
export function nivelPeloTitulo(titulo = '') {
    for (const [re, nivel] of NIVEL_NO_TITULO) if (re.test(titulo)) return nivel;
    return null;
}

/** Uma linha do post. Sem email, sem link: o destino é o site. */
export function linhaDaVaga(v) {
    const partes = [v.title];
    if (v.company) partes.push(v.company);
    const nivel = nivelPeloTitulo(v.title);
    // O nível só entra se o título NÃO o disser — repetir "Sênior — Sênior" é ruído.
    const etiqueta = [
        nivel && !new RegExp(NIVEL_LABEL[nivel], 'i').test(v.title) ? NIVEL_LABEL[nivel] : null,
        AREA_LABEL[v.area],
    ].filter(Boolean).join(' · ');
    if (etiqueta) partes.push(etiqueta);
    return `• ${partes.join(' — ')}`;
}

/**
 * Monta o texto pronto para colar no LinkedIn.
 *
 * Sem hashtag em excesso e sem "🚀 BOMBANDO": o público é dev, e dev reconhece
 * post de marketing a um quarteirão. O que convence aqui é a lista ser real.
 */
export function montarPost(vagas, { total } = {}) {
    if (!vagas.length) return '';
    const hoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
    const linhas = vagas.map(linhaDaVaga).join('\n');
    const restantes = Number.isFinite(total) && total > vagas.length ? total - vagas.length : 0;

    return [
        `${vagas.length} vagas remotas de tecnologia no Brasil — ${hoje}`,
        '',
        linhas,
        '',
        restantes
            ? `Tem mais ${restantes} vagas remotas abertas na base, todas coletadas de posts de recrutador — muitas nunca chegam a job board nenhum.`
            : 'Todas coletadas de posts de recrutador — muitas nunca chegam a job board nenhum.',
        '',
        'A lista completa está no newdevjobs.xyz. Lá dá para configurar seu perfil e o sistema envia seu currículo para as vagas compatíveis automaticamente.',
        '',
        '#vagas #vagasremotas #desenvolvedor #tecnologia',
    ].join('\n');
}

/**
 * Vagas do dia + o post pronto.
 *
 * Critério: remota, do Brasil, de tecnologia, com email (ou seja, vaga de
 * verdade em que dá para se candidatar) e com título que diz alguma coisa.
 * Não depende do perfil de ninguém — é material de divulgação, igual para todos.
 */
export async function destaquesDoDia({ quantas = QUANTAS, hoje = new Date() } = {}) {
    const urna = await sql`
        select "Id", "JobTitle", "Company", "Area", "Level", "CreatedAt"
        from "Jobs"
        where "IsBR" is true
          and "Area" is not null and "Area" not in ('nontech', 'other')
          and jsonb_exists("Mods", 'remoto')
          and "Email" is not null and "Email" <> ''
          and "JobTitle" is not null and length(trim("JobTitle")) >= 8
        order by "CreatedAt" desc, "Id" desc
        limit ${TAMANHO_DA_URNA}`;

    const [{ n: total }] = await sql`
        select count(*)::int as n from "Jobs"
        where "IsBR" is true and "Area" is not null and "Area" <> 'nontech'
          and jsonb_exists("Mods", 'remoto')
          and "Email" is not null and "Email" <> ''`;

    // Uma empresa não pode ocupar a lista inteira: um recrutador que postou 15
    // vagas no mesmo dia viraria o post todo, e aí não é uma lista do mercado, é
    // um anúncio de graça para ele.
    const empresasVistas = new Set();
    const titulosVistos = new Set();
    const limpas = [];
    for (const j of urna) {
        const titulo = String(j.JobTitle).trim();
        if (TITULO_VAGO.test(titulo) || !ehTituloUsavel(titulo)) continue;

        // Duas empresas diferentes anunciando "Cientista de Dados Sênior" viram
        // duas linhas idênticas no post — parece lista inflada, não mercado.
        const chaveTitulo = titulo.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        if (titulosVistos.has(chaveTitulo)) continue;
        titulosVistos.add(chaveTitulo);

        const empresa = (j.Company || '').trim();
        const chaveEmpresa = empresa.toLowerCase();
        if (chaveEmpresa && empresasVistas.has(chaveEmpresa)) continue;
        if (chaveEmpresa) empresasVistas.add(chaveEmpresa);

        limpas.push({
            id: Number(j.Id), title: titulo,
            // O nome de pessoa é descartado AQUI, não só na hora de montar o
            // texto: assim ele também não aparece na lista do dashboard.
            company: empresa && pareceNomeDeEmpresa(empresa) && !pareceNomeDePessoa(empresa) ? empresa : null,
            area: j.Area, level: nivelPeloTitulo(titulo), createdAt: j.CreatedAt,
        });
    }

    const inicio = janelaDoDia(hoje, limpas.length, quantas);
    const doDia = limpas.slice(inicio, inicio + quantas);
    // Janela no fim da lista pode vir curta; completa do começo em vez de
    // entregar 3 vagas num dia e 10 no outro sem explicação.
    const vagas = doDia.length < quantas
        ? [...doDia, ...limpas.slice(0, quantas - doDia.length)]
        : doDia;

    return {
        dia: hoje.toISOString().slice(0, 10),
        vagas,
        totalRemotas: total,
        post: montarPost(vagas, { total }),
    };
}
