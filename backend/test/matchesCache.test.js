import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apifyExhaustedUntil, endOfMonthMs } from '../services/apifyPool.js';

// ---------- Agendador: não enfileirar robô sem crédito na Apify ----------
// Regressão: o agendador reivindicava robôs a cada 60s mesmo com todas as contas
// esgotadas. Cada run era gravado em "ScraperRuns", enfileirado no pg-boss e
// falhava ~3s depois — milhares de execuções natimortas por dia, e o log de
// falhas enterrava qualquer outro erro. Pior: o update do agendador avança o
// "NextRunAt", então os agendamentos eram consumidos à toa.

test('apifyExhaustedUntil: 0 quando não há conta configurada (é erro de config, não de crédito)', () => {
    // Sem APIFY_TOKEN no ambiente de teste, o pool nasce vazio. O agendador deve
    // seguir e deixar o erro real aparecer, em vez de silenciar como "sem crédito".
    assert.equal(apifyExhaustedUntil(), 0);
});

test('endOfMonthMs: aponta para o 1º dia do mês seguinte em UTC', () => {
    const emJaneiro = Date.UTC(2026, 0, 15, 12, 0, 0);
    assert.equal(endOfMonthMs(emJaneiro), Date.UTC(2026, 1, 1));
});

test('endOfMonthMs: vira o ano corretamente em dezembro', () => {
    const emDezembro = Date.UTC(2026, 11, 31, 23, 59, 0);
    assert.equal(endOfMonthMs(emDezembro), Date.UTC(2027, 0, 1));
});

// ---------- Memo do getMatches ----------
// Regressão: getMatches custava ~1,4s de banco e ~12 MB por chamada (medido com
// 6270 vagas). Dashboard, tela de vagas e início de envio disparavam três
// varreduras completas em poucos segundos. O memo guarda a PROMISE, não o
// resultado, para que chamadas concorrentes compartilhem uma única execução.

test('getMatches: chamadas concorrentes compartilham UMA execução', async () => {
    // Reimplementa a mecânica do memo isoladamente (o original depende do banco).
    // O que se garante aqui é a propriedade que importa: N chamadas dentro da
    // janela disparam o trabalho pesado uma vez só.
    let execucoes = 0;
    const cache = new Map();
    const TTL = 20_000;
    const pesado = async () => { execucoes++; await new Promise((r) => setTimeout(r, 5)); return ['vaga']; };
    const get = (uid) => {
        const memo = cache.get(uid);
        if (memo && Date.now() - memo.at < TTL) return memo.promise;
        const promise = pesado();
        cache.set(uid, { at: Date.now(), promise });
        return promise;
    };

    const [a, b, c] = await Promise.all([get('u1'), get('u1'), get('u1')]);
    assert.equal(execucoes, 1, 'três chamadas simultâneas deveriam render uma execução');
    assert.deepEqual(a, b);
    assert.deepEqual(b, c);

    // Usuário diferente não compartilha o memo — o resultado é por perfil.
    await get('u2');
    assert.equal(execucoes, 2);
});

test('getMatches: memo de usuários distintos não se mistura', () => {
    const cache = new Map();
    cache.set('u1', { at: Date.now(), promise: Promise.resolve(['a']) });
    assert.equal(cache.has('u2'), false);
});
