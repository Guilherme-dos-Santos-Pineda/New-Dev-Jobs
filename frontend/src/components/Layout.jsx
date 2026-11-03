import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { PLANOS_PAGOS_ATIVOS } from '../lib/flags.js';
import { prefetch } from '../lib/useCachedResource.js';
import { useT } from '../lib/i18n.jsx';
import { useInstalarApp } from '../lib/instalarApp.js';
import { useToast } from './Toast.jsx';
import Logo from './Logo.jsx';
import BugReportModal from './BugReportModal.jsx';

// Hover em um item do menu já aquece o chunk lazy da rota + os dados da tela.
// Quando o usuário clica, a página normalmente já tem tudo em cache.
const prefetchByPath = {
    '/app': () => {
        import('../pages/Dashboard.jsx');
        prefetch('profile', () => api.getProfile());
    },
    '/app/candidaturas': () => {
        import('../pages/Applications.jsx');
        prefetch('applications:1', () => api.getApplications({ page: 1, pageSize: 24 }));
    },
    '/app/perfil': () => {
        import('../pages/Profile.jsx');
        prefetch('profile', () => api.getProfile());
    },
};

function warm(path) {
    try { prefetchByPath[path]?.(); } catch { /* prefetch é best-effort */ }
}

function toggleTheme() {
    const el = document.documentElement;
    const dark = el.classList.toggle('dark');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
}

// =========================
// Navegação: TRÊS itens, e o resto num menu no nome
// =========================
// Feedback de usuários (02/11/2026): "confuso e cheio de informação". O menu
// tinha Dashboard, Candidaturas, Feedback (um mural de depoimentos, que numa
// ferramenta de vaga ninguém sabe para que serve), Perfil e Assinatura, e o
// rodapé tinha quatro botões só de ícone (bug, idioma, tema, sair). Clicar no
// nome não fazia nada, e foi o primeiro lugar onde o dono clicou procurando
// essas opções.
//
// Agora o menu diz as três coisas que a pessoa faz aqui: ver vagas, ver o que
// mandou, ajustar o perfil. Todo o resto mora no menu do nome.
const baseTabs = [
    { to: '/app', label: 'Vagas', icon: 'ti-briefcase', end: true },
    { to: '/app/candidaturas', label: 'Enviadas', icon: 'ti-send' },
    { to: '/app/perfil', label: 'Meu perfil', icon: 'ti-user' },
];

function MenuUsuario({ user, onBug, onSair, compacto }) {
    const { t, lang, setLang } = useT();
    const navigate = useNavigate();
    const [aberto, setAberto] = useState(false);
    const ref = useRef(null);
    const app = useInstalarApp();
    const toast = useToast();
    const initials = (user?.name || user?.email || '?')
        .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('');

    // Fecha ao clicar fora ou apertar Esc.
    useEffect(() => {
        if (!aberto) return;
        const fora = (e) => { if (ref.current && !ref.current.contains(e.target)) setAberto(false); };
        const esc = (e) => { if (e.key === 'Escape') setAberto(false); };
        document.addEventListener('mousedown', fora);
        document.addEventListener('keydown', esc);
        return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); };
    }, [aberto]);

    const ir = (to) => { setAberto(false); navigate(to); };
    const escuro = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

    return (
        <div className={`menu-usuario ${compacto ? 'compacto' : ''}`} ref={ref}>
            <button className="user-chip" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} aria-haspopup="menu">
                <span className="avatar">{initials}</span>
                {!compacto && <span className="user-chip-nome">{user?.name || user?.email}</span>}
                {!compacto && <i className={`ti ${aberto ? 'ti-chevron-down' : 'ti-chevron-up'}`} />}
            </button>
            {aberto && (
                <div className="menu-usuario-pop" role="menu">
                    <div className="mu-quem">
                        <b>{user?.name || t('Você')}</b>
                        <span>{user?.email}</span>
                    </div>
                    <button role="menuitem" onClick={() => ir('/app/perfil')}><i className="ti ti-user" /> {t('Meu perfil')}</button>
                    <button role="menuitem" onClick={() => ir('/app/feedback')}><i className="ti ti-message-2" /> {t('Depoimentos')}</button>
                    {PLANOS_PAGOS_ATIVOS && <button role="menuitem" onClick={() => ir('/app/assinatura')}><i className="ti ti-crown" /> {t('Assinatura')}</button>}
                    {user?.isAdmin && <button role="menuitem" onClick={() => ir('/app/admin')}><i className="ti ti-shield-cog" /> Admin</button>}
                    <div className="mu-sep" />
                    <button role="menuitem" onClick={() => { setAberto(false); onBug(); }}><i className="ti ti-bug" /> {t('Relatar um problema')}</button>
                    <button role="menuitem" onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')}>
                        <i className="ti ti-language" /> {lang === 'pt' ? 'English' : 'Português'}
                    </button>
                    <button role="menuitem" onClick={() => { toggleTheme(); setAberto(false); }}>
                        <i className={`ti ${escuro ? 'ti-sun' : 'ti-moon'}`} /> {escuro ? t('Tema claro') : t('Tema escuro')}
                    </button>
                    {app.mostrar && (
                        <button role="menuitem" onClick={() => {
                            setAberto(false);
                            if (app.ios) toast.show(t('No iPhone: toque em Compartilhar e depois em "Adicionar à Tela de Início".'));
                            else app.instalar();
                        }}>
                            <i className="ti ti-device-mobile" /> {t('Instalar app')}
                        </button>
                    )}
                    <div className="mu-sep" />
                    <button role="menuitem" className="mu-sair" onClick={onSair}><i className="ti ti-logout" /> {t('Sair')}</button>
                </div>
            )}
        </div>
    );
}

export default function Layout() {
    const { user, logout } = useAuth();
    const { t: tr } = useT();
    const navigate = useNavigate();
    const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar') === 'collapsed');

    const toggleCollapsed = () => setCollapsed((c) => {
        const next = !c;
        localStorage.setItem('sidebar', next ? 'collapsed' : 'expanded');
        return next;
    });

    const tabs = baseTabs;
    const doLogout = () => { logout(); navigate('/login'); };
    const [bugAberto, setBugAberto] = useState(false);

    return (
        <div className={`app-shell ${collapsed ? 'collapsed' : ''}`}>
            {/* Sidebar (desktop) */}
            <aside className="sidebar">
                <div className="sidebar-head">
                    <NavLink to="/app" end className="brand sidebar-brand"><Logo /></NavLink>
                    <button className="sidebar-collapse" onClick={toggleCollapsed} title={collapsed ? 'Expandir' : 'Recolher'} aria-label="Recolher menu">
                        <i className={`ti ${collapsed ? 'ti-chevron-right' : 'ti-chevron-left'}`} />
                    </button>
                </div>
                <nav className="sidebar-nav">
                    {tabs.map((t) => (
                        <NavLink key={t.to} to={t.to} end={t.end} title={tr(t.label)}
                            onMouseEnter={() => warm(t.to)} onFocus={() => warm(t.to)}
                            className={({ isActive }) => (isActive ? 'active' : '')}>
                            <i className={`ti ${t.icon}`} />
                            <span>{tr(t.label)}</span>
                        </NavLink>
                    ))}
                </nav>
                <div className="sidebar-foot">
                    <MenuUsuario user={user} onBug={() => setBugAberto(true)} onSair={doLogout} compacto={collapsed} />
                </div>
            </aside>

            {/* Top bar (mobile): só a marca e o menu do nome. */}
            <header className="mobile-bar">
                <NavLink to="/app" end className="brand"><Logo /></NavLink>
                <div className="spacer" />
                <MenuUsuario user={user} onBug={() => setBugAberto(true)} onSair={doLogout} compacto />
            </header>

            {/* Conteúdo */}
            <main className="app-main"><Outlet /></main>

            {bugAberto && <BugReportModal onClose={() => setBugAberto(false)} />}

            {/* Bottom nav (mobile) */}
            <nav className="bottom-nav">
                {tabs.map((t) => (
                    <NavLink key={t.to} to={t.to} end={t.end}
                        onMouseEnter={() => warm(t.to)} onFocus={() => warm(t.to)}
                        className={({ isActive }) => (isActive ? 'active' : '')}>
                        <i className={`ti ${t.icon}`} />
                        <span>{tr(t.label)}</span>
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}
