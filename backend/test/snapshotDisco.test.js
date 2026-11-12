import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// A pasta vem do ambiente: isola o teste do .cache/ do projeto.
const dir = await mkdtemp(path.join(os.tmpdir(), 'snap-'));
process.env.SNAPSHOT_DIR = dir;
const { serializar, desserializar, lerSnapshot, gravadorDeSnapshot } = await import('../lib/snapshotDisco.js');
const { aindaNaJanela } = await import('../services/vagasPorLink.js');

test('data volta como Date: o feed compara CreatedAt', () => {
    const quando = new Date('2026-11-10T12:00:00Z');
    const o = desserializar(serializar({ corpus: [{ Id: '7', CreatedAt: quando, Mods: ['remoto'], IsBR: true, Email: null }] }));
    const v = o.dados.corpus[0];
    assert.ok(v.CreatedAt instanceof Date);
    assert.equal(v.CreatedAt.getTime(), quando.getTime());
    assert.deepEqual(v.Mods, ['remoto']);
    assert.equal(v.Email, null);
    assert.equal(v.Id, '7');
    assert.ok(o.gravadoEm > 0);
});

test('sem arquivo ou arquivo torto: null, sem lançar', async () => {
    assert.equal(await lerSnapshot('nao-existe'), null);
    assert.equal(desserializar('[]'), null);
});

test('gravador escreve e a leitura devolve o estado mais novo', async () => {
    let estado = { n: 1 };
    const agendar = gravadorDeSnapshot('teste', () => estado, 0);
    estado = { n: 2 };
    agendar();
    agendar(); // a segunda chamada no mesmo intervalo não duplica a escrita
    await new Promise((r) => setTimeout(r, 50));
    const s = await lerSnapshot('teste');
    assert.deepEqual(s.dados, { n: 2 });
    // Não sobra arquivo temporário da troca.
    assert.deepEqual((await readdir(dir)).filter((f) => f.endsWith('.tmp')), []);
});

test('vagas por link: a cópia não estica a janela de cada fonte', () => {
    const agora = Date.parse('2026-11-30T00:00:00Z');
    const dias = (n) => new Date(agora - n * 86400000);
    const lista = [
        { Id: 'a', CreatedAt: dias(10), Anunciada: true },
        { Id: 'b', CreatedAt: dias(20), Anunciada: true },
        { Id: 'c', CreatedAt: dias(20), Anunciada: false },
        { Id: 'd', CreatedAt: dias(40), Anunciada: false },
    ];
    assert.deepEqual(aindaNaJanela(lista, agora).map((v) => v.Id), ['a', 'c']);
});
