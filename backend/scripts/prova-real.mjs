#!/usr/bin/env node
// PROVA REAL: 10 contas novas percorrem a jornada inteira em PRODUÇÃO.
//
//   node backend/scripts/prova-real.mjs
//
// Cada passo AFIRMA o que deveria acontecer e falha alto quando não acontece —
// um teste que só imprime "200 ok" não prova nada, porque a maioria dos bugs
// deste sistema devolve 200 com o conteúdo errado (feed vazio, filtro ignorado,
// email de contato vazando).
//
// O QUE ESTE TESTE NÃO FAZ: não dispara envio de email. As contas de teste não
// têm Google conectado, então o envio é barrado pelo próprio sistema — e é isso
// que verificamos. Mandar email de verdade para recrutador real a partir de uma
// conta falsa não é teste, é spam.
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, '.env') });
const { default: sql } = await import('../lib/sql.js');

const API = process.env.PROVA_API || 'https://newdevjobs.xyz';
const SB = process.env.SUPABASE_URL;
const SENHA = 'ProvaReal!' + Math.random().toString(36).slice(2, 10);
const hdr = (k) => ({ apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' });
const SERVICE = hdr(process.env.SUPABASE_SERVICE_ROLE_KEY);
const ANON = hdr(process.env.SUPABASE_ANON_KEY);

let ok = 0; const falhas = [];
function checa(cond, oQue, detalhe = '') {
    if (cond) { ok++; return true; }
    falhas.push(`${oQue}${detalhe ? ` — ${detalhe}` : ''}`);
    console.log(`   [FALHOU] ${oQue}${detalhe ? ` — ${detalhe}` : ''}`);
    return false;
}

async function api(token, method, path, body) {
    const r = await fetch(`${API}/api${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const txt = await r.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch { data = { _raw: txt.slice(0, 120) }; }
    return { status: r.status, data, bytes: txt.length };
}

// 10 perfis diferentes de propósito: um perfil só testaria um caminho da consulta.
const PERFIS = [
    { nome: 'Dev backend remoto',    Areas: ['dev'],     Modalities: ['remoto'],                         Skills: ['node', 'javascript', 'postgresql'], Levels: ['pleno'] },
    { nome: 'Dev fullstack hibrido', Areas: ['dev'],     Modalities: ['remoto', 'hibrido'],              Skills: ['react', 'node', 'typescript'],      Levels: ['pleno', 'senior'] },
    { nome: 'QA',                    Areas: ['qa'],      Modalities: ['remoto'],                         Skills: ['cypress', 'selenium'],              Levels: ['junior'] },
    { nome: 'Dados',                 Areas: ['data'],    Modalities: ['remoto', 'hibrido'],              Skills: ['python', 'sql', 'power bi'],        Levels: ['pleno'] },
    { nome: 'Mobile',                Areas: ['mobile'],  Modalities: ['remoto'],                         Skills: ['flutter', 'kotlin'],                Levels: ['junior'] },
    { nome: 'DevOps',                Areas: ['devops'],  Modalities: ['remoto', 'hibrido', 'presencial'], Skills: ['docker', 'kubernetes', 'aws'],     Levels: ['senior'] },
    { nome: 'Suporte/infra',         Areas: ['suporte'], Modalities: ['presencial', 'hibrido'],          Skills: ['redes', 'windows'],                 Levels: ['junior'] },
    { nome: 'Sem area definida',     Areas: [],          Modalities: ['remoto'],                         Skills: ['java', 'spring'],                   Levels: ['pleno'] },
    { nome: 'Palavra exigida',       Areas: [],          Modalities: [],                                 Skills: ['python'],                           Levels: [], RequiredKeywords: ['python'] },
    { nome: 'Palavra bloqueada',     Areas: ['dev'],     Modalities: ['remoto'],                         Skills: ['php'],                              Levels: [], BlockedWords: ['estagio', 'estágio'] },
];

const contas = [];
async function limpar() {
    for (const c of contas) {
        for (const tabela of ['BugReports', 'Feedback', 'SendQueue', 'Applications', 'Profiles']) {
            try { await sql.unsafe(`delete from "${tabela}" where "UserId" = $1`, [c.id]); } catch { /* tabela pode não existir */ }
        }
        try { await sql`delete from "Users" where "Id" = ${c.id}`; } catch { /* ignore */ }
        try { await fetch(`${SB}/auth/v1/admin/users/${c.id}`, { method: 'DELETE', headers: SERVICE }); } catch { /* ignore */ }
    }
}
process.on('SIGINT', async () => { await limpar(); process.exit(1); });

const antes = {
    users: (await sql`select count(*)::int n from "Users"`)[0].n,
    apps: (await sql`select count(*)::int n from "Applications"`)[0].n,
    fila: (await sql`select count(*)::int n from "SendQueue"`)[0].n,
};
console.log(`alvo ${API} · Users antes: ${antes.users} · Applications: ${antes.apps} · SendQueue: ${antes.fila}\n`);

try {
    // ---------- 1. CADASTRO ----------
    console.log('1) CADASTRO — 10 contas novas');
    for (let i = 0; i < PERFIS.length; i++) {
        const email = `prova-${Date.now()}-${i}@teste-newdevjobs.local`;
        const r = await fetch(`${SB}/auth/v1/admin/users`, {
            method: 'POST', headers: SERVICE,
            body: JSON.stringify({ email, password: SENHA, email_confirm: true, user_metadata: { name: PERFIS[i].nome } }),
        });
        const j = await r.json();
        if (!checa(r.ok && j.id, `cadastro #${i + 1}`, j.msg || '')) continue;
        contas.push({ id: j.id, email, perfil: PERFIS[i] });
        await new Promise((s) => setTimeout(s, 250)); // o Auth limita por IP
    }
    console.log(`   ${contas.length}/10 contas criadas`);

    // ---------- 2. LOGIN ----------
    console.log('\n2) LOGIN');
    for (const c of contas) {
        const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
            method: 'POST', headers: ANON, body: JSON.stringify({ email: c.email, password: SENHA }),
        });
        const j = await r.json();
        checa(r.ok && j.access_token, `login ${c.perfil.nome}`, j.error_description || j.msg || '');
        c.token = j.access_token;
        await new Promise((s) => setTimeout(s, 250));
    }
    const vivas = contas.filter((c) => c.token);
    console.log(`   ${vivas.length}/${contas.length} logaram`);

    // ---------- 3. PRIMEIRO ACESSO ----------
    console.log('\n3) PRIMEIRO ACESSO (/auth/me cria a linha em Users)');
    for (const c of vivas) {
        const r = await api(c.token, 'GET', '/auth/me');
        checa(r.status === 200 && r.data?.user?.id, `/auth/me ${c.perfil.nome}`, `HTTP ${r.status}`);
        checa(r.data?.user?.plan === 'free', `conta nova nasce no plano free (${c.perfil.nome})`, r.data?.user?.plan);
    }
    const criados = (await sql`select count(*)::int n from "Users" where "Email" like '%@teste-newdevjobs.local'`)[0].n;
    checa(criados === vivas.length, 'todas as contas viraram linha em Users', `${criados} de ${vivas.length}`);

    // ---------- 4. PERFIL ----------
    console.log('\n4) PERFIL — salvar e reler');
    for (const c of vivas) {
        const p = c.perfil;
        const corpo = {
            skills: p.Skills, areas: p.Areas, modalities: p.Modalities, seniorities: p.Levels,
            requiredKeywords: p.RequiredKeywords || [], blockedWords: p.BlockedWords || [],
            headline: `Teste ${p.nome}`, region: 'br',
        };
        const put = await api(c.token, 'PUT', '/profile', corpo);
        if (!checa(put.status === 200, `salvar perfil ${p.nome}`, `HTTP ${put.status} ${JSON.stringify(put.data).slice(0, 90)}`)) continue;
        const get = await api(c.token, 'GET', '/profile');
        const lido = get.data?.profile || {};
        // A API normaliza a grafia da skill ("node" vira "Node.js"), entao a
        // comparacao e por quantidade — comparar string a string acusaria bug
        // onde ha feature.
        const skills = lido.skills || [];
        checa(skills.length === p.Skills.length, `perfil guardou as ${p.Skills.length} skills de ${p.nome}`, JSON.stringify(skills));
        checa(JSON.stringify(lido.areas || []) === JSON.stringify(p.Areas), `perfil releu as AREAS de ${p.nome}`, `enviou ${JSON.stringify(p.Areas)}, leu ${JSON.stringify(lido.areas)}`);
        checa(JSON.stringify(lido.modalities || []) === JSON.stringify(p.Modalities), `perfil releu as MODALIDADES de ${p.nome}`, `enviou ${JSON.stringify(p.Modalities)}, leu ${JSON.stringify(lido.modalities)}`);
        checa(JSON.stringify(lido.seniorities || []) === JSON.stringify(p.Levels), `perfil releu os NIVEIS de ${p.nome}`, `enviou ${JSON.stringify(p.Levels)}, leu ${JSON.stringify(lido.seniorities)}`);
    }

    // ---------- 5. FEED ----------
    console.log('\n5) FEED — cada perfil recebe vagas diferentes?');
    const feeds = {};
    for (const c of vivas) {
        const r = await api(c.token, 'GET', '/jobs/matches');
        if (!checa(r.status === 200, `/jobs/matches ${c.perfil.nome}`, `HTTP ${r.status}`)) continue;
        const ms = r.data.matches || [];
        feeds[c.perfil.nome] = ms;
        checa(!ms.some((m) => m.email !== undefined), `SEGURANCA: /jobs/matches nao devolve email de contato (${c.perfil.nome})`);
        checa(!ms.some((m) => m.description !== undefined), `SEGURANCA: plano free nao recebe a descricao (${c.perfil.nome})`);
        checa(ms.every((m, i) => i === 0 || ms[i - 1].matchScore >= m.matchScore), `feed ordenado por match (${c.perfil.nome})`);
        console.log(`   ${c.perfil.nome.padEnd(24)} ${String(ms.length).padStart(4)} vagas · melhor ${ms[0]?.matchScore ?? '-'}% · ${(r.bytes / 1024).toFixed(0)} kB`);
    }
    const tamanhos = new Set(Object.values(feeds).map((f) => f.length));
    checa(tamanhos.size > 1, 'perfis diferentes recebem feeds diferentes (o filtro esta funcionando)', `todos com ${[...tamanhos][0]} vagas`);

    // ---------- 6. FILTROS ----------
    console.log('\n6) FILTROS — o que o usuario pediu foi respeitado?');
    // Conferido pela coluna "Area" gravada no banco, nao por regex no titulo: um
    // regex ingenuo acusa "Desenvolvedor SAP Senior - Logistica & Producao", que e
    // vaga de dev de verdade e o classificador acerta em manter (titulo tecnico
    // ganha do resto — e a regra documentada).
    const idsDeTodos = [...new Set(Object.values(feeds).flat().map((m) => Number(m.id)))];
    if (idsDeTodos.length) {
        const nonTech = await sql`select "Id","JobTitle" from "Jobs" where "Id" = any(${idsDeTodos}::bigint[]) and "Area" = 'nontech'`;
        checa(nonTech.length === 0, 'NENHUM feed traz vaga de outra profissao',
            `${nonTech.length} de ${idsDeTodos.length} · ex.: ${nonTech[0]?.JobTitle || ''}`);
        console.log(`   ${idsDeTodos.length} vagas distintas nos 10 feeds · ${nonTech.length} de outra profissao`);
    }

    const conferirTexto = async (feed, rotulo, testa) => {
        if (!feed?.length) { console.log(`   (${rotulo}: feed vazio, nada a conferir)`); return; }
        const ids = feed.map((m) => Number(m.id));
        const linhas = await sql`select "Id","JobTitle","Company","Description","Skills" from "Jobs" where "Id" = any(${ids}::bigint[])`;
        const ruins = linhas.filter((j) => !testa(`${j.JobTitle} ${j.Company} ${j.Description} ${JSON.stringify(j.Skills)}`));
        checa(ruins.length === 0, rotulo, `${ruins.length} de ${linhas.length} violam · ex.: ${ruins[0]?.JobTitle || ''}`);
    };
    await conferirTexto(feeds['Palavra exigida'], 'palavra EXIGIDA aparece em todas as vagas do feed',
        (t) => t.toLowerCase().includes('python'));
    await conferirTexto(feeds['Palavra bloqueada'], 'palavra BLOQUEADA nao aparece em nenhuma vaga do feed',
        (t) => !/est[áa]gio/i.test(t));

    // ---------- 6b. DESTAQUES / POST DE DIVULGACAO ----------
    console.log('\n6b) DESTAQUES DO DIA (post pronto para o LinkedIn)');
    const hl = await api(vivas[0].token, 'GET', '/highlights');
    if (checa(hl.status === 200, '/highlights responde', `HTTP ${hl.status}`)) {
        const d = hl.data || {};
        checa(Array.isArray(d.vagas) && d.vagas.length > 0, 'tem vagas em destaque', `${d.vagas?.length} vagas`);
        // O invariante que mais importa aqui, conferido contra os DADOS REAIS e
        // nao contra um fixture: o texto vai para rede social publica.
        checa(!(d.vagas || []).some((v) => v.email !== undefined), 'SEGURANCA: /highlights nao devolve email');
        // Todas as vagas do post tem de ser mesmo remotas e do Brasil — a lista e
        // propaganda, e propaganda errada e pior que propaganda nenhuma.
        const idsHl = (d.vagas || []).map((v) => Number(v.id));
        if (idsHl.length) {
            const erradas = await sql`
                select "Id","JobTitle" from "Jobs"
                where "Id" = any(${idsHl}::bigint[])
                  and (not jsonb_exists("Mods",'remoto') or "IsBR" is not true or "Area" in ('nontech','other'))`;
            checa(erradas.length === 0, 'toda vaga do post e remota, do Brasil e de tecnologia',
                `${erradas.length} erradas · ex.: ${erradas[0]?.JobTitle || ''}`);
        }
        // Mesma lista para todos os usuarios (e conteudo de divulgacao, nao feed).
        const hl2 = await api(vivas[3].token, 'GET', '/highlights');
        checa(JSON.stringify(hl2.data?.vagas) === JSON.stringify(d.vagas), 'a lista de destaques e igual para todos');

        // O post pronto e material de divulgacao assinado pela plataforma: so
        // admin recebe. Nenhuma destas contas e admin, entao o campo nem pode vir.
        checa(d.post === undefined, 'SEGURANCA: usuario comum NAO recebe o post de divulgacao',
            d.post ? `veio com ${d.post.length} caracteres` : '');
        checa(hl2.data?.post === undefined, 'nem por outra conta comum');

        // Candidatura a partir dos destaques: teto de 10 e trava de plano.
        const idsParaEnviar = (d.vagas || []).slice(0, 3).map((v) => v.id);
        const app1 = await api(vivas[0].token, 'POST', '/highlights/apply', { jobIds: idsParaEnviar });
        checa(app1.status === 402, 'plano free NAO se candidata a dedo pelos destaques', `HTTP ${app1.status}`);
        checa(app1.data?.upgrade === true, 'a recusa avisa que e caso de upgrade');

        const demais = await api(vivas[0].token, 'POST', '/highlights/apply', { jobIds: Array.from({ length: 11 }, (_, i) => i + 1) });
        checa(demais.status === 400, 'pedir mais de 10 vagas e recusado antes de qualquer envio', `HTTP ${demais.status}`);

        const vazio = await api(vivas[0].token, 'POST', '/highlights/apply', { jobIds: [] });
        checa(vazio.status === 400, 'lista vazia e recusada', `HTTP ${vazio.status}`);

        // Agora pelo lado do admin: o post TEM de vir, e o conteudo dele e
        // conferido contra os dados reais. Testar isso com conta comum passaria
        // por vacuidade — sem post, nao ha email para vazar.
        const adminDeMentira = vivas[vivas.length - 1];
        await sql`update "Users" set "Role" = 'admin' where "Id" = ${adminDeMentira.id}`;
        await new Promise((r) => setTimeout(r, 1200)); // cache de token do middleware
        const hlAdmin = await api(adminDeMentira.token, 'GET', '/highlights');
        const post = hlAdmin.data?.post;
        if (checa(typeof post === 'string' && post.length > 50, 'admin RECEBE o post de divulgacao', `${post?.length ?? 0} caracteres`)) {
            checa(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(post), 'SEGURANCA: o post NAO contem email de contato');
            checa(post.includes('newdevjobs.xyz'), 'o post leva para o site');
            // Nome de pessoa no lugar da empresa: a extracao cai no autor do post
            // quando nao acha empresa, e publicar isso expoe gente de verdade.
            const { pareceNomeDePessoa } = await import('../services/highlights.js');
            const empresas = (hlAdmin.data.vagas || []).map((v) => v.company).filter(Boolean);
            const pessoas = empresas.filter(pareceNomeDePessoa);
            checa(pessoas.length === 0, 'SEGURANCA: nenhum nome de pessoa publicado como empresa', pessoas.join(', '));
        }
        await sql`update "Users" set "Role" = null where "Id" = ${adminDeMentira.id}`;

        console.log(`   ${d.vagas?.length} vagas · ${d.totalRemotas} remotas na base · post so para admin (${post?.length ?? 0} caracteres)`);
    }

    // ---------- 7. DASHBOARD ----------
    console.log('\n7) DASHBOARD');
    for (const c of vivas) {
        const r = await api(c.token, 'GET', '/dashboard');
        if (!checa(r.status === 200, `/dashboard ${c.perfil.nome}`, `HTTP ${r.status}`)) continue;
        const m = r.data.metrics || {};
        checa(m.compatible === (feeds[c.perfil.nome] || []).length,
            `dashboard e feed contam a mesma coisa (${c.perfil.nome})`, `${m.compatible} vs ${(feeds[c.perfil.nome] || []).length}`);
        checa(m.dailyLimit === 7 && m.remainingToday === 7, `limite do free correto (${c.perfil.nome})`, `${m.remainingToday}/${m.dailyLimit}`);
        checa(Array.isArray(r.data.sparkSent) && r.data.sparkSent.length === 7, `sparkline de 7 dias (${c.perfil.nome})`);
    }

    // ---------- 8. ENVIO ----------
    console.log('\n8) ENVIO — as travas seguram?');
    const c0 = vivas[0];
    const man = await api(c0.token, 'POST', '/queue', { mode: 'manual', jobIds: (feeds[c0.perfil.nome] || []).slice(0, 3).map((m) => m.id) });
    checa(man.status === 402, 'plano free NAO pode selecionar vagas a mao', `HTTP ${man.status}`);
    checa(man.data?.upgrade === true, 'a recusa avisa que e caso de upgrade');

    const auto = await api(c0.token, 'POST', '/queue', { mode: 'auto' });
    checa(auto.status === 403, 'sem Google/CV o envio e BARRADO (nenhum email sai)', `HTTP ${auto.status}`);
    checa(typeof auto.data?.error === 'string' && auto.data.error.length > 10,
        'a recusa explica o motivo em vez de dar erro generico', auto.data?.error);
    console.log(`   mensagem ao usuario: "${auto.data?.error}"`);

    const fila = (await sql`select count(*)::int n from "SendQueue"`)[0].n;
    checa(fila === antes.fila, 'NADA entrou na fila de envio', `${fila} vs ${antes.fila}`);
    const apps = (await sql`select count(*)::int n from "Applications"`)[0].n;
    checa(apps === antes.apps, 'NENHUMA candidatura foi criada', `${apps} vs ${antes.apps}`);

    // ---------- 9. COBRANÇA ----------
    console.log('\n9) COBRANCA (so leitura — nada e cobrado)');
    const planos = await api(c0.token, 'GET', '/billing/plans');
    checa(planos.status === 200, '/billing/plans responde');
    checa(planos.data?.stripeEnabled === true, 'Stripe esta configurado no servidor');
    for (const p of (planos.data?.plans || []).filter((x) => x.id !== 'free')) {
        checa(p.purchasable === true, `plano ${p.id} tem preco configurado (STRIPE_PRICE_*)`, `purchasable=${p.purchasable}`);
    }
    const uso = await api(c0.token, 'GET', '/billing/me');
    checa(uso.status === 200, '/billing/me responde', `HTTP ${uso.status}`);
    const hist = await api(c0.token, 'GET', '/billing/history');
    checa(hist.status === 200, '/billing/history responde', `HTTP ${hist.status}`);

    // ---------- 10. CANAIS ----------
    console.log('\n10) MURAL, BUGS E RANKING');
    const bug = await api(vivas[1].token, 'POST', '/bugs', { message: 'Relato criado pela prova real automatizada. Pode apagar.', page: '/app/vagas' });
    checa([200, 201].includes(bug.status), 'relato de bug e aceito', `HTTP ${bug.status} ${JSON.stringify(bug.data).slice(0, 80)}`);
    const meusBugs = await api(vivas[1].token, 'GET', '/bugs/mine');
    checa(meusBugs.status === 200 && (meusBugs.data?.reports || []).length >= 1, 'o autor ve o proprio relato', JSON.stringify(meusBugs.data).slice(0, 80));
    const bugsDeOutro = await api(vivas[2].token, 'GET', '/bugs/mine');
    checa((bugsDeOutro.data?.reports || []).length === 0, 'SEGURANCA: um usuario NAO ve o relato de bug de outro');
    const bugsAdmin = await api(vivas[2].token, 'GET', '/bugs');
    checa([401, 403].includes(bugsAdmin.status), 'SEGURANCA: usuario comum nao acessa a lista de bugs do admin', `HTTP ${bugsAdmin.status}`);

    const rk = await api(c0.token, 'GET', '/ranking');
    checa(rk.status === 200, '/ranking responde', `HTTP ${rk.status}`);
    const nomes = (rk.data?.ranking || rk.data?.users || rk.data || []).map((u) => u?.name || u?.Name || '').filter(Boolean);
    const temNomeCompleto = nomes.some((n) => n.trim().split(/\s+/).length > 1 && !/\s\w\.$/.test(n.trim()));
    checa(!temNomeCompleto, 'SEGURANCA: /ranking abrevia o sobrenome', nomes.slice(0, 3).join(' | '));

    const adm = await api(c0.token, 'GET', '/admin/overview');
    checa([401, 403].includes(adm.status), 'SEGURANCA: conta comum nao entra no /admin', `HTTP ${adm.status}`);

    // ---------- 11. SESSÃO ----------
    console.log('\n11) SESSAO');
    const semToken = await fetch(`${API}/api/auth/me`);
    checa(semToken.status === 401, 'sem token -> 401', `HTTP ${semToken.status}`);
    const tokenRuim = await api('abc.def.ghi', 'GET', '/auth/me');
    checa(tokenRuim.status === 401, 'token invalido -> 401', `HTTP ${tokenRuim.status}`);
    // O logout real sao DUAS coisas: /api/auth/logout tira o token do cache do
    // middleware (fecha a janela de 60s) e o signOut encerra a sessao no Supabase
    // (e o que de fato invalida o JWT). Medimos as duas em separado — se um dia o
    // front esquecer o signOut, o token continua valendo ate expirar, e este
    // teste mostra isso em vez de esconder atras de um "logout ok".
    await api(c0.token, 'POST', '/auth/logout');
    const soPurge = await api(c0.token, 'GET', '/auth/me');
    checa(soPurge.status === 401, 'so /api/auth/logout ja invalida o token (lista de recusa)', `HTTP ${soPurge.status}`);
    const out = await fetch(`${SB}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${c0.token}`, 'Content-Type': 'application/json' },
    });
    checa(out.ok || out.status === 204, 'signOut no Supabase responde', `HTTP ${out.status}`);
    await new Promise((r) => setTimeout(r, 1500)); // o cache do middleware tem TTL curto
    const depoisLogout = await api(c0.token, 'GET', '/auth/me');
    checa(depoisLogout.status === 401, 'depois do logout COMPLETO o token para de valer', `HTTP ${depoisLogout.status}`);
} finally {
    console.log('\n=== LIMPEZA ===');
    await limpar();
    const depois = {
        users: (await sql`select count(*)::int n from "Users"`)[0].n,
        apps: (await sql`select count(*)::int n from "Applications"`)[0].n,
        fila: (await sql`select count(*)::int n from "SendQueue"`)[0].n,
        sobrou: (await sql`select count(*)::int n from "Users" where "Email" like '%@teste-newdevjobs.local'`)[0].n,
    };
    checa(depois.users === antes.users, 'base de usuarios voltou ao que era', `${depois.users} vs ${antes.users}`);
    checa(depois.sobrou === 0, 'nenhuma conta de teste sobrou', `${depois.sobrou} sobraram`);
    checa(depois.apps === antes.apps && depois.fila === antes.fila, 'nada foi criado em Applications/SendQueue');
    console.log(`   Users ${antes.users} -> ${depois.users} · Applications ${antes.apps} -> ${depois.apps} · SendQueue ${antes.fila} -> ${depois.fila}`);

    console.log(`\n${'='.repeat(62)}`);
    console.log(falhas.length ? `${ok} verificacoes passaram, ${falhas.length} FALHARAM:` : `TODAS as ${ok} verificacoes passaram`);
    falhas.forEach((f, i) => console.log(`   ${i + 1}. ${f}`));
    await sql.end();
    process.exit(falhas.length ? 1 : 0);
}
