import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enderecos, umaPorRecrutador } from '../services/mesmoRecrutador.js';

// Caso real (02/11/2026): 11 currículos da mesma pessoa para vagas@innolevels.com.br.

test('enderecos: separa lista e normaliza', () => {
    assert.deepEqual(enderecos('RH@X.com.br, vagas@y.com; a@z.io'), ['rh@x.com.br', 'vagas@y.com', 'a@z.io']);
    assert.deepEqual(enderecos(null), []);
});

test('umaPorRecrutador: a primeira vaga de cada recrutador vence', () => {
    const vagas = [
        { id: 1, email: 'vagas@innolevels.com.br' },
        { id: 2, email: 'VAGAS@innolevels.com.br' },
        { id: 3, email: 'rh@outra.com' },
        { id: 4, email: 'ana@outra2.com, vagas@innolevels.com.br' },
    ];
    assert.deepEqual(umaPorRecrutador(vagas).map((v) => v.id), [1, 3]);
});

test('umaPorRecrutador: some quem já foi contatado', () => {
    const vagas = [{ id: 1, email: 'rh@a.com' }, { id: 2, email: 'rh@b.com' }];
    assert.deepEqual(umaPorRecrutador(vagas, ['rh@a.com']).map((v) => v.id), [2]);
});
