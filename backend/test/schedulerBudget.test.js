import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vagasNesteTick } from '../worker.js';

// O agendador tem DOIS tetos e eles resolvem problemas diferentes:
//   por tick  -> evita a manada quando muitos robôs vencem juntos
//   por dia   -> espalha o crédito Apify pelo mês inteiro
// Sem o segundo, 305 robôs diários gastavam o crédito de 4 contas em 1,5 dia e
// a base ficava 28 dias sem vaga nova. Regressão medida em produção.

test('respeita o teto por tick quando o dia ainda tem folga', () => {
    assert.equal(vagasNesteTick({ usadosHoje: 0, tetoDiario: 16, tetoPorTick: 3 }), 3);
});

test('o teto diário aperta o do tick quando sobra pouco', () => {
    assert.equal(vagasNesteTick({ usadosHoje: 15, tetoDiario: 16, tetoPorTick: 3 }), 1);
});

test('devolve zero com o orçamento do dia gasto', () => {
    assert.equal(vagasNesteTick({ usadosHoje: 16, tetoDiario: 16, tetoPorTick: 3 }), 0);
});

test('nunca devolve negativo se o dia estourou', () => {
    assert.equal(vagasNesteTick({ usadosHoje: 40, tetoDiario: 16, tetoPorTick: 3 }), 0);
});

test('teto diário generoso não anula o do tick', () => {
    assert.equal(vagasNesteTick({ usadosHoje: 0, tetoDiario: 10000, tetoPorTick: 3 }), 3);
});
