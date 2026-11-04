import test from 'node:test';
import assert from 'node:assert/strict';
import { devePerguntar, RESPOSTAS, DIAS_ATE_PERGUNTAR, DIAS_ENTRE_PERGUNTAS } from '../services/retornoEnvios.js';

const agora = Date.UTC(2026, 10, 30);
const diasAtras = (n) => new Date(agora - n * 86400000);

test('quem nunca enviou não é perguntado', () => {
    assert.equal(devePerguntar({ primeiroEnvio: null, agora }), false);
});

test('espera os 14 dias depois do primeiro envio', () => {
    assert.equal(devePerguntar({ primeiroEnvio: diasAtras(DIAS_ATE_PERGUNTAR - 1), agora }), false);
    assert.equal(devePerguntar({ primeiroEnvio: diasAtras(DIAS_ATE_PERGUNTAR), agora }), true);
});

test('quem respondeu só é perguntado de novo depois de 30 dias', () => {
    const base = { primeiroEnvio: diasAtras(90), ultimaResposta: 'nada', agora };
    assert.equal(devePerguntar({ ...base, ultimaEm: diasAtras(DIAS_ENTRE_PERGUNTAS - 1) }), false);
    assert.equal(devePerguntar({ ...base, ultimaEm: diasAtras(DIAS_ENTRE_PERGUNTAS) }), true);
    assert.equal(devePerguntar({ ...base, ultimaResposta: 'sim', ultimaEm: diasAtras(DIAS_ENTRE_PERGUNTAS) }), true);
});

test('quem conseguiu emprego nunca mais é perguntado', () => {
    assert.equal(devePerguntar({ primeiroEnvio: diasAtras(400), ultimaResposta: 'emprego', ultimaEm: diasAtras(300), agora }), false);
});

test('as respostas batem com o check da migration', async () => {
    const { readFile } = await import('node:fs/promises');
    const migration = await readFile(new URL('../../supabase/migrations/0018_retorno_envios.sql', import.meta.url), 'utf8');
    for (const r of RESPOSTAS) assert.ok(migration.includes(`'${r}'`), `${r} seria recusada pelo banco`);
});
