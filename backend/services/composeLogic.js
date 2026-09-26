// =========================
// Montar email para o usuário enviar POR CONTA PRÓPRIA (lógica pura)
// =========================
// Por que existe: medido no banco, de 9 pessoas que chegaram a salvar um
// perfil, 5 NÃO conectaram o Gmail. 56% de desistência na tela de permissão do
// Google, entre gente que já queria o produto. Era o maior buraco do funil e
// não tinha contorno: sem o token não saía nada.
//
// Este caminho entrega o email pronto (destinatário, assunto e corpo) para a
// pessoa mandar do Gmail dela. Sem OAuth, sem token, sem permissão. Ela
// comprova sozinha que a vaga existe e que o texto presta, e só depois decide
// se quer que o sistema faça isso sozinho.
//
// A lógica de decisão fica AQUI, pura, pelo mesmo motivo de billingLogic.js:
// é uma trava de segurança e trava de segurança precisa de teste.
//
// ---------------------------------------------------------------------------
// As quatro checagens, e por que cada uma existe
// ---------------------------------------------------------------------------
// 1. PERFIL: o template usa nome e contatos do perfil. Sem ele o email sai pela
//    metade e quem recebe é um recrutador real.
// 2. ESTÁ NO FEED: o mesmo motivo do /highlights/apply. Aceitar qualquer id da
//    base transformaria isto num caminho paralelo para alcançar VAGA NENHUMA
//    filtrada pelo perfil, e pior, para coletar contato em massa.
// 3. JÁ CANDIDATOU: `UNIQUE (UserId, JobId)` recusa no banco de qualquer jeito;
//    checar antes é só para devolver mensagem decente em vez de erro de
//    constraint.
// 4. COTA DO DIA: esta é a trava do moat. O email de contato é o ativo da
//    plataforma, e é exatamente por isso que /jobs e /jobs/matches nunca o
//    devolvem. Liberar um por vez, contado no MESMO teto diário do envio
//    automático, mantém a regra de pé: no free são 7 por dia, não 1500.
//
// ---------------------------------------------------------------------------
// A ORDEM DAS CHECAGENS é o detalhe que erra fácil
// ---------------------------------------------------------------------------
// "Já candidatou" vem ANTES de "está no feed", e isso não é estética: o feed
// (`getMatches`) JÁ EXCLUI as vagas candidatadas. Ou seja, toda vaga repetida
// também parece estar fora do feed, e as duas condições chegam verdadeiras
// juntas, sempre. Com a ordem invertida, clicar duas vezes na mesma vaga
// respondia "vaga fora da sua lista", que manda a pessoa procurar um problema
// que não existe. Pego na prova ponta a ponta, não no teste unitário.
//
// "Já candidatou" também vem antes da cota: repetir não consome nada, é um
// no-op, e dizer "acabou sua cota" nesse caso é falso e ainda empurra a pessoa
// para um upgrade que ela não precisa.

/**
 * Decide se o usuário pode receber o email de contato de UMA vaga.
 * Pura: sem SQL, sem rede, sem Date.now().
 *
 * @param {object}  p
 * @param {boolean} p.temPerfil     usuário tem linha em Profiles
 * @param {boolean} p.estaNoFeed    a vaga está nos matches atuais do usuário
 * @param {boolean} p.jaCandidatou  já existe Application para (usuário, vaga)
 * @param {number}  p.restamHoje    envios que ainda cabem no teto diário
 * @returns {{ok: true} | {ok: false, status: number, erro: string}}
 */
export function decideCompose({ temPerfil, estaNoFeed, jaCandidatou, restamHoje }) {
    if (!temPerfil) {
        return { ok: false, status: 403, erro: 'Complete seu perfil antes de montar o email.' };
    }
    if (jaCandidatou) {
        return { ok: false, status: 409, erro: 'Você já se candidatou a esta vaga.' };
    }
    if (!estaNoFeed) {
        return { ok: false, status: 404, erro: 'Vaga fora da sua lista de vagas compatíveis.' };
    }
    if (!Number.isFinite(restamHoje) || restamHoje <= 0) {
        return { ok: false, status: 429, erro: 'Você já usou todos os envios de hoje. Volte amanhã ou faça upgrade.' };
    }
    return { ok: true };
}
