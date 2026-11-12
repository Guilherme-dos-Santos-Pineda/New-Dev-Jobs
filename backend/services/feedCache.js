import sql from '../lib/sql.js';
import { LIKE_EMAIL } from './emailContato.js';
import { lerSnapshot, gravadorDeSnapshot } from '../lib/snapshotDisco.js';

// =========================
// Vagas do feed em memória
// =========================
// O limite que chega primeiro no plano grátis do Supabase é o EGRESS (5 GB por
// ciclo), e não o banco nem os usuários: cada feed trazia até 1500 vagas com a
// descrição inteira, ~2,3 MB, e cada envio refazia a consulta. No dia do post no
// Reddit foram 519 MB; no ritmo daquele dia, o ciclo acabava em uma semana.
//
// A lista de vagas é a MESMA para todo mundo, só o filtro muda por pessoa. Então
// o processo guarda as vagas que podem entrar em algum feed (~10 mil, ~15 MB) e
// filtra aqui. O banco só manda o que mudou:
//
//  • Uma vez por minuto, e só se alguém pedir, uma IMPRESSÃO da lista: o maior
//    Id e um md5 calculado LÁ, sobre os campos que afetam o feed. Volta ~50 bytes.
//  • Vaga nova (Id maior, impressão antiga igual): traz só as novas.
//  • Impressão diferente (reclassificação, "Não é TI", email zerado): recarrega.
//
// É a impressão, e não um aviso do código que altera a vaga, que garante isto:
// `npm run reclassify`, o scraper e o admin mudam `Jobs` por caminhos diferentes,
// e um aviso esquecido em um deles deixaria o feed velho sem erro nenhum.

const SYNC_MS = Number(process.env.FEED_SYNC_MS) || 60_000;
// Teto do que fica em memória, na mesma lógica do MATCHES_MAX: ficam as mais
// recentes. Numa VM de 954 MB, 15 mil vagas são ~25 MB.
const CORPUS_MAX = Number(process.env.FEED_CORPUS_MAX) || 15_000;

let corpus = [];
let maxId = null;     // até onde a `marca` cobre
let marca = null;
let conferidoEm = 0;
let emCurso = null;

// Fragmento devolvido por função SÍNCRONA: ver semDislikeSql em jobFeedback.js.
// FUNÇÃO, não constante: `sql` é null sem DATABASE_URL e o import quebraria o CI.
const elegivel = () => sql`"Email" is not null and "Email" like ${LIKE_EMAIL}`;

/** Maior Id elegível e md5 das vagas até `ate` (todas, se null). */
async function impressao(ate) {
    const [r] = await sql`
        select max("Id")::text as "maxId", md5(coalesce(string_agg(concat_ws('|',
                   "Id", "Email", "JobTitle", "Company", "Area", "Level", "Mods"::text, "IsBR",
                   "AiClassification", "CreatedAt", "Skills"::text, length("Description")
               ), ',' order by "Id") filter (where "Id" <= coalesce(${ate}::bigint, "Id")), '')) as marca
        from "Jobs"
        where ${elegivel()}`;
    return r;
}

/** Mais recente primeiro, igual ao `order by "CreatedAt" desc, "Id" desc`. */
export function maisRecentePrimeiro(a, b) {
    const dt = new Date(b.CreatedAt) - new Date(a.CreatedAt);
    if (dt) return dt;
    const [x, y] = [BigInt(a.Id), BigInt(b.Id)];
    return x === y ? 0 : (y > x ? 1 : -1);
}

// Cópia em disco (lib/snapshotDisco.js): depois de um deploy, o processo novo lê
// o disco e a impressão de sempre decide se serve. Se nada mudou, o reinício
// custa ~50 bytes em vez de ~12 MB.
const salvarNoDisco = gravadorDeSnapshot('feed', () => ({ corpus, maxId, marca }));
let tentouDisco = false;

/** Usa a cópia do disco se as colunas de "Jobs" forem as mesmas. A impressão confere o resto. */
async function carregarDoDisco() {
    const s = await lerSnapshot('feed');
    const d = s?.dados;
    if (!d?.maxId || !d.marca || !Array.isArray(d.corpus)) return false;
    // Migration nova em "Jobs" deixaria a cópia sem a coluna, e a impressão não
    // pega isso. `limit 0` devolve só o nome das colunas.
    if (d.corpus.length) {
        const vazio = await sql`select * from "Jobs" limit 0`;
        const doBanco = vazio.columns.map((c) => c.name).sort().join(',');
        if (doBanco !== Object.keys(d.corpus[0]).sort().join(',')) return false;
    }
    corpus = d.corpus;
    maxId = d.maxId;
    marca = d.marca;
    return true;
}

async function recarregar() {
    // A impressão vem ANTES das linhas: se uma vaga mudar no meio, a próxima
    // conferência acusa diferença. Na ordem inversa a mudança passaria batida.
    const f = await impressao(null);
    corpus = f.maxId ? [...await sql`
        select * from "Jobs" where ${elegivel()} and "Id" <= ${f.maxId}::bigint
        order by "CreatedAt" desc, "Id" desc limit ${CORPUS_MAX}`] : [];
    maxId = f.maxId;
    marca = f.marca;
    salvarNoDisco();
}

async function sincronizar() {
    if (!maxId && !tentouDisco) {
        tentouDisco = true;
        if (await carregarDoDisco().catch(() => false)) console.log(`feedCache: ${corpus.length} vagas lidas do disco`);
    }
    if (!maxId) return recarregar();
    const f = await impressao(maxId);
    if (f.marca !== marca) return recarregar();
    if (BigInt(f.maxId) <= BigInt(maxId)) return undefined;

    const nova = await impressao(f.maxId);
    const novas = await sql`
        select * from "Jobs" where ${elegivel()} and "Id" > ${maxId}::bigint and "Id" <= ${f.maxId}::bigint
        order by "CreatedAt" desc, "Id" desc limit ${CORPUS_MAX}`;
    corpus = [...novas, ...corpus].sort(maisRecentePrimeiro).slice(0, CORPUS_MAX);
    maxId = f.maxId;
    marca = nova.marca;
    salvarNoDisco();
    return undefined;
}

/** Vagas que podem entrar em algum feed, mais recentes primeiro. Não altere o array. */
export async function vagasDoFeed() {
    if (Date.now() - conferidoEm < SYNC_MS) return corpus;
    // Uma conferência por vez: quem chega junto espera a mesma.
    emCurso ??= sincronizar()
        .then(() => { conferidoEm = Date.now(); })
        .catch((e) => {
            // Vaga de um minuto atrás é melhor que feed fora do ar. Sem nada em
            // memória não há o que mostrar, e o erro sobe.
            if (!conferidoEm) throw e;
            console.warn(`feedCache: conferência falhou, seguindo com o que há: ${e.message}`);
        })
        .finally(() => { emCurso = null; });
    await emCurso;
    return corpus;
}
