import test from 'node:test';
import assert from 'node:assert/strict';
import { temPermissaoDeEnvio, isFaltaDeEscopo, isInvalidGrant } from '../services/google.js';

// Caso real (04/11/2026): na tela do Google cada permissão é uma caixinha. Quem
// concluía sem marcar a de enviar ficava "conectado", e cada envio falhava com
// "Request had insufficient authentication scopes", com retentativa por horas.

const ENVIO = 'https://www.googleapis.com/auth/gmail.send';

test('temPermissaoDeEnvio: exige o escopo de envio entre os concedidos', () => {
    assert.equal(temPermissaoDeEnvio(`openid email ${ENVIO}`), true);
    assert.equal(temPermissaoDeEnvio('openid https://www.googleapis.com/auth/userinfo.email'), false);
    assert.equal(temPermissaoDeEnvio(''), false);
    assert.equal(temPermissaoDeEnvio(undefined), false);
});

test('isFaltaDeEscopo: reconhece a recusa do Gmail nos dois formatos', () => {
    assert.equal(isFaltaDeEscopo(new Error('Request had insufficient authentication scopes.')), true);
    assert.equal(isFaltaDeEscopo({ response: { data: { error: { status: 'PERMISSION_DENIED', message: 'Request had insufficient authentication scopes.' } } } }), true);
    assert.equal(isFaltaDeEscopo({ response: { data: { error: { status: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' } } } }), true);
});

test('isFaltaDeEscopo: erro transitório continua sendo retentado', () => {
    assert.equal(isFaltaDeEscopo(new Error('Rate limit exceeded')), false);
    assert.equal(isFaltaDeEscopo(new Error('socket hang up')), false);
    assert.equal(isFaltaDeEscopo(undefined), false);
});

test('invalid_grant segue separado de falta de escopo', () => {
    assert.equal(isInvalidGrant(new Error('invalid_grant')), true);
    assert.equal(isFaltaDeEscopo(new Error('invalid_grant')), false);
});
