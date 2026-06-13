import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../auth.jsx';
import { MODALITY_OPTIONS, LEVEL_OPTIONS, maskPhone, maskWhatsapp, normalizeLinkedin, normalizeKeyword } from '../utils.js';
import TagInput from '../components/TagInput.jsx';
import EmailSettings from './Settings.jsx';

const SUGGESTED = ['JavaScript', 'TypeScript', 'Node.js', 'React', 'Python', 'C#', '.NET', 'Java', 'SQL', 'AWS', 'Docker', 'Git'];
const POSTING_OPTIONS = [
    { v: '', l: 'Sem filtro (todas as vagas)' }, { v: 7, l: 'Últimos 7 dias' },
    { v: 14, l: 'Últimos 14 dias' }, { v: 30, l: 'Últimos 30 dias' }, { v: 60, l: 'Últimos 60 dias' },
];

const EMPTY = {
    skills: [], seniorities: [], modalities: [], salaryMin: '', salaryMax: '', headline: '',
    phone: '', whatsapp: '', linkedin: '', github: '', portfolio: '',
    requiredKeywords: [], blockedWords: [], blockedDomains: [], strictLevel: false, postingDays: '',
};

export default function Profile() {
    const toast = useToast();
    const { user, refreshUser } = useAuth();
    const [params] = useSearchParams();
    const initialSection = (params.get('google') || params.get('tab') === 'email') ? 'email'
        : (params.get('section') || 'skills');
    const [section, setSection] = useState(initialSection);

    const [form, setForm] = useState(EMPTY);
    const [cvName, setCvName] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [drag, setDrag] = useState(false);
    const fileRef = useRef();
    const liRef = useRef();

    function applyProfile(p) {
        if (!p) return;
        setForm({
            skills: p.skills || [], seniorities: p.seniorities || [], modalities: p.modalities || [],
            salaryMin: p.salaryMin ?? '', salaryMax: p.salaryMax ?? '', headline: p.headline || '',
            phone: p.phone ? maskPhone(p.phone) : '', whatsapp: p.whatsapp ? maskWhatsapp(p.whatsapp) : '',
            linkedin: p.linkedin || '', github: p.github || '', portfolio: p.portfolio || '',
            requiredKeywords: p.requiredKeywords || [], blockedWords: p.blockedWords || [],
            blockedDomains: p.blockedDomains || [],
            strictLevel: !!p.strictLevel, postingDays: p.postingDays ?? '',
        });
        setCvName(p.cvName);
    }

    useEffect(() => {
        (async () => {
            const { profile } = await api.getProfile();
            applyProfile(profile);
            setLoading(false);
        })();
    }, []);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    async function save() {
        setSaving(true);
        try {
            const { profile } = await api.updateProfile(form);
            applyProfile(profile);
            await refreshUser();
            toast.show('Configurações salvas');
        } catch (e) { toast.show(e.message, 'error'); }
        finally { setSaving(false); }
    }

    async function resetConfig() {
        if (!window.confirm('Resetar todas as configurações do perfil? (o currículo é mantido)')) return;
        try {
            const { profile } = await api.resetProfile();
            applyProfile(profile);
            await refreshUser();
            toast.show('Configurações resetadas');
        } catch (e) { toast.show('Falha ao resetar', 'error'); }
    }

    async function handleCv(file) {
        if (!file) return;
        setUploading(true);
        try {
            const { profile } = await api.uploadCv(file);
            setCvName(profile.cvName);
            await refreshUser();
            toast.show('Currículo enviado');
        } catch (e) { toast.show(e.message, 'error'); }
        finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
    }

    async function handleImport(file) {
        if (!file) return;
        if (file.type !== 'application/pdf') { toast.show('Envie um PDF', 'error'); return; }
        setImporting(true);
        try {
            const { extracted: ex } = await api.importLinkedin(file);
            setForm((f) => {
                const lower = new Set(f.skills.map((s) => s.toLowerCase()));
                const skills = [...f.skills, ...(ex.skills || []).filter((s) => !lower.has(s.toLowerCase()))];
                return {
                    ...f, skills,
                    headline: f.headline || ex.headline || '',
                    seniorities: (ex.seniority && !f.seniorities.includes(ex.seniority)) ? [...f.seniorities, ex.seniority] : f.seniorities,
                    phone: f.phone || (ex.phone ? maskPhone(ex.phone) : ''),
                    whatsapp: f.whatsapp || (ex.phone ? maskWhatsapp(ex.phone) : ''),
                    linkedin: f.linkedin || ex.linkedin || '', github: f.github || ex.github || '',
                    portfolio: f.portfolio || ex.portfolio || '',
                };
            });
            toast.show(`Importado do LinkedIn: ${ex.skills?.length || 0} skills + dados. Revise e salve.`);
        } catch (e) { toast.show(e.message, 'error'); }
        finally { setImporting(false); if (liRef.current) liRef.current.value = ''; }
    }

    const toggleIn = (key, v) => setForm((f) => ({ ...f, [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] }));

    if (loading) return <div className="page center"><div className="spinner" /></div>;

    // --- completude ---
    const hasFilters = form.requiredKeywords.length || form.blockedWords.length || form.blockedDomains.length || form.postingDays;
    const sections = [
        { id: 'skills', label: 'Skills & Keywords', icon: 'ti-tags', complete: form.skills.length > 0 },
        { id: 'work', label: 'Preferências de Trabalho', icon: 'ti-briefcase', complete: form.modalities.length > 0 && form.seniorities.length > 0 },
        { id: 'filters', label: 'Filtros', icon: 'ti-filter', optional: true, complete: !!hasFilters },
        { id: 'contact', label: 'Contato & Currículo', icon: 'ti-address-book', complete: !!cvName },
        { id: 'email', label: 'Email & Templates', icon: 'ti-mail-cog', complete: !!user.googleConnected },
    ];
    const required = sections.filter((s) => !s.optional);
    const pct = Math.round((required.filter((s) => s.complete).length / required.length) * 100);

    const showSave = section !== 'email';

    return (
        <div className="page" style={{ maxWidth: 1080 }}>
            <div className="page-head row" style={{ alignItems: 'flex-start' }}>
                <div>
                    <h1>Meu Perfil</h1>
                    <p>Configure suas preferências para receber as melhores vagas.</p>
                </div>
                <div className="spacer" />
                <button className="btn ghost sm" onClick={resetConfig}><i className="ti ti-rotate" /> Resetar configuração</button>
            </div>

            <div className="card" style={{ marginBottom: 20, padding: 16 }}>
                <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: 13 }}>Perfil</strong>
                    <div className="spacer" />
                    <span className="mono" style={{ fontSize: 13, color: 'var(--color-accent)' }}>{pct}% completo</span>
                </div>
                <div className="progress"><span style={{ width: `${pct}%` }} /></div>
            </div>

            <div className="settings-grid">
                <nav className="section-nav">
                    {sections.map((s) => (
                        <button key={s.id} className={section === s.id ? 'active' : ''} onClick={() => setSection(s.id)}>
                            <i className={`ti ${s.icon} lead`} />
                            {s.label}
                            <span className="st">
                                {s.optional
                                    ? (s.complete ? <i className="ti ti-circle-check st-ok" /> : <span className="st-opt">opcional</span>)
                                    : (s.complete ? <i className="ti ti-circle-check st-ok" /> : <i className="ti ti-alert-circle st-no" />)}
                            </span>
                        </button>
                    ))}
                </nav>

                <div>
                    {section === 'skills' && (
                        <div className="card">
                            <div className="sec-card-head"><h2>Skills &amp; Keywords</h2></div>
                            <div className="why"><i className="ti ti-info-circle" />Essas keywords calculam o match de cada vaga com seu perfil. Quanto mais precisas, melhores os resultados.</div>

                            {/* Importar do LinkedIn */}
                            <div className="card" style={{ marginBottom: 18, borderColor: 'var(--color-accent-light)' }}>
                                <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                                    <div className="feat-ico" style={{ width: 34, height: 34, marginBottom: 0 }}><i className="ti ti-sparkles" /></div>
                                    <div style={{ fontWeight: 600 }}>Importar currículo do LinkedIn</div>
                                    <span className="badge warn" style={{ marginLeft: 'auto' }}>Opcional</span>
                                </div>
                                <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                                    Envie o PDF do seu LinkedIn e preenchemos keywords, nível de experiência e contatos.
                                </p>
                                <button type="button" className="btn ghost sm" style={{ padding: '4px 0' }} onClick={() => setShowHelp((v) => !v)}>
                                    <i className={`ti ti-chevron-${showHelp ? 'down' : 'right'}`} /> Como exportar do LinkedIn
                                </button>
                                {showHelp && (
                                    <ol style={{ margin: '6px 0 4px 20px', fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                                        <li>Abra seu perfil no LinkedIn</li>
                                        <li>Clique em <b>"Mais"</b> e <b>"Salvar como PDF"</b></li>
                                        <li>Faça upload do PDF aqui</li>
                                    </ol>
                                )}
                                <div className={`dropzone ${drag ? 'drag' : ''}`} style={{ marginTop: 12 }}
                                    onClick={() => liRef.current?.click()}
                                    onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                                    onDragLeave={() => setDrag(false)}
                                    onDrop={(e) => { e.preventDefault(); setDrag(false); handleImport(e.dataTransfer.files?.[0]); }}>
                                    <i className="ti ti-cloud-upload" />
                                    {importing ? 'Lendo PDF…' : <>Arraste o PDF ou clique para selecionar<br /><span className="muted" style={{ fontSize: 11 }}>PDF do LinkedIn (máximo 10MB)</span></>}
                                </div>
                                <input ref={liRef} type="file" accept="application/pdf" hidden onChange={(e) => handleImport(e.target.files?.[0])} />
                                <div className="notice info" style={{ marginTop: 12, marginBottom: 0 }}>
                                    <i className="ti ti-info-circle" /><span>Este PDF é só para extrair dados — <b>não</b> é o currículo anexado nos emails.</span>
                                </div>
                            </div>

                            <div className="field">
                                <label>Headline</label>
                                <input className="input" value={form.headline} maxLength={120}
                                    onChange={(e) => set('headline', e.target.value)} placeholder="Ex.: Desenvolvedor Backend Pleno" />
                            </div>
                            <div className="field">
                                <label>Keywords de busca</label>
                                <TagInput value={form.skills} onChange={(v) => set('skills', v)} suggestions={SUGGESTED}
                                    normalize={normalizeKeyword} placeholder="Digite uma skill e pressione Enter" />
                                <div className="hint">Padronizamos automaticamente (ex.: "js" → JavaScript, ".net" → .NET).</div>
                            </div>
                        </div>
                    )}

                    {section === 'work' && (
                        <div className="card">
                            <div className="sec-card-head"><h2>Preferências de Trabalho</h2></div>
                            <div className="why"><i className="ti ti-info-circle" />Pode escolher <b>vários</b>. Ex.: remoto + híbrido + presencial, sendo pleno e sênior.</div>
                            <div className="field">
                                <label>Modalidade <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>(selecione uma ou mais)</span></label>
                                <div className="chips">
                                    {MODALITY_OPTIONS.map((o) => (
                                        <span key={o.value} className={`chip toggle ${form.modalities.includes(o.value) ? 'on' : ''}`}
                                            onClick={() => toggleIn('modalities', o.value)}>{o.label}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="field">
                                <label>Senioridade <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>(selecione uma ou mais)</span></label>
                                <div className="chips">
                                    {LEVEL_OPTIONS.map((o) => (
                                        <span key={o.value} className={`chip toggle ${form.seniorities.includes(o.value) ? 'on' : ''}`}
                                            onClick={() => toggleIn('seniorities', o.value)}>{o.label}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="grid-2">
                                <div className="field">
                                    <label>Pretensão mínima (R$)</label>
                                    <input className="input" type="number" min="0" value={form.salaryMin}
                                        onChange={(e) => set('salaryMin', e.target.value)} placeholder="4000" />
                                </div>
                                <div className="field">
                                    <label>Pretensão máxima (R$)</label>
                                    <input className="input" type="number" min="0" value={form.salaryMax}
                                        onChange={(e) => set('salaryMax', e.target.value)} placeholder="8000" />
                                </div>
                            </div>
                        </div>
                    )}

                    {section === 'filters' && (
                        <div className="card">
                            <div className="sec-card-head"><h2>Filtros</h2><span className="badge warn">Opcional</span></div>
                            <div className="why"><i className="ti ti-info-circle" />Refine quais vagas aparecem. Esses filtros descartam automaticamente vagas que não combinam.</div>

                            <div className="field">
                                <label>Keywords obrigatórias <span className="badge ok">eliminatório</span></label>
                                <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>Vagas que NÃO contenham nenhuma dessas palavras serão descartadas.</div>
                                <TagInput value={form.requiredKeywords} onChange={(v) => set('requiredKeywords', v)} normalize={normalizeKeyword} placeholder="Tags que toda vaga DEVE ter…" />
                            </div>

                            <div className="field">
                                <label>Palavras bloqueadas</label>
                                <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>Vagas que contenham qualquer uma dessas palavras serão ignoradas.</div>
                                <TagInput value={form.blockedWords} onChange={(v) => set('blockedWords', v)} tone="danger" normalize={normalizeKeyword} placeholder="Tags que você NÃO quer ver…" />
                            </div>

                            <div className="field">
                                <label>Domínios bloqueados</label>
                                <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>Emails vindos desses domínios serão ignorados.</div>
                                <TagInput value={form.blockedDomains} onChange={(v) => set('blockedDomains', v)} tone="danger" placeholder="Ex: gmail.com, hotmail.com…" />
                            </div>

                            <div className="field">
                                <label>Senioridade estrita</label>
                                <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>
                                    Usa as senioridades escolhidas em <b>Preferências de Trabalho</b>
                                    {form.seniorities.length ? `: ${form.seniorities.map((s) => LEVEL_OPTIONS.find((o) => o.value === s)?.label || s).join(', ')}` : ' (nenhuma selecionada ainda)'}.
                                </div>
                                <label className="row" style={{ alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 400 }}>
                                    <input type="checkbox" checked={form.strictLevel} onChange={(e) => set('strictLevel', e.target.checked)} />
                                    Descartar vagas fora dessas senioridades
                                </label>
                            </div>

                            <div className="field">
                                <label>Data de postagem</label>
                                <select className="select" value={form.postingDays} onChange={(e) => set('postingDays', e.target.value)}>
                                    {POSTING_OPTIONS.map((o) => <option key={o.l} value={o.v}>{o.l}</option>)}
                                </select>
                            </div>
                        </div>
                    )}

                    {section === 'contact' && (
                        <div className="card">
                            <div className="sec-card-head"><h2>Contato &amp; Currículo</h2></div>
                            <div className="grid-2">
                                <div className="field">
                                    <label>Telefone</label>
                                    <input className="input" inputMode="tel" value={form.phone}
                                        onChange={(e) => set('phone', maskPhone(e.target.value))} placeholder="(11) 90000-0000" />
                                </div>
                                <div className="field">
                                    <label>WhatsApp <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>(com DDI)</span></label>
                                    <input className="input" inputMode="tel" value={form.whatsapp}
                                        onChange={(e) => set('whatsapp', maskWhatsapp(e.target.value))} placeholder="+55 (11) 90000-0000" />
                                </div>
                            </div>
                            <div className="field">
                                <label>LinkedIn</label>
                                <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                                    <input className="input" value={form.linkedin}
                                        onChange={(e) => set('linkedin', e.target.value)}
                                        onBlur={(e) => e.target.value && set('linkedin', normalizeLinkedin(e.target.value))}
                                        placeholder="cole a URL ou só o seu @usuario" />
                                    <button type="button" className="btn sm" style={{ flexShrink: 0 }}
                                        onClick={() => window.open('https://www.linkedin.com/in/', '_blank', 'noopener')}>
                                        <i className="ti ti-brand-linkedin" /> Abrir
                                    </button>
                                </div>
                                <div className="hint">Abra o LinkedIn, copie a URL do seu perfil e cole aqui — ou digite só o usuário que completamos o link.</div>
                            </div>
                            <div className="grid-2">
                                <div className="field">
                                    <label>GitHub</label>
                                    <input className="input" value={form.github} onChange={(e) => set('github', e.target.value)} placeholder="github.com/seu-usuario" />
                                </div>
                                <div className="field">
                                    <label>Portfólio</label>
                                    <input className="input" value={form.portfolio} onChange={(e) => set('portfolio', e.target.value)} placeholder="seusite.dev" />
                                </div>
                            </div>

                            <div className="sec-card-head" style={{ marginTop: 8, paddingTop: 14, borderTop: '1px solid var(--color-border-light)' }}>
                                <h2 style={{ fontSize: 15 }}><i className="ti ti-paperclip" /> Currículo para anexar no email</h2>
                            </div>
                            <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Este é o PDF enviado em anexo nas candidaturas.</p>
                            {cvName ? (
                                <div className="row" style={{ alignItems: 'center' }}>
                                    <i className="ti ti-file-type-pdf" style={{ fontSize: 26, color: 'var(--color-danger)' }} />
                                    <div><div style={{ fontWeight: 600 }}>{cvName}</div><div className="muted" style={{ fontSize: 12.5 }}>Currículo enviado</div></div>
                                    <div className="spacer" />
                                    <button className="btn sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Enviando…' : 'Substituir'}</button>
                                </div>
                            ) : (
                                <div className="empty" style={{ padding: 28 }}>
                                    <i className="ti ti-cloud-upload" />Envie seu currículo em PDF (até 5MB).
                                    <div style={{ marginTop: 12 }}>
                                        <button className="btn primary sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Enviando…' : 'Selecionar arquivo'}</button>
                                    </div>
                                </div>
                            )}
                            <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => handleCv(e.target.files?.[0])} />
                        </div>
                    )}

                    {section === 'email' && <EmailSettings />}

                    {showSave && (
                        <div className="row" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
                            <button className="btn primary" disabled={saving} onClick={save}>
                                {saving ? 'Salvando…' : (<><i className="ti ti-device-floppy" /> Salvar configurações</>)}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
