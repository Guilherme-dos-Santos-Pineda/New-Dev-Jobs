import { test } from 'node:test';
import assert from 'node:assert/strict';
import { niveisAceitos } from '../config/niveis.js';
import { computeMatch } from '../services/matching.js';
import { passesFilters } from '../services/jobsQuery.js';

// Caso real (02/11/2026): estagiário com "estágio + júnior" recebia 584 vagas
// sênior, e "Desenvolvedor GenAI Pleno" aparecia com 100% de match.

test('niveisAceitos: folga de um degrau, nunca sênior para júnior', () => {
    assert.deepEqual(niveisAceitos({ Levels: ['estagio', 'junior'] }), ['estagio', 'junior', 'pleno']);
    assert.deepEqual(niveisAceitos({ Levels: ['senior'] }), ['pleno', 'senior', 'lead']);
    assert.deepEqual(niveisAceitos({ Levels: [] }), []);
    assert.deepEqual(niveisAceitos(null), []);
});

test('niveisAceitos: senioridade estrita tira a folga', () => {
    assert.deepEqual(niveisAceitos({ Levels: ['junior'], StrictLevel: true }), ['junior']);
});

test('passesFilters: júnior não recebe vaga sênior, recebe vaga sem nível', () => {
    const p = { Region: 'br', Levels: ['estagio', 'junior'] };
    const base = { Email: 'rh@empresa.com.br', Description: 'Vaga em São Paulo/SP', Skills: ['Python'] };
    assert.equal(passesFilters({ ...base, JobTitle: 'Desenvolvedor Python Sênior' }, p), false);
    assert.equal(passesFilters({ ...base, JobTitle: 'Desenvolvedor Python Júnior' }, p), true);
    assert.equal(passesFilters({ ...base, JobTitle: 'Desenvolvedor Python' }, p), true);
});

test('computeMatch: vaga acima do nível não chega a 100%', () => {
    const p = { Skills: ['Python', 'Django'], Levels: ['estagio', 'junior'] };
    const job = (JobTitle, Description = '') => ({ JobTitle, Description, Skills: ['Python', 'Django'] });
    assert.ok(computeMatch(p, job('Dev Python Júnior')).score >= 90);
    assert.ok(computeMatch(p, job('Dev Python Pleno', 'Buscamos alguém júnior ou pleno')).score <= 60);
    assert.ok(computeMatch(p, job('Desenvolvedor Python Sênior')).score < 50, 'sênior fica abaixo do corte do envio automático');
});

test('computeMatch: nível vem do título, não da descrição', () => {
    const p = { Skills: ['React'], Levels: ['junior'] };
    const r = computeMatch(p, { JobTitle: 'Desenvolvedor React Sênior', Description: 'Mentorar devs júnior', Skills: ['React'] });
    assert.ok(r.score < 50, `veio ${r.score}`);
});
