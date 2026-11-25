// =========================
// Idade máxima da vaga oferecida
// =========================
// Conta da data do POST (`PostedAt`), não de quando o robô achou: o monitoramento
// pega post antigo de recrutador, e a vaga entrava "nova" com post de meses antes.
// Relato em 24/11/2026: o recrutador pediu o print do anúncio, que era de 7 meses
// atrás. Medido no mesmo dia: 736 de 12,7 mil vagas com post de mais de 6 meses.
// Sem `PostedAt`, vale `CreatedAt`.
//
// Vale no feed inteiro (feedCache.vagasDoFeed): botão de envio, envio das 9h,
// fila, seleção manual, sugestões do perfil. A cascata do admin
// (diagnosticoFeed.js) corta igual.

export const IDADE_MAXIMA_DIAS = 180;

/** O post da vaga é recente o bastante para ainda oferecer? */
export function vagaDentroDaIdade(vaga, agora = Date.now()) {
    const quando = new Date(vaga?.PostedAt || vaga?.CreatedAt || 0).getTime();
    if (!quando) return true; // sem data nenhuma: erra para o lado de mostrar
    return agora - quando <= IDADE_MAXIMA_DIAS * 86_400_000;
}
