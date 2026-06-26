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
