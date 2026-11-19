// =========================
// Promoção em vigor (Black Friday 2026)
// =========================
// Decisão do dono (19/11/2026): "30 + 30 dias por R$ 10", de hoje até 30/11. O preço
// é o de sempre (R$ 10, plans.js): a promoção dá DIAS a mais, não desconto. Assim não
// existe "preço de" inflado para depois baixar, que é o problema clássico de Procon.
//
// Vale a data em que a pessoa ABRE o checkout: os dias vão gravados no metadata da
// sessão (billing.js), então Pix ou boleto pago no dia 1º continua valendo 60 dias.
// A landing continua só com o grátis (decisão de 06/11/2026); a oferta é dentro do app.
//
// Para a próxima: troque as datas e o nome. Fora da janela, nada muda em lugar nenhum.

export const PROMOCAO = {
    id: 'black-friday-2026',
    nome: 'Black Friday',
    inicio: '2026-11-19T00:00:00-03:00',
    fim: '2026-11-30T23:59:59-03:00',
    diasExtra: 30,
};

/** A promoção vale agora? Devolve o que a tela precisa, ou null. */
export function promocaoAtiva(agora = Date.now(), p = PROMOCAO) {
    const ini = Date.parse(p.inicio);
    const fim = Date.parse(p.fim);
    if (!(agora >= ini && agora <= fim)) return null;
    return { id: p.id, nome: p.nome, fim: p.fim, diasExtra: p.diasExtra };
}
