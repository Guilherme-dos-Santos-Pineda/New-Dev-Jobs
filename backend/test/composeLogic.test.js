import test from 'node:test';
import assert from 'node:assert/strict';
import { decideCompose } from '../services/composeLogic.js';

// =========================
// Travas do "enviar por conta própria"
// =========================
// Este é o único caminho que devolve o email de contato de uma vaga. Se
// qualquer uma destas checagens cair, a base vira uma lista de contatos para
// raspar, que é exatamente o que /jobs e /jobs/matches evitam. Daí o teste.

const ok = { temPerfil: true, estaNoFeed: true, jaCandidatou: false, restamHoje: 7 };

test('libera quando está tudo em ordem', () => {
    assert.deepEqual(decideCompose(ok), { ok: true });
});

test('sem perfil não monta email', () => {
    const r = decideCompose({ ...ok, temPerfil: false });
    assert.equal(r.ok, false);
    assert.equal(r.status, 403);
});

test('vaga fora do feed do usuário é recusada', () => {
    // Sem isto o endpoint alcançaria QUALQUER vaga da base pelo id, pulando os
    // filtros do perfil. Mesmo raciocínio do /highlights/apply.
    const r = decideCompose({ ...ok, estaNoFeed: false });
    assert.equal(r.ok, false);
    assert.equal(r.status, 404);
});

test('vaga já candidatada é recusada', () => {
    const r = decideCompose({ ...ok, jaCandidatou: true });
    assert.equal(r.ok, false);
    assert.equal(r.status, 409);
});

test('cota esgotada barra a liberação do email', () => {
    // É esta linha que impede alguém de puxar 1500 endereços num dia.
    const r = decideCompose({ ...ok, restamHoje: 0 });
    assert.equal(r.ok, false);
    assert.equal(r.status, 429);
});

test('cota negativa também barra', () => {
    assert.equal(decideCompose({ ...ok, restamHoje: -3 }).ok, false);
});

test('cota indefinida barra em vez de liberar', () => {
    // Se `restamHoje` chegar undefined por um bug de chamada, o padrão seguro é
    // NÃO entregar o contato. Um `> 0` ingênuo com NaN deixaria passar.
    for (const valor of [undefined, null, NaN, 'muitos']) {
        const r = decideCompose({ ...ok, restamHoje: valor });
        assert.equal(r.ok, false, `restamHoje=${String(valor)} deveria barrar`);
        assert.equal(r.status, 429);
    }
});

test('repetida vence cota esgotada (repetir não consome nada)', () => {
    // Quem clica de novo numa vaga que já mandou tem de ler "já se candidatou",
    // não "acabou sua cota": a segunda mensagem é falsa e manda a pessoa pagar
    // por um limite que ela não atingiu.
    const r = decideCompose({ ...ok, jaCandidatou: true, restamHoje: 0 });
    assert.equal(r.status, 409);
});

test('vaga repetida diz "já se candidatou", não "fora da lista"', () => {
    // Regressão: o feed já exclui o que foi candidatado, então uma vaga
    // repetida chega aqui com estaNoFeed=false E jaCandidatou=true ao mesmo
    // tempo. Com a ordem invertida a pessoa lia "vaga fora da sua lista" ao
    // clicar duas vezes, e ia caçar um problema inexistente.
    const r = decideCompose({ ...ok, jaCandidatou: true, estaNoFeed: false });
    assert.equal(r.status, 409);
});

test('falta de perfil vence todo o resto', () => {
    const r = decideCompose({ temPerfil: false, estaNoFeed: false, jaCandidatou: true, restamHoje: 0 });
    assert.equal(r.status, 403);
});

test('nenhuma mensagem de erro vaza o email do recrutador', () => {
    // O objeto de decisão vai inteiro para a resposta HTTP.
    const casos = [
        { ...ok, temPerfil: false }, { ...ok, estaNoFeed: false },
        { ...ok, jaCandidatou: true }, { ...ok, restamHoje: 0 },
    ];
    for (const c of casos) {
        const r = decideCompose(c);
        assert.equal('to' in r, false);
        assert.equal(/@/.test(r.erro), false, `mensagem não deve conter endereço: ${r.erro}`);
    }
});
