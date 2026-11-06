import test from 'node:test';
import assert from 'node:assert/strict';
import { devePedirFeedback, abreviarNome, montarInteracoes, ENVIOS_PARA_PEDIR } from '../services/feedbackMural.js';

test('pede feedback a partir de 10 envios, para quem ainda não deixou', () => {
    assert.equal(ENVIOS_PARA_PEDIR, 10);
    assert.equal(devePedirFeedback({ enviados: 9, jaDeu: false }), false);
    assert.equal(devePedirFeedback({ enviados: 10, jaDeu: false }), true);
    assert.equal(devePedirFeedback({ enviados: 50, jaDeu: true }), false);
});

test('o mural não mostra nome completo', () => {
    assert.equal(abreviarNome('Maria da Silva'), 'Maria S.');
    assert.equal(abreviarNome('  Ana   souza '), 'Ana S.');
    assert.equal(abreviarNome('Ana'), 'Ana');
    assert.equal(abreviarNome(''), 'Usuário');
    assert.equal(abreviarNome(null), 'Usuário');
});

test('conta votos e marca o da pessoa', () => {
    const votos = [
        { FeedbackId: '1', UserId: 'a', Voto: 1 },
        { FeedbackId: '1', UserId: 'b', Voto: 1 },
        { FeedbackId: '1', UserId: 'c', Voto: -1 },
    ];
    const i = montarInteracoes(['1', '2'], votos, [], 'c');
    assert.deepEqual({ ...i.get('1'), comentarios: undefined }, { likes: 2, dislikes: 1, meuVoto: -1, comentarios: undefined });
    assert.deepEqual(i.get('2'), { likes: 0, dislikes: 0, meuVoto: 0, comentarios: [] });
});

test('resposta sai com nome abreviado e sabe de quem é', () => {
    const respostas = [{ Id: '9', FeedbackId: '1', UserId: 'a', Mensagem: 'concordo', CreatedAt: 'x', Author: 'Maria da Silva' }];
    const [r] = montarInteracoes(['1'], [], respostas, 'a').get('1').comentarios;
    assert.equal(r.author, 'Maria S.');
    assert.equal(r.mine, true);
    assert.equal(montarInteracoes(['1'], [], respostas, 'b').get('1').comentarios[0].mine, false);
});

test('voto e resposta de relato fora da lista são ignorados', () => {
    const i = montarInteracoes(['1'], [{ FeedbackId: '7', UserId: 'a', Voto: 1 }], [{ Id: '1', FeedbackId: '7', UserId: 'a', Mensagem: 'x', Author: 'A' }], 'a');
    assert.deepEqual(i.get('1'), { likes: 0, dislikes: 0, meuVoto: 0, comentarios: [] });
});
