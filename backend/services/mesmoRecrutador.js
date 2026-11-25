import sql from '../lib/sql.js';
import { planOf } from '../config/plans.js';

// =========================
// Um currículo por recrutador a cada 30 dias
// =========================
// Medido em 02/11/2026: uma pessoa tinha mandado 11 currículos para
// vagas@innolevels.com.br, outra 13 para o mesmo RH. Para o recrutador é a
// mesma pessoa repetida, e o caminho natural é marcar como spam, o que derruba
// a reputação do Gmail DE QUEM ENVIA (e a entrega de todo o resto).
//
// Duas travas, com a mesma regra:
//  • no feed (getMatches): sobra UMA vaga por recrutador, a de maior match, e
//    some quem já recebeu nos últimos 30 dias. Assim o envio automático, a
//    seleção manual e o "enviar você mesmo", que só aceitam vaga do feed, já
//    nascem sem repetição.
//  • no envio (applyToJob): autoridade final, para o que não passa pelo feed
//    (destaques, fila antiga).

export const DIAS_MESMO_RECRUTADOR = 30;
// Quem paga espera 15 dias, não 30 (decisão do dono, 12/11/2026): com até 50 envios
// por dia o estoque acabava em dias, e o mesmo recrutador postando vaga nova duas
// semanas depois é a vaga que essa pessoa quer. Ainda é uma por recrutador por vez.
export const DIAS_MESMO_RECRUTADOR_PAGO = 15;

/** Dias entre dois currículos para o mesmo recrutador, pelo plano da pessoa. */
export function diasEntreEnvios(plano, expira = null, agora = Date.now()) {
    const ativo = !expira || new Date(expira).getTime() > agora;
    return ativo && planOf(plano).autoSend ? DIAS_MESMO_RECRUTADOR_PAGO : DIAS_MESMO_RECRUTADOR;
}

/** Endereços de um campo Email ("a@x.com, b@y.com" vira dois), normalizados. */
export function enderecos(campo) {
    return String(campo || '').toLowerCase().split(/[\s,;]+/).filter((e) => e.includes('@'));
}

// =========================
// A mesma vaga com outro email (25/11/2026)
// =========================
// Relato de pagante: "enviou para a mesma vaga duas vezes". "Auditor Técnico" da
// Decision entrou como duas vagas, postadas por dois recrutadores da empresa com
// endereços diferentes do mesmo domínio, e as duas saíram no mesmo dia. Comparando
// só o endereço, eram recrutadores diferentes. Medido: 67 de 4878 envios em 7 dias
// (1,4%, 31 pessoas) foram para o mesmo cargo no mesmo domínio dentro de 15 dias.
// Agora cargo igual + domínio de empresa igual é a mesma vaga, com a mesma janela.
// Domínio de email pessoal (gmail etc.) não conta: ali cada endereço é uma pessoa.
const DOMINIOS_PESSOAIS = new Set([
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br', 'live.com',
    'msn.com', 'yahoo.com', 'yahoo.com.br', 'icloud.com', 'me.com', 'bol.com.br', 'uol.com.br', 'terra.com.br',
    'ig.com.br', 'proton.me', 'protonmail.com', 'aol.com', 'zoho.com',
]);

/** Cargo comparável: sem acento, sem marca de gênero "(a)", sem pontuação. */
export function cargoComparavel(titulo) {
    return String(titulo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/\((?:a|o|as|os|e)\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Chaves "mesma vaga" (domínio de empresa + cargo) de uma vaga. Título vazio não gera chave. */
export function chavesDaVaga(titulo, campoEmail) {
    const cargo = cargoComparavel(titulo);
    if (cargo.length < 3) return [];
    const dominios = new Set(enderecos(campoEmail).map((e) => e.split('@')[1]).filter((d) => d && !DOMINIOS_PESSOAIS.has(d)));
    return [...dominios].map((d) => `vaga:${d}|${cargo}`);
}

/** Tudo que identifica o destino desta vaga: os endereços e as chaves de "mesma vaga". */
export function marcasDaVaga(titulo, campoEmail) {
    return [...enderecos(campoEmail), ...chavesDaVaga(titulo, campoEmail)];
}

/**
 * Deixa uma vaga por recrutador, na ordem recebida (a primeira vence), e tira
 * as de quem já foi contatado. Duas vagas são do mesmo recrutador se dividem
 * QUALQUER endereço, ou se têm o mesmo cargo no mesmo domínio de empresa.
 * `contatados` traz endereços e chaves (contatadosRecentes).
 */
export function umaPorRecrutador(vagas, contatados = []) {
    const vistos = new Set(contatados);
    const saida = [];
    for (const v of vagas) {
        const marcas = marcasDaVaga(v.title ?? v.JobTitle, v.email ?? v.Email);
        if (marcas.some((e) => vistos.has(e))) continue;
        for (const e of marcas) vistos.add(e);
        saida.push(v);
    }
    return saida;
}

async function diasDoUsuario(userId) {
    const [u] = await sql`select "Plan", "PlanExpiresAt" from "Users" where "Id" = ${userId}`;
    return diasEntreEnvios(u?.Plan, u?.PlanExpiresAt);
}

// Egress (14/11/2026): esta consulta era a que mais devolvia linhas no banco, ~12 mil
// em 20 minutos (quem manda 50 por dia tem centenas de endereços), porque rodava a
// cada feed montado E a cada envio. Agora o feed guarda o resultado 60 s por pessoa
// e o envio (jaContatado) pergunta só pelos endereços daquela vaga.
const GUARDA_MS = 60_000;
const guardados = new Map();

/** Endereços para os quais o usuário mandou currículo nos últimos 30 dias (15 no plano pago). */
export function contatadosRecentes(userId) {
    const g = guardados.get(userId);
    if (g && Date.now() - g.em < GUARDA_MS) return g.lista;
    const lista = buscarContatados(userId);
    guardados.set(userId, { em: Date.now(), lista });
    lista.catch(() => guardados.delete(userId));
    if (guardados.size > 1000) guardados.delete(guardados.keys().next().value);
    return lista;
}

async function buscarContatados(userId) {
    const dias = await diasDoUsuario(userId);
    const rows = await sql`
        select j."Email", j."JobTitle" from "Applications" a
        join "Jobs" j on j."Id" = a."JobId"
        where a."UserId" = ${userId} and j."Email" is not null
          and a."SentAt" > now() - make_interval(days => ${dias})`;
    return [...new Set(rows.flatMap((r) => marcasDaVaga(r.JobTitle, r.Email)))];
}

/**
 * O usuário já mandou para algum endereço desta vaga, ou para o mesmo cargo no
 * mesmo domínio de empresa, nos últimos 30 dias (15 no plano pago)? Pergunta ao
 * banco só por estes endereços e domínios, sem guarda: é a autoridade final antes
 * do envio, e devolve poucas linhas.
 */
export async function jaContatado(userId, campoEmail, titulo = '') {
    const ends = enderecos(campoEmail);
    if (!ends.length) return false;
    const chaves = chavesDaVaga(titulo, campoEmail);
    const dias = await diasDoUsuario(userId);
    const escapar = (x) => x.replace(/[%_\\]/g, (c) => `\\${c}`);
    const padroes = [
        ...ends.map((e) => `%${escapar(e)}%`),
        ...chaves.map((k) => `%@${escapar(k.slice(5, k.indexOf('|')))}%`),
    ];
    const rows = await sql`
        select j."Email", j."JobTitle" from "Applications" a
        join "Jobs" j on j."Id" = a."JobId"
        where a."UserId" = ${userId} and a."SentAt" > now() - make_interval(days => ${dias})
          and lower(j."Email") like any(${padroes}::text[])
        limit 50`;
    // O like acha "ba@x.com" ao procurar "a@x.com": a confirmação é por endereço inteiro
    // e por chave inteira (domínio + cargo).
    const ja = new Set(rows.flatMap((r) => marcasDaVaga(r.JobTitle, r.Email)));
    return [...ends, ...chaves].some((e) => ja.has(e));
}
