import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { haQuanto } from '../lib/tempo.js';

// =========================
// Recrutadores (admin)
// =========================
// Antes a tela falava a língua do banco: status discovered/approved/rejected,
// "órfão", "com/sem vaga", checkbox "só com email". Mas o que decide se um
// recrutador importa é se o ROBÔ o visita, e isso é uma regra (tem vaga BR e
// não foi bloqueado), não um status. Agora são três grupos com o nome do que
// acontece com eles, e duas ações: bloquear e visitar agora.

const PAGE_SIZE = 25;
const nf = (n) => (n ?? 0).toLocaleString('pt-BR');

const GRUPOS = [
    ['monitorados', 'Monitorados', 'ti-radar'],
    ['fora', 'Fora do monitoramento', 'ti-eye-off'],
    ['bloqueados', 'Bloqueados', 'ti-ban'],
    ['', 'Todos', 'ti-list'],
];
const ORDENS = [['jobs', 'Mais vagas de TI'], ['recent', 'Mais recentes'], ['stale', 'Visitados há mais tempo'], ['name', 'Nome']];

// Por que está fora: a regra é "tem vaga BR de TI com email, ou foi incluído à mão".
const situacao = (r) => {
    if (r.status === 'rejected') return { rotulo: 'Bloqueado', classe: 'danger', dica: 'Você bloqueou. O robô não visita.' };
    if (r.monitoravel) return { rotulo: 'Monitorado', classe: 'ok', dica: r.status === 'approved' && !r.techBrCount ? 'Incluído à mão.' : 'Tem vaga no Brasil, o robô visita toda semana.' };
    if (!r.linkedinUrl) return { rotulo: 'Fora', classe: 'neutral', dica: 'Sem perfil do LinkedIn, não dá para visitar.' };
    return { rotulo: 'Fora', classe: 'neutral', dica: 'Ainda não gerou vaga no Brasil.' };
};

export default function AdminRecruiters() {
    const toast = useToast();
    const [stats, setStats] = useState(null);
    const [data, setData] = useState({ recruiters: [], total: 0, page: 1 });
    const [loading, setLoading] = useState(true);
    const [f, setF] = useState({ q: '', grupo: 'monitorados', sort: 'jobs' });
    const ocupado = useRef(new Set());

    async function load(filtros = f, page = 1) {
        setLoading(true);
        try { setData(await api.adminRecruiters({ ...filtros, page, pageSize: PAGE_SIZE })); }
        catch (e) { toast.show(e.message, 'error'); }
        finally { setLoading(false); }
    }
    async function loadStats() {
        try { setStats(await api.adminRecruiterStats()); } catch { /* números são extra */ }
    }
    useEffect(() => { load(f, 1); loadStats(); }, []);

    const aplicar = (k, v) => { const novo = { ...f, [k]: v }; setF(novo); load(novo, 1); };

    async function acao(r, fn, msg) {
        if (ocupado.current.has(r.id)) return;
        ocupado.current.add(r.id);
        try { await fn(); toast.show(msg); await load(f, data.page); loadStats(); }
        catch (e) { toast.show(e.message, 'error'); }
        finally { ocupado.current.delete(r.id); }
    }
    const bloquear = (r) => acao(r, () => api.adminUpdateRecruiter(r.id, 'rejected'), `${r.name || 'Recrutador'} bloqueado. O robô não visita mais.`);
    const desbloquear = (r) => acao(r, () => api.adminUpdateRecruiter(r.id, 'discovered'), 'Desbloqueado. Volta a ser monitorado se tiver vaga no Brasil.');
    const incluir = (r) => acao(r, () => api.adminUpdateRecruiter(r.id, 'approved'), 'Incluído no monitoramento.');
    const visitar = (r) => {
        if (!window.confirm(`Ler agora os posts do último mês de ${r.name || 'este recrutador'}? Custa no máximo US$ 0,06.`)) return;
        acao(r, () => api.adminRunScraper('monitoring', {
            source: 'selected', recruiterIds: [Number(r.id)], maxPosts: 30,
            postedLimit: 'month', sortBy: 'date', contentType: 'all', region: 'br',
        }), 'Visita enviada. O resultado aparece em Robôs › Últimas execuções.');
    };

    const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
    const cobertura = stats?.monitorados ? Math.round((stats.visitados / stats.monitorados) * 100) : 0;

    return (
        <>
            {stats && (
                <div className="card kpi-faixa" style={{ marginBottom: 14 }}>
                    <div className="kpi-cel">
                        <div className="kpi-cel-label"><i className="ti ti-radar" /> Monitorados</div>
                        <div className="kpi-cel-num">{nf(stats.monitorados)}</div>
                        <div className="kpi-cel-sub">de {nf(stats.total)} na base</div>
                    </div>
                    <div className="kpi-cel">
                        <div className="kpi-cel-label"><i className="ti ti-refresh" /> Visitados nesta volta</div>
                        <div className="kpi-cel-num">{nf(stats.visitados)} <span className="kpi-cel-de">{cobertura}%</span></div>
                        <div className="progress" style={{ marginTop: 8 }}><span style={{ width: `${cobertura}%` }} /></div>
                        <div className="kpi-cel-sub">nos últimos {stats.diasEntreVisitas} dias</div>
                    </div>
                    <div className="kpi-cel">
                        <div className="kpi-cel-label"><i className="ti ti-user-plus" /> Novos (7 dias)</div>
                        <div className="kpi-cel-num">{nf(stats.novos7d)}</div>
                        <div className="kpi-cel-sub">achados pelos robôs</div>
                    </div>
                    <div className="kpi-cel">
                        <div className="kpi-cel-label"><i className="ti ti-ban" /> Bloqueados</div>
                        <div className="kpi-cel-num">{nf(stats.bloqueados)}</div>
                        <div className="kpi-cel-sub">o robô ignora</div>
                    </div>
                </div>
            )}

            <div className="card" style={{ marginBottom: 14 }}>
                <div className="toolbar" style={{ marginBottom: 12 }}>
                    <div className="search"><i className="ti ti-search" />
                        <input className="input" placeholder="Nome, empresa ou email e Enter" value={f.q}
                            onChange={(e) => setF((p) => ({ ...p, q: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && load(f, 1)} />
                    </div>
                    <select className="select" style={{ maxWidth: 210 }} value={f.sort} onChange={(e) => aplicar('sort', e.target.value)} aria-label="Ordenar">
                        {ORDENS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                </div>
                <div className="chips">
                    {GRUPOS.map(([g, l, ico]) => (
                        <button key={g} className={`chip toggle ${f.grupo === g ? 'on' : ''}`} onClick={() => aplicar('grupo', g)}>
                            <i className={`ti ${ico}`} /> {l}
                        </button>
                    ))}
                </div>
            </div>

            <div className="card lista-card">
                {loading ? (
                    <div style={{ padding: 16 }}><div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '70%' }} /></div>
                ) : data.recruiters.length === 0 ? (
                    <div className="empty" style={{ padding: 30 }}><i className="ti ti-user-off" />Ninguém neste filtro.</div>
                ) : data.recruiters.map((r) => {
                    const sit = situacao(r);
                    return (
                        <div key={r.id} className="linha linha-recrutador">
                            <span className="linha-txt">
                                <span className="linha-titulo">
                                    {r.linkedinUrl
                                        ? <a href={r.linkedinUrl} target="_blank" rel="noopener">{r.name || 'Recrutador'} <i className="ti ti-external-link" style={{ fontSize: 12 }} /></a>
                                        : (r.name || 'Recrutador')}
                                </span>
                                <span className="linha-sub">{[r.company, r.title].filter((x) => x && x !== r.name).join(' · ') || r.email || ''}</span>
                            </span>
                            <span className="rec-num" title="Vagas de TI no Brasil que ele já postou">
                                <b>{nf(r.techBrCount)}</b> vaga{r.techBrCount === 1 ? '' : 's'} de TI
                            </span>
                            <span className="rec-num" title={r.lastCheckedAt ? 'Última visita do robô' : 'O robô ainda não visitou'}>
                                {r.lastCheckedAt ? `visitado ${haQuanto(r.lastCheckedAt)}` : 'nunca visitado'}
                            </span>
                            <span className={`badge ${sit.classe}`} title={sit.dica}>{sit.rotulo}</span>
                            <span className="rec-acoes">
                                {r.monitoravel && r.status !== 'rejected' && (
                                    <button className="btn ghost sm" title="Ler os posts dele agora" onClick={() => visitar(r)}><i className="ti ti-player-play" /> Visitar</button>
                                )}
                                {!r.monitoravel && r.status !== 'rejected' && r.linkedinUrl && (
                                    <button className="btn ghost sm" title="Incluir no monitoramento mesmo sem vaga" onClick={() => incluir(r)}><i className="ti ti-plus" /> Monitorar</button>
                                )}
                                {r.status === 'rejected'
                                    ? <button className="btn ghost sm" onClick={() => desbloquear(r)}><i className="ti ti-lock-open" /> Desbloquear</button>
                                    : <button className="btn ghost sm" title="O robô para de visitar" onClick={() => bloquear(r)}><i className="ti ti-ban" /> Bloquear</button>}
                            </span>
                        </div>
                    );
                })}
            </div>

            <div className="row" style={{ alignItems: 'center', marginTop: 10 }}>
                <span className="muted" style={{ fontSize: 12 }}>{nf(data.total)} recrutador(es) · página {data.page} de {totalPages}</span>
                <div className="spacer" />
                <button className="btn ghost sm" disabled={loading || data.page <= 1} onClick={() => load(f, data.page - 1)}><i className="ti ti-chevron-left" /> anterior</button>
                <button className="btn ghost sm" disabled={loading || data.page >= totalPages} onClick={() => load(f, data.page + 1)}>próxima <i className="ti ti-chevron-right" /></button>
            </div>
        </>
    );
}
