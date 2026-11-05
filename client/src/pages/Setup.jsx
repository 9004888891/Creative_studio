import React, { useState } from 'react';
import { post } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, Notice, useAction } from '../components/ui.jsx';
import AuthCard from './AuthCard.jsx';

export default function Setup() {
  const { signedIn, status } = useAuth(), [f, setF] = useState({ name: '', email: '', password: '', setupKey: '' }), { busy, error, run } = useAction();
  const set = k => e => setF(Object.assign({}, f, { [k]: e.target.value }));
  const submit = e => { e.preventDefault(); run(() => post('/auth/setup', f)).then(r => { if (r) { signedIn(r.user); window.location.replace('/'); } }); };
  return (
    <AuthCard title="Set up Creative Studio" sub="Create the first admin account. You can invite your team after this.">
      <form onSubmit={submit} className="stack">
        <Field label="Your name"><input required autoComplete="name" value={f.name} onChange={set('name')} /></Field>
        <Field label="Email"><input type="email" required autoComplete="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Password" hint="At least 10 characters."><input type="password" required minLength={10} autoComplete="new-password" value={f.password} onChange={set('password')} /></Field>
        <Field label="Setup key" hint={status && status.setupKey ? 'The SETUP_KEY value set in Vercel.' : 'Set SETUP_KEY in Vercel first (or run npm run create-admin).'}><input type="password" required={!!(status && status.setupKey)} autoComplete="off" value={f.setupKey} onChange={set('setupKey')} /></Field>
        <Notice kind="error">{error}</Notice>
        <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create admin account'}</button>
      </form>
    </AuthCard>
  );
}
