import { useEffect, useState } from 'react';
import { api } from '../api.js';

// =========================
// Post de divulgação do dia (só admin)
// =========================
// Texto pronto para colar no LinkedIn, montado a partir das vagas remotas do dia.
// Fica AQUI, e não no dashboard, porque é material assinado pela plataforma:
// quem publica em nome dela é quem responde por ela.
//
// A trava real é no servidor — `?post=1` só devolve o texto para admin. Esconder
// apenas no frontend deixaria o post na resposta da API para qualquer usuário ler
// no DevTools.

export default function AdminPromoPost() {
    const [dados, setDados] = useState(null);
    const [erro, setErro] = useState(null);
    const [copiado, setCopiado] = useState(false);

    useEffect(() => {
        let vivo = true;
        api.getHighlights({ post: true })
            .then((d) => { if (vivo) setDados(d); })
            .catch((e) => { if (vivo) setErro(e.message); });
        return () => { vivo = false; };
    }, []);

    async function copiar() {
        try {
            await navigator.clipboard.writeText(dados.post);
        } catch {
            // clipboard bloqueado (permissão negada, navegador antigo): seleciona o
            // texto para copiar à mão em vez de simplesmente não fazer nada.
            const el = document.getElementById('post-divulgacao');
            if (el) { el.focus(); el.select(); document.execCommand?.('copy'); }
        }
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
    }

    if (erro) return <div className="card"><div className="empty" style={{ padding: 20 }}><i className="ti ti-alert-triangle" />{erro}</div></div>;
    if (!dados) return null;

    const vagas = dados.vagas || [];

    return (
        <div className="card fade-in" style={{ marginBottom: 20 }}>
            <div className="row" style={{ alignItems: 'center', marginBottom: 4 }}>
                <div className="section-title" style={{ margin: 0 }}>
                    <i className="ti ti-brand-linkedin" /> Post de divulgação do dia
                </div>
                <div className="spacer" />
                <button className="btn sm primary" onClick={copiar} disabled={!dados.post}>
                    <i className={`ti ti-${copiado ? 'check' : 'copy'}`} /> {copiado ? 'copiado!' : 'copiar'}
                </button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 14 }}>
                {vagas.length} vagas escolhidas entre as {(dados.totalRemotas || 0).toLocaleString('pt-BR')} remotas do Brasil na base.
                A lista muda todo dia — não a cada recarga, então dá para conferir depois de copiar.
                O texto nunca leva o email de contato das vagas.
            </p>

            {dados.post ? (
                <textarea
                    id="post-divulgacao"
                    readOnly
                    value={dados.post}
                    rows={18}
                    style={{ width: '100%', fontSize: 12.5, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' }}
                />
            ) : (
                <div className="empty" style={{ padding: 20 }}>
                    <i className="ti ti-file-off" />Nenhuma vaga remota disponível para montar o post hoje.
                </div>
            )}
        </div>
    );
}
