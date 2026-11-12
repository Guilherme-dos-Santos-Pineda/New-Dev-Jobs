import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// =========================
// Currículo (JSON da IA) → PDF, no servidor
// =========================
// A versão do currículo por tipo de vaga (cvVersoes.js) vai anexada no envio,
// sem a pessoa baixar nada. Na tela o PDF sai pelo window.print; aqui não há
// navegador, então o PDF é montado à mão com pdf-lib (JS puro, sem Chrome: a VM
// tem 1 GB).
//
// Fonte padrão do PDF (Helvetica, WinAnsi): cobre os acentos do português e do
// espanhol. O que ela não desenha (emoji, setas) sai do texto em vez de quebrar.
//
// Lembrete entre colchetes ("[quantos usuários?]") é um dado que só a pessoa
// sabe. Num anexo que vai direto ao recrutador ele não pode aparecer: sai aqui.

const A4 = [595.28, 841.89];
const MARGEM = 50;
const COR_TEXTO = rgb(0.13, 0.13, 0.13);
const COR_SUAVE = rgb(0.38, 0.38, 0.38);

const ROTULOS = {
    pt: { resumo: 'Resumo profissional', habilidades: 'Habilidades', experiencia: 'Experiência', projetos: 'Projetos', formacao: 'Formação', certificacoes: 'Certificações', idiomas: 'Idiomas', tecnologias: 'Tecnologias', stack: 'Stack' },
    en: { resumo: 'Professional summary', habilidades: 'Skills', experiencia: 'Experience', projetos: 'Projects', formacao: 'Education', certificacoes: 'Certifications', idiomas: 'Languages', tecnologias: 'Technologies', stack: 'Stack' },
};

/** Tira os lembretes entre colchetes e os espaços que sobram. */
export function semLembretes(texto) {
    return String(texto ?? '')
        .replace(/\s*\[[^\]\n]{0,120}\]/g, '')
        .replace(/\(\s*\)/g, '')
        .replace(/\s+([,.;:])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/** Quebra o texto em linhas que cabem na largura. */
function quebrar(texto, fonte, tamanho, largura) {
    const linhas = [];
    for (const paragrafo of String(texto).split('\n')) {
        let atual = '';
        for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
            const tentativa = atual ? `${atual} ${palavra}` : palavra;
            if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura || !atual) atual = tentativa;
            else { linhas.push(atual); atual = palavra; }
        }
        linhas.push(atual);
    }
    return linhas;
}

/**
 * Monta o PDF. `cv` tem o formato de `curriculoReescrito` (analiseCvLogic.lerResposta).
 * @returns {Promise<Buffer>}
 */
export async function curriculoEmPdf(cv, { lang = 'pt' } = {}) {
    const R = ROTULOS[lang === 'en' ? 'en' : 'pt'];
    const doc = await PDFDocument.create();
    const normal = await doc.embedFont(StandardFonts.Helvetica);
    const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
    doc.setTitle(semLembretes(cv?.nome) || 'Curriculo');

    // Caractere que a fonte não desenha sai (emoji, seta): o PDF não pode quebrar por um ícone.
    const desenhavel = new Map();
    const limpo = (s) => [...semLembretes(s)].filter((c) => {
        if (!desenhavel.has(c)) {
            try { normal.encodeText(c); desenhavel.set(c, true); } catch { desenhavel.set(c, false); }
        }
        return desenhavel.get(c);
    }).join('');

    const largura = A4[0] - MARGEM * 2;
    let pagina = doc.addPage(A4);
    let y = A4[1] - MARGEM;
    const espaco = (h) => {
        if (y - h < MARGEM) { pagina = doc.addPage(A4); y = A4[1] - MARGEM; }
    };
    const escrever = (texto, { fonte = normal, tamanho = 10, cor = COR_TEXTO, recuo = 0, depois = 2 } = {}) => {
        const t = limpo(texto);
        if (!t) return;
        for (const linha of quebrar(t, fonte, tamanho, largura - recuo)) {
            espaco(tamanho + 3);
            pagina.drawText(linha, { x: MARGEM + recuo, y: y - tamanho, size: tamanho, font: fonte, color: cor });
            y -= tamanho + 3;
        }
        y -= depois;
    };
    const secao = (titulo) => {
        espaco(30);
        y -= 8;
        escrever(titulo.toUpperCase(), { fonte: negrito, tamanho: 10.5, depois: 1 });
        pagina.drawLine({ start: { x: MARGEM, y }, end: { x: A4[0] - MARGEM, y }, thickness: 0.6, color: COR_SUAVE });
        y -= 6;
    };
    const itens = (lista) => { for (const i of lista || []) escrever(`• ${i}`, { recuo: 8 }); };

    escrever(cv?.nome, { fonte: negrito, tamanho: 18, depois: 2 });
    escrever(cv?.titulo, { tamanho: 11.5, cor: COR_SUAVE });
    escrever(cv?.contato, { tamanho: 9.5, cor: COR_SUAVE, depois: 4 });

    if (limpo(cv?.resumoProfissional)) { secao(R.resumo); escrever(cv.resumoProfissional); }
    if (cv?.habilidades?.length) {
        secao(R.habilidades);
        for (const h of cv.habilidades) escrever(h.categoria ? `${h.categoria}: ${h.itens}` : h.itens);
    }
    if (cv?.experiencias?.length) {
        secao(R.experiencia);
        for (const e of cv.experiencias) {
            escrever([e.cargo, e.empresa].filter(Boolean).join(' | '), { fonte: negrito, depois: 0 });
            escrever(e.periodo, { tamanho: 9, cor: COR_SUAVE, depois: 1 });
            itens(e.atividades);
            if (e.tecnologias) escrever(`${R.tecnologias}: ${e.tecnologias}`, { tamanho: 9, cor: COR_SUAVE });
            y -= 4;
        }
    }
    if (cv?.projetos?.length) {
        secao(R.projetos);
        for (const p of cv.projetos) {
            escrever(p.nome, { fonte: negrito, depois: 0 });
            itens(p.descricao);
            if (p.stack) escrever(`${R.stack}: ${p.stack}`, { tamanho: 9, cor: COR_SUAVE });
            y -= 4;
        }
    }
    if (cv?.formacao?.length) {
        secao(R.formacao);
        for (const f of cv.formacao) escrever([f.curso, f.instituicao, f.periodo].filter(Boolean).join(' | '));
    }
    if (cv?.certificacoes?.length) { secao(R.certificacoes); itens(cv.certificacoes); }
    if (cv?.idiomas?.length) {
        secao(R.idiomas);
        escrever(cv.idiomas.map((i) => [i.idioma, i.nivel].filter(Boolean).join(': ')).join('  ·  '));
    }

    return Buffer.from(await doc.save());
}

/** Nome do anexo: "Curriculo - Fulano de Tal.pdf", só com caractere seguro em nome de arquivo. */
export function nomeDoAnexo(nome) {
    const base = semLembretes(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w .-]/g, '').replace(/\s+/g, ' ').trim();
    return `Curriculo${base ? ` - ${base}` : ''}.pdf`;
}
