import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { haQuanto } from '../lib/tempo.js';

// =========================
// Admin › Vagas de parceiros (backend/services/vagasParceiros.js)
// =========================
// A recrutadora manda a vaga com um link de candidatura; aqui ela vira vaga em
// "Vagas por link", com o selo "Direto da recrutadora", para quem tem o perfil.
// "Abriram" é o número para contar a ela depois.
const VAZIO = { titulo: '', empresa: '', local: '', modalidade: '', descricao: '', link: '', contato: '' };

export default function AdminParceiros() {
    const toast = useToast();
    const [lista, setLista] = useState(null);
    const [f, setF] = useState(VAZIO);
    const [enviando, setEnviando] = useState(false);
    const trava = useRef(false);
    const muda = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

    async function carregar() {
        try { setLista((await api.adminParceiros()).vagas); } catch (e) { toast.show(e.message, 'error'); setLista([]); }
    }
    useEffect(() => { carregar(); }, []);

    async function publicar(e) {
        e.preventDefault();
        if (trava.current) return;
        trava.current = true; setEnviando(true);
        try {
            await api.adminParceiroCriar(f);
            toast.show('Publicada. Aparece em Vagas por link para quem tem o perfil.');
            setF(VAZIO);
            carregar();
        } catch (err) { toast.show(err.message, 'error'); }
        finally { trava.current = false; setEnviando(false); }
    }

    async function encerrar(id) {
        if (!window.confirm('Encerrar esta vaga? Ela sai da lista de todo mundo.')) return;
        try { await api.adminParceiroEncerrar(id); carregar(); } catch (e) { toast.show(e.message, 'error'); }
    }

    const campo = { display: 'grid', gap: 4, fontSize: 12.5, fontWeight: 600 };
    return (<>
        <form className="card" style={{ padding: 18, marginBottom: 16, display: 'grid', gap: 12 }} onSubmit={publicar}>
            <div>
                <h3 style={{ fontSize: 15, margin: 0 }}>Publicar vaga de parceiro</h3>
                <div className="muted" style={{ fontSize: 12.5 }}>Vaga que a recrutadora mandou, com candidatura por link. Aparece em Vagas por link, na frente das outras da semana, por 30 dias.</div>
            </div>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                <label style={campo}>Cargo<input className="input" value={f.titulo} onChange={muda('titulo')} placeholder="Desenvolvedor Backend Pleno (Python)" required /></label>
                <label style={campo}>Empresa<input className="input" value={f.empresa} onChange={muda('empresa')} placeholder="Nexmuv" required /></label>
                <label style={campo}>Local<input className="input" value={f.local} onChange={muda('local')} placeholder="São Paulo/SP" /></label>
                <label style={campo}>Modalidade
                    <select className="select" value={f.modalidade} onChange={muda('modalidade')}>
                        <option value="">Não informada</option>
                        <option value="remoto">Remoto</option>
                        <option value="hibrido">Híbrido</option>
                        <option value="presencial">Presencial</option>
                    </select>
                </label>
            </div>
            <label style={campo}>Link de candidatura<input className="input" type="url" value={f.link} onChange={muda('link')} placeholder="https://..." required /></label>
            <label style={campo}>Descrição (requisitos, stack, contrato)<textarea className="input" rows={6} value={f.descricao} onChange={muda('descricao')} style={{ resize: 'vertical' }} /></label>
            <label style={campo}>Quem mandou (só para você)<input className="input" value={f.contato} onChange={muda('contato')} placeholder="Myllena, WhatsApp" /></label>
            <div><button className="btn primary" disabled={enviando}>{enviando ? 'Publicando...' : 'Publicar vaga'}</button></div>
        </form>

        {!lista ? (
            <div className="card" style={{ padding: 18 }}><div className="skeleton sk-line" /></div>
        ) : lista.length === 0 ? (
            <div className="card empty" style={{ padding: 24 }}><i className="ti ti-heart-handshake" /><div>Nenhuma vaga de parceiro ainda.</div></div>
        ) : (
            <div className="card lista-card">
                {lista.map((v) => (
                    <div key={v.id} className="row" style={{ padding: '12px 16px', gap: 12, alignItems: 'center', borderBottom: '1px solid var(--color-border-light)', opacity: v.ativa ? 1 : 0.5 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600 }}>{v.titulo}</div>
                            <div className="muted" style={{ fontSize: 12.5 }}>
                                {v.empresa} · {haQuanto(v.criadaEm)}{v.contato ? ` · ${v.contato}` : ''} · <a href={v.link} target="_blank" rel="noopener noreferrer">link</a>
                            </div>
                        </div>
                        <span className="badge ok" title="Pessoas que clicaram em Abrir vaga">{v.aberturas} abriram</span>
                        {v.ativa ? <button className="btn sm ghost" onClick={() => encerrar(v.id)}>Encerrar</button> : <span className="badge">encerrada</span>}
                    </div>
                ))}
            </div>
        )}
    </>);
}
