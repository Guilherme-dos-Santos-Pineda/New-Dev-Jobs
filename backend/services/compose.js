import sql from '../lib/sql.js';
import { computeMatch } from './matching.js';
import { renderEmail } from './templates.js';
import { resolveTemplate } from '../routes/templates.js';
import { getMatches, invalidateMatches } from './jobsQuery.js';
import { planOf } from '../config/plans.js';
import { decideCompose } from './composeLogic.js';
import { emailDeContatoValido } from './emailContato.js';

// =========================
// Email pronto para o usuário mandar do Gmail dele (sem OAuth)
// =========================
// O "porquê" está em composeLogic.js. Aqui fica só o IO.

class ComposeError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}

/**
 * Libera o email de contato de UMA vaga, montado com o template do usuário.
 *
 * Registra a candidatura como `Status = 'manual'`: a vaga sai do feed e nunca
 * mais é oferecida, igual a um envio de verdade.
 *
 * @returns {{to, subject, body, title, company, matchScore, remainingToday}}
 */
export async function composeForJob(userId, jobId, planName) {
    const [user] = await sql`select * from "Users" where "Id" = ${userId}`;
    if (!user) throw new ComposeError('Usuário não encontrado', 404);

    const [profile] = await sql`select * from "Profiles" where "UserId" = ${userId}`;

    // A vaga tem de estar no feed DESTE usuário. `getMatches` já aplica os
    // filtros do perfil e exclui o que ele candidatou; sem esta checagem o
    // endpoint viraria "me dê o contato de qualquer vaga da base".
    const matches = await getMatches(userId);
    // Id de bigint volta como string no porsager: comparar como string.
    const alvo = matches.find((m) => String(m.id) === String(jobId));

    const [jaFeita] = await sql`
        select "Id" from "Applications" where "UserId" = ${userId} and "JobId" = ${jobId}`;

    const limite = planOf(planName).dailyLimit;
    const [{ count: usadosHoje }] = await sql`
        select count(*)::int as count from "Applications"
        where "UserId" = ${userId} and "SentAt"::date = current_date`;

    const veredito = decideCompose({
        temPerfil: !!profile,
        estaNoFeed: !!alvo,
        jaCandidatou: !!jaFeita,
        restamHoje: limite - usadosHoje,
    });
    if (!veredito.ok) throw new ComposeError(veredito.erro, veredito.status);

    const [job] = await sql`select * from "Jobs" where "Id" = ${jobId}`;
    if (!job) throw new ComposeError('Vaga não encontrada', 404);
    // Mesma trava do envio automático: "(11) 99153-5908" é truthy e passava.
    // Aqui doeria diferente, porque o endereço vai DIRETO para a tela e a
    // pessoa colaria um telefone no campo "para" do Gmail.
    if (!emailDeContatoValido(job.Email)) throw new ComposeError('Vaga sem email de contato válido', 422);

    const match = computeMatch(profile, job);
    const tpl = await resolveTemplate(userId, 'pt');
    const rendered = renderEmail({ subjectTemplate: tpl.subject, bodyTemplate: tpl.body, user, profile, job });

    // -----------------------------------------------------------------------
    // A gravação é o gargalo de segurança, não a leitura acima.
    // -----------------------------------------------------------------------
    // Checar a cota e depois inserir, em dois passos soltos, é uma corrida: com
    // requisições em paralelo TODAS passam pela checagem antes de qualquer uma
    // gravar, e quem disparar 1500 ao mesmo tempo leva 1500 endereços. Isso
    // anularia a razão de /jobs e /jobs/matches esconderem o email.
    //
    // Então a contagem e a inserção acontecem na MESMA transação, depois de um
    // `for update` na linha do usuário: as requisições do mesmo usuário passam
    // uma de cada vez, e a segunda já enxerga a primeira. O lock é por usuário
    // (não trava ninguém mais) e dura o tempo de dois statements.
    //
    // No pooler em transaction mode isto é seguro: a transação fica presa a uma
    // conexão só. Não confundir com advisory lock, que precisa de session mode.
    const gravado = await sql.begin(async (tx) => {
        await tx`select "Id" from "Users" where "Id" = ${userId} for update`;

        const [{ count: agora }] = await tx`
            select count(*)::int as count from "Applications"
            where "UserId" = ${userId} and "SentAt"::date = current_date`;
        if (agora >= limite) return { estourou: true };

        // `SentAt` é o que `countSentToday` conta, e é por isso que ele é
        // preenchido aqui: o recurso escasso é o ENDEREÇO liberado, não o
        // clique em enviar. O Status fica 'manual' justamente porque não
        // sabemos se a pessoa mandou, e a tela de Candidaturas diz isso.
        const [row] = await tx`
            insert into "Applications" ("UserId", "JobId", "Status", "MatchScore", "Subject", "Body", "SentAt")
            values (${userId}, ${jobId}, 'manual', ${match.score}, ${rendered.subject}, ${rendered.text}, now())
            on conflict ("UserId", "JobId") do nothing
            returning "Id"`;
        if (!row) return { repetida: true };

        return { id: row.Id, usados: agora + 1 };
    });

    if (gravado.estourou) {
        throw new ComposeError('Você já usou todos os envios de hoje. Volte amanhã ou faça upgrade.', 429);
    }
    if (gravado.repetida) {
        throw new ComposeError('Você já se candidatou a esta vaga.', 409);
    }

    // A vaga saiu do conjunto "ainda não candidatadas": derruba o memo, senão
    // ela reapareceria como disponível por até o TTL.
    invalidateMatches(userId);

    return {
        to: job.Email,
        subject: rendered.subject,
        body: rendered.text,
        title: alvo.title || job.Title || 'Vaga',
        company: job.Company || '',
        matchScore: match.score,
        remainingToday: Math.max(0, limite - gravado.usados),
    };
}

export { ComposeError };
