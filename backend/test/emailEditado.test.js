import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { emailEditado, ASSUNTO_MAX, CORPO_MAX } from '../services/emailEditado.js';

test('sem edição, vale o modelo do perfil', () => {
    assert.deepEqual(emailEditado({ jobId: 1 }), { editado: null });
    assert.deepEqual(emailEditado(), { editado: null });
});

test('edição completa passa, sem espaço sobrando', () => {
    assert.deepEqual(emailEditado({ subject: '  Vaga Dev  -  Código 123 ', body: 'Olá,\r\n\r\nsegue meu currículo.\n' }),
        { editado: { subject: 'Vaga Dev - Código 123', body: 'Olá,\n\nsegue meu currículo.' } });
});

test('edição pela metade ou vazia é recusada', () => {
    assert.ok(emailEditado({ subject: 'Assunto' }).erro);
    assert.ok(emailEditado({ subject: '   ', body: 'texto' }).erro);
    assert.ok(emailEditado({ subject: 'Assunto', body: '  ' }).erro);
    assert.ok(emailEditado({ subject: 1, body: 'texto' }).erro);
});

test('texto grande demais é recusado', () => {
    assert.ok(emailEditado({ subject: 'a'.repeat(ASSUNTO_MAX + 1), body: 'texto' }).erro);
    assert.ok(emailEditado({ subject: 'Assunto', body: 'a'.repeat(CORPO_MAX + 1) }).erro);
});

test('o envio usa o texto editado, e só nele', async () => {
    const sender = await readFile(new URL('../services/sender.js', import.meta.url), 'utf8');
    assert.match(sender, /export async function applyToJob\(userId, jobId, editado = null\)/);
    assert.match(sender, /editado \? \{ subject: editado\.subject, body: editado\.body \} : await resolveTemplate/);
    const rota = await readFile(new URL('../routes/applications.js', import.meta.url), 'utf8');
    assert.match(rota, /applyToJob\(req\.user\.Id, jobId, editado\)/);
});
