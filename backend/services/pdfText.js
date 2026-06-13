import { getDocumentProxy } from 'unpdf';

// Extrai o texto do PDF preservando as quebras de linha originais
// (essenciais para o parser do LinkedIn). Usa o `hasEOL` dos itens do pdfjs.
export async function pdfToText(buffer) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const lines = [];

    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        let line = '';
        for (const item of content.items) {
            line += item.str || '';
            if (item.hasEOL) { lines.push(line); line = ''; }
        }
        if (line) lines.push(line);
    }

    return lines.join('\n');
}
