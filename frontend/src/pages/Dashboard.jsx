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

// =========================
// Vagas de hoje (a tela inicial)
// =========================
// Feedback real de usuários (29/10/2026): "muita informação", "não entendo para
// que serve", "parece feito para tirar dinheiro de desempregado". O painel
// antigo tinha onze blocos (KPIs, ranking, central de atividades, mural de
// feedback, tour, checklist, banner...) e a busca de vagas escondida num modal.
//
// Agora a tela responde UMA pergunta: "quais vagas são para mim hoje?". Cada
// vaga tem o que a pessoa precisa para decidir (cargo, empresa, área, nível,
// modalidade, compatibilidade, o post) e uma ação principal: Enviar currículo.
// 👍/👎 ensinam o que serve; o 👎 tira a vaga da lista na hora.
//
// A lista é CONGELADA ao carregar: enviar ou dar 👎 marca a linha em vez de
// recalcular, senão a vaga some debaixo do dedo e leva junto o botão de desfazer.

const POR_PAGINA = 20;
const AREA_NOME = Object.fromEntries(AREA_OPTIONS.map((a) => [a.value, a.label]));
const NIVEL_NOME = { estagio: 'Estágio', junior: 'Júnior', pleno: 'Pleno', senior: 'Sênior', lead: 'Tech Lead', manager: 'Gerência' };
const MOD_NOME = { remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial' };

export default function Dashboard() {
    const { user, refreshUser } = useAuth();
    const { t } = useT();
    const toast = useToast();
    const { data: profData } = useCachedResource('profile', () => api.getProfile());
    const profile = profData?.profile;

    // Sem área escolhida o feed não tem o que filtrar: o assistente vem antes.
    // Declarado antes do JSX que usa (no-use-before-define já derrubou o app).
    const [wizardFeito, setWizardFeito] = useState(false);
    const mostraWizard = !wizardFeito && !!profData && !(profile?.areas?.length);

    const [lista, setLista] = useState(null);       // congelada ao carregar
    const [estado, setEstado] = useState({});       // id -> 'enviado' | 'aberto' | 'removido'
    const [likes, setLikes] = useState(new Set());
    const [feedbackLigado, setFeedbackLigado] = useState(false);
    const [motivos, setMotivos] = useState({});
    const [pedindoMotivo, setPedindoMotivo] = useState(null);
    const [aberta, setAberta] = useState(null);     // id com o post expandido
    const [textoCompleto, setTextoCompleto] = useState({});
    const [mostrar, setMostrar] = useState(POR_PAGINA);
    const [ocupado, setOcupado] = useState(null);
    const trava = useRef(false);

    async function carregar() {
        try {
            const r = await api.getMatches();
            // A API ordena só por compatibilidade, e o topo virava vaga de 135
            // dias atrás, provavelmente fechada. Aqui o recente vem primeiro (faixas
            // de semana/mês) e, dentro da faixa, o mais compatível.
            const faixa = (d) => { const dias = (Date.now() - new Date(d)) / 86400000; return dias <= 7 ? 0 : dias <= 30 ? 1 : 2; };
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

    const restam = Math.max(0, user?.usage?.remainingToday ?? 0);
    const limite = user?.usage?.dailyLimit ?? 0;
    const usadas = user?.usage?.usedToday ?? 0;
    // Envio DIRETO: sai do Gmail conectado, com o currículo anexado. Sem isso,
    // "Enviar" abre o email pronto no Gmail da pessoa (ela anexa e envia).
    const envioDireto = !!user?.googleConnected && !!user?.hasCv && !!user?.planLimits?.allowManual;

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

    async function abrirPost(id) {
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
                <p>
                    {t('Vagas de tecnologia que recrutadores postaram no LinkedIn, já com o contato deles.')}{' '}
                    <Link to="/app/perfil" className="link-sutil">{t('Ajustar o que eu procuro')}</Link>
                </p>
            </div>

            {mostraWizard && (
                <WizardInicial onPronto={() => setWizardFeito(true)} onPular={() => setWizardFeito(true)} />
            )}

            {!mostraWizard && (<>
                {/* Como o envio funciona, em uma linha, e a cota do dia. */}
                <div className="card vh-barra">
                    <div className="vh-modo">
                        <i className={`ti ${envioDireto ? 'ti-circle-check' : 'ti-mail-forward'}`} />
                        <span>
                            {envioDireto
                                ? t('Ao clicar em Enviar, o email sai do seu Gmail com o currículo anexado.')
                                : t('Ao clicar em Enviar, abrimos o email pronto no seu Gmail. Você anexa o currículo e envia.')}
                            {!envioDireto && (
                                <> <Link to={user?.googleConnected ? '/app/perfil' : '/app/perfil?section=email'} className="link-sutil">
                                    {user?.googleConnected ? t('Anexe seu currículo para enviarmos direto') : t('Prefere que a gente envie direto?')}
                                </Link></>
                            )}
                        </span>
                    </div>
                    <div className="vh-cota" title={t('Envios de hoje')}>
                        <b>{restam}</b> {t('de {n} envios livres hoje', { n: limite })}
                    </div>
                </div>

                {restam <= 0 && (
                    <div className="notice info" style={{ marginTop: 12 }}>
                        <i className="ti ti-moon" />{t('Você usou os {n} envios de hoje. Amanhã tem mais, e as vagas continuam aqui.', { n: limite })}
                    </div>
                )}

                {lista === null ? (
                    <div className="card" style={{ marginTop: 14, padding: 18 }}>
                        <div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '70%' }} /><div className="skeleton sk-line" style={{ width: '85%' }} />
                    </div>
                ) : lista.length === 0 ? (
                    <div className="card empty" style={{ marginTop: 14, padding: 34 }}>
                        <i className="ti ti-mood-search" />
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('Nenhuma vaga combina com você agora.')}</div>
                        <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{t('Entram vagas novas todos os dias. Se quiser ver mais, afrouxe os filtros.')}</div>
                        <Link to="/app/perfil" className="btn sm">{t('Ajustar o que eu procuro')}</Link>
                    </div>
                ) : (<>
                    <div className="vh-contagem muted">{t('{n} vagas combinam com o seu perfil', { n: lista.length.toLocaleString('pt-BR') })}</div>
                    <div className="card lista-card">
                        {visiveis.map((v) => {
                            const st = estado[v.id];
                            if (st === 'removido') {
                                return (
                                    <div key={v.id} className="vh-removida">
                                        <span>{t('Vaga tirada da sua lista. Obrigado, isso melhora o que a gente te mostra.')}</span>
                                        <button className="btn ghost sm" onClick={() => votar(v, 0)}>{t('Desfazer')}</button>
                                    </div>
                                );
                            }
                            const curtiu = likes.has(String(v.id));
                            return (
                                <div key={v.id} className={`vh-vaga ${st ? 'feita' : ''}`}>
                                    <div className="vh-topo">
                                        <div className="vh-info">
                                            <div className="vh-titulo">{v.title || t('Vaga')}</div>
                                            <div className="vh-sub">
                                                {[v.company, v.location, haQuanto(v.createdAt)].filter(Boolean).join(' · ')}
                                            </div>
                                            <div className="vh-chips">
                                                {v.area && v.area !== 'other' && <span className="chip muted">{AREA_NOME[v.area] || v.area}</span>}
                                                {v.level && <span className="chip muted">{NIVEL_NOME[v.level] || v.level}</span>}
                                                {(v.mods || []).map((m) => <span key={m} className="chip muted">{MOD_NOME[m] || m}</span>)}
                                                <span className={`score ${scoreClass(v.matchScore)}`} title={t('O quanto a vaga combina com as suas skills')}>{v.matchScore}%</span>
                                            </div>
                                        </div>
                                        <div className="vh-acoes">
                                            {st === 'enviado' ? (
                                                <span className="badge ok"><i className="ti ti-check" /> {t('Enviado')}</span>
                                            ) : st === 'aberto' ? (
                                                <span className="badge info"><i className="ti ti-external-link" /> {t('Aberto no Gmail')}</span>
                                            ) : (
                                                <button className="btn primary sm" disabled={restam <= 0 || ocupado === v.id} onClick={() => enviar(v)}>
                                                    <i className={`ti ${ocupado === v.id ? 'ti-loader-2 spin' : 'ti-send'}`} /> {t('Enviar currículo')}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="vh-rodape">
                                        <button className="btn ghost sm" onClick={() => abrirPost(v.id)} aria-expanded={aberta === v.id}>
                                            <i className={`ti ${aberta === v.id ? 'ti-chevron-up' : 'ti-file-text'}`} /> {aberta === v.id ? t('Fechar') : t('Ver a vaga')}
                                        </button>
                                        {feedbackLigado && (
                                            <span className="vh-votos">
                                                <span className="muted" style={{ fontSize: 12 }}>{t('Serve para você?')}</span>
                                                <button className={`btn ghost sm vh-voto ${curtiu ? 'on' : ''}`} aria-pressed={curtiu} title={t('Sim, quero mais vagas assim')}
                                                    onClick={() => votar(v, curtiu ? 0 : 1)}>👍</button>
                                                <button className="btn ghost sm vh-voto" title={t('Não, tirar da minha lista')}
                                                    onClick={() => setPedindoMotivo(pedindoMotivo === v.id ? null : v.id)}>👎</button>
                                            </span>
                                        )}
                                    </div>

                                    {pedindoMotivo === v.id && (
                                        <div className="vh-motivos">
                                            <span className="muted" style={{ fontSize: 12.5 }}>{t('O que não serve?')}</span>
                                            {Object.entries(motivos).map(([k, rotulo]) => (
                                                <button key={k} className="chip toggle" onClick={() => votar(v, -1, k)}>{t(rotulo)}</button>
                                            ))}
                                        </div>
                                    )}

                                    {aberta === v.id && (
                                        <div className="det-descricao vh-post">
                                            {textoCompleto[v.id] ?? v.description ?? t('Carregando…')}
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
                    <div className="muted" style={{ fontSize: 12.5, textAlign: 'center', marginTop: 16 }}>
                        {usadas > 0 && <>{t('Você mandou {n} hoje.', { n: usadas })} </>}
                        <Link to="/app/candidaturas" className="link-sutil">{t('Ver tudo que você já enviou')}</Link>
                    </div>
                </>)}
            </>)}
        </div>
    );
}
