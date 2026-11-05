import React, { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { post } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Field, GoogleButton, Notice, useAction } from '../components/ui.jsx';
import AuthCard from './AuthCard.jsx';

export default function Login() {
  const { status, signedIn } = useAuth(), nav = useNavigate(), [q] = useSearchParams();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), { busy, error, run } = useAction();
  const next = (q.get('next') || '/').startsWith('/') && !(q.get('next') || '').startsWith('//') ? q.get('next') || '/' : '/';
  const done = r => { if (r) { signedIn(r.user); nav(next, { replace: true }); } };
  const submit = e => { e.preventDefault(); run(() => post('/auth/login', { email, password })).then(done); };
  const google = useCallback(credential => { run(() => post('/auth/google', { credential })).then(done); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <AuthCard title="Sign in" sub="Use the account your admin invited.">
      <form onSubmit={submit} className="stack">
        <Field label="Email"><input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="Password"><input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></Field>
        <Notice kind="error">{error}</Notice>
        <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
      {status && status.google ? <><div className="or"><span>or</span></div><GoogleButton clientId={status.google} onCredential={google} /></> : null}
      <p className="muted small">Forgot your password? Ask your admin for a reset link.</p>
    </AuthCard>
  );
}
