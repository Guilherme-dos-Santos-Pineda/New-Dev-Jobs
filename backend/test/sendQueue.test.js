import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSendPlan, scheduleSequentially } from '../services/sendQueue.js';
import { SEND_QUEUE } from '../lib/boss.js';

// =========================================================================
// Regressão do ERRO 500 do auto-envio.
// Causa original: a API agendava os envios no pg-boss com Promise.all (paralelo).
// Com 150+ vagas de uma vez, isso estourava o pool do pg-boss (max 2) / o pooler
// do Supabase (~15) e o request morria com 500 pro usuário.
// Correção: agendar SEQUENCIALMENTE (um await por vez). Estes testes garantem
// que o plano de espaçamento está certo e que os envios NUNCA rodam em paralelo.
// =========================================================================

test('buildSendPlan: 1º envio imediato e espaçamento cumulativo', () => {
    const now = 1_000_000;
    const plan = buildSendPlan('user-1', [10, 20, 30], now, () => 90);

    assert.equal(plan.length, 3);
    // startAfter cumulativo: 0, 90, 180
    assert.deepEqual(plan.map((p) => p._startAfter), [0, 90, 180]);
    // ScheduledAt = now + startAfter*1000
    assert.deepEqual(plan.map((p) => p.ScheduledAt.getTime()), [now, now + 90_000, now + 180_000]);
    // ScheduledAt sempre crescente (nunca agenda "pra trás")
    for (let i = 1; i < plan.length; i += 1) {
        assert.ok(plan[i].ScheduledAt.getTime() > plan[i - 1].ScheduledAt.getTime());
    }
    // campos do espelho SendQueue
    assert.deepEqual(plan.map((p) => p.JobId), [10, 20, 30]);
    assert.ok(plan.every((p) => p.UserId === 'user-1' && p.Status === 'queued'));
});

test('buildSendPlan: lista vazia → plano vazio', () => {
    assert.deepEqual(buildSendPlan('u', [], 0, () => 60), []);
});

// Boss falso: cada send "demora" um tick; conta quantos estão em voo ao mesmo
// tempo. Se alguém trocar o for/await por Promise.all, maxInFlight vira N e o
// teste quebra — exatamente o cenário que gerava o 500.
function makeSpyBoss() {
    let inFlight = 0;
    let maxInFlight = 0;
    const calls = [];
    return {
        maxInFlight: () => maxInFlight,
        calls,
        async send(queue, data, opts) {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((r) => setTimeout(r, 5)); // cede o event loop
            calls.push({ queue, data, opts });
            inFlight -= 1;
        },
    };
}

test('scheduleSequentially: NUNCA agenda em paralelo (anti-500)', async () => {
    const userId = 'user-1';
    const jobIds = [10, 20, 30, 40, 50];
    const plan = buildSendPlan(userId, jobIds, 0, () => 60);
    const rows = jobIds.map((jid, i) => ({ Id: i + 1, JobId: jid }));
    const boss = makeSpyBoss();

    await scheduleSequentially(boss, userId, rows, plan);

    // O invariante que evita o 500: no máximo 1 send em voo por vez.
    assert.equal(boss.maxInFlight(), 1);
    // Todos agendados, na ordem, com payload e startAfter corretos.
    assert.equal(boss.calls.length, rows.length);
    boss.calls.forEach((c, i) => {
        assert.equal(c.queue, SEND_QUEUE);
        assert.deepEqual(c.data, { userId, queueId: i + 1, jobId: jobIds[i] });
        assert.equal(c.opts.startAfter, plan[i]._startAfter);
    });
});

test('scheduleSequentially: lote grande (200) continua sequencial', async () => {
    const userId = 'u';
    const jobIds = Array.from({ length: 200 }, (_, i) => i + 1);
    const plan = buildSendPlan(userId, jobIds, 0, () => 60);
    const rows = jobIds.map((jid, i) => ({ Id: i + 1, JobId: jid }));
    const boss = makeSpyBoss();

    await scheduleSequentially(boss, userId, rows, plan);

    assert.equal(boss.maxInFlight(), 1);
    assert.equal(boss.calls.length, 200);
});
