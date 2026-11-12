import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useT } from '../lib/i18n.jsx';

// IA no currículo (backend/services/iaLogic.js): teste de 48 h e plano de R$ 5.
// Decisão do dono (11/11/2026): a COMPRA mora em Assinatura, num cartão igual
// aos outros planos (CartaoPlanoIa). Em Currículo IA fica só um aviso do estado,
// que a pessoa pode fechar (AvisoIA). Botão de compra na aba incomodava.
const quando = (ms) => new Date(ms).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const dia = (ms) => new Date(ms).toLocaleDateString();

const chaveAviso = (modo) => `avisoIa:${modo}`;
function fechado(modo) {
    try { return !!localStorage.getItem(chaveAviso(modo)); } catch { return false; }
}

/** O aviso do estado da IA, no topo de Currículo IA. Fechar cala aquele estado; o próximo aparece. */
export function AvisoIA({ ia }) {
    const { t } = useT();
    const [oculto, setOculto] = useState(() => fechado(ia?.modo));
    if (!ia || ia.modo === 'admin' || oculto) return null;

    let icone = 'ti-gift';
    let texto;
    if (ia.modo === 'novo') {
        texto = t('Teste grátis de 48 horas: a partir do primeiro uso, você tem 1 análise e 1 currículo adaptado a um tipo de vaga.');
    } else if (ia.modo === 'teste') {
        texto = t('Teste grátis até {quando}: restam {a} análise(s) e {v} currículo(s) adaptado(s).', { quando: quando(ia.ate), a: ia.analisesRestantes, v: ia.versoesRestantes });
    } else if (ia.modo === 'plano') {
        icone = 'ti-sparkles';
        texto = t('IA liberada até {quando}: restam {n} de 10 usos (análises e currículos adaptados somam).', { quando: dia(ia.ate), n: ia.restantes });
    } else {
        icone = 'ti-lock';
        texto = <>{t('Seu teste grátis de 48 horas acabou. Para continuar, veja o plano de IA em')} <Link to="/app/assinatura">{t('Assinatura')}</Link>.</>;
    }

    function fechar() {
        try { localStorage.setItem(chaveAviso(ia.modo), '1'); } catch { /* sem armazenamento: some só nesta visita */ }
        setOculto(true);
    }

    return (
        <div className={`why aviso-ia aviso-ia-${ia.modo}`} style={{ marginBottom: 14 }}>
            <i className={`ti ${icone}`} />
            <span style={{ flex: 1 }}>{texto}</span>
            <button type="button" className="aviso-ia-fechar" onClick={fechar} aria-label={t('Fechar aviso')}><i className="ti ti-x" /></button>
        </div>
    );
}

/** O plano de IA em Assinatura, no mesmo formato dos outros planos. */
export function CartaoPlanoIa({ ia, indice = 3, disponivel = true }) {
    const { t } = useT();
    const [indo, setIndo] = useState(false);
    const [erro, setErro] = useState('');
    const trava = useRef(false);
    // Voltar do checkout sem pagar (botão Voltar do navegador) restaura a página
    // do cache com o botão travado em "Redirecionando…". O pageshow destrava.
    useEffect(() => {
        const destravar = () => { setIndo(false); trava.current = false; };
        window.addEventListener('pageshow', destravar);
        return () => window.removeEventListener('pageshow', destravar);
    }, []);

    async function comprar() {
        if (trava.current) return;
        trava.current = true;
        setIndo(true);
        setErro('');
        try {
            const { url } = await api.checkoutIa();
            window.location.href = url;
        } catch (e) {
            setErro(e.message);
            setIndo(false);
            trava.current = false;
        }
    }

    const ativa = ia?.modo === 'plano';
    return (
        <div className={`card plan-card fade-in d${indice + 1}`} style={ativa ? { borderColor: 'var(--color-accent)' } : undefined}>
            <div className="row" style={{ alignItems: 'center' }}>
                <span className="plan-tag">{t('IA no currículo')}</span>
                {ativa && <span className="badge ok" style={{ marginLeft: 'auto' }}>{t('ativa')}</span>}
            </div>
            <div className="plan-desc">{t('A IA analisa seu currículo e faz uma versão para cada tipo de vaga, que vai nos seus envios depois que você aprova.')}</div>
            <div className="plan-price-row">
                <span className="plan-price-v">R$5</span>
                <span className="plan-price-p">{t('pagamento único · 30 dias')}</span>
            </div>
            <div className="plan-note"><i className="ti ti-gift" /> {t('teste grátis de 48 horas antes de pagar')}</div>
            <ul className="plan-feat-list">
                {[
                    t('10 usos entre análises e currículos adaptados'),
                    t('nota, pontos fortes e o que melhorar'),
                    t('um currículo para cada tipo de vaga do seu feed'),
                    t('você aprova antes de ir nos envios'),
                    t('incluída no plano Automático'),
                ].map((f) => <li key={f}><i className="ti ti-check" />{f}</li>)}
            </ul>
            {ia?.modo === 'admin' ? (
                <button className="btn block sm" disabled>{t('Sem limite (admin)')}</button>
            ) : ativa ? (
                <button className="btn block sm" disabled={indo || !disponivel} onClick={comprar}>
                    {indo ? t('Redirecionando…') : t('Liberada até {quando} · mais 30 dias', { quando: dia(ia.ate) })}
                </button>
            ) : (
                <button className="btn primary block sm" disabled={indo || !disponivel} onClick={comprar}>
                    {indo ? t('Redirecionando…') : (<><i className="ti ti-sparkles" /> {t('Liberar a IA')}</>)}
                </button>
            )}
            {erro && <div className="cv-erro" style={{ marginTop: 8 }}>{erro}</div>}
        </div>
    );
}
