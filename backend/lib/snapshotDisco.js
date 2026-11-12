import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// =========================
// Cópia em disco do que o processo guarda em memória
// =========================
// O feed (feedCache.js) e as vagas por link (vagasPorLink.js) vivem em memória
// para poupar o egress do Supabase. Só que a memória some a cada deploy ou
// reinício, e a primeira requisição depois disso baixava tudo de novo: ~12 MB do
// feed e ~4 MB dos links, dezenas de vezes por ciclo (medido em 11/11/2026, era
// a maior fonte de egress depois dos scripts locais).
//
// Com a cópia, o processo novo lê o disco e só pergunta ao banco o que mudou. A
// cópia NUNCA é a fonte da verdade: quem a usa confere contra o banco (a
// impressão do feed) ou descarta a cópia velha (links).
//
// Fica em `.cache/` na raiz do projeto, e não em /tmp: o serviço roda com
// PrivateTmp=true, que zera o /tmp a cada reinício. O `git reset --hard` do
// deploy não apaga arquivo ignorado pelo git.

const DIR = process.env.SNAPSHOT_DIR || fileURLToPath(new URL('../../.cache/', import.meta.url));

// Date vira string no JSON e o código compara datas: marca e devolve como Date.
function substituto(chave, valor) {
    const original = this[chave];
    return original instanceof Date ? { $data: original.getTime() } : valor;
}
function revive(_chave, valor) {
    if (valor && typeof valor === 'object' && typeof valor.$data === 'number' && Object.keys(valor).length === 1) return new Date(valor.$data);
    return valor;
}

export function serializar(dados) {
    return JSON.stringify({ gravadoEm: Date.now(), dados }, substituto);
}
export function desserializar(texto) {
    const o = JSON.parse(texto, revive);
    return o && typeof o === 'object' && 'dados' in o ? o : null;
}

/** { gravadoEm, dados } ou null (sem arquivo, arquivo torto, disco recusou). Nunca lança. */
export async function lerSnapshot(nome) {
    try {
        return desserializar(await readFile(path.join(DIR, `${nome}.json`), 'utf8'));
    } catch {
        return null;
    }
}

async function gravar(nome, dados) {
    await mkdir(DIR, { recursive: true });
    const destino = path.join(DIR, `${nome}.json`);
    // Grava ao lado e troca: um reinício no meio da escrita não deixa arquivo pela metade.
    const temp = `${destino}.${process.pid}.tmp`;
    await writeFile(temp, serializar(dados));
    await rename(temp, destino);
}

/**
 * Gravação com intervalo mínimo: o feed muda a cada minuto quando chega vaga, e
 * reescrever ~15 MB toda vez gastaria CPU da VM à toa. `pegarDados` é chamada na
 * hora de gravar, então sai sempre o estado mais novo. Falha só vira aviso.
 */
export function gravadorDeSnapshot(nome, pegarDados, intervaloMs = 10 * 60 * 1000) {
    let ultima = 0;
    let timer = null;
    return function agendar() {
        if (timer) return;
        const espera = Math.max(0, intervaloMs - (Date.now() - ultima));
        timer = setTimeout(async () => {
            timer = null;
            ultima = Date.now();
            try { await gravar(nome, pegarDados()); } catch (e) { console.warn(`snapshot ${nome}: não gravou (${e.message})`); }
        }, espera);
        timer.unref?.();
    };
}
