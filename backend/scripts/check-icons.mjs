#!/usr/bin/env node
// Confere que todo ícone usado no frontend EXISTE na fonte que o app carrega.
//
//   npm run check:icons
//
// Por que existe: ícone que não existe não dá erro. A regra CSS simplesmente não
// casa, o glifo não aparece e sobra um espaço vazio. Vários botões do app são só
// ícone — o de relatar bug, por exemplo — então um nome errado transforma um
// botão funcionando num quadrado invisível, e a função parece quebrada.
//
// Já aconteceu três vezes aqui: `ti-star-filled` (as estrelas de avaliação
// inteiras, invisíveis), `ti-brand-google-filled` e `ti-discount-check-filled`.
// E uma vez com a folha toda, quando a URL fixada apontou para um 404 e TODOS os
// ícones sumiram de uma vez.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// A URL da fonte é lida do próprio index.html: conferir contra outra versão não
// prova nada sobre o que o app carrega.
const html = readFileSync(join(RAIZ, 'frontend/index.html'), 'utf8');
const url = html.match(/https:\/\/cdn\.jsdelivr\.net\/npm\/@tabler[^"']+/)?.[0];
if (!url) { console.error('❌ não achei a URL da fonte de ícones em frontend/index.html'); process.exit(1); }
console.log(`fonte: ${url}`);

const resp = await fetch(url);
if (!resp.ok) {
    console.error(`❌ a URL da fonte devolve HTTP ${resp.status} — TODOS os ícones do app somem assim.`);
    process.exit(1);
}
const css = await resp.text();
const existentes = new Set([...css.matchAll(/\.ti-([a-z0-9-]+):/g)].map((m) => m[1]));
console.log(`   HTTP 200 · ${existentes.size} ícones disponíveis`);

function arquivos(dir) {
    return readdirSync(dir).flatMap((nome) => {
        const cam = join(dir, nome);
        if (statSync(cam).isDirectory()) return arquivos(cam);
        return /\.(jsx?|html)$/.test(nome) ? [cam] : [];
    });
}

const usados = new Map();
for (const cam of [...arquivos(join(RAIZ, 'frontend/src')), join(RAIZ, 'frontend/index.html')]) {
    const txt = readFileSync(cam, 'utf8');
    // Duas formas de escrever o nome, e a segunda escapou da primeira versão
    // deste script: dentro de template literal o nome aparece SEM o "ti " na
    // frente — `ti ${feito ? 'ti-circle-check-filled' : s.icon}`. Foi assim que um
    // ícone inexistente ficou invisível no onboarding, justamente o check de
    // "passo concluído", com o verificador dizendo que estava tudo certo.
    const achados = [
        ...[...txt.matchAll(/\bti ti-([a-z0-9-]+)/g)].map((x) => x[1]),
        ...[...txt.matchAll(/['"`](ti-[a-z0-9-]+)['"`]/g)].map((x) => x[1].slice(3)),
    ];
    for (const nome of achados) {
        if (nome.endsWith('-')) {
            for (const sufixo of ['up', 'down', 'right', 'left']) usados.set(nome + sufixo, cam);
            continue;
        }
        usados.set(nome, cam);
    }
}

const faltando = [...usados].filter(([nome]) => !existentes.has(nome));
console.log(`${usados.size} ícones usados no app`);

if (!faltando.length) {
    console.log('✅ todos existem na fonte');
    process.exit(0);
}
console.log(`❌ ${faltando.length} NÃO existem (vão aparecer como espaço vazio):`);
for (const [nome, cam] of faltando) console.log(`   ti-${nome}  —  ${relative(RAIZ, cam)}`);
process.exit(1);
