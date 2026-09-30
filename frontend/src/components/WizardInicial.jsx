import { useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from './Toast.jsx';
import { useT } from '../lib/i18n.jsx';
import { AREA_OPTIONS, LEVEL_OPTIONS, normalizeKeyword } from '../utils.js';

// =========================
// Wizard de primeiro acesso
// =========================
// Medido no banco: de 17 contas, 8 NUNCA salvaram um perfil. O maior degrau do
// funil inteiro é o primeiro, e o checklist que existia só listava tarefas
// ("Complete seu perfil") sem nunca perguntar nada. Quem não sabia o que
// preencher fechava a aba.
//
// Aqui o sistema PERGUNTA, uma coisa por tela, e a pessoa só responde.
//
// ---------------------------------------------------------------------------
// Quatro decisões de desenho, todas com motivo medido
// ---------------------------------------------------------------------------
// 1. ÁREA E NÍVEL SÃO PERGUNTAS SEPARADAS. Parece detalhe e não é: "tech lead"
//    e "gerência" são NÍVEL, não área. Se virassem opção de área, quem
//    escolhesse receberia zero vaga, porque vaga nenhuma é classificada assim.
// 2. O CURRÍCULO É OPCIONAL AQUI, mas oferecido com o caminho do LinkedIn
//    pronto. Ele serve a dois fins de uma vez: vira o anexo das candidaturas e
//    as skills saem dele sem a pessoa digitar nada.
// 3. PALAVRA EXIGIDA É "OU", NÃO "E", e a tela diz isso. Um usuário real pôs
//    dez palavras achando que estreitava a busca; na verdade alargava. Sem
//    explicar, o filtro faz o contrário do que a pessoa acha.
// 4. TODA TELA DIZ QUE DÁ PARA MUDAR DEPOIS. O medo de errar a configuração
//    inicial trava mais gente do que a configuração em si.

const PASSOS = ['area', 'nivel', 'curriculo', 'exigidas', 'bloqueadas'];

export default function WizardInicial({ onPronto, onPular }) {
    const { refreshUser } = useAuth();
    const toast = useToast();
    const { t } = useT();

    const [passo, setPasso] = useState(0);
    const [areas, setAreas] = useState([]);
    const [niveis, setNiveis] = useState([]);
    const [skills, setSkills] = useState([]);
    const [temCv, setTemCv] = useState(false);
    const [lendoCv, setLendoCv] = useState(false);
    const [exigidas, setExigidas] = useState([]);
    const [bloqueadas, setBloqueadas] = useState([]);
    const [rascunho, setRascunho] = useState('');
    const [salvando, setSalvando] = useState(false);
    const salvandoRef = useRef(false); // trava síncrona contra duplo-clique
    const inputArquivo = useRef(null);

    const atual = PASSOS[passo];
    const ultimo = passo === PASSOS.length - 1;

    function alterna(lista, set, valor) {
        set(lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]);
    }

    // O currículo faz duas coisas numa tacada: vira o anexo das candidaturas e
    // alimenta as skills. Por isso as duas chamadas, e por isso a extração não
    // pode derrubar o upload: se o PDF não for do LinkedIn, o arquivo continua
    // salvo e a pessoa segue em frente.
    async function subirCv(arquivo) {
        if (!arquivo) return;
        setLendoCv(true);
        try {
            await api.uploadCv(arquivo);
            setTemCv(true);
            try {
                const { extracted } = await api.importLinkedin(arquivo);
                const achadas = (extracted?.skills || []).slice(0, 15);
                if (achadas.length) {
                    setSkills(achadas);
                    toast.show(t('Li seu currículo e achei {n} habilidades.', { n: achadas.length }));
                } else {
                    toast.show(t('Currículo salvo. Não consegui ler habilidades dele, você pode digitar depois.'));
                }
            } catch {
                toast.show(t('Currículo salvo. Não consegui ler habilidades dele, você pode digitar depois.'));
            }
        } catch (e) {
            toast.show(e.message, 'error');
        } finally {
            setLendoCv(false);
        }
    }

    function addPalavra(lista, set) {
        const limpa = normalizeKeyword(rascunho);
        if (!limpa) return;
        if (!lista.includes(limpa)) set([...lista, limpa]);
        setRascunho('');
    }

    async function finalizar() {
        if (salvandoRef.current) return;
        salvandoRef.current = true;
        setSalvando(true);
        try {
            await api.updateProfile({
                areas, levels: niveis, skills,
                requiredKeywords: exigidas, blockedWords: bloqueadas,
                modalities: [],
            });
            await refreshUser();
            toast.show(t('Pronto! Seu perfil está configurado.'));
            onPronto?.();
        } catch (e) {
            toast.show(e.message, 'error');
            salvandoRef.current = false;
            setSalvando(false);
        }
    }

    function proximo() {
        if (ultimo) finalizar();
        else { setRascunho(''); setPasso((n) => n + 1); }
    }

    // Só a área é obrigatória: é ela que decide o feed. O resto melhora o
    // resultado, e travar a pessoa em cada tela é exatamente o que fazia ela
    // desistir antes de salvar qualquer coisa.
    const podeAvancar = atual === 'area' ? areas.length > 0 : true;

    return (
        <div className="modal-overlay" onClick={(e) => e.stopPropagation()}>
            <div className="modal wizard" onClick={(e) => e.stopPropagation()}>

                <div className="wizard-topo">
                    <div className="wizard-barra" aria-hidden="true">
                        <span style={{ width: `${((passo + 1) / PASSOS.length) * 100}%` }} />
                    </div>
                    <span className="wizard-conta">{passo + 1} {t('de')} {PASSOS.length}</span>
                </div>

                <div className="wizard-corpo">
                    {atual === 'area' && (
                        <>
                            <h2>{t('Você está procurando vaga de quê?')}</h2>
                            <p className="wizard-sub">{t('Escolha uma ou mais. É isso que decide quais vagas chegam até você.')}</p>
                            <div className="wizard-grade">
                                {AREA_OPTIONS.map((o) => (
                                    <button key={o.value} type="button"
                                        className={`wizard-cartao ${areas.includes(o.value) ? 'on' : ''}`}
                                        onClick={() => alterna(areas, setAreas, o.value)}>
                                        <i className={`ti ${o.icone}`} aria-hidden="true" />
                                        <span className="wc-t">{o.label}</span>
                                        <span className="wc-d">{o.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {atual === 'nivel' && (
                        <>
                            <h2>{t('Qual o seu nível?')}</h2>
                            <p className="wizard-sub">{t('Pode marcar mais de um. Se ficar em dúvida, marque o seu e o de cima.')}</p>
                            <div className="wizard-linhas">
                                {LEVEL_OPTIONS.map((o) => (
                                    <button key={o.value} type="button"
                                        className={`wizard-linha ${niveis.includes(o.value) ? 'on' : ''}`}
                                        onClick={() => alterna(niveis, setNiveis, o.value)}>
                                        <span>{o.label}</span>
                                        <i className={`ti ${niveis.includes(o.value) ? 'ti-circle-check' : 'ti-circle'}`} aria-hidden="true" />
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    {atual === 'curriculo' && (
                        <>
                            <h2>{t('Envie seu currículo')}</h2>
                            <p className="wizard-sub">{t('É o PDF que vai anexado em cada candidatura. E a gente lê ele para preencher suas habilidades sozinho.')}</p>

                            <div className="wizard-dica">
                                <i className="ti ti-brand-linkedin" aria-hidden="true" />
                                <div>
                                    <b>{t('Não tem um PDF pronto? Pegue o do LinkedIn:')}</b>
                                    <ol>
                                        <li>{t('Abra seu perfil no LinkedIn')}</li>
                                        <li>{t('Clique em "Mais" logo abaixo da sua foto')}</li>
                                        <li>{t('Escolha "Salvar como PDF"')}</li>
                                    </ol>
                                </div>
                            </div>

                            <input ref={inputArquivo} type="file" accept="application/pdf" style={{ display: 'none' }}
                                onChange={(e) => subirCv(e.target.files?.[0])} />
                            <button type="button" className="btn primary wizard-largo"
                                disabled={lendoCv} onClick={() => inputArquivo.current?.click()}>
                                {lendoCv
                                    ? <><div className="spinner" style={{ width: 15, height: 15, borderWidth: 2 }} /> {t('Lendo seu currículo…')}</>
                                    : <><i className="ti ti-upload" /> {temCv ? t('Trocar o PDF') : t('Escolher PDF')}</>}
                            </button>

                            {temCv && (
                                <div className="notice ok wizard-ok">
                                    <i className="ti ti-circle-check" />
                                    <span>
                                        {t('Currículo salvo.')}{' '}
                                        {skills.length > 0 && t('Habilidades encontradas: {lista}', { lista: skills.slice(0, 8).join(', ') })}
                                    </span>
                                </div>
                            )}
                        </>
                    )}

                    {atual === 'exigidas' && (
                        <>
                            <h2>{t('Alguma palavra que a vaga PRECISA ter?')}</h2>
                            {/* Um usuário real pôs dez palavras achando que estreitava. Sem
                                esta frase, o filtro faz o contrário do que a pessoa espera. */}
                            <p className="wizard-sub">{t('Basta UMA delas aparecer na vaga. Quanto mais palavras você põe, MAIS vagas aparecem, não menos.')}</p>
                            <ListaPalavras
                                itens={exigidas} onRemover={(k) => setExigidas(exigidas.filter((x) => x !== k))}
                                rascunho={rascunho} setRascunho={setRascunho}
                                onAdd={() => addPalavra(exigidas, setExigidas)}
                                exemplo={t('ex.: React, .NET, Python')} t={t}
                            />
                            <p className="wizard-nota">{t('Pode deixar vazio. Aí você recebe tudo da sua área.')}</p>
                        </>
                    )}

                    {atual === 'bloqueadas' && (
                        <>
                            <h2>{t('E alguma que você NÃO quer ver?')}</h2>
                            <p className="wizard-sub">{t('Se a palavra aparecer na vaga, ela some do seu feed. Aqui basta uma para descartar.')}</p>
                            <ListaPalavras
                                itens={bloqueadas} onRemover={(k) => setBloqueadas(bloqueadas.filter((x) => x !== k))}
                                rascunho={rascunho} setRascunho={setRascunho}
                                onAdd={() => addPalavra(bloqueadas, setBloqueadas)}
                                exemplo={t('ex.: React Native, estágio, PJ')} t={t}
                            />
                            <p className="wizard-nota">{t('Cuidado para não bloquear demais: palavra comum tira vaga boa junto.')}</p>
                        </>
                    )}
                </div>

                <div className="wizard-pe">
                    <button className="btn ghost sm" onClick={() => (passo === 0 ? onPular?.() : setPasso((n) => n - 1))} disabled={salvando}>
                        {passo === 0 ? t('Agora não') : t('Voltar')}
                    </button>
                    {/* Aparece em toda tela: o medo de errar a configuração trava mais
                        gente do que a configuração em si. */}
                    <span className="wizard-calma">{t('dá para mudar depois')}</span>
                    <button className="btn primary" onClick={proximo} disabled={!podeAvancar || salvando || lendoCv}>
                        {salvando
                            ? t('Salvando…')
                            : ultimo ? <>{t('Ver minhas vagas')} <i className="ti ti-arrow-right" /></> : <>{t('Continuar')} <i className="ti ti-arrow-right" /></>}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ListaPalavras({ itens, onRemover, rascunho, setRascunho, onAdd, exemplo, t }) {
    return (
        <div className="wizard-palavras">
            <div className="row" style={{ gap: 8 }}>
                <input className="input" value={rascunho} placeholder={exemplo}
                    onChange={(e) => setRascunho(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }} />
                <button type="button" className="btn" onClick={onAdd} disabled={!rascunho.trim()}>
                    <i className="ti ti-plus" /> {t('Adicionar')}
                </button>
            </div>
            {itens.length > 0 && (
                <div className="wizard-tags">
                    {itens.map((k) => (
                        <span key={k} className="tag">
                            {k}
                            <button type="button" onClick={() => onRemover(k)} aria-label={t('Remover')}>
                                <i className="ti ti-x" />
                            </button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
