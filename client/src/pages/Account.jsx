import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { patch } from '../api.js';
import { useAuth, ROLE_LABEL } from '../auth.jsx';
import { Field, Notice, useAction } from '../components/ui.jsx';

export default function Account() {
  const { user, signedIn, signOut } = useAuth(), nav = useNavigate();
  const [name, setName] = useState(user.name || ''), [pw, setPw] = useState({ currentPassword: '', newPassword: '' }), [ok, setOk] = useState('');
  const a = useAction(), b = useAction();
  const saveName = e => { e.preventDefault(); setOk(''); a.run(() => patch('/auth/me', { name })).then(r => { if (r) { signedIn(r.user); setOk('Name saved.'); } }); };
  const savePw = e => { e.preventDefault(); setOk(''); b.run(() => patch('/auth/me', pw)).then(r => { if (r) { signedIn(r.user); setPw({ currentPassword: '', newPassword: '' }); setOk('Password changed. Other devices have been signed out.'); } }); };
  return (
    <div className="page narrow-page">
      <h1>Your account</h1>
      <p className="muted">{user.email} · {ROLE_LABEL[user.role]}</p>
      <Notice kind="success">{ok}</Notice>
      <form className="card stack" onSubmit={saveName}><h2>Name</h2><Field label="Name"><input required value={name} onChange={e => setName(e.target.value)} /></Field><Notice kind="error">{a.error}</Notice><button className="btn primary" disabled={a.busy}>Save</button></form>
      <form className="card stack" onSubmit={savePw}><h2>Password</h2>
        <Field label="Current password" hint="Leave empty if you have only used Google sign-in."><input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={e => setPw(Object.assign({}, pw, { currentPassword: e.target.value }))} /></Field>
        <Field label="New password" hint="At least 10 characters."><input type="password" required minLength={10} autoComplete="new-password" value={pw.newPassword} onChange={e => setPw(Object.assign({}, pw, { newPassword: e.target.value }))} /></Field>
        <Notice kind="error">{b.error}</Notice><button className="btn primary" disabled={b.busy}>Change password</button></form>
      <div className="card stack"><h2>Sign out everywhere</h2><p className="muted">Ends your session on every device, including this one.</p><button className="btn" onClick={async () => { await signOut(true); nav('/login'); }}>Sign out everywhere</button></div>
    </div>
  );
}
