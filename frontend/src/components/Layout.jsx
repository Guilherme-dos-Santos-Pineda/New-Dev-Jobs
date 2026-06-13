import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import Logo from './Logo.jsx';

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

export default function Layout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const initials = (user?.name || user?.email || '?')
        .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('');

    const tabs = user?.isAdmin
        ? [...baseTabs, { to: '/app/admin', label: 'Admin', icon: 'ti-shield-cog' }]
        : baseTabs;

    const doLogout = () => { logout(); navigate('/login'); };

    return (
        <div className="app-shell">
            {/* Sidebar (desktop) */}
            <aside className="sidebar">
                <NavLink to="/app" end className="brand sidebar-brand"><Logo /></NavLink>
                <nav className="sidebar-nav">
                    {tabs.map((t) => (
                        <NavLink key={t.to} to={t.to} end={t.end}
                            className={({ isActive }) => (isActive ? 'active' : '')}>
                            <i className={`ti ${t.icon}`} />
                            <span>{t.label}</span>
                        </NavLink>
                    ))}
                </nav>
                <div className="sidebar-foot">
                    <div className="user-chip">
                        <div className="avatar">{initials}</div>
                        <span>{user?.name || user?.email}</span>
                    </div>
                    <div className="sidebar-foot-actions">
                        <ThemeButton />
                        <button className="icon-btn" title="Sair" onClick={doLogout}><i className="ti ti-logout" /></button>
                    </div>
                </div>
            </aside>

            {/* Top bar (mobile) */}
            <header className="mobile-bar">
                <NavLink to="/app" end className="brand"><Logo /></NavLink>
                <div className="spacer" />
                <ThemeButton />
                <button className="icon-btn" title="Sair" onClick={doLogout}><i className="ti ti-logout" /></button>
            </header>

            {/* Conteúdo */}
            <main className="app-main"><Outlet /></main>

            {/* Bottom nav (mobile) */}
            <nav className="bottom-nav">
                {tabs.map((t) => (
                    <NavLink key={t.to} to={t.to} end={t.end}
                        className={({ isActive }) => (isActive ? 'active' : '')}>
                        <i className={`ti ${t.icon}`} />
                        <span>{t.label}</span>
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}
