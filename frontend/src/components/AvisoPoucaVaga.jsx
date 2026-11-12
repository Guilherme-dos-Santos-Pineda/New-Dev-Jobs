import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../lib/i18n.jsx';
import { useToast } from './Toast.jsx';

// "Seu perfil tem pouca vaga" (backend/services/ampliarPerfil.js): para quem não
// tem vaga para uma semana, as mudanças no perfil que mais trazem vaga, cada uma
// com o número medido no feed real e um botão que já aplica. "Agora não" cala 7
// dias, só neste aparelho. Pedido do dono, 12/11/2026.
const CHAVE = 'avisoPoucaVagaAte';
const calado = () => { try { return Number(localStorage.getItem(CHAVE) || 0) > Date.now(); } catch { return false; } };

export default function AvisoPoucaVaga({ onMudou }) {
    const { t } = useT();
    const toast = useToast();
    const [d, setD] = useState(null);
    const [oculto, setOculto] = useState(calado);
    const [ocupado, setOcupado] = useState('');
    const trava = useRef(false);

    useEffect(() => { if (!oculto) api.ampliarPerfil().then(setD).catch(() => {}); }, [oculto]);
    if (oculto || !d?.pouca || !d.sugestoes?.length) return null;

    async function aplicar(s) {
        if (trava.current) return;
        trava.current = true;
        setOcupado(s.id);
        try {
            const r = await api.aplicarAmpliacao(s.id);
            if (r.aplicada) {
                toast.show(t('Perfil atualizado: agora são {n} vagas.', { n: r.total }), 'success');
                setD(await api.ampliarPerfil().catch(() => null));
                onMudou?.();
            }
        } catch (e) { toast.show(e.message, 'error'); } finally { setOcupado(''); trava.current = false; }
    }
    function agoraNao() {
        try { localStorage.setItem(CHAVE, String(Date.now() + 7 * 86400000)); } catch { /* sem armazenamento: some só nesta visita */ }
        setOculto(true);
    }

    return (
        <div className="card aviso-pouca-vaga" style={{ marginBottom: 14 }}>
            <div className="vh-retorno-titulo"><i className="ti ti-trending-up" /> {t('Seu perfil tem só {n} vagas para enviar', { n: d.total })}</div>
            <div className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>{t('Abrindo um pouco o perfil, chegam mais vagas. O número é do seu feed de hoje:')}</div>
            <div className="apv-lista">
                {d.sugestoes.map((s) => (
                    <div key={s.id} className="apv-item">
                        <span>{t(s.texto)} <b className="apv-ganho">+{s.ganho} {t('vagas')}</b></span>
                        <button className="btn sm primary" disabled={!!ocupado} onClick={() => aplicar(s)}>{ocupado === s.id ? '…' : t('Marcar')}</button>
                    </div>
                ))}
            </div>
            <button className="btn sm ghost" style={{ marginTop: 8 }} onClick={agoraNao}>{t('Agora não')}</button>
        </div>
    );
}
