import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { escolherVagas, horaDeEnviar, proximoEnvio } from '../services/autoEnvio.js';
import { PLANS, planOf } from '../config/plans.js';

const agora = Date.UTC(2026, 10, 10, 12);
const dias = (n) => new Date(agora - n * 86400000).toISOString();
const vaga = (id, matchScore, idade) => ({ id, matchScore, createdAt: dias(idade) });

test('só vaga da última semana, e sem piso de compatibilidade', () => {
    const ids = escolherVagas([vaga(1, 90, 1), vaga(2, 15, 1), vaga(3, 90, 8), vaga(4, 50, 7)], 20, agora);
    assert.deepEqual(ids, [1, 4, 2]);
});

test('sai primeiro o melhor match, e a mais nova no empate', () => {
    assert.deepEqual(escolherVagas([vaga(1, 60, 1), vaga(2, 90, 3), vaga(3, 90, 1)], 20, agora), [3, 2, 1]);
});

test('respeita o que resta do limite do dia', () => {
    const lista = [vaga(1, 90, 1), vaga(2, 80, 1), vaga(3, 70, 1)];
    assert.deepEqual(escolherVagas(lista, 2, agora), [1, 2]);
    assert.deepEqual(escolherVagas(lista, 0, agora), []);
    assert.deepEqual(escolherVagas(lista, -1, agora), []);
});

test('sem vaga nova, nada sai', () => {
    assert.deepEqual(escolherVagas([vaga(1, 95, 30)], 20, agora), []);
});

test('só envia a partir das 9h de Brasília', () => {
    assert.equal(horaDeEnviar(Date.UTC(2026, 10, 10, 11, 59)), false);
    assert.equal(horaDeEnviar(Date.UTC(2026, 10, 10, 12, 0)), true);
});

test('próximo envio: hoje às 9h se ainda não saiu, senão amanhã', () => {
    const noveDia10 = Date.UTC(2026, 10, 10, 12);
    const noveDia11 = Date.UTC(2026, 10, 11, 12);
    const seisDaManha = Date.UTC(2026, 10, 10, 9);
    assert.equal(proximoEnvio(new Date('2026-11-09'), seisDaManha), noveDia10);
    assert.equal(proximoEnvio(new Date('2026-11-10'), Date.UTC(2026, 10, 10, 15)), noveDia11);
    assert.equal(proximoEnvio(null, seisDaManha), noveDia10);
});

test('quem liga às 22h de Brasília recebe na manhã seguinte', () => {
    // 01h UTC do dia 11: a rota grava now() - 12h, que é o dia 10.
    assert.equal(proximoEnvio(new Date('2026-11-10'), Date.UTC(2026, 10, 11, 1)), Date.UTC(2026, 10, 11, 12));
});

test('a rota não usa current_date ao ligar, senão pula a manhã seguinte', async () => {
    const rota = await readFile(new URL('../routes/auth.js', import.meta.url), 'utf8');
    assert.match(rota, /"AutoEnvioUltimo" = \(now\(\) - interval '12 hours'\)::date/);
});

test('envio automático é recurso pago, e o plano grátis não tem', () => {
    assert.ok(!planOf('free').autoSend);
    assert.equal(planOf('starter').autoSend, true);
    assert.equal(planOf('pro').autoSend, true);
});

test('o plano à venda é o de R$ 10, com 50 envios por dia', () => {
    assert.equal(PLANS.starter.price, 10);
    assert.equal(PLANS.starter.dailyLimit, 50);
    assert.equal(PLANS.pro.aVenda, false);
});

test('o checkout só vende o que está à venda', async () => {
    const rota = await readFile(new URL('../routes/billing.js', import.meta.url), 'utf8');
    assert.match(rota, /checkoutSchema = z\.object\(\{ plan: z\.enum\(\['starter'\]\) \}\)/);
});
