import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { escolherVagas, horaDeEnviar, proximoEnvio, diasAteVencer } from '../services/autoEnvio.js';
import { PLANS, planOf } from '../config/plans.js';

const agora = Date.UTC(2026, 10, 10, 12);
const dias = (n) => new Date(agora - n * 86400000).toISOString();
const vaga = (id, matchScore, idade) => ({ id, matchScore, createdAt: dias(idade) });

test('a semana sai primeiro, sem piso de compatibilidade', () => {
    const ids = escolherVagas([vaga(1, 90, 1), vaga(2, 15, 1), vaga(3, 90, 8), vaga(4, 50, 7)], 20, agora);
    assert.deepEqual(ids, [1, 4, 2, 3]);
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

test('sem vaga da semana, sai a do mês e depois a mais antiga, as mais novas antes', () => {
    assert.deepEqual(escolherVagas([vaga(1, 95, 30), vaga(2, 50, 10), vaga(3, 99, 100)], 20, agora), [2, 1, 3]);
});

test('quem paga não fica sem envio enquanto houver vaga no perfil', () => {
    const lista = Array.from({ length: 60 }, (_, i) => vaga(i + 1, 40, 8 + i));
    assert.equal(escolherVagas(lista, 50, agora).length, 50);
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

test('ritmo: a semana sai toda, o estoque antigo é dividido pelos dias do plano (11/11/2026)', () => {
    const semana = [vaga(1, 90, 1), vaga(2, 80, 2), vaga(3, 70, 3)];
    const antigas = Array.from({ length: 56 }, (_, i) => vaga(100 + i, 60, 10 + i));
    const ids = escolherVagas([...semana, ...antigas], 50, agora, { diasRestantes: 28 });
    // 3 da semana + 56 antigas / 28 dias = 5 hoje, em vez de 50 e estoque zerado no dia
    assert.equal(ids.length, 5);
    assert.deepEqual(ids.slice(0, 3), [1, 2, 3]);
});

test('ritmo: no último dia do plano sai o que sobrou, até o limite', () => {
    const antigas = Array.from({ length: 60 }, (_, i) => vaga(i + 1, 60, 10 + i));
    assert.equal(escolherVagas(antigas, 50, agora, { diasRestantes: 1 }).length, 50);
    assert.equal(escolherVagas(antigas, 50, agora, { diasRestantes: 0 }).length, 50);
});

test('diasAteVencer: arredonda para cima, no mínimo 1, sem validade conta 30', () => {
    assert.equal(diasAteVencer(new Date(agora + 2.5 * 86400000), agora), 3);
    assert.equal(diasAteVencer(new Date(agora - 86400000), agora), 1);
    assert.equal(diasAteVencer(null, agora), 30);
});

