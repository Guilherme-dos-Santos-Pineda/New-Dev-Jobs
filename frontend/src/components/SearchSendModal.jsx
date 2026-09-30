import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from './Toast.jsx';
import { useT } from '../lib/i18n.jsx';
import { scoreClass, gmailComposeUrl, mailtoUrl, LIMITE_URL } from '../utils.js';

// =========================
// Buscar vagas e escolher como candidatar-se
// =========================
// Três caminhos, e o terceiro é novo:
//
//   auto     envia sozinho pela conta Google conectada
//   revisar  escolhe da lista e envia (planos pagos)
//   próprio  devolve o email pronto para a pessoa mandar do Gmail DELA
//
// O terceiro existe porque, medido no banco, de 9 pessoas que salvaram um
// perfil só 4 conectaram o Gmail. A tela de permissão do Google era o maior
// buraco do funil e não tinha desvio: sem token, nada saía, e a pessoa ia
// embora sem nunca ver o produto funcionando.
//
// Por isso ele NÃO exige conta conectada e aparece mesmo para quem não
// configurou nada além do perfil. A permissão do Gmail passa a ser pedida
// depois que a pessoa mandou algumas na mão e sentiu o trabalho que dá, que é
// o momento em que ela tem motivo para querer a automação.

export default function SearchSendModal({ onClose, onStarted, onManualSent }) {
    const { user, refreshUser } = useAuth();
    const toast = useToast();
    const { t } = useT();
    const navigate = useNavigate();
    const [phase, setPhase] = useState('searching'); // searching | choose | manual | proprio
    const [matches, setMatches] = useState([]);
    const [filtered, setFiltered] = useState(0); // vagas escondidas pelos filtros do perfil
    const [selected, setSelected] = useState(new Set());
    const [expanded, setExpanded] = useState(null);
    // A listagem chega com a descrição truncada (a resposta inteira seria ~2 MB).
    // O texto completo é buscado sob demanda, só da vaga que o usuário abriu.
    const [fullDesc, setFullDesc] = useState({}); // id -> descrição completa
    const [starting, setStarting] = useState(false);
    const startingRef = useRef(false); // guarda síncrona contra duplo-clique
    // Caminho "por conta própria": o que já foi liberado nesta sessão.
    const [composto, setComposto] = useState({}); // id -> { to, subject, body }
    const [compondo, setCompondo] = useState(null); // id em andamento
    const compondoRef = useRef(false); // guarda síncrona contra duplo-clique

    // Lista do caminho "por conta própria", CONGELADA ao entrar na tela.
    //
    // Duas razões para não usar `matches` direto aqui:
    //
    // 1. São até 1500 vagas. Renderizar 1500 linhas travou a tela a ponto de a
    //    captura de tela estourar o tempo. O caminho pago pode listar tudo (é
    //    por essa escolha ampla que se paga); este é o caminho de todo mundo.
    // 2. Mostrar mais do que a pessoa pode mandar hoje só a obriga a descartar
    //    sem critério. Mesmo raciocínio dos destaques, que trazem exatamente o
    //    teto diário.
    //
    // Congelada porque a cota cai a cada envio: recalcular encolheria a lista
    // debaixo do dedo da pessoa e sumiria com as linhas que ela acabou de abrir
    // (e que guardam o botão de copiar).
    const [doDia, setDoDia] = useState([]);

    const ready = user.googleConnected && user.hasProfile && user.hasCv;
    const isFree = (user.plan || 'free') === 'free';
    const temPerfil = !!user.hasProfile;
    const quantosMandou = Object.keys(composto).length;
    const restamHoje = Math.max(0, user.usage?.remainingToday ?? 0);

    function entrarProprio() {
        setDoDia(matches.slice(0, restamHoje));
        setPhase('proprio');
    }

    useEffect(() => {
        let alive = true;
        const started = Date.now();
        (async () => {
            try { await refreshUser(); } catch { /* ignore */ }
            let list = []; let hidden = 0;
            try { const r = await api.getMatches(); list = r.matches; hidden = r.filtered || 0; } catch { /* ignore */ }
            // Mínimo curto só para a animação de "busca" não piscar — sem padding
            // artificial de tempo. Se a API já demorou mais que isso, abre na hora.
            const wait = Math.max(0, 700 - (Date.now() - started));
            setTimeout(() => { if (alive) { setMatches(list); setFiltered(hidden); setSelected(new Set(list.map((m) => m.id))); setPhase('choose'); } }, wait);
        })();
        return () => { alive = false; };
    }, []);

    async function start(mode, jobIds) {
        if (startingRef.current) return; // bloqueia cliques repetidos antes do re-render
        startingRef.current = true;
        setStarting(true);
        try {
            await api.queueStart(mode, jobIds);
            toast.show(mode === 'auto' ? 'Envio automático iniciado!' : `${jobIds.length} vaga(s) na fila de envio`);
            onStarted?.();
            onClose();
        } catch (e) {
            if (e.status === 402) toast.show('Seleção manual é um recurso dos planos pagos.', 'error');
            else toast.show(e.message, 'error');
            startingRef.current = false;
            setStarting(false);
        }
    }

    // Libera o email de UMA vaga e abre o Gmail do usuário já preenchido.
    //
    // A aba é aberta ANTES do await, de propósito: `window.open` chamado depois
    // de uma resposta da rede perde o vínculo com o clique e o navegador bloqueia
    // como popup. Abrimos em branco durante o gesto e só então trocamos a URL.
    async function abrirNoGmail(id) {
        if (compondoRef.current) return;
        compondoRef.current = true;
        setCompondo(id);
        const aba = window.open('', '_blank');
        try {
            const email = await api.composeJob(id);
            const url = gmailComposeUrl(email);
            if (aba && url.length <= LIMITE_URL) aba.location = url;
            else aba?.close(); // popup bloqueado ou email longo demais: fica o copiar
            setComposto((c) => ({ ...c, [id]: email }));
            try { await refreshUser(); } catch { /* ignore */ }
            onManualSent?.();
        } catch (e) {
            aba?.close();
            toast.show(e.message, 'error');
        } finally {
            compondoRef.current = false;
            setCompondo(null);
        }
    }

    async function copiar(id) {
        const email = composto[id];
        if (!email) return;
        const texto = `Para: ${email.to}\nAssunto: ${email.subject}\n\n${email.body}`;
        try {
            await navigator.clipboard.writeText(texto);
            toast.show(t('Email copiado. Cole no seu cliente de email.'));
        } catch {
            toast.show(t('Não consegui copiar. Selecione o texto na tela.'), 'error');
        }
    }

    async function expandir(id) {
        if (expanded === id) { setExpanded(null); return; }
        setExpanded(id);
        if (fullDesc[id] !== undefined) return;
        try {
            const { job } = await api.getJob(id);
            setFullDesc((d) => ({ ...d, [id]: job?.description || '' }));
        } catch {
            // Falhou? Fica o trecho que já veio na listagem — melhor que um erro
            // por causa de um detalhe opcional.
            setFullDesc((d) => ({ ...d, [id]: null }));
        }
    }

    // Leva para a tela de conectar o Google. Fecha o modal antes: deixar o
    // modal aberto por cima da navegacao esconde justamente a tela para onde a
    // pessoa esta indo.
    function irConectar() {
        onClose();
        navigate('/app/perfil?section=email');
    }

    function toggle(id) {
        setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    }

    return (
        <div className="modal-overlay" onClick={() => !starting && onClose()}>
            <div className="modal" style={{ maxWidth: phase === 'choose' ? 560 : 680 }} onClick={(e) => e.stopPropagation()}>

                {phase === 'searching' && (
                    <div style={{ padding: '48px 32px', textAlign: 'center' }}>
                        <div className="search-pulse"><i className="ti ti-radar-2" /></div>
                        <h3 style={{ fontSize: 18, fontWeight: 600, marginTop: 18 }}>{t('Buscando vagas disponíveis')}</h3>
                        <p className="muted" style={{ marginTop: 8 }}>{t('Analisando oportunidades no banco de dados…')}</p>
                        <p className="muted" style={{ marginTop: 4, fontSize: 12.5 }}>Comparamos seu perfil com as milhares de vagas que já estão na base.</p>
                    </div>
                )}

                {phase === 'choose' && (
                    <>
                        <div className="modal-head">
                            <i className="ti ti-send" style={{ color: 'var(--color-accent)', fontSize: 20 }} />
                            <h3>{t('Como deseja enviar os e-mails?')}</h3>
                            <button className="close" onClick={onClose} disabled={starting}><i className="ti ti-x" /></button>
                        </div>
                        <div style={{ padding: '18px 22px' }}>
                            {matches.length === 0 ? (
                                filtered > 0 ? (
                                    <div className="notice warn">
                                        <i className="ti ti-filter-x" />
                                        <span><b>{filtered}</b> vaga(s) encontrada(s), mas todas foram descartadas pelos seus filtros (ex.: keyword obrigatória). Ajuste em <Link to="/app/perfil?section=filters">Perfil → Filtros</Link>.</span>
                                    </div>
                                ) : (
                                    <div className="empty"><i className="ti ti-briefcase-off" />Nenhuma vaga disponível agora. Rode o scraper ou volte mais tarde.</div>
                                )
                            ) : (
                                <>
                                    <p style={{ marginBottom: 16 }}>
                                        {t('Achei')} <b style={{ color: 'var(--color-accent)' }}>{matches.length} {t('vagas')}</b> {t('para o seu perfil. Como você quer se candidatar?')}
                                    </p>

                                    {/* ------------------------------------------------------------
                                        Duas opcoes, e a diferenca entre elas e QUEM APERTA ENVIAR.
                                        ------------------------------------------------------------
                                        Antes a opcao automatica aparecia TRAVADA para quem nao tinha
                                        Google, com um cadeado e uma frase dizendo o que faltava. Isso
                                        e um beco: a pessoa le que nao pode e fecha. Medido: de 9 que
                                        salvaram perfil, 5 nunca conectaram o Gmail.

                                        Agora a opcao automatica CONVIDA a conectar (leva para a tela),
                                        e ao lado dela fica a alternativa explicita de nao conectar
                                        nada. Ninguem fica sem caminho. */}
                                    <div className="choice" style={starting ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
                                        onClick={() => { if (ready) start('auto'); else irConectar(); }}>
                                        <div className="choice-ico ok"><i className="ti ti-bolt" /></div>
                                        <div>
                                            <div className="choice-t">
                                                {starting ? t('Iniciando envio…') : (ready ? t('Enviar tudo automaticamente') : t('Conectar o Gmail e deixar automático'))}
                                            </div>
                                            <div className="choice-d">
                                                {ready
                                                    ? t('O sistema manda sozinho, uma vaga a cada 60 a 120 segundos. Você não faz nada.')
                                                    : t('Você autoriza só o envio. O sistema manda por você, com o seu nome no remetente.')}
                                            </div>
                                        </div>
                                        {starting
                                            ? <div className="spinner" style={{ marginLeft: 'auto', width: 18, height: 18, borderWidth: 2 }} />
                                            : <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)' }} />}
                                    </div>

                                    <div className={`choice ${temPerfil ? '' : 'locked'}`} style={starting ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
                                        onClick={() => {
                                            if (temPerfil) entrarProprio();
                                            else toast.show(t('Salve seu perfil primeiro para montarmos o email.'), 'error');
                                        }}>
                                        <div className="choice-ico"><i className={`ti ${temPerfil ? 'ti-mail-forward' : 'ti-lock'}`} /></div>
                                        <div>
                                            <div className="choice-t">
                                                {t('Não quero conectar nada')}
                                                <span className="badge ok" style={{ marginLeft: 6 }}>{t('sem permissão')}</span>
                                            </div>
                                            <div className="choice-d">{t('A gente te passa o email do recrutador com o texto pronto, e você manda do seu jeito.')}</div>
                                        </div>
                                        <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)' }} />
                                    </div>

                                    {/* Seleção ampla continua paga: é o que diferencia o plano. */}
                                    <div className={`choice ${(isFree || !ready) ? 'locked' : ''}`} style={starting ? { opacity: 0.6, pointerEvents: 'none' } : undefined}
                                        onClick={() => {
                                            if (isFree) toast.show(t('Escolher uma a uma é um recurso dos planos pagos.'), 'error');
                                            else if (!ready) irConectar();
                                            else setPhase('manual');
                                        }}>
                                        <div className="choice-ico"><i className={`ti ${(isFree || !ready) ? 'ti-lock' : 'ti-list-check'}`} /></div>
                                        <div>
                                            <div className="choice-t">{t('Escolher uma a uma')} {isFree && <span className="badge warn">Pro</span>}</div>
                                            <div className="choice-d">{t('Revisar as {n} vagas e marcar só as que você quiser.', { n: matches.length })}</div>
                                        </div>
                                        <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)' }} />
                                    </div>

                                    {!ready && (
                                        <p className="muted" style={{ fontSize: 12, marginTop: 12, textAlign: 'center' }}>
                                            {t('Permissão apenas de envio (gmail.send). Nunca lemos seus emails.')}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </>
                )}

                {phase === 'manual' && (
                    <>
                        <div className="modal-head">
                            <button className="btn ghost sm" onClick={() => setPhase('choose')}><i className="ti ti-arrow-left" /></button>
                            <h3>Selecionar vagas ({selected.size}/{matches.length})</h3>
                            <button className="close" onClick={onClose} disabled={starting}><i className="ti ti-x" /></button>
                        </div>
                        <div className="modal-body" style={{ padding: '8px 16px' }}>
                            <label className="row" style={{ alignItems: 'center', gap: 8, padding: '8px 4px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={selected.size === matches.length}
                                    onChange={(e) => setSelected(e.target.checked ? new Set(matches.map((m) => m.id)) : new Set())} />
                                {t('Selecionar todas')}
                            </label>
                            {matches.map((m) => (
                                <div key={m.id} className="sel-item">
                                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.title || 'Vaga'}</div>
                                        <div className="muted" style={{ fontSize: 12 }}>{m.company ? `${m.company} · ` : ''}{m.matchScore}% match</div>
                                        {expanded === m.id && <div className="muted" style={{ fontSize: 12, marginTop: 6, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{fullDesc[m.id] || m.description || 'Sem descrição.'}</div>}
                                        <button className="btn ghost sm" style={{ padding: '2px 0', marginTop: 4 }} onClick={() => expandir(m.id)}>
                                            <i className={`ti ti-chevron-${expanded === m.id ? 'up' : 'down'}`} /> {expanded === m.id ? t('ocultar') : t('ver detalhes')}
                                        </button>
                                    </div>
                                    <span className={`score ${scoreClass(m.matchScore)}`}>{m.matchScore}%</span>
                                </div>
                            ))}
                        </div>
                        <div className="modal-foot">
                            <button className="btn ghost" onClick={onClose}>{t('Cancelar')}</button>
                            <button className="btn primary" disabled={starting || selected.size === 0}
                                onClick={() => start('manual', [...selected])}>
                                {starting ? 'Enviando…' : (<><i className="ti ti-send" /> Adicionar {selected.size} à fila</>)}
                            </button>
                        </div>
                    </>
                )}

                {phase === 'proprio' && (
                    <>
                        <div className="modal-head">
                            <button className="btn ghost sm" onClick={() => setPhase('choose')}><i className="ti ti-arrow-left" /></button>
                            <h3>{t('Enviar você mesmo')} {doDia.length > 0 && <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>({quantosMandou}/{doDia.length})</span>}</h3>
                            <button className="close" onClick={onClose}><i className="ti ti-x" /></button>
                        </div>
                        <div className="modal-body" style={{ padding: '8px 16px' }}>
                            <div className="notice" style={{ marginBottom: 10 }}>
                                <i className="ti ti-info-circle" />
                                <span>{t('Abrimos o seu Gmail com destinatário, assunto e texto prontos. Anexe seu currículo e mande. Cada vaga aberta gasta 1 do seu limite de hoje e sai desta lista.')}</span>
                            </div>

                            {doDia.length === 0 && (
                                <div className="empty">
                                    <i className="ti ti-clock-pause" />
                                    {t('Você já usou os envios de hoje. Volte amanhã ou faça upgrade para mandar mais.')}
                                </div>
                            )}

                            {doDia.map((m) => {
                                const feito = composto[m.id];
                                return (
                                    <div key={m.id} className="sel-item">
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.title || 'Vaga'}</div>
                                            <div className="muted" style={{ fontSize: 12 }}>{m.company ? `${m.company} · ` : ''}{m.matchScore}% match</div>
                                            {feito && (
                                                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                                                    <span className="muted" style={{ fontSize: 12 }}>
                                                        <i className="ti ti-check" style={{ color: 'var(--color-success)' }} /> {t('para')} {feito.to}
                                                    </span>
                                                    <button className="btn ghost sm" style={{ padding: '2px 0' }} onClick={() => copiar(m.id)}>
                                                        <i className="ti ti-copy" /> {t('copiar texto')}
                                                    </button>
                                                    <a className="btn ghost sm" style={{ padding: '2px 0' }} href={mailtoUrl(feito)}>
                                                        <i className="ti ti-mail" /> {t('outro app de email')}
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                        {feito ? (
                                            <span className="badge ok">{t('aberto')}</span>
                                        ) : (
                                            <button className="btn sm" disabled={!!compondo} onClick={() => abrirNoGmail(m.id)}>
                                                {compondo === m.id
                                                    ? <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                                                    : <><i className="ti ti-brand-google" /> {t('Abrir no Gmail')}</>}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* O pedido de permissão vem DEPOIS do trabalho manual, não antes:
                            é quando a pessoa já viu que funciona e já sentiu o custo. */}
                        {quantosMandou >= 2 && !user.googleConnected && (
                            <div className="notice" style={{ margin: '0 16px 12px' }}>
                                <i className="ti ti-bolt" />
                                <span>
                                    {t('Já foram {n} na mão.', { n: quantosMandou })}{' '}
                                    <Link to="/app/perfil?section=email">{t('Conecte o Gmail')}</Link> {t('e o sistema passa a fazer isso sozinho.')}
                                </span>
                            </div>
                        )}

                        <div className="modal-foot">
                            <button className="btn ghost" onClick={onClose}>{t('Fechar')}</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
