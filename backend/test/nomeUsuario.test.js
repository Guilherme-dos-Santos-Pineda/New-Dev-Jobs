import { test } from 'node:test';
import assert from 'node:assert/strict';
import { limparNome, remetente } from '../services/nomeUsuario.js';

test('limpa espaços e aceita nome com acento', () => {
    assert.equal(limparNome('  Guilherme   dos  Santos '), 'Guilherme dos Santos');
    assert.equal(limparNome('João Ávila'), 'João Ávila');
});

test('recusa vazio, curto, comprido demais e só número', () => {
    assert.equal(limparNome(''), null);
    assert.equal(limparNome('a'), null);
    assert.equal(limparNome('x'.repeat(81)), null);
    assert.equal(limparNome('12345'), null);
    assert.equal(limparNome(null), null);
});

test('tira o que quebraria o cabeçalho do email ou viraria HTML', () => {
    assert.equal(limparNome('Ana\r\nBcc: x@y.com'), 'Ana Bcc: x@y.com');
    assert.equal(limparNome('<b>Ana</b> "Lima"'), 'b Ana /b Lima');
});

test('o remetente leva o nome escolhido e o endereço do Gmail conectado', () => {
    assert.deepEqual(remetente({ Name: 'Ana Lima', GoogleEmail: 'ana@gmail.com', Email: 'ana@x.com' }), { name: 'Ana Lima', address: 'ana@gmail.com' });
    assert.equal(remetente({ Name: '', Email: 'ana@x.com' }), 'ana@x.com');
});
