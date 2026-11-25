import sql from '../lib/sql.js';
import { TETOS, criarContador } from './segurancaLogic.js';

// =========================
// Segurança contra raspagem: contadores e alertas (regra em segurancaLogic.js)
// =========================
// Em memória de propósito: o processo é um só, reinício zera (o pior caso é dar
// mais um dia de folga), e não vira uma escrita no banco por leitura de vaga.

const detalhes = criarContador(TETOS.detalhePorDia);
const revelacoesPorIp = criarContador(TETOS.revelarPorIpDia);

const alertas = [];
function alertar(tipo, dados) {
    const a = { em: new Date().toISOString(), tipo, ...dados };
    alertas.unshift(a);
    if (alertas.length > 200) alertas.length = 200;
    console.warn(`🛡️ ${tipo}: ${JSON.stringify(dados)}`);
}

/** Mais um detalhe de vaga lido por esta conta. true = passou do teto do dia. */
export function contarDetalhe(user) {
    const r = detalhes(user.Id);
    if (r.primeiraVez) alertar('detalhes demais', { userId: user.Id, email: user.Email, n: r.n });
    return r.passou;
}

/** Mais um "enviar você mesmo" deste IP (todas as contas somadas). true = passou do teto. */
export function contarRevelacao(ip, user) {
    const r = revelacoesPorIp(String(ip || 'sem-ip'));
    if (r.passou) alertar('emails revelados demais no mesmo IP', { ip: String(ip || '').replace(/\.\d+$/, '.x'), userId: user.Id, email: user.Email, n: r.n });
    return r.passou;
}

export function registrarAlerta(tipo, dados) { alertar(tipo, dados); }

/** Admin › Segurança. Consultas sequenciais (regra do pool). */
export async function painelSeguranca() {
    const revelaram = await sql`
        select u."Id" as id, u."Name" as nome, u."Email" as email, u."CreatedAt" as "criadaEm", u."GoogleConnected" as gmail,
               count(*)::int as revelados, count(distinct a."SentAt"::date)::int as dias,
               (select count(*)::int from "Applications" x where x."UserId" = u."Id" and x."Status" = 'sent') as "enviosGmail"
        from "Applications" a join "Users" u on u."Id" = a."UserId"
        where a."Status" = 'manual' and a."SentAt" > now() - interval '7 days'
        group by u."Id" order by revelados desc limit 20`;
    const contas = await sql`
        select "CreatedAt"::date as dia, count(*)::int as contas from "Users"
        where "CreatedAt" > now() - interval '14 days' group by 1 order by 1 desc`;
    const [tot] = await sql`
        select count(*)::int as n, count(distinct "UserId")::int as pessoas from "Applications"
        where "Status" = 'manual' and "SentAt" > now() - interval '7 days'`;
    return { alertas, revelaram, contas, revelados7d: tot, tetos: TETOS };
}
