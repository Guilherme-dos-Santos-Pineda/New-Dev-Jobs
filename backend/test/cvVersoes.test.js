import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gruposDoFeed, escolherVersao, lerVersao, mensagemVersao, SISTEMA_VERSAO } from '../services/cvVersoesLogic.js';

const vaga = (id, area, extra = {}) => ({ id, area, title: `Vaga ${id}`, company: 'Acme', skills: ['Java'], description: 'x', matchScore: id, ...extra });

test('agrupa o feed por área e idioma, maiores grupos primeiro, sem área vaga', () => {
    const feed = [vaga(1, 'backend'), vaga(2, 'backend'), vaga(3, 'qa'), vaga(4, 'other'), vaga(5, null), vaga(6, 'backend', { en: true })];
    const g = gruposDoFeed(feed, (m) => (m.en ? 'en' : 'pt'));
    assert.deepEqual(g.map((x) => `${x.area}:${x.lang}:${x.vagas}`), ['backend:pt:2', 'qa:pt:1', 'backend:en:1']);
    assert.equal(g[0].exemplos[0].id, 2); // maior match primeiro
});

test('o envio usa só versão APROVADA da mesma área e idioma', () => {
    const versoes = [
        { area: 'backend', lang: 'pt', status: 'aprovada', id: 1 },
        { area: 'backend', lang: 'en', status: 'rascunho', id: 2 },
        { area: 'qa', lang: 'pt', status: 'aprovada', id: 3 },
    ];
    assert.equal(escolherVersao({ area: 'backend', lang: 'pt' }, versoes).id, 1);
    assert.equal(escolherVersao({ area: 'backend', lang: 'en' }, versoes), null); // rascunho não sai
    assert.equal(escolherVersao({ area: 'data', lang: 'pt' }, versoes), null);    // sem versão: vai o original
});

test('lê a versão com a lista do que mudou', () => {
    const r = lerVersao(JSON.stringify({
        mudancas: ['Destaquei Java na Acme'],
        curriculoReescrito: { nome: 'Ana', resumoProfissional: 'Back-end.', experiencias: [{ cargo: 'Dev', empresa: 'Acme', atividades: ['APIs'] }] },
    }), 'Ana Acme Java');
    assert.deepEqual(r.mudancas, ['Destaquei Java na Acme']);
    assert.equal(r.curriculo.experiencias[0].empresa, 'Acme');
    assert.equal(lerVersao('nada'), null);
});

test('o prompt proíbe inventar e não deixa apagar emprego inteiro', () => {
    assert.match(SISTEMA_VERSAO, /NUNCA invente/);
    assert.match(SISTEMA_VERSAO, /nunca apague a experiência inteira/);
    assert.match(mensagemVersao('CV', { area: 'backend', lang: 'en', exemplos: [] }), /inglês/);
});
