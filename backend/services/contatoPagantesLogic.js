// =========================
// Admin › Falar com pagantes: a regra (sem banco)
// =========================
// Pedido do dono (25/11/2026): conversar com cada pagante para saber o que estão
// achando, começando por quem pagou e não usa. A tela agrupa, sugere a mensagem
// no jeito dele e abre o WhatsApp ou o Gmail com o texto pronto.

export const GRUPOS = [
    { id: 'naoUsa', titulo: 'Pagou e não está usando', desc: 'Prioridade: entender o que travou.' },
    { id: 'semVaga', titulo: 'Pode estar sem vaga', desc: 'O envio das 9h de hoje saiu bem abaixo do limite: o perfil provavelmente zerou.' },
    { id: 'usa', titulo: 'Usando bem', desc: 'Pedir opinião e se já teve retorno.' },
];

const primeiro = (nome) => String(nome || '').trim().split(/\s+/)[0] || '';

/**
 * Em que grupo a pessoa cai.
 * `hoje` = enviados hoje + o que está na fila; `limite` = teto do dia do plano.
 * Sem vaga: Automático ligado, já rodou hoje, e o lote do dia saiu com menos da
 * metade do limite (o automático enche o lote até o limite quando há vaga).
 */
export function grupoDoPagante(p) {
    if (!p.gmail || !p.auto) return 'naoUsa';
    if (p.autoRodouHoje && p.limite > 0 && p.hoje < p.limite / 2) return 'semVaga';
    return 'usa';
}

/** Por que caiu no grupo, em uma linha para o dono. */
export function notaDoPagante(p) {
    if (!p.gmail) return 'Pagou e nunca conectou o Gmail.';
    if (!p.auto) return `Automático desligado (${p.envios} envios no total).`;
    if (grupoDoPagante(p) === 'semVaga') return `Hoje saíram ${p.hoje} de ${p.limite}. ${p.envios} envios no total.`;
    return `${p.envios} envios no total, Automático ligado.`;
}

/** A mensagem sugerida, no jeito do dono. `dica` (opcional) vem das sugestões do perfil. */
export function mensagemPara(p, { dica = null, venceEm = '' } = {}) {
    const n = primeiro(p.nome);
    const oi = `Fala${n ? ' ' + n : ''}, aqui é o Guilherme do New Dev Jobs.`;
    if (!p.gmail) {
        return `${oi} Vi que você pegou o Automático mas ainda não conectou o Gmail, aí ele não consegue mandar nada por você. Travou em alguma parte? Se quiser, te ajudo a configurar em 2 minutos${venceEm ? `, e o plano tá valendo até ${venceEm}` : ''}.`;
    }
    if (!p.auto) {
        if (p.envios >= 200) return `${oi} Vi que você desligou o Automático depois de mandar uns ${p.envios} currículos. Conseguiu alguma coisa? 👀 Se foi outra coisa, me conta também, quero entender o que dá pra melhorar.`;
        return `${oi} Vi que o envio automático tá desligado na sua conta e queria entender: teve algo que não curtiu, vaga que não tinha a ver, ou só não viu onde ligava? Tô ajustando a ferramenta pelo que o pessoal fala, então sua opinião ajuda demais.`;
    }
    if (grupoDoPagante(p) === 'semVaga') {
        const ajuste = dica
            ? ` Tem um ajuste que destrava mais: "${dica.texto}" dá mais umas ${dica.ganho} vagas pro seu perfil (em Vagas, no cartão "Seu perfil tem só", é só tocar em Marcar).`
            : ' Dá pra ampliar o perfil em Vagas, no cartão "Seu perfil tem só", que mostra o que mais traz vaga.';
        return `${oi} Vi que você já mandou pra quase todas as vagas do seu perfil, por isso o envio de hoje saiu pequeno.${ajuste} E me conta: o que tá achando até agora? Já teve algum retorno?`;
    }
    return `${oi} Você tá entre os que mais usam o Automático e queria ouvir de você: já teve resposta de recrutador ou entrevista? Tem algo que te incomoda ou que você queria que tivesse? Pode ser sincero, tô ajustando tudo pelo que vocês falam 🙏`;
}

/** Número para o wa.me: só dígitos, com 55 quando vier sem o país. Vazio: sem WhatsApp. */
export function whatsDe(telefone) {
    let d = String(telefone || '').replace(/\D/g, '');
    if (d.length < 10) return null;
    if (d.length <= 11) d = '55' + d;
    return d;
}
