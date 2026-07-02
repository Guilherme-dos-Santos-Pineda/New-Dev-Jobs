import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abbreviateName } from '../routes/ranking.js';

// ---------- Minimização de PII no ranking ----------
test('abbreviateName: nome completo vira "Primeiro S."', () => {
    assert.equal(abbreviateName('Guilherme dos Santos Pineda'), 'Guilherme P.');
    assert.equal(abbreviateName('Ana Souza'), 'Ana S.');
});
test('abbreviateName: nome único fica como está', () => {
    assert.equal(abbreviateName('Madonna'), 'Madonna');
});
test('abbreviateName: vazio/null cai no fallback', () => {
    assert.equal(abbreviateName(''), 'Usuário');
    assert.equal(abbreviateName(null), 'Usuário');
    assert.equal(abbreviateName('   '), 'Usuário');
});
test('abbreviateName: nunca expõe o sobrenome inteiro', () => {
    const out = abbreviateName('Fulano Sobrenomelongo');
    assert.ok(!out.includes('Sobrenomelongo'), `vazou sobrenome: ${out}`);
});
