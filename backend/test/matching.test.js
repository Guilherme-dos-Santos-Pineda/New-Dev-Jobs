import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMatch } from '../services/matching.js';

test('computeMatch: skills em comum aumentam o score', () => {
    const profile = { Skills: ['React', 'Node.js'], Levels: ['pleno'] };
    const alto = computeMatch(profile, { JobTitle: 'Dev React', Skills: ['React', 'Node.js'] });
    const baixo = computeMatch(profile, { JobTitle: 'Dev', Skills: ['COBOL', 'Delphi'] });
    assert.ok(alto.score > baixo.score, 'mais skills em comum = score maior');
    assert.ok(alto.matched.includes('React'));
    assert.ok(baixo.missing.includes('COBOL'));
});

test('computeMatch: score sempre entre 0 e 100', () => {
    for (const job of [{ Skills: [] }, { Skills: ['X'] }, { JobTitle: 'Sênior', Skills: ['React'] }]) {
        const r = computeMatch({ Skills: ['React'], Levels: ['senior'] }, job);
        assert.ok(r.score >= 0 && r.score <= 100);
    }
});

test('computeMatch: senioridade compatível pontua mais que incompatível', () => {
    const job = { JobTitle: 'Desenvolvedor Sênior', Skills: ['React'] };
    const senior = computeMatch({ Skills: ['React'], Levels: ['senior'] }, job);
    const estagio = computeMatch({ Skills: ['React'], Levels: ['estagio'] }, job);
    assert.ok(senior.score >= estagio.score);
});

test('computeMatch: cross-área é fortemente rebaixado (QA x vaga de Dev)', () => {
    // QA com skills que se sobrepõem às de um Dev (Java/SQL) — sem a penalidade de
    // área isso daria match alto. Com áreas declaradas, não pode parecer compatível.
    const qa = { Skills: ['Java', 'SQL', 'Selenium'], Levels: ['senior'], Areas: ['qa'] };
    const devJob = { JobTitle: 'Senior Engineer', Skills: ['Java', 'SQL'] };
    const r = computeMatch(qa, devJob);
    assert.equal(r.areaMismatch, true);
    assert.ok(r.score <= 30, `cross-área deve ficar baixo, veio ${r.score}`);
});

test('computeMatch: mesma área não sofre penalidade', () => {
    const qa = { Skills: ['Selenium', 'Cypress'], Levels: ['senior'], Areas: ['qa'] };
    const qaJob = { JobTitle: 'Analista de QA', Skills: ['Selenium', 'Cypress'] };
    const r = computeMatch(qa, qaJob);
    assert.equal(r.areaMismatch, false);
    assert.ok(r.score >= 80, `mesma área deve manter score alto, veio ${r.score}`);
});

test('computeMatch: sem áreas declaradas, não há penalidade de área', () => {
    const profile = { Skills: ['Java'], Levels: ['senior'] }; // sem Areas
    const devJob = { JobTitle: 'Senior Engineer', Skills: ['Java'] };
    const r = computeMatch(profile, devJob);
    assert.equal(r.areaMismatch, false);
});

test('computeMatch: vaga irrelevante SEM skills (motorista p/ dev) fica < corte de auto-envio', () => {
    const dev = { Skills: ['JavaScript', 'React', 'C#', 'Go'], Levels: ['pleno', 'senior'], Areas: ['dev'] };
    const busDriver = { JobTitle: 'Motorista de Ônibus', Description: 'Vaga para motorista, governo municipal. CNH categoria D.', Skills: [] };
    const r = computeMatch(dev, busDriver);
    assert.ok(r.score < 50, `deveria ficar abaixo de 50 (auto-envio), veio ${r.score}`);
});

test('computeMatch: "go" não casa "governo" (limite de palavra)', () => {
    const dev = { Skills: ['Go'], Levels: ['pleno'] };
    const job = { JobTitle: 'Auxiliar', Description: 'trabalho no governo, atendimento ao público', Skills: [] };
    const r = computeMatch(dev, job);
    assert.ok(r.score < 50, `governo não é match de Go, veio ${r.score}`);
});

test('computeMatch: vaga sem skills mas com a stack no texto pontua mais', () => {
    const dev = { Skills: ['React', 'Node.js'], Levels: ['pleno'] };
    const relevante = { JobTitle: 'Vaga Desenvolvedor', Description: 'Buscamos alguém com React e Node.js', Skills: [] };
    const irrelevante = { JobTitle: 'Motorista', Description: 'entregas na cidade', Skills: [] };
    assert.ok(computeMatch(dev, relevante).score > computeMatch(dev, irrelevante).score);
});
