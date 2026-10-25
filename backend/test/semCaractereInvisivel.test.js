import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Um "\b" de regex escrito por script de edição virou o caractere BACKSPACE
// literal (0x08) três vezes em classify.js. O regex continua válido, só deixa
// de casar: "Blumenau/SC" deixou de ser reconhecido como Brasil e nenhum teste
// de lógica apontava a causa. Esta varredura aponta.
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

function arquivos(dir) {
    return readdirSync(dir).flatMap((n) => {
        if (n === 'node_modules') return [];
        const p = join(dir, n);
        return statSync(p).isDirectory() ? arquivos(p) : /\.(m?js)$/.test(n) ? [p] : [];
    });
}

test('nenhum arquivo do backend tem caractere de controle invisível', () => {
    const sujos = arquivos(RAIZ).filter((p) => /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(readFileSync(p, 'utf8')));
    assert.deepEqual(sujos, []);
});
