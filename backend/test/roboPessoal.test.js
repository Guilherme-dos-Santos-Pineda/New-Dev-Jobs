import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consultasPessoais, proximaBusca, diasDeEstoque, ordemDeAtendimento, RODAR_A_CADA_DIAS } from '../services/roboPessoalLogic.js';

const agora = Date.UTC(2026, 10, 12, 8);
const dias = (n) => new Date(agora - n * 86400000);

test('buscas da pessoa: área e nível dela, no formato que mais rende ("currículo para")', () => {
    const c = consultasPessoais({ Areas: ['backend', 'qa'], Levels: ['junior', 'pleno'] });
    assert.equal(c[0], '"júnior" back-end "currículo para"');
    assert.equal(c[1], '"júnior" QA "currículo para"', 'intercala: a primeira de cada área vem antes');
    assert.ok(c.length <= 8);
    assert.ok(c.every((q) => /currículo/.test(q)));
});

test('buscas: fora de TI e sem nível também funcionam; sem área cai em desenvolvedor', () => {
    assert.equal(consultasPessoais({ Areas: ['financeiro'], Levels: ['estagio'] })[0], '"estágio" financeiro "currículo para"');
    assert.equal(consultasPessoais({ Areas: ['frontend'] })[0], 'front-end "currículo para"');
    assert.equal(consultasPessoais({})[0], 'desenvolvedor "currículo para"');
    assert.equal(consultasPessoais({ Areas: '["mobile"]', Levels: '["senior"]' })[0], '"sênior" mobile "currículo para"');
});

test('primeira vez: roda já, com janela de um mês', () => {
    const p = proximaBusca({}, agora);
    assert.equal(p.rodar, true);
    assert.equal(p.janela, 'month');
});

test('depois: a cada 6 dias, janela de semana; a cada 25, volta ao mês', () => {
    assert.equal(proximaBusca({ ultima: dias(2), ultimaProfunda: dias(2) }, agora).rodar, false);
    const semana = proximaBusca({ ultima: dias(RODAR_A_CADA_DIAS), ultimaProfunda: dias(10) }, agora);
    assert.equal(semana.rodar, true);
    assert.equal(semana.janela, 'week');
    assert.equal(proximaBusca({ ultima: dias(7), ultimaProfunda: dias(26) }, agora).janela, 'month');
    assert.equal(proximaBusca({ ultima: dias(1), forcar: true }, agora).rodar, true, 'o botão do admin roda na hora');
});

test('dias de estoque e ordem: quem tem menos vaga é atendido primeiro', () => {
    assert.equal(diasDeEstoque(100, 20), 5);
    assert.equal(diasDeEstoque(0, 20), 0);
    assert.equal(diasDeEstoque(100, 0), null);
    const ordem = ordemDeAtendimento([{ id: 'a', dias: 9 }, { id: 'b', dias: null }, { id: 'c', dias: 2 }]).map((p) => p.id);
    assert.deepEqual(ordem, ['c', 'a', 'b']);
});
