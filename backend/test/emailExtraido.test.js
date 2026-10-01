import test from 'node:test';
import assert from 'node:assert/strict';
import { emailConfirmadoNoTexto, ehDominioFalso } from '../services/emailExtraido.js';

// =========================
// A IA pode LER o email do post, nunca ESCREVER um
// =========================
// Relato real: o usuário recebia alerta do Gmail de "endereço não existe".
// Medido na base em 01/10/2026: 382 de 7826 vagas tinham um email que não
// aparece em lugar nenhum do post de origem. Os valores abaixo são os REAIS.

const POST_SEM_EMAIL = `🚀 Estamos contratando! (Fortaleza/CE)
Buscamos Desenvolvedor(a) Sênior Full Stack PJ com IA Aplicada.
📩 Confira a vaga e candidate-se: https://lnkd.in/dwYbpY8d`;

test('post sem email nenhum: a IA não pode inventar um', () => {
    // Caso real, vaga 19041: o post só tinha um link e virou contato@empresa.com.
    assert.equal(emailConfirmadoNoTexto('contato@empresa.com', POST_SEM_EMAIL), null);
    assert.equal(emailConfirmadoNoTexto('rh@gestart.com.br', POST_SEM_EMAIL), null);
});

test('email que está no post é mantido', () => {
    const post = 'Envie seu currículo para vagas@acme.com.br até sexta.';
    assert.equal(emailConfirmadoNoTexto('vagas@acme.com.br', post), 'vagas@acme.com.br');
});

test('comparação ignora maiúsculas e espaços em volta', () => {
    const post = 'Mande para Vagas@Acme.com.BR';
    assert.equal(emailConfirmadoNoTexto('  vagas@acme.com.br  ', post), 'vagas@acme.com.br');
});

test('lista: mantém os reais e descarta só o inventado', () => {
    // Derrubar a lista inteira por causa de um intruso perderia os bons;
    // manter a lista inteira mandaria email para um endereço morto.
    const post = 'Contatos: siva@agentanalytics.ai e mamta@agentanalytics.ai';
    const r = emailConfirmadoNoTexto('siva@agentanalytics.ai, nitin@agentanalytics.ai, mamta@agentanalytics.ai', post);
    assert.equal(r, 'siva@agentanalytics.ai, mamta@agentanalytics.ai');
});

test('placeholders de documentação são recusados mesmo se aparecerem no texto', () => {
    // Um post pode conter "exemplo: contato@empresa.com" como instrução; isso
    // não é endereço de recrutador.
    const post = 'Exemplo de contato: contato@empresa.com';
    assert.equal(emailConfirmadoNoTexto('contato@empresa.com', post), null);
    for (const e of ['x@company.com', 'mounika@example.com', 'a@exemplo.com.br', 'b@dominio.com']) {
        assert.equal(ehDominioFalso(e), true, `deveria ser falso: ${e}`);
    }
});

test('domínio real não é confundido com placeholder', () => {
    for (const e of ['rh@cwi.com.br', 'a@3point.in', 'x@example-corp.com', 'y@minhaempresa.com.br']) {
        assert.equal(ehDominioFalso(e), false, `não deveria ser falso: ${e}`);
    }
});

test('sem texto de origem não confia em nada', () => {
    // Sem post para conferir, a única resposta honesta é "não sei", e não-sei
    // tem de significar não-envia: o custo do erro é um bounce na caixa do
    // usuário, que derruba a reputação de envio dele.
    assert.equal(emailConfirmadoNoTexto('rh@acme.com', ''), null);
    assert.equal(emailConfirmadoNoTexto('rh@acme.com', null), null);
});

test('entrada vazia ou não-string vira null', () => {
    for (const v of [null, undefined, '', '   ', 42, {}]) {
        assert.equal(emailConfirmadoNoTexto(v, 'qualquer texto'), null);
    }
});

test('não "conserta" endereço parecido', () => {
    // O post tem 3point.in; a IA devolveu point.in (perdeu o dígito). Aceitar
    // por semelhança reintroduz exatamente o bug: endereço que não existe.
    const post = 'Envie para akarsh@3point.in';
    assert.equal(emailConfirmadoNoTexto('akarsh@point.in', post), null);
    assert.equal(emailConfirmadoNoTexto('akarsh@3point.in', post), 'akarsh@3point.in');
});
