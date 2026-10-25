// Tempo relativo em português, para telas que respondem "quando foi?" e
// "quando vai ser?" (robôs, recrutadores, vagas). Data absoluta obriga a pessoa a
// fazer a conta de cabeça; "há 40 min" já é a resposta.

const MIN = 60000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** "agora", "há 5 min", "há 3 h", "ontem", "há 4 dias". null vira "nunca". */
export function haQuanto(data) {
    if (!data) return 'nunca';
    const ms = Date.now() - new Date(data).getTime();
    if (ms < MIN) return 'agora';
    if (ms < HORA) return `há ${Math.floor(ms / MIN)} min`;
    if (ms < DIA) return `há ${Math.floor(ms / HORA)} h`;
    const dias = Math.floor(ms / DIA);
    return dias === 1 ? 'ontem' : `há ${dias} dias`;
}

/** "em 12 min", "em 1h 20min", "agora" (vencido ou nos próximos segundos). */
export function emQuanto(data) {
    if (!data) return '';
    const ms = new Date(data).getTime() - Date.now();
    if (ms < MIN) return 'agora';
    if (ms < HORA) return `em ${Math.round(ms / MIN)} min`;
    const h = Math.floor(ms / HORA);
    const m = Math.round((ms % HORA) / MIN);
    if (h >= 24) return `em ${Math.round(h / 24)} dia(s)`;
    return m ? `em ${h}h ${m}min` : `em ${h}h`;
}

/** Frequência de um robô em palavras. */
export function aCada(minutos) {
    if (!minutos) return '';
    if (minutos % 1440 === 0) return minutos === 1440 ? '1x por dia' : `a cada ${minutos / 1440} dias`;
    if (minutos % 60 === 0) return `a cada ${minutos / 60}h`;
    return `a cada ${minutos} min`;
}
