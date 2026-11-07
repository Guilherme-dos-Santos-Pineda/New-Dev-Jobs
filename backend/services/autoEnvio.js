import sql from '../lib/sql.js';
import { planOf } from '../config/plans.js';
import { planUsage } from './usage.js';
import { getMatches } from './jobsQuery.js';
import { enqueue } from './sendQueue.js';
import { assertCanSend } from './sender.js';

// =========================
// Envio automático (plano pago)
// =========================
// Único caminho em que currículo sai sem clique, por isso é estreito: só quem
// ligou, só vaga da última semana que passa nos filtros do perfil, e dentro do
// limite do dia. Os melhores matches saem primeiro.
//
// Sem piso de compatibilidade (decisão do dono, 07/11/2026): com 50% de corte a
// pessoa típica não tinha NENHUMA vaga na semana (23 de 40), e quem paga para não
// entrar todo dia não recebia nada. Com mais vagas na base, o piso pode voltar.
//
// Só vaga nova de propósito. Medido em 05/11/2026: a pessoa típica ganha 13 vagas
// boas por mês, ~3 por semana. Mandar o estoque antigo sozinho gastaria tudo no
// primeiro dia, em vaga que provavelmente já fechou.

/** Corte do botão "enviar para as melhores" em Vagas. O envio das 9h não usa. */
export const MATCH_MINIMO = 50;
const DIAS_DE_VAGA_NOVA = 7;
const HORA_UTC = 12; // 9h em Brasília
const DIA_MS = 86400000;

/** Os ids que saem hoje: novos, os melhores primeiro. */
export function escolherVagas(matches, restam, agora = Date.now()) {
    return matches
        .filter((m) => agora - new Date(m.createdAt).getTime() <= DIAS_DE_VAGA_NOVA * DIA_MS)
        .sort((a, b) => b.matchScore - a.matchScore || new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, Math.max(0, restam))
        .map((m) => m.id);
}

export const horaDeEnviar = (agora = Date.now()) => new Date(agora).getUTCHours() >= HORA_UTC;

/** Quando sai o próximo envio de quem está com o automático ligado. */
export function proximoEnvio(ultimo, agora = Date.now()) {
    const hoje = new Date(agora).toISOString().slice(0, 10);
    const ultimoDia = ultimo ? new Date(ultimo).toISOString().slice(0, 10) : '';
    const horaDeHoje = Date.parse(`${hoje}T${HORA_UTC}:00:00Z`);
    return Math.max(ultimoDia >= hoje ? horaDeHoje + DIA_MS : horaDeHoje, agora);
}

async function enviarDoDia(usuario) {
    // enqueue() substitui o lote anterior: apagaria um envio em andamento.
    const [emAndamento] = await sql`select 1 from "SendQueue" where "UserId" = ${usuario.Id} and "Status" = 'queued' limit 1`;
    if (emAndamento) return 0;

    await assertCanSend(usuario.Id);
    const { remainingToday } = await planUsage(usuario.Id, usuario.Plan);
    const ids = escolherVagas(await getMatches(usuario.Id), remainingToday);
    if (ids.length) await enqueue(usuario.Id, ids);
    return ids.length;
}

let concluidoEm = '';
let rodando = false;

/** Chamado a cada minuto pelo agendador do worker. Roda uma vez por dia. */
export async function tickAutoEnvio(agora = Date.now()) {
    const dia = new Date(agora).toISOString().slice(0, 10);
    if (rodando || concluidoEm === dia || !horaDeEnviar(agora)) return;
    rodando = true;
    try {
        const usuarios = await sql`
            select "Id", "Plan" from "Users"
            where "AutoEnvio" = true and ("AutoEnvioUltimo" is null or "AutoEnvioUltimo" < current_date)`;
        for (const u of usuarios) {
            if (!planOf(u.Plan).autoSend) continue;
            // Marca antes de enviar: uma falha não repete o envio no tique seguinte.
            await sql`update "Users" set "AutoEnvioUltimo" = current_date where "Id" = ${u.Id}`;
            try {
                const n = await enviarDoDia(u);
                console.log(`🤖 envio automático: user ${u.Id}, ${n} vaga(s)`);
            } catch (e) {
                console.warn(`envio automático não saiu para user ${u.Id}: ${e.message}`);
            }
        }
        concluidoEm = dia;
    } finally {
        rodando = false;
    }
}
