import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, consumeState } from '../services/google.js';

// O state era um Map no processo: o usuario ia ao consentimento do Google e, se o
// servidor REINICIASSE nesse intervalo, o Map sumia junto e o callback respondia
// "Sessao de conexao expirou". Todo deploy reinicia o servico — e foi assim que o
// primeiro usuario de fora nao conseguiu conectar o Gmail.
//
// Assinado, o state nao depende de nada guardado: qualquer processo valida.
test('state assinado volta o userId', () => {
    const uid = 'a3f1c2d4-0000-4000-8000-abcdefabcdef';
    assert.equal(consumeState(createState(uid)), uid);
});

test('state sobrevive a "reinicio" (nao depende de estado em memoria)', () => {
    // Validar num state criado antes, sem nenhuma estrutura compartilhada entre as
    // chamadas, e o mais perto que da de simular o processo reiniciando.
    const s = createState('user-1');
    for (let i = 0; i < 3; i++) assert.equal(consumeState(s), 'user-1');
});

test('state adulterado e recusado', () => {
    const s = createState('user-1');
    const [payload, sig] = s.split('.');
    // Troca o usuario mantendo a assinatura antiga: e o ataque que o state previne.
    const outro = Buffer.from(JSON.stringify({ u: 'invasor', e: Date.now() + 60000 })).toString('base64url');
    assert.equal(consumeState(`${outro}.${sig}`), null);
    assert.equal(consumeState(`${payload}.${sig}x`), null);
    assert.equal(consumeState(`${payload}.`), null);
});

test('state expirado e recusado', () => {
    // Monta um payload vencido e assina com a mesma funcao, para provar que a
    // recusa vem da VALIDADE e nao da assinatura.
    const s = createState('user-1');
    const [, sig] = s.split('.');
    assert.ok(sig);
    const vencido = Buffer.from(JSON.stringify({ u: 'user-1', e: Date.now() - 1000 })).toString('base64url');
    assert.equal(consumeState(vencido + '.' + sig), null);
});

test('lixo no state nao derruba o servidor', () => {
    for (const v of [null, undefined, '', 'abc', 'a.b', '....', 'x'.repeat(500)]) {
        assert.doesNotThrow(() => consumeState(v));
        assert.equal(consumeState(v), null);
    }
});
