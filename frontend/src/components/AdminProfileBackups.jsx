import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { fmtDate } from '../utils.js';

// =========================
// Perfis apagados (só admin)
// =========================
// A rede de proteção contra "apagaram minha conta e não fui eu". Um DELETE
// autenticado é idêntico vindo do dono ou de quem entrou na conta dele, então o
// apagar arquiva em vez de destruir — e é aqui que o arquivo aparece.
//
// Nenhuma destas rotas é acessível ao dono do perfil, nem para listar: se a conta
// foi tomada, quem está com ela não pode apagar o backup também.

export default function AdminProfileBackups() {
    const toast = useToast();
    const [backups, setBackups] = useState(null);
    const [aberto, setAberto] = useState(null);
    const [detalhe, setDetalhe] = useState(null);
    const [restaurando, setRestaurando] = useState(null);

    async function carregar() {
        try { setBackups((await api.adminProfileBackups()).backups); }
        catch (e) { toast.show(e.message, 'error'); setBackups([]); }
    }
    useEffect(() => { carregar(); }, []);  

    async function ver(id) {
        if (aberto === id) { setAberto(null); return; }
        setAberto(id); setDetalhe(null);
        try { setDetalhe((await api.adminProfileBackup(id)).backup); }
        catch (e) { toast.show(e.message, 'error'); }
    }

    async function restaurar(b) {
        if (!window.confirm(`Restaurar o perfil de ${b.email || b.userId}?`)) return;
        setRestaurando(b.id);
        try {
            await api.adminRestoreProfile(b.id);
            toast.show('Perfil restaurado');
            await carregar();
        } catch (e) { toast.show(e.message, 'error'); }
        finally { setRestaurando(null); }
    }

    if (!backups) return <div className="center" style={{ padding: 40 }}><div className="spinner" /></div>;

    return (
        <div className="card">
            <div className="section-title"><i className="ti ti-archive" /> Perfis apagados</div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 16 }}>
                Cópia guardada automaticamente quando alguém apaga o próprio perfil. Serve para desfazer
                exclusão feita por quem invadiu a conta. O usuário não vê nem consegue remover estas cópias.
            </p>

            {backups.length === 0 ? (
                <div className="empty" style={{ padding: 28 }}>
                    <i className="ti ti-archive-off" />Nenhum perfil foi apagado até agora.
                </div>
            ) : backups.map((b) => (
                <div key={b.id} className="destaque">
                    <div className="destaque-linha">
                        <div className="job-logo" style={{ width: 32, height: 32, fontSize: 15 }}><i className="ti ti-user-off" /></div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="destaque-titulo">{b.email || b.userId}</div>
                            <div className="muted" style={{ fontSize: 12 }}>
                                {fmtDate(b.createdAt)} · {b.skills} skills
                                {b.cvName ? ` · ${b.cvName}` : ''} · por {b.deletedBy}
                            </div>
                        </div>
                        {b.restoredAt
                            ? <span className="badge ok">restaurado</span>
                            : b.temPerfilAgora
                                ? <span className="badge warn">já refez o perfil</span>
                                : null}
                        <button className="btn ghost sm" onClick={() => ver(b.id)}>
                            <i className={`ti ti-chevron-${aberto === b.id ? 'up' : 'down'}`} /> ver
                        </button>
                        <button className="btn sm" disabled={restaurando === b.id || b.temPerfilAgora}
                            title={b.temPerfilAgora ? 'O usuário já tem um perfil ativo. Restaurar apagaria o atual.' : ''}
                            onClick={() => restaurar(b)}>
                            <i className="ti ti-restore" /> {restaurando === b.id ? 'Restaurando…' : 'Restaurar'}
                        </button>
                    </div>

                    {aberto === b.id && (
                        <div className="destaque-detalhe">
                            {/* IP e navegador de quem disparou: é o que permite julgar se
                                partiu do dono ou de outro lugar. */}
                            <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                                IP <b>{b.ip || ''}</b> · {b.userAgent || 'sem user agent'}
                            </div>
                            {detalhe
                                ? <pre className="bug-ctx" style={{ maxHeight: 320, overflow: 'auto' }}>
                                    {JSON.stringify(detalhe.snapshot, null, 2)}
                                </pre>
                                : <div className="muted" style={{ fontSize: 12.5 }}>carregando…</div>}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
