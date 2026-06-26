import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEmail, defaultTemplate } from '../services/templates.js';

const tpl = defaultTemplate('pt');
const user = { Name: 'Ana', Email: 'ana@x.com' };
const subject = (job, profile) => renderEmail({ subjectTemplate: tpl.subject, bodyTemplate: tpl.body, user, profile, job }).subject;

test('renderEmail: título real da vaga é mantido', () => {
    assert.match(subject({ JobTitle: 'Desenvolvedor .NET', Company: 'Acme' }, { Areas: ['dev'] }), /Desenvolvedor \.NET/);
});

test('renderEmail: título genérico "Vaga" vira o cargo da área (sem "para Vaga")', () => {
    const s = subject({ JobTitle: 'Vaga', Company: 'Acme' }, { Areas: ['qa'] });
    assert.match(s, /QA/);
    assert.doesNotMatch(s, /para Vaga/i);
});

test('renderEmail: título vazio sem área usa o padrão', () => {
    assert.match(subject({ JobTitle: '', Company: 'Acme' }, {}), /Desenvolvedor/);
});

test('renderEmail: interpola empresa no assunto', () => {
    assert.match(subject({ JobTitle: 'Dev', Company: 'Acme' }, {}), /na Acme/);
});
