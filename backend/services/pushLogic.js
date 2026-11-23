// =========================
// Notificação no celular: o que avisar e com que texto (regra pura, 23/11/2026)
// =========================
// Pedido do dono: avisos para os usuários, por push no app instalado. Quatro tipos,
// cada um no máximo uma vez por dia por pessoa (NotificacoesEnviadas) e cada um
// desligável no perfil (Users.NotifPrefs):
//   - vagas:     vagas novas do perfil nas últimas 24 h, ao meio-dia de Brasília;
//   - envio:     o envio das 9h do plano pago começou, com quantas vagas;
//   - plano:     o Automático acaba em 3 dias, amanhã ou hoje;
//   - indicacao: o amigo indicado mandou o primeiro currículo e o bônus saiu.
// Aviso demais faz a pessoa desligar tudo: por isso só vagas NOVAS, e só se houver.

export const TIPOS = ['vagas', 'envio', 'plano', 'indicacao'];
export const HORA_DO_RESUMO_UTC = 15; // meio-dia em Brasília
const DIA_MS = 86400000;

/** As preferências com o padrão: tudo ligado, menos o que a pessoa desligou. */
export function prefsCompletas(prefs) {
    const p = prefs && typeof prefs === 'object' ? prefs : {};
    return Object.fromEntries(TIPOS.map((t) => [t, p[t] !== false]));
}

/** Só aceita os tipos conhecidos e booleanos: o resto do corpo é ignorado. */
export function prefsParaGravar(corpo) {
    const out = {};
    for (const t of TIPOS) if (typeof corpo?.[t] === 'boolean') out[t] = corpo[t];
    return out;
}

/** Quantas vagas do feed entraram nas últimas 24 h. */
export function vagasNovas(feed, agora = Date.now()) {
    return (feed || []).filter((v) => agora - new Date(v.createdAt).getTime() <= DIA_MS).length;
}

export function avisoVagas(n) {
    if (!(n > 0)) return null;
    return {
        title: n === 1 ? '1 vaga nova pro seu perfil' : `${n} vagas novas pro seu perfil`,
        body: 'Entraram nas últimas 24 horas. Abra e mande seu currículo.',
        url: '/app',
    };
}

export function avisoEnvio(n) {
    if (!(n > 0)) return null;
    return {
        title: 'Seu envio de hoje começou',
        body: `Seu currículo está saindo para ${n} ${n === 1 ? 'vaga' : 'vagas'}, uma a cada 1 ou 2 minutos.`,
        url: '/app/candidaturas',
    };
}

/** Avisa com 3 dias, 1 dia e no dia. Devolve null nos outros dias. */
export function avisoPlano(expiraEm, agora = Date.now()) {
    if (!expiraEm) return null;
    const dias = Math.ceil((new Date(expiraEm).getTime() - agora) / DIA_MS);
    if (![3, 1, 0].includes(dias)) return null;
    return {
        title: dias === 0 ? 'Seu Automático acaba hoje' : dias === 1 ? 'Seu Automático acaba amanhã' : 'Seu Automático acaba em 3 dias',
        body: 'O pagamento é único e não renova sozinho. Renovando, os dias somam aos que faltam.',
        url: '/app/assinatura',
    };
}

export function avisoIndicacao() {
    return {
        title: 'Sua indicação deu certo',
        body: 'Você ganhou +10 envios por dia por 7 dias.',
        url: '/app/indicar',
    };
}

/** Status que significam "esta inscrição não existe mais": apaga. */
export function inscricaoMorta(statusCode) {
    return statusCode === 404 || statusCode === 410;
}
