/**
 * Endereço do post original no LinkedIn, a partir do id guardado na vaga.
 *
 * Só serve em "Enviadas". O post traz o email do recrutador: mostrado no feed,
 * abriria caminho para colher contato sem gastar a cota do dia.
 */
export function linkDoPost(linkedinId) {
    const id = String(linkedinId ?? '');
    return /^\d{15,25}$/.test(id) ? `https://www.linkedin.com/feed/update/urn:li:activity:${id}/` : null;
}
