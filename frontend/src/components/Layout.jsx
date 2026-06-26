import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { prefetch } from '../lib/useCachedResource.js';
import { useT } from '../lib/i18n.jsx';
import Logo from './Logo.jsx';

// Hover em um item do menu já aquece o chunk lazy da rota + os dados da tela.
// Quando o usuário clica, a página normalmente já tem tudo em cache.
const prefetchByPath = {
    '/app': () => {
        import('../pages/Dashboard.jsx');
        prefetch('dashboard', () => api.getDashboard());
        prefetch('profile', () => api.getProfile());
        prefetch('ranking', () => api.getRanking());
    },
    '/app/candidaturas': () => {
        import('../pages/Applications.jsx');
        prefetch('applications:1', () => api.getApplications({ page: 1, pageSize: 24 }));
    },
    '/app/feedback': () => {
        import('../pages/Feedback.jsx');
        prefetch('feedback:0', () => api.getFeedback());
    },
    '/app/perfil': () => {
        import('../pages/Profile.jsx');
        prefetch('profile', () => api.getProfile());
    },
    '/app/assinatura': () => {
        import('../pages/Subscription.jsx');
        prefetch('billing:plans', () => api.getPlans());
        prefetch('billing:history', () => api.billingHistory());
    },
    '/app/admin': () => { import('../pages/Admin.jsx'); },
};

function warm(path) {
    try { prefetchByPath[path]?.(); } catch { /* prefetch é best-effort */ }
}

function toggleTheme() {
    const el = document.documentElement;
    const dark = el.classList.toggle('dark');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
}

const baseTabs = [
    { to: '/app', label: 'Dashboard', icon: 'ti-layout-dashboard', end: true },
    { to: '/app/candidaturas', label: 'Candidaturas', icon: 'ti-send' },
    { to: '/app/feedback', label: 'Feedback', icon: 'ti-message-2' },
    { to: '/app/perfil', label: 'Perfil', icon: 'ti-user' },
    { to: '/app/assinatura', label: 'Assinatura', icon: 'ti-crown' },
];

function ThemeButton() {
    return (
        <button className="icon-btn" onClick={toggleTheme} aria-label="Alternar tema">
            <i className="ti ti-sun icon-sun" />
            <i className="ti ti-moon icon-moon" />
        </button>
    );
}

function LangButton() {
    const { lang, setLang } = useT();
    return (
        <button className="icon-btn" style={{ fontWeight: 600, fontSize: 12 }}
            onClick={() => setLang(lang === 'pt' ? 'en' : 'pt')} title="Idioma / Language" aria-label="Idioma">
            {lang === 'pt' ? 'PT' : 'EN'}
        </button>
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

    const initials = (user?.name || user?.email || '?')
        .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('');

    const tabs = user?.isAdmin
        ? [...baseTabs, { to: '/app/admin', label: 'Admin', icon: 'ti-shield-cog' }]
        : baseTabs;

    const doLogout = () => { logout(); navigate('/login'); };

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
                    <div className="user-chip">
                        <div className="avatar">{initials}</div>
                        <span>{user?.name || user?.email}</span>
                    </div>
                    <div className="sidebar-foot-actions">
                        <LangButton />
                        <ThemeButton />
                        <button className="icon-btn" title={tr('Sair')} onClick={doLogout}><i className="ti ti-logout" /></button>
                    </div>
                </div>
            </aside>

            {/* Top bar (mobile) */}
            <header className="mobile-bar">
                <NavLink to="/app" end className="brand"><Logo /></NavLink>
                <div className="spacer" />
                <LangButton />
                <ThemeButton />
                <button className="icon-btn" title={tr('Sair')} onClick={doLogout}><i className="ti ti-logout" /></button>
            </header>

            {/* Conteúdo */}
            <main className="app-main"><Outlet /></main>

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
