import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { fmtDate, AREA_OPTIONS } from '../utils.js';
import { haQuanto } from '../lib/tempo.js';

// =========================
// Vagas (admin)
// =========================
// A pergunta desta tela é "o que entrou, e está certo?". Os grupos de cima são
// os cortes que o feed faz (outra profissão, fora do Brasil, sem email) e cada
// um mostra quanto tem: dá para ver de relance se o robô trouxe lixo. Vaga que
// passou e não é de TI sai com UM clique ("Não é TI"), e não volta: o backend
// grava a decisão e a reclassificação respeita.

const PAGE_SIZE = 30;
const nf = (n) => (n ?? 0).toLocaleString('pt-BR');

const GRUPOS = [
    ['feed', 'No feed', 'ti-circle-check'],
    ['fora_ti', 'Fora de TI', 'ti-ban'],
    ['fora_br', 'Fora do Brasil', 'ti-world'],
    ['sem_area', 'Sem área definida', 'ti-help-circle'],
    ['sem_email', 'Sem email', 'ti-mail-off'],
    ['removidas', 'Removidas por você', 'ti-trash'],
    ['', 'Todas', 'ti-list'],
];
const PERIODOS = [['hoje', 'Hoje'], ['7d', '7 dias'], ['30d', '30 dias'], ['', 'Tudo']];
const AREA_NOME = Object.fromEntries(AREA_OPTIONS.map((a) => [a.value, a.label]));
const nomeArea = (a) => (a === 'nontech' ? 'Fora de TI' : a === 'other' || !a ? 'Sem área' : AREA_NOME[a] || a);

export default function AdminJobs() {
    const toast = useToast();
    const [data, setData] = useState({ jobs: [], total: 0, page: 1, contagens: null });
    const [loading, setLoading] = useState(true);
    const [aberta, setAberta] = useState(null);
    const [f, setF] = useState({ q: '', grupo: 'feed', periodo: '7d', area: '' });
    const ocupado = useRef(new Set());

    async function load(filtros = f, page = 1) {
        setLoading(true);
        try { setData(await api.adminJobs({ ...filtros, page, pageSize: PAGE_SIZE })); }
        catch (e) { toast.show(e.message, 'error'); }
        finally { setLoading(false); }
    }
    useEffect(() => { load(f, 1); }, []);

    // Chip e select aplicam na hora; a busca, no Enter (senão consulta a cada tecla).
    const aplicar = (k, v) => { const novo = { ...f, [k]: v }; setF(novo); load(novo, 1); };

    async function mudar(job, remover) {
        if (ocupado.current.has(job.id)) return;
        ocupado.current.add(job.id);
        try {
            const { job: novo } = remover ? await api.adminRemoverVaga(job.id) : await api.adminRestaurarVaga(job.id);
            // Sai da lista atual (não pertence mais ao grupo) e o detalhe reflete o novo estado.
            setData((d) => ({ ...d, jobs: d.jobs.filter((j) => j.id !== job.id), total: Math.max(0, d.total - 1) }));
            setAberta((a) => (a?.id === job.id ? { ...a, ...novo } : a));
            toast.show(remover ? 'Vaga removida do feed. Não volta mais.' : 'Vaga restaurada.');
        } catch (e) { toast.show(e.message, 'error'); }
        finally { ocupado.current.delete(job.id); }
    }

    const jobs = data.jobs || [];
    const c = data.contagens || {};
    const contagemDe = (g) => c[g || 'todas'];
    const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));

    return (
        <>
            <div className="card" style={{ marginBottom: 14 }}>
                <div className="toolbar" style={{ marginBottom: 12 }}>
                    <div className="search"><i className="ti ti-search" />
                        <input className="input" placeholder="Buscar cargo ou empresa e Enter" value={f.q}
                            onChange={(e) => setF((p) => ({ ...p, q: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && load(f, 1)} />
                    </div>
                    <div className="segmented">
                        {PERIODOS.map(([v, l]) => (
                            <button key={v} className={f.periodo === v ? 'active' : ''} onClick={() => aplicar('periodo', v)}>{l}</button>
                        ))}
                    </div>
                    <select className="select" style={{ maxWidth: 190 }} value={f.area} onChange={(e) => aplicar('area', e.target.value)} aria-label="Área">
                        <option value="">Todas as áreas</option>
                        {AREA_OPTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                    </select>
                </div>
                <div className="chips">
                    {GRUPOS.map(([g, l, ico]) => (
                        <button key={g} className={`chip toggle ${f.grupo === g ? 'on' : ''}`} onClick={() => aplicar('grupo', g)}>
                            <i className={`ti ${ico}`} /> {l}{contagemDe(g) != null ? <b className="chip-n">{nf(contagemDe(g))}</b> : null}
                        </button>
                    ))}
                </div>
            </div>

            <div className="card lista-card">
                {loading ? (
                    <div style={{ padding: 16 }}><div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '70%' }} /></div>
                ) : jobs.length === 0 ? (
                    <div className="empty" style={{ padding: 30 }}><i className="ti ti-briefcase-off" />Nenhuma vaga neste filtro.</div>
                ) : jobs.map((j) => (
                    <div key={j.id} className="linha linha-vaga" role="button" tabIndex={0}
                        onClick={() => setAberta(j)} onKeyDown={(e) => e.key === 'Enter' && setAberta(j)}>
                        <span className="linha-txt">
                            <span className="linha-titulo">{j.title || 'Vaga sem título'}</span>
                            <span className="linha-sub">
                                {j.company ? `${j.company} · ` : ''}{j.recruiterName ? `por ${j.recruiterName} · ` : ''}{haQuanto(j.createdAt)}
                            </span>
                        </span>
                        <span className={`badge ${j.area === 'nontech' ? 'danger' : j.area === 'other' || !j.area ? 'neutral' : 'info'}`}>{nomeArea(j.area)}</span>
                        {j.isBR === false && <span className="badge warn">fora do BR</span>}
                        {j.removida ? (
                            <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); mudar(j, false); }}>
                                <i className="ti ti-arrow-back-up" /> Restaurar
                            </button>
                        ) : j.area !== 'nontech' && (
                            <button className="btn ghost sm" title="Tirar do feed de todos" onClick={(e) => { e.stopPropagation(); mudar(j, true); }}>
                                <i className="ti ti-ban" /> Não é TI
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <div className="row" style={{ alignItems: 'center', marginTop: 10 }}>
                <span className="muted" style={{ fontSize: 12 }}>{nf(data.total)} vaga(s) · página {data.page || 1} de {totalPages}</span>
                <div className="spacer" />
                <button className="btn ghost sm" disabled={loading || (data.page || 1) <= 1} onClick={() => load(f, (data.page || 1) - 1)}><i className="ti ti-chevron-left" /> anterior</button>
                <button className="btn ghost sm" disabled={loading || (data.page || 1) >= totalPages} onClick={() => load(f, (data.page || 1) + 1)}>próxima <i className="ti ti-chevron-right" /></button>
            </div>

            {aberta && (
                <div className="modal-overlay" onClick={() => setAberta(null)}>
                    <div className="modal det" onClick={(e) => e.stopPropagation()}>
                        <div className="det-topo">
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <h3>{aberta.title || 'Vaga'}</h3>
                                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{aberta.company}</div>
                            </div>
                            <button className="close" onClick={() => setAberta(null)} aria-label="Fechar"><i className="ti ti-x" /></button>
                        </div>
                        <div className="modal-body">
                            <div className="det-campos">
                                <div className="det-campo"><span className="det-rotulo">Área</span>
                                    <span className={`det-valor ${aberta.area === 'nontech' ? 'danger' : ''}`}>{nomeArea(aberta.area)}{aberta.removida ? ' (removida por você)' : ''}</span></div>
                                <div className="det-campo"><span className="det-rotulo">País</span>
                                    <span className="det-valor">{aberta.isBR === false ? 'Fora do Brasil' : 'Brasil'}</span></div>
                                <div className="det-campo"><span className="det-rotulo">Email de contato</span>
                                    <span className="det-valor">{aberta.email || 'sem email'}</span></div>
                                <div className="det-campo"><span className="det-rotulo">Coletada</span>
                                    <span className="det-valor">{fmtDate(aberta.createdAt)}</span></div>
                                {aberta.recruiterName && (
                                    <div className="det-campo"><span className="det-rotulo">Recrutador</span>
                                        <span className="det-valor">{aberta.recruiterUrl
                                            ? <a href={aberta.recruiterUrl} target="_blank" rel="noopener" style={{ textDecoration: 'underline' }}>{aberta.recruiterName}</a>
                                            : aberta.recruiterName}</span></div>
                                )}
                                {aberta.level && <div className="det-campo"><span className="det-rotulo">Nível</span><span className="det-valor">{aberta.level}</span></div>}
                            </div>
                            <div className="det-secao">
                                <span className="det-rotulo">Post original</span>
                                <div className="det-descricao">{aberta.description || '(sem conteúdo)'}</div>
                            </div>
                            <div className="modal-foot">
                                {aberta.removida
                                    ? <button className="btn ghost sm" onClick={() => mudar(aberta, false)}><i className="ti ti-arrow-back-up" /> Restaurar</button>
                                    : aberta.area !== 'nontech' && <button className="btn danger sm" onClick={() => mudar(aberta, true)}><i className="ti ti-ban" /> Não é vaga de TI</button>}
                                <button className="btn ghost sm" onClick={() => setAberta(null)}>Fechar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
