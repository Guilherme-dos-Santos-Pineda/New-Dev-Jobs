import fs from 'fs';
import path from 'path';
import { supabaseAdmin, supabaseConfigured, STORAGE_BUCKET } from './supabaseAdmin.js';

// =========================
// Armazenamento de currículos (Supabase Storage, bucket privado "cvs")
// =========================
// A chave (key) guardada em Profiles.CvPath passa a ser o caminho do objeto
// no bucket, ex.: "<userId>/cv_1700000000000_meu_cv.pdf".
// CVs antigos ficaram salvos em disco (uploads/) com caminho absoluto — o
// getCvBuffer detecta esse caso e lê do disco como fallback.

function ensureConfigured() {
    if (!supabaseConfigured) throw new Error('Supabase Storage não configurado (SUPABASE_URL/SERVICE_ROLE_KEY ausentes)');
}

// Caminho absoluto de disco = CV legado (pré-Fase 3), não é key de Storage.
function isLegacyDiskPath(cvPath) {
    return typeof cvPath === 'string' && path.isAbsolute(cvPath);
}

/**
 * Sobe o PDF para o Storage e devolve a key do objeto.
 * @param {string} userId  uuid do usuário
 * @param {{buffer: Buffer, originalname: string}} file  arquivo (multer memoryStorage)
 */
export async function uploadCv(userId, file) {
    ensureConfigured();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${userId}/cv_${Date.now()}_${safe}`;
    const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(key, file.buffer, {
        contentType: 'application/pdf',
        upsert: true,
    });
    if (error) throw new Error(`Falha ao enviar CV ao Storage: ${error.message}`);
    return key;
}

/**
 * Baixa o CV e devolve o Buffer. Aceita key de Storage ou caminho de disco legado.
 */
export async function getCvBuffer(cvPath) {
    if (!cvPath) throw new Error('Currículo não encontrado');

    // CV legado em disco
    if (isLegacyDiskPath(cvPath)) {
        if (!fs.existsSync(cvPath)) throw new Error('Arquivo de currículo não encontrado no disco');
        return fs.readFileSync(cvPath);
    }

    ensureConfigured();
    const { data, error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).download(cvPath);
    if (error) throw new Error(`Falha ao baixar CV do Storage: ${error.message}`);
    return Buffer.from(await data.arrayBuffer());
}

/**
 * Remove um CV do Storage (best-effort). Ignora caminhos legados de disco.
 */
export async function removeCv(cvPath) {
    if (!cvPath || isLegacyDiskPath(cvPath) || !supabaseConfigured) return;
    try {
        await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([cvPath]);
    } catch {
        // limpeza é best-effort; não falha o fluxo principal
    }
}
