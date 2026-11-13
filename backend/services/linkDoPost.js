/**
 * Endereço do post original no LinkedIn, a partir do id guardado na vaga.
 *
 * Só serve em "Enviadas". O post traz o email do recrutador: mostrado no feed,
 * abriria caminho para colher contato sem gastar a cota do dia.
 */
/**
 * Sem o id do post (vaga de antes de ele ser guardado, ~1/3 dos envios), a busca
 * de posts do LinkedIn por cargo e empresa, que costuma achar o original.
 */
export function buscaDoPost(titulo, empresa) {
    const termos = [titulo, empresa].map((x) => String(x || '').replace(/["']/g, ' ').trim()).filter(Boolean).join(' ').slice(0, 120);
    return termos ? `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(termos)}` : null;
}

export function linkDoPost(linkedinId) {
    const id = String(linkedinId ?? '');
    return /^\d{15,25}$/.test(id) ? `https://www.linkedin.com/feed/update/urn:li:activity:${id}/` : null;
}
