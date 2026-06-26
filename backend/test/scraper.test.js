import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobHash, extractSkills } from '../services/scraper.js';

test('jobHash: normaliza (case/espaços) e é estável', () => {
    assert.equal(jobHash('Acme', 'Dev', 'a@b.com'), jobHash(' acme ', 'DEV', 'A@B.COM'));
});

test('jobHash: muda quando empresa/cargo/email mudam (dedup correto)', () => {
    const base = jobHash('Acme', 'Dev', 'a@b.com');
    assert.notEqual(base, jobHash('Acme', 'QA', 'a@b.com'));
    assert.notEqual(base, jobHash('Outra', 'Dev', 'a@b.com'));
    assert.notEqual(base, jobHash('Acme', 'Dev', 'c@d.com'));
});

test('extractSkills: encontra skills conhecidas no texto', () => {
    const skills = extractSkills('Vaga para Desenvolvedor Node.js com React e Docker');
    assert.ok(skills.includes('Node.js'));
    assert.ok(skills.includes('React'));
    assert.ok(skills.includes('Docker'));
});
