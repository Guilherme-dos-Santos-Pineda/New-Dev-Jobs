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
];

export default function Layout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const initials = (user?.name || user?.email || '?')
        .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('');

    const tabs = user?.isAdmin
        ? [...baseTabs, { to: '/app/admin', label: 'Admin', icon: 'ti-shield-cog' }]
        : baseTabs;

    return (
        <>
            <nav className="app-nav">
                <NavLink to="/app" className="brand"><Logo /></NavLink>

                <div className="nav-tabs">
                    {tabs.map((t) => (
                        <NavLink key={t.to} to={t.to} end={t.end}
                            className={({ isActive }) => (isActive ? 'active' : '')}>
                            <i className={`ti ${t.icon}`} />
                            <span>{t.label}</span>
                        </NavLink>
                    ))}
                </div>

                <div className="nav-right">
                    <button className="icon-btn" onClick={toggleTheme} aria-label="Alternar tema">
                        <i className="ti ti-sun icon-sun" />
                        <i className="ti ti-moon icon-moon" />
                    </button>
                    <div className="user-chip">
                        <span>{user?.name || user?.email}</span>
                        <div className="avatar">{initials}</div>
                    </div>
                    <button className="icon-btn" title="Sair"
                        onClick={() => { logout(); navigate('/login'); }}>
                        <i className="ti ti-logout" />
                    </button>
                </div>
            </nav>
            <Outlet />
        </>
    );
}
