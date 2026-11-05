import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { post } from '../api.js';
import { Field, Notice, useAction } from '../components/ui.jsx';
import AuthCard from './AuthCard.jsx';

export default function Reset() {
  const { token } = useParams(), [password, setPassword] = useState(''), [ok, setOk] = useState(false), { busy, error, run } = useAction();
  const submit = e => { e.preventDefault(); run(() => post('/auth/reset/' + encodeURIComponent(token), { password })).then(r => r && setOk(true)); };
  if (ok) return <AuthCard title="Password changed"><p>You can sign in with your new password now.</p><Link className="btn primary" to="/login">Sign in</Link></AuthCard>;
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={submit} className="stack">
        <Field label="New password" hint="At least 10 characters."><input type="password" required minLength={10} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
        <Notice kind="error">{error}</Notice>
        <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </AuthCard>
  );
}
