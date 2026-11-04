import test from 'node:test';
import assert from 'node:assert/strict';
import { drenando, POLL_S } from '../lib/boss.js';
// O laço real do pg-boss, de propósito: o `drenando` depende de como ele trata o
// aviso, e o package.json aceita versão nova. Se o comportamento mudar, cai aqui.
import Worker from '../../node_modules/pg-boss/dist/worker.js';

// Medido em 04/11/2026: 178 mil consultas por dia em fila vazia, ~44 MB de egress.

test('as filas juntas consultam o banco menos de 20 mil vezes por dia', () => {
    const porDia = Object.entries(POLL_S)
        .reduce((soma, [fila, s]) => soma + (86400 / s) * (fila === 'scraper' ? 2 : 1), 0);
    assert.ok(porDia < 20000, `seriam ${porDia} por dia`);
});

test('drenando: avisa depois do item, com sucesso ou com erro', async () => {
    const ordem = [];
    const ok = drenando(async () => { ordem.push('item'); return 'feito'; }, () => ordem.push('avisou'));
    assert.equal(await ok([{}]), 'feito');
    assert.deepEqual(ordem, ['item', 'avisou']);

    let avisos = 0;
    const falha = drenando(async () => { throw new Error('gmail fora'); }, () => { avisos += 1; });
    // O erro precisa subir: é ele que faz o pg-boss tentar de novo.
    await assert.rejects(falha([{}]), /gmail fora/);
    assert.equal(avisos, 1);
});

test('fila com itens não espera o intervalo; vazia, volta a dormir', async () => {
    let buscas = 0;
    let processados = 0;
    let worker = null;
    const item = drenando(async () => { processados += 1; }, () => worker.notify());
    worker = new Worker({
        id: 'teste',
        workId: 'teste',
        name: 'fila',
        options: {},
        interval: 60_000,
        fetch: async () => { buscas += 1; return buscas <= 3 ? [{}] : []; },
        onFetch: async (jobs) => { if (jobs.length) await item(jobs); },
        onError: (e) => { throw e; },
    });
    worker.start();
    await new Promise((r) => setTimeout(r, 200));

    assert.equal(processados, 3, 'os três itens saíram sem esperar os 60 s');
    assert.equal(buscas, 4, 'uma busca vazia e parou de consultar');
    await worker.stop();
});
