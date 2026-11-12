import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { FILTRO_DATA_ATIVO } from '../lib/flags.js';
import { useCachedResource, mutateCache } from '../lib/useCachedResource.js';
import { useToast } from '../components/Toast.jsx';
import { useAuth } from '../auth.jsx';
import { REGION_OPTIONS, CONTRACT_OPTIONS, MODALITY_OPTIONS, LEVEL_OPTIONS, AREA_OPTIONS, UF_OPTIONS, maskPhone, maskWhatsapp, normalizeLinkedin, normalizeKeyword } from '../utils.js';
import { useT } from '../lib/i18n.jsx';
import TagInput from '../components/TagInput.jsx';
import EmailSettings from './Settings.jsx';
import AutoEnvio from '../components/AutoEnvio.jsx';

const SUGGESTED = ['JavaScript', 'TypeScript', 'Node.js', 'React', 'Python', 'C#', '.NET', 'Java', 'SQL', 'AWS', 'Docker', 'Git'];
const POSTING_OPTIONS = [
    { v: '', l: 'Sem filtro (todas as vagas)' }, { v: 30, l: 'Últimos 30 dias' },
    { v: 60, l: 'Últimos 60 dias' }, { v: 90, l: 'Últimos 90 dias' },
];

const EMPTY = {
    skills: [], seniorities: [], modalities: [], areas: [], salaryMin: '', salaryMax: '', headline: '',
    phone: '', whatsapp: '', linkedin: '', github: '', portfolio: '',
    requiredKeywords: [], blockedWords: [], blockedDomains: [], strictLevel: false, postingDays: '', region: 'br', contracts: [], regions: [],
    states: [], cities: [], showPcd: false,
};

export default function Profile() {
    const toast = useToast();
    const { t } = useT();
    const { user, refreshUser, logout } = useAuth();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    // Link direto (?section=filters) abre aquele painel de "Mais opções".
    const initialSection = params.get('section') || '';
    const [section, setSection] = useState(initialSection);

    const [form, setForm] = useState(EMPTY);
    const [cvName, setCvName] = useState(null);
    // O nome mora em Users, não no perfil: salva junto, mas por outra rota.
    const [nome, setNome] = useState('');
    useEffect(() => { if (user?.name) setNome(user.name); }, [user?.name]);
    const [salvandoNome, setSalvandoNome] = useState(false);
    async function salvarNome() {
        if (salvandoNome) return;
        setSalvandoNome(true);
        try {
            await api.atualizarNome(nome.trim().replace(/\s+/g, ' '));
            await refreshUser();
            toast.show(t('Nome salvo. Os próximos emails já saem com ele.'));
        } catch (e) { toast.show(e.message, 'error'); }
        finally { setSalvandoNome(false); }
    }
    // A entrada da análise de currículo só aparece quando a ferramenta existe (migration 0024).
    const [analiseCv, setAnaliseCv] = useState(null);
    useEffect(() => { api.analiseCv().then(setAnaliseCv).catch(() => {}); }, []);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [showMatch, setShowMatch] = useState(false);
    const [drag, setDrag] = useState(false);
    const [confirmaApagar, setConfirmaApagar] = useState('');
    const [apagando, setApagando] = useState(false);
    const fileRef = useRef();
    const liRef = useRef();
    const busyRef = useRef({}); // travas síncronas anti duplo-clique (upload/import/save)

    // Retrato do que está GRAVADO no servidor. Comparar o formulário com ele é o
    // que permite dizer "você tem alterações não salvas" — sem isso a pessoa
    // marcava um chip, trocava de aba e perdia a mudança sem nenhum aviso, um
    // erro que o usuário costuma atribuir a si mesmo e não reporta.
    const salvoRef = useRef(JSON.stringify(EMPTY));

    function applyProfile(p) {
        if (!p) return;
        const novo = {
            skills: p.skills || [], seniorities: p.seniorities || [], modalities: p.modalities || [], areas: p.areas || [],
            salaryMin: p.salaryMin ?? '', salaryMax: p.salaryMax ?? '', headline: p.headline || '',
            phone: p.phone ? maskPhone(p.phone) : '', whatsapp: p.whatsapp ? maskWhatsapp(p.whatsapp) : '',
            linkedin: p.linkedin || '', github: p.github || '', portfolio: p.portfolio || '',
            requiredKeywords: p.requiredKeywords || [], blockedWords: p.blockedWords || [],
            blockedDomains: p.blockedDomains || [],
            strictLevel: !!p.strictLevel, postingDays: p.postingDays ?? '', region: p.region || 'br',
            states: p.states || [], cities: p.cities || [], showPcd: !!p.showPcd,
            contracts: p.contracts || [], contratoLigado: !!p.contratoLigado,
            regions: p.regions || [], regiaoLigada: !!p.regiaoLigada,
        };
        setForm(novo);
        salvoRef.current = JSON.stringify(novo);
        setCvName(p.cvName);
    }

    // Cacheado: ao voltar para o Perfil (ou após prefetch no hover) o formulário
    // aparece preenchido na hora. Aplicamos só uma vez para não sobrescrever o que
    // o usuário está editando quando a revalidação em segundo plano retorna.
    const { data, loading } = useCachedResource('profile', () => api.getProfile());
    const appliedRef = useRef(false);
    useEffect(() => {
        if (data?.profile && !appliedRef.current) {
            applyProfile(data.profile);
            appliedRef.current = true;
        }
    }, [data]);  

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    async function save() {
        setSaving(true);
        try {
            const nomeLimpo = nome.trim().replace(/\s+/g, ' ');
            if (nomeLimpo && nomeLimpo !== user?.name) await api.atualizarNome(nomeLimpo);
            const { profile } = await api.updateProfile(form);
            applyProfile(profile);
            mutateCache('profile', { profile });
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
            mutateCache('profile', { profile });
            await refreshUser();
            toast.show('Configurações resetadas');
        } catch (e) { toast.show('Falha ao resetar', 'error'); }
    }

    async function handleCv(file) {
        if (!file || busyRef.current.cv) return;
        busyRef.current.cv = true;
        setUploading(true);
        try {
            const { profile } = await api.uploadCv(file);
            setCvName(profile.cvName);
            mutateCache('profile', { profile });
            await refreshUser();
            toast.show('Currículo enviado');
        } catch (e) { toast.show(e.message, 'error'); }
        finally { busyRef.current.cv = false; setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
    }

    async function handleImport(file) {
        if (!file || busyRef.current.imp) return;
        if (file.type !== 'application/pdf') { toast.show('Envie um PDF', 'error'); return; }
        busyRef.current.imp = true;
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
        finally { busyRef.current.imp = false; setImporting(false); if (liRef.current) liRef.current.value = ''; }
    }

    async function apagarPerfil() {
        if (busyRef.current.del) return;
        busyRef.current.del = true;
        setApagando(true);
        try {
            await api.deleteProfile(confirmaApagar.trim().toUpperCase());
            mutateCache('profile', { profile: null });
            setConfirmaApagar('');
            toast.show('Perfil apagado.');
            // DESLOGA depois de apagar. Continuar logado num app sem perfil
            // devolve a pessoa para um painel zerado que parece a conta
            // quebrada, e ainda deixa a sessão aberta logo depois de uma ação
            // que costuma ser feita justamente para se desfazer do acesso.
            //
            // A espera curta é só para a confirmação ser lida antes da
            // navegação levar o toast junto.
            setTimeout(() => { logout(); navigate('/login'); }, 1400);
        } catch (e) {
            toast.show(e.message, 'error');
            busyRef.current.del = false;
            setApagando(false);
        }
    }

    const toggleIn = (key, v) => setForm((f) => ({ ...f, [key]: f[key].includes(v) ? f[key].filter((x) => x !== v) : [...f[key], v] }));

    if (loading) return <div className="page center"><div className="spinner" /></div>;

    const showSave = true;
    const sujo = JSON.stringify(form) !== salvoRef.current;
    // O filtro de local só vale para híbrida e presencial, e só no Brasil.
    const soRemoto = form.modalities.length === 1 && form.modalities[0] === 'remoto';
    const mostraLocal = !soRemoto && form.region !== 'intl';

    return (
        <div className="page" style={{ maxWidth: 820 }}>
            <div className="page-head">
                <h1>{t('Meu perfil')}</h1>
                <p className="perfil-sub">{t('Três coisas: o que você procura, seu currículo e como enviar.')}</p>
            </div>

            <div className="perfil-simples">
                <div>
                    {/* Página única (02/11/2026): as três coisas que a pessoa precisa resolver
                        ficam à vista, nesta ordem; todo ajuste fino mora em "Mais opções",
                        fechado. Antes eram cinco seções com menu lateral e 39 campos, e o
                        feedback era "confuso e cheio de informação". */}

                        <div className="card">
                            <div className="field" style={{ marginBottom: 0 }}>
                                <label>{t('Seu nome')}</label>
                                {/* Botão próprio: o "Salvar" do perfil fica no fim da página, e o primeiro
                                    relato (11/11/2026) foi de quem digitou o nome e nunca chegou a ele. */}
                                <div className="row" style={{ gap: 8 }}>
                                    <input className="input" style={{ flex: 1 }} value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} placeholder={t('Como você quer ser chamado pelos recrutadores')} />
                                    {nome.trim().replace(/\s+/g, ' ') !== (user?.name || '') && (
                                        <button type="button" className="btn primary sm" disabled={salvandoNome} onClick={salvarNome}>{salvandoNome ? t('Salvando…') : t('Salvar nome')}</button>
                                    )}
                                </div>
                                <div className="hint">{t('Aparece no app e nos seus emails, no "Me chamo…", na assinatura e no nome do remetente. Use o nome completo.')}</div>
                            </div>
                        </div>

                        <div className="card">
                            <div className="sec-card-head"><h2>{t('O que você procura')}</h2></div>
                            <div className="field">
                                <label>{t('Área')} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>({t('obrigatório, pode marcar várias')})</span></label>
                                <div className="chips">
                                    {AREA_OPTIONS.map((o) => (
                                        <span key={o.value} className={`chip toggle ${form.areas.includes(o.value) ? 'on' : ''}`}
                                            onClick={() => toggleIn('areas', o.value)}>{o.label}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="field">
                                <label>Modalidade <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>(selecione uma ou mais)</span></label>
                                <div className="chips">
                                    {MODALITY_OPTIONS.map((o) => (
                                        <span key={o.value} className={`chip toggle ${form.modalities.includes(o.value) ? 'on' : ''}`}
                                            onClick={() => toggleIn('modalities', o.value)}>{o.label}</span>
                                    ))}
                                </div>
                            </div>
                            {form.contratoLigado && (
                                <div className="field">
                                    <label>{t('Tipo de contrato')} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>({t('opcional')})</span></label>
                                    <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>{t('Vaga que não informa o contrato continua aparecendo.')}</div>
                                    <div className="chips">
                                        {CONTRACT_OPTIONS.map((o) => (
                                            <span key={o.value} className={`chip toggle ${form.contracts.includes(o.value) ? 'on' : ''}`}
                                                onClick={() => toggleIn('contracts', o.value)}>{o.label}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {mostraLocal && (
                                <div className="field">
                                    <label>{t('Estados e cidades')} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>({t('opcional')})</span></label>
                                    <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>{t('Vale para vagas híbridas e presenciais. Vaga remota e vaga sem local informado continuam aparecendo.')}</div>
                                    <div className="chips">
                                        {UF_OPTIONS.map((o) => (
                                            <span key={o.value} className={`chip toggle ${form.states.includes(o.value) ? 'on' : ''}`}
                                                onClick={() => toggleIn('states', o.value)}>{o.label}</span>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: 10 }}>
                                        <TagInput value={form.cities} onChange={(v) => set('cities', v)} placeholder={t('Ou só algumas cidades: digite e aperte Enter')} />
                                    </div>
                                </div>
                            )}
                            <div className="field">
                                <label>Senioridade <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>(selecione uma ou mais)</span></label>
                                <div className="chips">
                                    {LEVEL_OPTIONS.map((o) => (
                                        <span key={o.value} className={`chip toggle ${form.seniorities.includes(o.value) ? 'on' : ''}`}
                                            onClick={() => toggleIn('seniorities', o.value)}>{o.label}</span>
                                    ))}
                                </div>
                            </div>
                            {/* À vista de propósito: "e se mandar para a minha própria empresa?"
                                foi a dúvida de quem já trabalha (03/11/2026), e em Filtros
                                avançados ninguém achava a resposta. */}
                            <div className="field">
                                <label>{t('Empresas e palavras bloqueadas')}</label>
                                <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>{t('Já trabalha em algum lugar? Coloque o nome da empresa aqui e ela nunca recebe seu currículo. Vale para o nome, o email e o texto da vaga.')}</div>
                                <TagInput value={form.blockedWords} onChange={(v) => set('blockedWords', v)} tone="danger" normalize={normalizeKeyword} placeholder={t('Nome da empresa ou palavra')} />
                            </div>
                        </div>
                    <div className="card">
                        <div className="sec-card-head">
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
                            {cvName && analiseCv?.disponivel && (
                                <Link to="/app/curriculo" className="cv-entrada">
                                    <i className="ti ti-sparkles" />
                                    <div>
                                        <div className="cv-entrada-titulo">{t('Melhorar meu currículo com IA')} <span className="badge info">{t('Em teste')}</span></div>
                                        <div className="muted">{t('Nota, o que melhorar e um currículo para cada tipo de vaga. Teste grátis de 48 horas.')}</div>
                                    </div>
                                    <i className="ti ti-chevron-right" />
                                </Link>
                            )}
                    </div>
                    <EmailSettings parte="conta" />
                    <AutoEnvio />
                    <div className="mais-opcoes">
                        <div className="mais-titulo">{t('Mais opções')} <span>{t('não precisa mexer para começar')}</span></div>
                    <div className={`mais-item ${section === 'skills' ? 'aberto' : ''}`}>
                        <button type="button" className="mais-cab" onClick={() => setSection(section === 'skills' ? '' : 'skills')} aria-expanded={section === 'skills'}>
                            <i className="ti ti-tags" /> <span>{t('Suas habilidades')}</span>
                            <i className={`ti ${section === 'skills' ? 'ti-chevron-up' : 'ti-chevron-down'} mais-seta`} />
                        </button>
                        {section === 'skills' && (

                        <div className="card">
                            <div className="sec-card-head"><h2>{t('Suas habilidades')}</h2><span className="badge warn">Opcional</span></div>
                            <div className="why"><i className="ti ti-info-circle" />Essas keywords calculam o match de cada vaga com seu perfil. Quanto mais precisas, melhores os resultados.</div>

                            {/* Os CAMPOS vêm primeiro. Antes as duas caixas de ajuda
                                abriam a seção e empurravam headline e keywords ~250px
                                para baixo: quem clicava em "Skills & Keywords" para
                                editar as skills caía em dois acordeões de explicação. */}
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

                            {/* Como funciona o match (recolhível) */}
                            <div className="panel">
                                <button type="button" className="panel-toggle" onClick={() => setShowMatch((v) => !v)}>
                                    <i className="ti ti-target-arrow" />
                                    Como funciona o match?
                                    <i className={`ti ti-chevron-${showMatch ? 'down' : 'right'} chev`} />
                                </button>
                                {showMatch && (
                                    <div style={{ marginTop: 12, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
                                        <p style={{ marginTop: 0 }}>O match (0–100%) mede o quanto cada vaga combina com você. Ele soma duas partes:</p>
                                        <ul style={{ margin: '0 0 12px 18px', padding: 0 }}>
                                            <li><b>Skills, peso 80%.</b> Quantas das skills pedidas na vaga estão nas suas keywords. Ex.: a vaga pede 5 skills e você tem 4 → 80% nesta parte.</li>
                                            <li><b>Senioridade, peso 20%.</b> 100% se o nível da vaga bate com um dos que você marcou em <i>Preferências de Trabalho</i>; cai ~25 pontos a cada nível de distância (ex.: pleno x sênior).</li>
                                        </ul>
                                        <div className="notice info" style={{ marginBottom: 12 }}>
                                            <i className="ti ti-bolt" /><span>O envio automático só dispara em vagas com match <b>≥ 50%</b>.</span>
                                        </div>
                                        <p style={{ margin: '0 0 6px' }}><b>Antes do score, os filtros descartam vagas que não servem:</b> área profissional, região, keywords obrigatórias, palavras e domínios bloqueados, senioridade estrita e data de postagem (aba <i>Filtros</i>).</p>
                                        <p style={{ margin: '0 0 6px' }}><b>Para melhorar seus resultados:</b></p>
                                        <ul style={{ margin: 0, padding: '0 0 0 18px' }}>
                                            <li>Liste as keywords que você <b>realmente</b> domina. Encher de skills que não usa infla um match falso.</li>
                                            <li>Marque sua(s) senioridade(s) e área para não receber vagas de outro nível ou cargo.</li>
                                            <li>Use <i>keywords obrigatórias</i> para exigir algo essencial (ex.: sua linguagem principal).</li>
                                        </ul>
                                    </div>
                                )}
                            </div>

                            {/* Importar do LinkedIn */}
                            <div className="panel" style={{ borderColor: 'var(--color-accent-light)' }}>
                                <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                                    <div className="feat-ico" style={{ width: 34, height: 34, marginBottom: 0 }}><i className="ti ti-file-cv" /></div>
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
                                    <i className="ti ti-info-circle" /><span>Este PDF é só para extrair dados. <b>Não</b> é o currículo anexado nos emails.</span>
                                </div>
                            </div>
                        </div>
                        )}
                    </div>
                    <div className={`mais-item ${section === 'filters' ? 'aberto' : ''}`}>
                        <button type="button" className="mais-cab" onClick={() => setSection(section === 'filters' ? '' : 'filters')} aria-expanded={section === 'filters'}>
                            <i className="ti ti-filter" /> <span>{t('Filtros avançados')}</span>
                            <i className={`ti ${section === 'filters' ? 'ti-chevron-up' : 'ti-chevron-down'} mais-seta`} />
                        </button>
                        {section === 'filters' && (

                        <div className="card">
                            <div className="sec-card-head"><h2>{t('Filtros avançados')}</h2><span className="badge warn">Opcional</span></div>
                            <div className="why"><i className="ti ti-info-circle" />{t('Não precisa mexer aqui para começar. Use quando já tiver visto as vagas e quiser tirar algum tipo da sua lista.')}</div>
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

                            <div className="field">
                                <label>Onde se candidatar (país das vagas)</label>
                                <select className="select" value={form.region} onChange={(e) => set('region', e.target.value)}>
                                    <option value="br">🇧🇷 Brasil</option>
                                    <option value="intl">🌎 Internacional</option>
                                    <option value="ambos">🇧🇷🌎 Brasil e exterior</option>
                                </select>
                                <div className="hint">Só receberá vagas da região escolhida. (Por enquanto o foco é Brasil.)</div>
                            </div>
                            {form.region !== 'br' && form.regiaoLigada && (
                                <div className="field">
                                    <label>{t('Regiões')} <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>({t('opcional')})</span></label>
                                    <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>{t('Sem marcar nada, aparecem todas. Vaga que não informa o país continua aparecendo.')}</div>
                                    <div className="chips">
                                        {REGION_OPTIONS.map((o) => (
                                            <span key={o.value} className={`chip toggle ${form.regions.includes(o.value) ? 'on' : ''}`}
                                                onClick={() => toggleIn('regions', o.value)}>{t(o.label)}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <div className="field">
                                <label>Keywords obrigatórias <span className="badge ok">eliminatório</span></label>
                                <div className="hint" style={{ marginTop: 0, marginBottom: 8 }}>Vagas que NÃO contenham nenhuma dessas palavras serão descartadas.</div>
                                <TagInput value={form.requiredKeywords} onChange={(v) => set('requiredKeywords', v)} normalize={normalizeKeyword} placeholder="Tags que toda vaga DEVE ter…" />
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
                                    Só essas senioridades (sem isso, mostramos também um nível acima e um abaixo)
                                </label>
                            </div>

                            <div className="field">
                                <label>{t('Vagas exclusivas para PCD')}</label>
                                <label className="row" style={{ alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 400 }}>
                                    <input type="checkbox" checked={form.showPcd} onChange={(e) => set('showPcd', e.target.checked)} />
                                    {t('Mostrar vagas exclusivas para pessoas com deficiência')}
                                </label>
                            </div>

                            {/* Conta de quando a vaga entrou aqui, a mesma data que a lista mostra.
                                Sem a chave o campo some: seletor que não faz nada parece produto quebrado. */}
                            {FILTRO_DATA_ATIVO && (
                                <div className="field">
                                    <label>{t('Vagas recentes')}</label>
                                    <select className="select" value={form.postingDays} onChange={(e) => set('postingDays', e.target.value)}>
                                        {POSTING_OPTIONS.map((o) => <option key={o.l} value={o.v}>{t(o.l)}</option>)}
                                    </select>
                                    <span className="muted" style={{ fontSize: 12 }}>{t('Conta a partir de quando a vaga entrou aqui.')}</span>
                                </div>
                            )}
                        </div>
                        )}
                    </div>
                    <div className={`mais-item ${section === 'contact' ? 'aberto' : ''}`}>
                        <button type="button" className="mais-cab" onClick={() => setSection(section === 'contact' ? '' : 'contact')} aria-expanded={section === 'contact'}>
                            <i className="ti ti-address-book" /> <span>{t('Contato')}</span>
                            <i className={`ti ${section === 'contact' ? 'ti-chevron-up' : 'ti-chevron-down'} mais-seta`} />
                        </button>
                        {section === 'contact' && (

                        <div className="card">
                            <div className="sec-card-head"><h2>{t('Contato')}</h2></div>
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
                                <div className="hint">Abra o LinkedIn, copie a URL do seu perfil e cole aqui. Ou digite só o usuário, que completamos o link.</div>
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

                            </div>
                        )}
                    </div>
                    <div className={`mais-item ${section === 'modelo' ? 'aberto' : ''}`}>
                        <button type="button" className="mais-cab" onClick={() => setSection(section === 'modelo' ? '' : 'modelo')} aria-expanded={section === 'modelo'}>
                            <i className="ti ti-mail-cog" /> <span>{t('Modelo do email e teste de envio')}</span>
                            <i className={`ti ${section === 'modelo' ? 'ti-chevron-up' : 'ti-chevron-down'} mais-seta`} />
                        </button>
                        {section === 'modelo' && <EmailSettings parte="modelo" />}
                    </div>
                    <div className={`mais-item ${section === 'perigo' ? 'aberto' : ''}`}>
                        <button type="button" className="mais-cab" onClick={() => setSection(section === 'perigo' ? '' : 'perigo')} aria-expanded={section === 'perigo'}>
                            <i className="ti ti-trash" /> <span>{t('Apagar meu perfil')}</span>
                            <i className={`ti ${section === 'perigo' ? 'ti-chevron-up' : 'ti-chevron-down'} mais-seta`} />
                        </button>
                        {section === 'perigo' && (

                        <div className="card">
                            <div className="sec-card-head"><h2>Apagar meu perfil</h2></div>
                            <div className="why"><i className="ti ti-info-circle" />
                                Isto apaga suas skills, filtros, contatos e a referência do currículo. Sua conta e
                                seu histórico de candidaturas continuam.
                            </div>

                            {/* O "Resetar configuração" fica escondido no cabeçalho do
                                celular, onde roubava uma linha inteira. Aqui ele não
                                some: é a mesma família de ação (desfazer o que foi
                                configurado), só que sem o destrutivo. */}
                            <div className="resetar-aqui">
                                <div>
                                    <b>Resetar configuração</b>
                                    <span>Volta os filtros e preferências ao padrão. Não apaga skills nem currículo.</span>
                                </div>
                                <button className="btn ghost sm" onClick={resetConfig}>
                                    <i className="ti ti-rotate" /> {t('Resetar configuração')}
                                </button>
                            </div>

                            <div className="perigo-box">
                                <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                                    <i className="ti ti-alert-triangle" style={{ color: 'var(--color-danger)', fontSize: 20, flexShrink: 0 }} />
                                    <div>
                                        <div style={{ fontWeight: 600, marginBottom: 6 }}>O que acontece ao apagar</div>
                                        <ul style={{ margin: '0 0 0 18px', fontSize: 13, lineHeight: 1.75, color: 'var(--color-text-secondary)' }}>
                                            <li>Os envios que estão na fila são cancelados.</li>
                                            <li>Você deixa de receber vagas até preencher o perfil de novo.</li>
                                            {/* A cópia de segurança CONTINUA sendo feita (é o que torna
                                                reversível alguém entrar na conta e apagar por você), mas não é
                                                mais anunciada aqui: quem apaga por privacidade não deveria
                                                receber, no meio da ação, a notícia de que algo foi guardado.
                                                A retenção é declarada na Política de Privacidade, que é onde
                                                ela tem de estar, e continua verdadeira. Não remova de lá. */}
                                            <li>Você sai da sua conta em seguida.</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="field" style={{ marginTop: 18, maxWidth: 340 }}>
                                <label>Digite <b>APAGAR</b> para confirmar</label>
                                <input className="input" value={confirmaApagar} placeholder="APAGAR"
                                    onChange={(e) => setConfirmaApagar(e.target.value)} />
                            </div>
                            <button className="btn danger" disabled={apagando || confirmaApagar.trim().toUpperCase() !== 'APAGAR'}
                                onClick={apagarPerfil}>
                                <i className="ti ti-trash" /> {apagando ? 'Apagando…' : 'Apagar meu perfil'}
                            </button>
                        </div>
                        )}
                    </div>
                    </div>

                    {showSave && (
                        // Sem alteração pendente NÃO mostramos um botão desabilitado:
                        // botão que nunca funciona é ruído, e o usuário aprende a
                        // ignorar aquele canto da tela — justamente onde o aviso de
                        // "não salvo" vai aparecer depois. No lugar, uma confirmação
                        // discreta de que está tudo gravado.
                        <div className={`save-bar ${sujo ? '' : 'limpo'}`}>
                            {sujo ? (
                                <>
                                    <span className="aviso">
                                        <i className="ti ti-alert-circle" /> {t('Você tem alterações não salvas.')}
                                    </span>
                                    <div className="acoes">
                                        <button className="btn sm" disabled={saving}
                                            onClick={() => applyProfile(data?.profile)}>
                                            <i className="ti ti-arrow-back-up" /> {t('Descartar')}
                                        </button>
                                        <button className="btn primary" disabled={saving} onClick={save}>
                                            {saving ? t('Salvando…') : (<><i className="ti ti-device-floppy" /> {t('Salvar configurações')}</>)}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <span className="tudo-salvo"><i className="ti ti-circle-check" /> {t('Tudo salvo')}</span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
