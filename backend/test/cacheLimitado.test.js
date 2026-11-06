import test from 'node:test';
import assert from 'node:assert/strict';
import { criarCacheLimitado } from '../lib/cacheLimitado.js';

const b = (n) => Buffer.alloc(n);

test('devolve o que foi guardado', () => {
    const c = criarCacheLimitado(10);
    const buf = b(4);
    c.guardar('a', buf);
    assert.equal(c.ler('a'), buf);
    assert.equal(c.ler('b'), undefined);
});

test('nunca passa do limite: sai o mais antigo', () => {
    const c = criarCacheLimitado(10);
    c.guardar('a', b(4));
    c.guardar('b', b(4));
    c.guardar('c', b(4));
    assert.equal(c.ler('a'), undefined);
    assert.ok(c.ler('b'));
    assert.ok(c.ler('c'));
    assert.equal(c.tamanho(), 8);
});

test('o que foi lido por último fica', () => {
    const c = criarCacheLimitado(10);
    c.guardar('a', b(4));
    c.guardar('b', b(4));
    c.ler('a');
    c.guardar('c', b(4));
    assert.ok(c.ler('a'));
    assert.equal(c.ler('b'), undefined);
});

test('arquivo maior que o limite não entra e não derruba os outros', () => {
    const c = criarCacheLimitado(10);
    c.guardar('a', b(4));
    c.guardar('grande', b(11));
    assert.equal(c.ler('grande'), undefined);
    assert.ok(c.ler('a'));
});

test('guardar de novo e apagar mantêm a conta certa', () => {
    const c = criarCacheLimitado(10);
    c.guardar('a', b(4));
    c.guardar('a', b(6));
    assert.equal(c.tamanho(), 6);
    c.apagar('a');
    assert.equal(c.tamanho(), 0);
    c.apagar('inexistente');
    assert.equal(c.tamanho(), 0);
});
