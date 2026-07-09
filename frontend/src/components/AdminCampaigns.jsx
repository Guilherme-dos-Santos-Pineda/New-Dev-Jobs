import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';

const STATUS_BADGE = { draft: 'neutral', running: 'ok', paused: 'warn', done: 'info' };
const STATUS_LABEL = { draft: 'rascunho', running: 'enviando', paused: 'pausada', done: 'concluída' };

const DEFAULT_BODY = `<p>Olá 👋</p>
<p>Você já usou o <b>Reprova Currículo</b> no passado — e temos novidades pra você.</p>
<p>Lançamos o <b>newdevjobs</b>: um SaaS que <b>monitora vagas de dev no LinkedIn e envia seu currículo automaticamente</b> pela sua própria conta Gmail. Você configura uma vez e as candidaturas rodam no piloto automático.</p>
<p>👉 Comece grátis: <a href="https://newdevjobs.xyz">newdevjobs.xyz</a> — 7 candidaturas por dia sem cartão.</p>
<p>Abraço,<br>Equipe newdevjobs</p>`;

export default function AdminCampaigns() {
    const toast = useToast();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: 'Divulgação newdevjobs',
        fromEmail: 'newdevjobs <contato@newdevjobs.xyz>',
        subject: 'Novidade pra quem é dev: candidaturas no automático 🚀',
        body: DEFAULT_BODY,
        dailyCap: 50,
        emails: '',
    });
    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    async function load() {
        setLoading(true);
        try { const { campaigns } = await api.adminCampaigns(); setList(campaigns); }
        catch (e) { toast.show(e.message, 'error'); }
        finally { setLoading(false); }
    }
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const emailsArr = form.emails.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);

    async function create() {
        if (!emailsArr.length) { toast.show('Cole ao menos um email na lista.', 'error'); return; }
        setSaving(true);
        try {
            const r = await api.adminCreateCampaign({
                name: form.name, subject: form.subject, body: form.body,
                fromEmail: form.fromEmail, dailyCap: Number(form.dailyCap) || 50, emails: emailsArr,
            });
            toast.show(`Campanha criada: ${r.recipients} destinatário(s)${r.ignored ? ` · ${r.ignored} ignorado(s) (inválido/descadastrado)` : ''}. Clique "Iniciar".`);
            set('emails', '');
            load();
        } catch (e) { toast.show(e.message, 'error'); }
        finally { setSaving(false); }
    }

    async function status(c, s) {
        try { await api.adminCampaignStatus(c.id, s); load(); }
        catch (e) { toast.show(e.message, 'error'); }
    }
    async function remove(c) {
        if (!window.confirm(`Excluir a campanha "${c.name}"?`)) return;
        try { await api.adminDeleteCampaign(c.id); load(); }
        catch (e) { toast.show(e.message, 'error'); }
    }

    return (
        <>
            <div className="notice warn" style={{ marginBottom: 14 }}>
                <i className="ti ti-alert-triangle" />
                <span>Envio espaçado (60–120s) e com teto diário. <b>Link de descadastro</b> automático + header List-Unsubscribe. Envie só para quem <b>consentiu</b> (LGPD). O remetente usa o <b>Resend</b> (domínio autenticado) — o <b>domínio precisa estar verificado</b> no Resend (SPF/DKIM), senão a campanha pausa. Se o Resend não estiver configurado, cai no Gmail da conta conectada.</span>
            </div>

            {/* Criar campanha */}
            <div className="card" style={{ marginBottom: 16 }}>
                <div className="section-title"><i className="ti ti-mail-plus" /> Nova campanha</div>
                <div className="grid-2">
                    <div className="field"><label>Nome (interno)</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
                    <div className="field"><label>Enviar de (conta Google conectada)</label><input className="input" value={form.fromEmail} onChange={(e) => set('fromEmail', e.target.value)} placeholder="newdevoficial@gmail.com" /></div>
                </div>
                <div className="field"><label>Assunto</label><input className="input" value={form.subject} onChange={(e) => set('subject', e.target.value)} /></div>
                <div className="field">
                    <label>Corpo do email (HTML) <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>· use {'{email}'} para personalizar · descadastro é adicionado no fim</span></label>
                    <textarea className="input" rows={9} value={form.body} onChange={(e) => set('body', e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12.5 }} />
                </div>
                <div className="grid-2">
                    <div className="field"><label>Limite por dia</label><input className="input" type="number" min="1" max="500" value={form.dailyCap} onChange={(e) => set('dailyCap', e.target.value)} /></div>
                    <div className="field" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                        <div className="muted" style={{ fontSize: 12 }}>{emailsArr.length} email(s) na lista · ~{Math.ceil(emailsArr.length / (Number(form.dailyCap) || 50))} dia(s) de envio</div>
                    </div>
                </div>
                <div className="field">
                    <label>Lista de emails (um por linha)</label>
                    <textarea className="input" rows={5} value={form.emails} onChange={(e) => set('emails', e.target.value)} placeholder={'pessoa1@email.com\npessoa2@email.com'} style={{ fontFamily: 'monospace', fontSize: 12.5 }} />
                </div>
                <button className="btn primary" disabled={saving || !emailsArr.length} onClick={create}>
                    {saving ? 'Criando…' : (<><i className="ti ti-plus" /> Criar campanha (rascunho)</>)}
                </button>
            </div>

            {/* Lista */}
            <div className="card">
                <div className="row" style={{ alignItems: 'center' }}>
                    <div className="section-title" style={{ margin: 0 }}><i className="ti ti-send" /> Campanhas ({list.length})</div>
                    <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={load}><i className="ti ti-refresh" /></button>
                </div>
                {loading ? <div className="center" style={{ padding: 30 }}><div className="spinner" /></div>
                    : list.length === 0 ? <div className="empty" style={{ padding: 24 }}><i className="ti ti-mail-off" />Nenhuma campanha ainda.</div>
                        : (
                            <div className="dtable-wrap" style={{ marginTop: 10 }}>
                                <table className="dtable">
                                    <thead><tr><th>Campanha</th><th>De</th><th>Progresso</th><th>Hoje</th><th>Estado</th><th className="col-actions">Ações</th></tr></thead>
                                    <tbody>
                                        {list.map((c) => {
                                            const pct = c.total ? Math.round((c.sent / c.total) * 100) : 0;
                                            return (
                                                <tr key={c.id}>
                                                    <td style={{ fontWeight: 600 }}>{c.name}<div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{c.subject}</div></td>
                                                    <td className="muted" style={{ fontSize: 12 }}>{c.fromEmail}</td>
                                                    <td style={{ minWidth: 140 }}>
                                                        <div style={{ fontSize: 12 }}>{c.sent}/{c.total} enviados{c.failed ? ` · ${c.failed} falha` : ''}{c.unsub ? ` · ${c.unsub} saíram` : ''}</div>
                                                        <div className="progress" style={{ height: 5, marginTop: 4 }}><span style={{ width: `${pct}%` }} /></div>
                                                    </td>
                                                    <td className="muted" style={{ fontSize: 12 }}>{c.sentToday}/{c.dailyCap}</td>
                                                    <td><span className={`badge ${STATUS_BADGE[c.status] || 'neutral'}`}>{STATUS_LABEL[c.status] || c.status}</span></td>
                                                    <td className="col-actions">
                                                        {c.status !== 'running' && c.status !== 'done' && <button className="btn ghost sm" title="Iniciar" onClick={() => status(c, 'running')}><i className="ti ti-player-play" /></button>}
                                                        {c.status === 'running' && <button className="btn ghost sm" title="Pausar" onClick={() => status(c, 'paused')}><i className="ti ti-player-pause" /></button>}
                                                        <button className="btn ghost sm" title="Excluir" onClick={() => remove(c)}><i className="ti ti-trash" /></button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
            </div>
        </>
    );
}
