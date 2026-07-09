import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';

const STATUS_BADGE = { draft: 'neutral', running: 'ok', paused: 'warn', done: 'info' };
const STATUS_LABEL = { draft: 'rascunho', running: 'enviando', paused: 'pausada', done: 'concluída' };

// Template com a identidade REAL da landing (pages/index.html): azul profundo
// #185FA5→#0C447C, Inter + IBM Plex Mono, headline leve com palavra em destaque
// e o card de "match" com o selo. Feito para EMAIL: tabelas + estilos inline
// (Gmail ignora <head>/<style> e webfonts → cai em Arial, e tudo bem).
// O rodapé de descadastro é anexado automaticamente no envio (withUnsubscribe).
const DEFAULT_BODY = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F8FB;padding:32px 16px;font-family:'Inter',Arial,Helvetica,sans-serif;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid #ECF0F5;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(13,17,23,.06);">
    <tr><td style="padding:20px 32px;border-bottom:1px solid #ECF0F5;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="width:30px;"><div style="width:30px;height:30px;border-radius:9px;background:#1F6FEB;background:linear-gradient(135deg,#1F6FEB 0%,#0C447C 100%);text-align:center;line-height:30px;color:#FFFFFF;font-family:'IBM Plex Mono','Courier New',monospace;font-size:15px;font-weight:600;">&rsaquo;</div></td>
        <td style="padding-left:10px;font-family:'IBM Plex Mono','Courier New',monospace;font-size:15px;font-weight:600;color:#0D1117;letter-spacing:-0.3px;">newdevjobs</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:38px 40px 6px;">
      <div style="font-family:'IBM Plex Mono','Courier New',monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#185FA5;margin-bottom:18px;">&mdash;&nbsp; automação de candidaturas</div>
      <div style="font-size:34px;line-height:1.12;letter-spacing:-1.2px;font-weight:300;color:#0D1117;margin:0 0 18px;">Sua candidatura chega <span style="color:#185FA5;font-weight:600;">antes</span> de <b style="font-weight:600;">todo mundo.</b></div>
      <p style="font-size:15.5px;line-height:1.7;color:#4A5568;margin:0 0 26px;">O <b style="color:#0D1117;">newdevjobs</b> monitora vagas publicadas por recrutadores no LinkedIn e envia seu currículo automaticamente &mdash; pela <b style="color:#0D1117;">sua própria conta Gmail</b>. Você configura uma vez e as candidaturas rodam no automático.</p>
      <a href="https://newdevjobs.xyz" style="background:#1F6FEB;background:linear-gradient(135deg,#1F6FEB 0%,#0C447C 100%);color:#FFFFFF;text-decoration:none;padding:14px 28px;border-radius:12px;font-size:14px;font-weight:600;display:inline-block;">Começar gratuitamente &rarr;</a>
      <div style="font-size:12.5px;color:#8B9CB0;margin-top:16px;">&#10003; 7 candidaturas por dia &nbsp;&middot;&nbsp; sem cartão de crédito</div>
    </td></tr>
    <tr><td style="padding:26px 40px 40px;">
      <div style="background:#F6F8FB;border:1px solid #ECF0F5;border-radius:14px;padding:16px;">
        <div style="font-family:'IBM Plex Mono','Courier New',monospace;font-size:11px;color:#8B9CB0;padding:2px 4px 12px;">newdevjobs · matches</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #ECF0F5;border-radius:10px;">
          <tr><td style="padding:14px 16px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="width:34px;vertical-align:top;"><div style="width:34px;height:34px;border-radius:9px;background:#1F6FEB;background:linear-gradient(135deg,#1F6FEB 0%,#0C447C 100%);text-align:center;line-height:34px;color:#FFFFFF;font-family:'IBM Plex Mono',monospace;font-size:14px;font-weight:600;">A</div></td>
              <td style="padding-left:12px;vertical-align:top;">
                <div style="font-size:13px;font-weight:600;color:#0D1117;">Dev Backend Pleno · .NET</div>
                <div style="font-size:11px;color:#8B9CB0;margin-top:2px;">Acme Tech · remoto · há 3 min</div>
              </td>
              <td align="right" style="vertical-align:top;white-space:nowrap;"><span style="font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:500;color:#185FA5;background:#E6F1FB;padding:4px 9px;border-radius:999px;">match 94%</span></td>
            </tr></table>
            <div style="font-size:12px;color:#1F9E6B;margin-top:11px;font-family:'IBM Plex Mono','Courier New',monospace;">&#10003; currículo enviado automaticamente</div>
          </td></tr>
        </table>
      </div>
    </td></tr>
    <tr><td style="background:#F6F8FB;border-top:1px solid #ECF0F5;padding:22px 32px;text-align:center;">
      <div style="font-family:'IBM Plex Mono','Courier New',monospace;font-size:13px;font-weight:600;color:#0D1117;letter-spacing:-0.3px;">newdevjobs</div>
      <div style="font-size:12px;color:#8B9CB0;margin-top:4px;">Feito por desenvolvedores, para desenvolvedores.</div>
    </td></tr>
  </table>
</td></tr>
</table>`;

export default function AdminCampaigns() {
    const toast = useToast();
    const [list, setList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: 'Divulgação newdevjobs',
        fromEmail: 'newdevjobs <contato@newdevjobs.xyz>',
        replyTo: 'newdevoficial@gmail.com',
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
                fromEmail: form.fromEmail, replyTo: form.replyTo?.trim() || undefined,
                dailyCap: Number(form.dailyCap) || 50, emails: emailsArr,
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
                    <div className="field"><label>Enviar de <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>· domínio verificado no Resend</span></label><input className="input" value={form.fromEmail} onChange={(e) => set('fromEmail', e.target.value)} placeholder="newdevjobs <contato@newdevjobs.xyz>" /></div>
                </div>
                <div className="grid-2">
                    <div className="field"><label>Assunto</label><input className="input" value={form.subject} onChange={(e) => set('subject', e.target.value)} /></div>
                    <div className="field"><label>Responder para (Reply-To) <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>· onde caem as respostas</span></label><input className="input" value={form.replyTo} onChange={(e) => set('replyTo', e.target.value)} placeholder="newdevoficial@gmail.com" /></div>
                </div>
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
