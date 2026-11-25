import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { haQuanto } from '../lib/tempo.js';

// =========================
// Admin › Falar com pagantes (backend/services/contatoPagantes.js)
// =========================
// Responde "com quem eu falo primeiro, e o quê?": quem pagou e não usa em cima,
// depois quem está sem vaga, depois quem usa bem. A mensagem vem pronta e editável;
// WhatsApp e Gmail abrem com o texto da caixa. "Já falei" fica no servidor, então
// vale no celular e no computador.
const dia = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '');
const ASSUNTO = 'Queria ouvir você sobre o New Dev Jobs';
const ASSINATURA = '\n\nGuilherme, do New Dev Jobs';

function Pessoa({ p, onFalei }) {
    const toast = useToast();
    const [texto, setTexto] = useState(p.mensagem);
    const [dica, setDica] = useState(null);
    const [medindo, setMedindo] = useState(false);
    const trava = useRef(false);

    async function medir() {
        if (trava.current) return;
        trava.current = true; setMedindo(true);
        try {
            const r = await api.adminPaganteDica(p.id);
            setDica(r);
            if (r.mensagem) setTexto(r.mensagem);
            else toast.show('Nenhum ajuste no perfil rende 5 vagas ou mais.');
        } catch (e) { toast.show(e.message, 'error'); }
        finally { trava.current = false; setMedindo(false); }
    }

    const whats = p.whats ? `https://wa.me/${p.whats}?text=${encodeURIComponent(texto)}` : null;
    const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(p.email)}&su=${encodeURIComponent(ASSUNTO)}&body=${encodeURIComponent(texto + ASSINATURA)}`;

    return (
        <div className="card" style={{ padding: '14px 16px', marginBottom: 10, opacity: p.falei ? 0.55 : 1 }}>
            <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong>{p.nome || p.email}</strong>
                <span className="muted" style={{ fontSize: 12.5 }}>{p.email}{p.telefone ? ` · ${p.telefone}` : ''}</span>
                {!p.pago && <span className="badge">cortesia</span>}
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                {p.nota} {p.plano} até {dia(p.vence)}.{p.ultimoEnvio ? ` Último envio ${haQuanto(p.ultimoEnvio)}.` : ''}
            </div>
            {dica && (
                <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                    {dica.vagas} vaga(s) no feed agora.{dica.sugestoes.length ? ' Ajustes: ' + dica.sugestoes.map((s) => `${s.texto} (+${s.ganho})`).join(', ') + '.' : ''}
                </div>
            )}
            <textarea className="input" value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
                style={{ width: '100%', margin: '10px 0', fontSize: 13, lineHeight: 1.5, resize: 'vertical' }} />
            <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {whats && <a className="btn sm primary" href={whats} target="_blank" rel="noopener noreferrer"><i className="ti ti-brand-whatsapp" /> WhatsApp</a>}
                <a className="btn sm" href={gmail} target="_blank" rel="noopener noreferrer"><i className="ti ti-mail" /> Email pelo Gmail</a>
                <button className="btn sm ghost" onClick={() => navigator.clipboard?.writeText(texto).then(() => toast.show('Texto copiado.')).catch(() => {})}><i className="ti ti-copy" /> Copiar</button>
                {p.grupo === 'semVaga' && <button className="btn sm ghost" disabled={medindo} onClick={medir}><i className="ti ti-adjustments" /> {medindo ? 'Medindo o perfil...' : 'Medir o perfil e pôr a dica'}</button>}
                <label className="row" style={{ marginLeft: 'auto', gap: 6, fontSize: 13, cursor: 'pointer', fontWeight: 400 }}>
                    <input type="checkbox" checked={!!p.falei} onChange={(e) => onFalei(p.id, e.target.checked)} />
                    {p.falei ? `Já falei (${dia(p.falei.em)})` : 'Já falei'}
                </label>
            </div>
        </div>
    );
}

export default function AdminPagantes() {
    const toast = useToast();
    const [d, setD] = useState(null);

    async function carregar() {
        try { setD(await api.adminPagantes()); } catch (e) { toast.show(e.message, 'error'); setD({ erro: true }); }
    }
    useEffect(() => { carregar(); }, []);

    async function falei(id, valor) {
        try {
            const r = await api.adminPaganteFalei(id, valor);
            setD((x) => ({ ...x, pessoas: x.pessoas.map((p) => (p.id === id ? { ...p, falei: r.falei } : p)) }));
        } catch (e) { toast.show(e.message, 'error'); }
    }

    if (!d) return <div className="card" style={{ padding: 18 }}><div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '70%' }} /></div>;
    if (d.erro) return <div className="card empty" style={{ padding: 24 }}><i className="ti ti-alert-triangle" /><div>Não deu para carregar.</div></div>;

    const total = d.pessoas.length;
    const faltam = d.pessoas.filter((p) => !p.falei).length;
    const comWhats = d.pessoas.filter((p) => p.whats).length;

    return (<>
        <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            {total} pagantes com plano ativo · {comWhats} com WhatsApp no perfil · falta falar com {faltam}.
            {' '}A mensagem é só uma sugestão: os botões levam o texto que estiver na caixa.
        </div>
        {d.grupos.map((g) => {
            // Quem ainda não recebeu mensagem primeiro; dentro disso, a ordem do servidor.
            const lista = d.pessoas.filter((p) => p.grupo === g.id).sort((a, b) => Number(!!a.falei) - Number(!!b.falei));
            if (!lista.length) return null;
            return (
                <div key={g.id} style={{ marginBottom: 22 }}>
                    <h3 style={{ fontSize: 15, margin: '0 0 2px' }}>{g.titulo} ({lista.length})</h3>
                    <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>{g.desc}</div>
                    {lista.map((p) => <Pessoa key={p.id} p={p} onFalei={falei} />)}
                </div>
            );
        })}
    </>);
}
