import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useCachedResource } from '../lib/useCachedResource.js';
import { useT } from '../lib/i18n.jsx';
import { scoreClass, gmailComposeUrl, LIMITE_URL, AREA_OPTIONS } from '../utils.js';
import { haQuanto } from '../lib/tempo.js';
import WizardInicial from '../components/WizardInicial.jsx';
import { marcarVoltaParaVagas } from '../lib/voltarParaVagas.js';

// =========================
// Vagas para você (a tela inicial)
// =========================
// Feedback real (29/10/2026): "muita informação", "não entendo para que serve",
// "cadê o botão de enviar", "sumiu o envio automático". A tela tem DUAS coisas:
//
//   1. Um cartão grande com a ação principal: mandar o currículo para as
//      melhores vagas de hoje de uma vez (envio automático pelo Gmail). Sem Gmail
//      conectado, o mesmo lugar vira "Conectar Gmail". É o botão que a pessoa
//      procura ao abrir o app.
//   2. A lista das vagas, enxuta: título, empresa, quando, compatibilidade e
//      "Enviar". Área, nível, modalidade e o post aparecem ao abrir a vaga.
//
// A lista é CONGELADA ao carregar: enviar ou dar 👎 marca a linha em vez de
// recalcular, senão a vaga some debaixo do dedo e leva junto o "desfazer".

const POR_PAGINA = 20;
const MIN_AUTO = 50; // o mesmo corte do envio automático no backend (routes/queue.js)
const AREA_NOME = Object.fromEntries(AREA_OPTIONS.map((a) => [a.value, a.label]));
const NIVEL_NOME = { estagio: 'Estágio', junior: 'Júnior', pleno: 'Pleno', senior: 'Sênior', lead: 'Tech Lead', manager: 'Gerência' };
const MOD_NOME = { remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial' };
const faixa = (d) => { const dias = (Date.now() - new Date(d)) / 86400000; return dias <= 7 ? 0 : dias <= 30 ? 1 : 2; };

export default function Dashboard() {
    const { user, refreshUser, googleConfigured } = useAuth();
    const { t } = useT();
    const toast = useToast();
    const { data: profData } = useCachedResource('profile', () => api.getProfile());
    const profile = profData?.profile;

    // Sem área escolhida o feed não tem o que filtrar: o assistente vem antes.
    // Declarado antes do JSX que usa (no-use-before-define já derrubou o app).
    const [wizardFeito, setWizardFeito] = useState(false);
    const mostraWizard = !wizardFeito && !!profData && !(profile?.areas?.length);

    const [lista, setLista] = useState(null);
    const [estado, setEstado] = useState({});       // id -> 'enviado' | 'aberto' | 'removido'
    const [likes, setLikes] = useState(new Set());
    const [feedbackLigado, setFeedbackLigado] = useState(false);
    const [motivos, setMotivos] = useState({});
    const [pedindoMotivo, setPedindoMotivo] = useState(null);
    const [aberta, setAberta] = useState(null);
    const [textoCompleto, setTextoCompleto] = useState({});
    const [mostrar, setMostrar] = useState(POR_PAGINA);
    const [ocupado, setOcupado] = useState(null);
    const [fila, setFila] = useState(null);
    const [iniciando, setIniciando] = useState(false);
    const trava = useRef(false);
    const poll = useRef(null);
    const estavaEnviando = useRef(false);

    async function carregar() {
        try {
            const r = await api.getMatches();
            // Recentes primeiro (a API ordena só por compatibilidade, e o topo
            // virava vaga de 135 dias), depois compatibilidade.
            setLista((r.matches || []).slice().sort((a, b) => faixa(a.createdAt) - faixa(b.createdAt) || b.matchScore - a.matchScore));
            setEstado({});
            setMostrar(POR_PAGINA);
        } catch (e) { toast.show(e.message, 'error'); setLista([]); }
    }
    useEffect(() => { if (!mostraWizard && profData) carregar(); }, [mostraWizard, !!profData]);
    useEffect(() => {
        api.jobFeedbackMine().then((r) => {
            setFeedbackLigado(!!r.disponivel);
            setLikes(new Set(r.likes || []));
            setMotivos(r.motivos || {});
        }).catch(() => {});
    }, []);

    // Envio automático em andamento: acompanha até acabar (também depois de F5).
    function pararPoll() { if (poll.current) { clearInterval(poll.current); poll.current = null; } }
    async function lerFila() {
        try {
            const { status } = await api.queueStatus();
            setFila(status);
            if (!status.active) {
                pararPoll();
                refreshUser().catch(() => {});
                // Acabou de terminar: as enviadas saem do feed, então recarrega.
                if (estavaEnviando.current) { estavaEnviando.current = false; carregar(); toast.show(t('Envio concluído: {n} currículos enviados.', { n: status.sent })); }
            } else estavaEnviando.current = true;
            return status;
        } catch { return null; }
    }
    function acompanhar() { pararPoll(); lerFila(); poll.current = setInterval(() => { if (!document.hidden) lerFila(); }, 4000); }
    useEffect(() => { lerFila().then((s) => { if (s?.active) acompanhar(); }); return pararPoll; }, []);

    const restam = Math.max(0, user?.usage?.remainingToday ?? 0);
    const limite = user?.usage?.dailyLimit ?? 0;
    const conectado = !!user?.googleConnected;
    const temCv = !!user?.hasCv;
    const envioDireto = conectado && temCv && !!user?.planLimits?.allowManual;
    const boas = (lista || []).filter((v) => v.matchScore >= MIN_AUTO && !estado[v.id]);
    const quantasAuto = Math.min(restam, boas.length);
    const enviando = !!fila?.active;

    async function enviarAutomatico() {
        if (iniciando || !quantasAuto) return;
        setIniciando(true);
        try {
            // A seleção é a mesma que a pessoa vê: as primeiras boas da lista.
            // Com escolha manual liberada, manda exatamente as que a pessoa vê; sem
            // ela (planos pagos ligados, plano grátis), o servidor escolhe sozinho
            // pela mesma regra (recentes, depois compatibilidade).
            const ids = boas.slice(0, quantasAuto).map((v) => v.id);
            if (user?.planLimits?.allowManual) await api.queueStart('manual', ids);
            else await api.queueStart('auto');
            setEstado((s) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, 'fila'])) }));
            toast.show(t('Pronto. Seu currículo vai sair para {n} vagas, uma a cada 1 ou 2 minutos.', { n: ids.length }));
            acompanhar();
        } catch (e) { toast.show(e.message, 'error'); }
        finally { setIniciando(false); }
    }

    async function pararEnvio() {
        try { await api.queueStop(); toast.show(t('Envio parado. O que já saiu continua enviado.')); lerFila(); }
        catch (e) { toast.show(e.message, 'error'); }
    }

    async function conectarGmail() {
        try {
            if (!googleConfigured) { toast.show(t('Conexão com o Google indisponível no momento.'), 'error'); return; }
            const { url } = await api.googleAuthUrl();
            marcarVoltaParaVagas();
            window.location.href = url;
        } catch (e) { toast.show(e.message, 'error'); }
    }

    async function enviar(vaga) {
        if (trava.current || restam <= 0) return;
        trava.current = true;
        setOcupado(vaga.id);
        // A aba abre ANTES do await: window.open depois de resposta de rede perde
        // o vínculo com o clique e o navegador bloqueia como popup.
        const aba = envioDireto ? null : window.open('', '_blank');
        try {
            if (envioDireto) {
                await api.apply(vaga.id);
                setEstado((s) => ({ ...s, [vaga.id]: 'enviado' }));
                toast.show(t('Currículo enviado para {empresa}.', { empresa: vaga.company || t('o recrutador') }));
            } else {
                const email = await api.composeJob(vaga.id);
                const url = gmailComposeUrl(email);
                if (aba && url.length <= LIMITE_URL) aba.location = url; else aba?.close();
                setEstado((s) => ({ ...s, [vaga.id]: 'aberto' }));
                toast.show(t('Abrimos o email no seu Gmail. Anexe o currículo e envie.'));
            }
            refreshUser().catch(() => {});
        } catch (e) {
            aba?.close();
            toast.show(e.message, 'error');
        } finally {
            trava.current = false;
            setOcupado(null);
        }
    }

    async function votar(vaga, voto, motivo) {
        setPedindoMotivo(null);
        try {
            await api.jobFeedback(vaga.id, voto, motivo);
            if (voto === -1) setEstado((s) => ({ ...s, [vaga.id]: 'removido' }));
            if (voto === 0) setEstado((s) => { const n = { ...s }; delete n[vaga.id]; return n; });
            setLikes((l) => { const n = new Set(l); voto === 1 ? n.add(String(vaga.id)) : n.delete(String(vaga.id)); return n; });
        } catch (e) { toast.show(e.message, 'error'); }
    }

    async function abrirVaga(id) {
        if (aberta === id) { setAberta(null); return; }
        setAberta(id);
        if (textoCompleto[id] !== undefined) return;
        try {
            const { job } = await api.getJob(id);
            setTextoCompleto((d) => ({ ...d, [id]: job?.description || '' }));
        } catch { setTextoCompleto((d) => ({ ...d, [id]: null })); }
    }

    const nome = user?.name?.split(' ')[0] || '';
    const visiveis = (lista || []).slice(0, mostrar);

    return (
        <div className="page vagas-hoje">
            <div className="page-head">
                <h1>{nome ? t('Vagas para você, {name}', { name: nome }) : t('Vagas para você')}</h1>
                <p>{t('Vagas de tecnologia postadas por recrutadores, com o contato deles.')}</p>
            </div>

            {mostraWizard && (
                <WizardInicial onPronto={() => setWizardFeito(true)} onPular={() => setWizardFeito(true)} />
            )}

            {!mostraWizard && (<>
                {/* ---- A ação principal ---- */}
                <div className="card vh-hero">
                    {enviando ? (<>
                        <div className="vh-hero-txt">
                            <div className="vh-hero-titulo"><i className="ti ti-loader-2 spin" /> {t('Enviando seu currículo…')}</div>
                            <div className="vh-hero-sub">{t('{feitos} de {total} enviados. Pode fechar a página, o envio continua.', { feitos: fila.sent, total: fila.total })}</div>
                            <div className="progress" style={{ marginTop: 10 }}><span style={{ width: `${Math.round(((fila.sent + fila.failed + fila.skipped) / (fila.total || 1)) * 100)}%` }} /></div>
                        </div>
                        <button className="btn ghost" onClick={pararEnvio}><i className="ti ti-player-stop" /> {t('Parar')}</button>
                    </>) : restam <= 0 ? (
                        <div className="vh-hero-txt">
                            <div className="vh-hero-titulo"><i className="ti ti-circle-check" /> {t('Você já mandou os {n} currículos de hoje.', { n: limite })}</div>
                            <div className="vh-hero-sub">{t('Amanhã tem mais. As vagas continuam aqui.')}</div>
                        </div>
                    ) : !conectado ? (<>
                        <div className="vh-hero-txt">
                            <div className="vh-hero-titulo">{t('Envio automático')}</div>
                            <div className="vh-hero-sub">{t('Conecte seu Gmail e a gente manda seu currículo para as melhores vagas, com o seu nome. Só pedimos permissão para enviar, nunca para ler.')}</div>
                        </div>
                        <button className="btn primary vh-hero-btn" onClick={conectarGmail}><i className="ti ti-brand-google" /> {t('Conectar Gmail')}</button>
                    </>) : !temCv ? (<>
                        <div className="vh-hero-txt">
                            <div className="vh-hero-titulo">{t('Falta só o seu currículo')}</div>
                            <div className="vh-hero-sub">{t('Ele vai anexado em cada email. É um PDF, leva 10 segundos.')}</div>
                        </div>
                        <Link className="btn primary vh-hero-btn" to="/app/perfil?section=contact"><i className="ti ti-file-upload" /> {t('Anexar currículo')}</Link>
                    </>) : quantasAuto > 0 ? (<>
                        <div className="vh-hero-txt">
                            <div className="vh-hero-titulo">{t('Mandar meu currículo para as {n} melhores vagas de hoje', { n: quantasAuto })}</div>
                            <div className="vh-hero-sub">{t('Sai do seu Gmail, com o seu nome, uma vaga a cada 1 ou 2 minutos. Você pode parar quando quiser.')}</div>
                        </div>
                        <button className="btn primary vh-hero-btn" disabled={iniciando} onClick={enviarAutomatico}>
                            <i className={`ti ${iniciando ? 'ti-loader-2 spin' : 'ti-send'}`} /> {t('Enviar agora')}
                        </button>
                    </>) : (
                        <div className="vh-hero-txt">
                            <div className="vh-hero-titulo">{t('Nenhuma vaga muito compatível agora')}</div>
                            <div className="vh-hero-sub">{t('O envio automático só manda para vagas que combinam bem com você. Escolha abaixo ou ajuste seu perfil.')}</div>
                        </div>
                    )}
                </div>
                {!enviando && restam > 0 && (
                    <div className="vh-cota muted">{t('{r} de {n} envios livres hoje', { r: restam, n: limite })} · <Link to="/app/perfil" className="link-sutil">{t('Ajustar o que eu procuro')}</Link></div>
                )}

                {/* ---- As vagas ---- */}
                {lista === null ? (
                    <div className="card" style={{ marginTop: 10, padding: 18 }}>
                        <div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '70%' }} /><div className="skeleton sk-line" style={{ width: '85%' }} />
                    </div>
                ) : lista.length === 0 ? (
                    <div className="card empty" style={{ marginTop: 10, padding: 34 }}>
                        <i className="ti ti-mood-search" />
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('Nenhuma vaga combina com você agora.')}</div>
                        <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{t('Entram vagas novas todos os dias. Se quiser ver mais, afrouxe os filtros.')}</div>
                        <Link to="/app/perfil" className="btn sm">{t('Ajustar o que eu procuro')}</Link>
                    </div>
                ) : (<>
                    <div className="card lista-card vh-lista">
                        {visiveis.map((v) => {
                            const st = estado[v.id];
                            if (st === 'removido') {
                                return (
                                    <div key={v.id} className="vh-removida">
                                        <span>{t('Vaga tirada da sua lista.')}</span>
                                        <button className="btn ghost sm" onClick={() => votar(v, 0)}>{t('Desfazer')}</button>
                                    </div>
                                );
                            }
                            const curtiu = likes.has(String(v.id));
                            const aberto = aberta === v.id;
                            return (
                                <div key={v.id} className={`vh-vaga ${st ? 'feita' : ''}`}>
                                    <div className="vh-linha">
                                        <button className="vh-info" onClick={() => abrirVaga(v.id)} aria-expanded={aberto}>
                                            <span className="vh-titulo">{v.title || t('Vaga')}</span>
                                            <span className="vh-sub">
                                                {[v.company, haQuanto(v.createdAt)].filter(Boolean).join(' · ')}
                                                {' · '}<span className={`vh-match ${scoreClass(v.matchScore)}`}>{t('{n}% compatível', { n: v.matchScore })}</span>
                                            </span>
                                        </button>
                                        {feedbackLigado && !st && (
                                            <span className="vh-votos">
                                                <button className={`vh-voto ${curtiu ? 'on' : ''}`} aria-pressed={curtiu} title={t('Gostei, quero mais assim')}
                                                    aria-label={t('Gostei, quero mais assim')} onClick={() => votar(v, curtiu ? 0 : 1)}>
                                                    <i className="ti ti-thumb-up" />
                                                </button>
                                                <button className="vh-voto" title={t('Não serve, tirar da lista')} aria-label={t('Não serve, tirar da lista')}
                                                    onClick={() => setPedindoMotivo(pedindoMotivo === v.id ? null : v.id)}>
                                                    <i className="ti ti-thumb-down" />
                                                </button>
                                            </span>
                                        )}
                                        <span className="vh-acoes">
                                            {st === 'enviado' ? <span className="badge ok"><i className="ti ti-check" /> {t('Enviado')}</span>
                                                : st === 'fila' ? <span className="badge info"><i className="ti ti-clock" /> {t('Na fila')}</span>
                                                : st === 'aberto' ? <span className="badge info"><i className="ti ti-external-link" /> {t('Aberto no Gmail')}</span>
                                                : (
                                                    <button className="btn sm" disabled={restam <= 0 || ocupado === v.id} onClick={() => enviar(v)}>
                                                        <i className={`ti ${ocupado === v.id ? 'ti-loader-2 spin' : 'ti-send'}`} /> {t('Enviar')}
                                                    </button>
                                                )}
                                        </span>
                                    </div>

                                    {pedindoMotivo === v.id && (
                                        <div className="vh-motivos">
                                            <span className="muted" style={{ fontSize: 12.5 }}>{t('O que não serve?')}</span>
                                            {Object.entries(motivos).map(([k, rotulo]) => (
                                                <button key={k} className="chip toggle" onClick={() => votar(v, -1, k)}>{t(rotulo)}</button>
                                            ))}
                                        </div>
                                    )}

                                    {aberto && (
                                        <div className="vh-detalhe">
                                            <div className="vh-chips">
                                                {v.area && v.area !== 'other' && <span className="chip muted">{AREA_NOME[v.area] || v.area}</span>}
                                                {v.level && <span className="chip muted">{NIVEL_NOME[v.level] || v.level}</span>}
                                                {(v.mods || []).map((m) => <span key={m} className="chip muted">{MOD_NOME[m] || m}</span>)}
                                                {v.location && <span className="chip muted">{v.location}</span>}
                                            </div>
                                            <div className="det-descricao">{textoCompleto[v.id] ?? v.description ?? t('Carregando…')}</div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    {lista.length > mostrar && (
                        <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => setMostrar((n) => n + POR_PAGINA)}>
                            {t('Mostrar mais vagas')}
                        </button>
                    )}
                </>)}
            </>)}
        </div>
    );
}
