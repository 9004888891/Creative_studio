import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth, isAdmin, ROLE_LABEL } from '../auth.jsx';

export default function Layout() {
  const { user, signOut } = useAuth(), nav = useNavigate(), [open, setOpen] = useState(false);
  const out = async () => { await signOut(); nav('/login'); };
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand" onClick={() => setOpen(false)}><img src="/favicon.svg" alt="" width="24" height="24" />Creative Studio</NavLink>
        <button type="button" className="menu-btn" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>☰</button>
        <nav className={'nav' + (open ? ' open' : '')} onClick={() => setOpen(false)}>
          <NavLink to="/" end>Projects</NavLink>
          <NavLink to="/learning">Learning</NavLink>
          {isAdmin(user) ? <NavLink to="/users">People</NavLink> : null}
          <NavLink to="/account" className="who">{user.name || user.email}<small>{ROLE_LABEL[user.role]}</small></NavLink>
          <button type="button" className="linklike" onClick={out}>Sign out</button>
        </nav>
      </header>
      <main className="main"><Outlet /></main>
    </div>
  );
}
