import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enderecos, umaPorRecrutador, marcasDaVaga, chavesDaVaga, cargoComparavel } from '../services/mesmoRecrutador.js';

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

// Caso real (25/11/2026): "Auditor Técnico" da Decision, duas vagas com dois
// recrutadores do mesmo domínio, as duas enviadas no mesmo dia.
test('mesma vaga com outro email da empresa: cargo igual + domínio igual é a mesma vaga', () => {
    const vagas = [
        { id: 1, title: 'Auditor Técnico', email: 're@decisionbr.com.br' },
        { id: 2, title: 'Auditor técnico', email: 'da@decisionbr.com.br' },
        { id: 3, title: 'Analista de RH', email: 'ta@decisionbr.com.br' },
        { id: 4, title: 'Desenvolvedor(a) Backend', email: 'a@x.com' },
        { id: 5, title: 'Desenvolvedor Backend', email: 'b@x.com' },
    ];
    assert.deepEqual(umaPorRecrutador(vagas).map((v) => v.id), [1, 3, 4]);
});

test('gmail não junta pessoas diferentes; já contatado por chave também sai', () => {
    const vagas = [
        { id: 1, title: 'Recepcionista', email: 'ana@gmail.com' },
        { id: 2, title: 'Recepcionista', email: 'bia@gmail.com' },
        { JobId: 3, JobTitle: 'Auditor Técnico', Email: 'novo@decisionbr.com.br' },
    ];
    const contatados = marcasDaVaga('Auditor Tecnico', 'velho@decisionbr.com.br');
    assert.deepEqual(umaPorRecrutador(vagas, contatados).map((v) => v.id ?? v.JobId), [1, 2]);
    assert.deepEqual(chavesDaVaga('Vaga', 'a@gmail.com'), []);
    assert.deepEqual(chavesDaVaga('', 'a@empresa.com'), []);
    assert.equal(cargoComparavel('Engenheiro(a) de Dados - Sênior'), 'engenheiro de dados senior');
});
