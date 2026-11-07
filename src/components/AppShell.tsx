import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Bell, Compass, GraduationCap, HeartHandshake, House, LogOut, Menu, Wallet as WalletIcon, X,
} from 'lucide-react';
import { Avatar } from './Avatar.tsx';
import { Brand } from './Brand.tsx';
import { useAuth } from './AuthContext.tsx';
import { api } from '../lib/api.ts';

const navigation = [
  { to: '/feed', label: 'Home', icon: House },
  { to: '/explore', label: 'Explore Gees', icon: Compass },
  { to: '/bounties', label: 'Bounties', icon: HeartHandshake },
  { to: '/learn', label: 'Geemifi Academy', icon: GraduationCap },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/wallet', label: 'My wallet', icon: WalletIcon },
];

export function AppShell() {
  const { user, setUser } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  async function signOut() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      navigate('/welcome');
    }
  }

  const links = navigation.map(({ to, label, icon: Icon }) => (
    <NavLink key={to} to={to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
      <Icon size={19} strokeWidth={1.8} />
      <span>{label}</span>
      {label === 'Notifications' && <span className="nav-dot" />}
    </NavLink>
  ));

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <button className="icon-button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}>
          {menuOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
        <Brand />
        <button className="avatar-button" onClick={() => navigate('/profile')} aria-label="Open your profile">
          <Avatar name={user?.displayName ?? 'Gee'} src={user?.avatarUrl} size="small" />
        </button>
      </header>

      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <NavLink to="/feed" className="sidebar-brand" onClick={() => setMenuOpen(false)}><Brand /></NavLink>
        <div className="sidebar-caption">YOUR SPACE</div>
        <nav className="main-nav" aria-label="Main navigation">{links}</nav>
        <div className="sidebar-bottom">
          <div className="community-note">
            <span className="note-sparkle"><SparkleMark /></span>
            <strong>Good things grow here.</strong>
            <span>A little kindness goes a long way.</span>
          </div>
          <button className="profile-mini" onClick={() => navigate('/profile')}>
            <Avatar name={user?.displayName ?? 'Gee'} src={user?.avatarUrl} size="small" />
            <span className="profile-mini-copy"><strong>{user?.displayName}</strong><small>@{user?.username}</small></span>
            <span className="profile-chevron">···</span>
          </button>
          <button className="logout-button" onClick={() => void signOut()}><LogOut size={16} /> Sign out</button>
        </div>
      </aside>

      {menuOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}

      <main className="main-region">
        <div className="page-container"><Outlet /></div>
      </main>
    </div>
  );
}

function SparkleMark() {
  return <span aria-hidden="true">✦</span>;
}