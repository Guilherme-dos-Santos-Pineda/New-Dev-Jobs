import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    lerResposta, mensagemDoUsuario, palavrasDoFeed, analisesRestantes, SISTEMA, LIMITE_ANALISES,
    lerControle, acessoLiberado,
} from '../services/analiseCvLogic.js';

const CV = 'Maria Souza. Desenvolvedora na Acme de 2022 a 2024. React, TypeScript e Node.js. Análise e Desenvolvimento de Sistemas.';
const resposta = (extra = {}) => JSON.stringify({
    scoreEmpregabilidade: 72,
    resumoExecutivo: 'Base boa.',
    pontosFortes: ['React na Acme'],
    pontosFracos: ['Sem projetos'],
    dicas: ['Mostre o impacto do trabalho na Acme'],
    palavrasChaveATS: ['React', 'Docker', 'typescript'],
    curriculoReescrito: {
        nome: 'Maria Souza', resumoProfissional: 'Desenvolvedora front-end.',
        experiencias: [{ cargo: 'Desenvolvedora', empresa: 'Acme', periodo: '2022 a 2024', atividades: ['Criou telas em React'] }],
        formacao: [{ curso: 'ADS', instituicao: 'X', periodo: '2021' }],
    },
    ...extra,
});

test('lê a resposta e marca as palavras-chave que já estão no currículo original', () => {
    const r = lerResposta(resposta(), CV);
    assert.equal(r.score, 72);
    assert.deepEqual(r.palavrasChave, [
        { palavra: 'React', temNoCurriculo: true },
        { palavra: 'Docker', temNoCurriculo: false },
        { palavra: 'typescript', temNoCurriculo: true },
    ]);
    assert.equal(r.curriculo.experiencias[0].atividades[0], 'Criou telas em React');
});

test('aceita texto em volta do JSON e corta nota fora de 0 a 100', () => {
    const r = lerResposta(`Aqui está:\n${resposta({ scoreEmpregabilidade: 140 })}\nFim`, CV);
    assert.equal(r.score, 100);
});

test('resposta sem currículo reescrito ou quebrada não conta como análise', () => {
    assert.equal(lerResposta('não sei', CV), null);
    assert.equal(lerResposta('{ quebrado', CV), null);
    assert.equal(lerResposta(JSON.stringify({ scoreEmpregabilidade: 50, curriculoReescrito: {} }), CV), null);
});

test('campos de tipo errado não quebram a tela', () => {
    const r = lerResposta(resposta({ dicas: 'uma string', pontosFortes: [null, 'ok', 3] }), CV);
    assert.deepEqual(r.dicas, []);
    assert.deepEqual(r.pontosFortes, ['ok', '3']);
});

test('o prompt proíbe inventar e pede lembrete entre colchetes', () => {
    assert.match(SISTEMA, /NUNCA invente/);
    assert.match(SISTEMA, /\[quantos usuários\?\]/);
    assert.doesNotMatch(SISTEMA, /adicione métricas quando possível/i);
});

test('a mensagem leva área, nível e as palavras do feed da pessoa', () => {
    const m = mensagemDoUsuario(CV, { Areas: ['frontend'], Levels: '["junior"]' }, ['React', 'CSS']);
    assert.match(m, /front-end/);
    assert.match(m, /júnior/);
    assert.match(m, /React, CSS/);
    assert.ok(m.endsWith(CV));
});

test('as palavras do feed são as skills que mais aparecem, uma vez por vaga', () => {
    const vagas = [{ skills: ['React', 'React', 'CSS'] }, { skills: ['react', 'Node'] }, { skills: ['Node', 'React'] }];
    assert.deepEqual(palavrasDoFeed(vagas, 2), ['React', 'Node']);
});

test('3 análises por pessoa no teste; admin sem limite', () => {
    assert.equal(LIMITE_ANALISES, 3);
    assert.equal(analisesRestantes(0), 3);
    assert.equal(analisesRestantes(3), 0);
    assert.equal(analisesRestantes(5), 0);
    assert.equal(analisesRestantes(9, { admin: true }), Infinity);
});

test('controle do admin: limite global, extras por pessoa e bloqueio', () => {
    assert.equal(analisesRestantes(3, { limite: 3, extras: 2 }), 2);
    assert.equal(analisesRestantes(0, { limite: 5 }), 5);
    assert.equal(analisesRestantes(0, { limite: 0 }), 0);
    assert.equal(analisesRestantes(0, { bloqueado: true, extras: 10 }), 0);
    assert.equal(analisesRestantes(0, { bloqueado: true, admin: true }), Infinity);
});

test('controle sem valor gravado vale o padrão: ligada e limite 3', () => {
    assert.deepEqual(lerControle(undefined), { ativa: true, limite: 3 });
    assert.deepEqual(lerControle({ ativa: false }), { ativa: false, limite: 3 });
    assert.deepEqual(lerControle({ limite: 999 }), { ativa: true, limite: 50 });
    assert.deepEqual(lerControle({ limite: '7' }), { ativa: true, limite: 3 });
});

test('desligada ou bloqueado tira o acesso, menos do admin', () => {
    assert.equal(acessoLiberado({ ativa: true }), true);
    assert.equal(acessoLiberado({ ativa: false }), false);
    assert.equal(acessoLiberado({ bloqueado: true }), false);
    assert.equal(acessoLiberado({ ativa: false, admin: true }), true);
    assert.equal(acessoLiberado({ bloqueado: true, admin: true }), true);
});
