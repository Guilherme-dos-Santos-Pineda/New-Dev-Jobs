import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vagaDentroDaIdade, IDADE_MAXIMA_DIAS } from '../config/idadeVaga.js';

const DIA = 86_400_000;
const agora = Date.parse('2026-11-25T12:00:00Z');
const ha = (dias) => new Date(agora - dias * DIA).toISOString();

test('post de até 6 meses entra; mais velho sai', () => {
    assert.equal(IDADE_MAXIMA_DIAS, 180);
    assert.equal(vagaDentroDaIdade({ PostedAt: ha(10) }, agora), true);
    assert.equal(vagaDentroDaIdade({ PostedAt: ha(179) }, agora), true);
    assert.equal(vagaDentroDaIdade({ PostedAt: ha(181) }, agora), false);
});

test('conta da data do POST, não de quando o robô achou (caso real: post de 7 meses, achado há 5)', () => {
    assert.equal(vagaDentroDaIdade({ PostedAt: ha(210), CreatedAt: ha(150) }, agora), false);
});

test('sem PostedAt usa CreatedAt; sem data nenhuma, mostra', () => {
    assert.equal(vagaDentroDaIdade({ CreatedAt: ha(200) }, agora), false);
    assert.equal(vagaDentroDaIdade({ CreatedAt: ha(20) }, agora), true);
    assert.equal(vagaDentroDaIdade({}, agora), true);
});
