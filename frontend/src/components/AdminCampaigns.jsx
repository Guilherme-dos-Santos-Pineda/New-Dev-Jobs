import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';

const STATUS_BADGE = { draft: 'neutral', running: 'ok', paused: 'warn', done: 'info' };
const STATUS_LABEL = { draft: 'rascunho', running: 'enviando', paused: 'pausada', done: 'concluída' };

// Template com a cara da landing (gradiente azul→índigo, card, CTA). Feito para
// EMAIL: tabelas + estilos inline (o que Gmail/Outlook renderizam de verdade).
// O rodapé de descadastro é anexado automaticamente no envio (withUnsubscribe).
const DEFAULT_BODY = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,.08);">
    <tr><td style="background-color:#2563eb;background:linear-gradient(135deg,#2563eb,#4f46e5);padding:44px 40px;text-align:center;">
      <div style="font-size:32px;font-weight:bold;color:#ffffff;">🚀 newdevjobs</div>
      <div style="margin-top:14px;font-size:17px;line-height:28px;color:#dbeafe;">Sua próxima vaga pode chegar<br><b style="color:#ffffff;">antes mesmo de você procurar.</b></div>
    </td></tr>
    <tr><td style="padding:40px;">
      <div style="font-size:24px;font-weight:bold;color:#111827;margin-bottom:16px;">Fala dev 👋</div>
      <p style="font-size:16px;line-height:28px;color:#4b5563;margin:0 0 16px;">Acabamos de lançar o <b>newdevjobs</b>.</p>
      <p style="font-size:16px;line-height:28px;color:#4b5563;margin:0 0 8px;">Uma plataforma que <b>monitora vagas publicadas por recrutadores no LinkedIn</b> e envia automaticamente seu currículo usando a <b>sua própria conta Gmail</b>.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
        <tr><td style="background:#eff6ff;padding:22px 24px;border-radius:12px;">
          <div style="font-size:16px;line-height:24px;color:#1e3a8a;margin-bottom:12px;">⚡ Você configura uma única vez</div>
          <div style="font-size:16px;line-height:24px;color:#1e3a8a;margin-bottom:12px;">🤖 A IA encontra vagas compatíveis</div>
          <div style="font-size:16px;line-height:24px;color:#1e3a8a;margin-bottom:12px;">📧 Seu currículo é enviado automaticamente</div>
          <div style="font-size:16px;line-height:24px;color:#1e3a8a;">🎯 Tudo pela sua própria conta Gmail</div>
        </td></tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:12px 0 28px;">
        <a href="https://newdevjobs.xyz" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:16px 32px;border-radius:10px;font-size:17px;font-weight:bold;display:inline-block;">Começar gratuitamente →</a>
      </td></tr></table>
      <div style="text-align:center;color:#6b7280;font-size:14px;line-height:26px;">✅ 7 candidaturas por dia<br>✅ Sem cartão de crédito<br>✅ Configuração em menos de 5 minutos</div>
    </td></tr>
    <tr><td style="background:#f9fafb;padding:26px;text-align:center;font-size:13px;color:#9ca3af;">Feito por desenvolvedores para desenvolvedores ❤️<br><br><b style="color:#111827;">Equipe newdevjobs</b></td></tr>
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
