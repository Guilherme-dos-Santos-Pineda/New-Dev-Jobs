import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectArea, detectLevel, passesFilters } from '../services/jobsQuery.js';

test('detectArea: classifica o cargo a partir do título', () => {
    assert.equal(detectArea({ JobTitle: 'Desenvolvedor .NET Sênior', Skills: [] }), 'dev');
    assert.equal(detectArea({ JobTitle: 'Analista de QA', Skills: [] }), 'qa');
    assert.equal(detectArea({ JobTitle: 'SDET', Skills: [] }), 'qa');
    assert.equal(detectArea({ JobTitle: 'Product Owner', Skills: [] }), 'po');
    assert.equal(detectArea({ JobTitle: 'Cientista de Dados', Skills: [] }), 'data');
    assert.equal(detectArea({ JobTitle: 'DevOps Engineer', Skills: [] }), 'devops');
    assert.equal(detectArea({ JobTitle: 'Desenvolvedor React Native', Skills: [] }), 'mobile');
    assert.equal(detectArea({ JobTitle: 'Vaga', Skills: [] }), 'other'); // não classificável
});

test('detectLevel: extrai a senioridade', () => {
    assert.equal(detectLevel('Desenvolvedor Júnior'), 'junior');
    assert.equal(detectLevel('Vaga Pleno'), 'pleno');
    assert.equal(detectLevel('Tech Lead'), 'lead');
    assert.equal(detectLevel('Gerente de Produto'), 'manager');
    assert.equal(detectLevel('Desenvolvedor'), null);
});

test('passesFilters: área profissional descarta vaga de outro cargo (QA não recebe Dev)', () => {
    const qa = { Region: 'br', Areas: ['qa'] };
    const devJob = { JobTitle: 'Desenvolvedor .NET', Email: 'rh@x.com.br', Skills: [] };
    const qaJob = { JobTitle: 'Analista de QA', Email: 'rh@x.com.br', Skills: [] };
    assert.equal(passesFilters(devJob, qa), false, 'vaga de Dev some para um QA');
    assert.equal(passesFilters(qaJob, qa), true, 'vaga de QA passa');
});

test('passesFilters: sem áreas selecionadas, não filtra por área', () => {
    const profile = { Region: 'br', Areas: [] };
    assert.equal(passesFilters({ JobTitle: 'Desenvolvedor', Email: 'x@y.com.br' }, profile), true);
});

test('passesFilters: vaga de área não-classificável (other) não é descartada', () => {
    const profile = { Region: 'br', Areas: ['qa'] };
    assert.equal(passesFilters({ JobTitle: 'Vaga', Email: 'x@y.com.br' }, profile), true);
});

test('passesFilters: palavra bloqueada descarta a vaga', () => {
    const profile = { Region: 'br', BlockedWords: ['estágio'] };
    assert.equal(passesFilters({ JobTitle: 'Vaga de Estágio', Email: 'x@y.com.br' }, profile), false);
});

test('passesFilters: keyword obrigatória ausente descarta', () => {
    const profile = { Region: 'br', RequiredKeywords: ['react'] };
    assert.equal(passesFilters({ JobTitle: 'Vaga Java', Email: 'x@y.com.br', Skills: [] }, profile), false);
    assert.equal(passesFilters({ JobTitle: 'Vaga React', Email: 'x@y.com.br', Skills: [] }, profile), true);
});

test('passesFilters: sem perfil libera tudo', () => {
    assert.equal(passesFilters({ JobTitle: 'X' }, null), true);
});
