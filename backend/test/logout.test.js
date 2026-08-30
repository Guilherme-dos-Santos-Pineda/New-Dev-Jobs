import test from 'node:test';
import assert from 'node:assert/strict';
import { purgeToken, foiDeslogado } from '../middleware/auth.js';

// Monta um access_token com a mesma forma do Supabase (header.payload.assinatura).
// A assinatura nao importa aqui: o middleware so le o `exp` para saber ate quando
// precisa lembrar do token. Validar a assinatura e trabalho do Supabase.
function jwtFalso(expSegundos) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'user-1', exp: expSegundos })}.assinatura`;
}

// O access_token do Supabase e um JWT: vale pela ASSINATURA, nao por uma sessao
// consultada a cada uso. Encerrar a sessao revoga o refresh token, mas o access
// token que ja esta na mao de alguem continua valido ate expirar — medido em
// producao, ainda funcionava depois do logout. Por isso o logout precisa de uma
// lista de recusa propria.
test('logout invalida o token na hora', () => {
    const token = jwtFalso(Math.floor(Date.now() / 1000) + 3600);
    assert.equal(foiDeslogado(token), false, 'token novo nao pode nascer deslogado');
    purgeToken(token);
    assert.equal(foiDeslogado(token), true, 'depois do logout o token tem de ser recusado');
});

// A lista nao pode crescer sem fim: cada entrada morre junto com o proprio token.
test('a entrada some quando o token expira', () => {
    const jaExpirado = jwtFalso(Math.floor(Date.now() / 1000) - 10);
    purgeToken(jaExpirado);
    assert.equal(foiDeslogado(jaExpirado), false, 'token ja expirado nao precisa ocupar memoria');
});

test('deslogar um token nao afeta os outros', () => {
    const a = jwtFalso(Math.floor(Date.now() / 1000) + 3600);
    const b = jwtFalso(Math.floor(Date.now() / 1000) + 1800);
    purgeToken(a);
    assert.equal(foiDeslogado(a), true);
    assert.equal(foiDeslogado(b), false, 'quem nao deslogou continua logado');
});

test('purgeToken aguenta token malformado sem quebrar', () => {
    assert.doesNotThrow(() => purgeToken('nao-e-um-jwt'));
    assert.equal(foiDeslogado('nao-e-um-jwt'), true, 'na duvida, recusa');
    assert.doesNotThrow(() => purgeToken(null));
    assert.doesNotThrow(() => purgeToken(undefined));
});
