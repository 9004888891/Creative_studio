import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { get, post } from '../api.js';
import { useAuth, ROLE_LABEL } from '../auth.jsx';
import { Field, GoogleButton, Notice, Spinner, useAction } from '../components/ui.jsx';
import AuthCard from './AuthCard.jsx';

export default function Invite() {
  const { token } = useParams(), { status, signedIn } = useAuth(), nav = useNavigate();
  const [inv, setInv] = useState(null), [f, setF] = useState({ name: '', password: '' }), { busy, error, setError, run } = useAction();
  useEffect(() => { get('/auth/invite/' + encodeURIComponent(token)).then(setInv).catch(e => setInv({ bad: e.message })); }, [token]);
  const done = r => { if (r) { signedIn(r.user); nav('/', { replace: true }); } };
  const submit = e => { e.preventDefault(); run(() => post('/auth/invite/' + encodeURIComponent(token), f)).then(done); };
  const google = useCallback(credential => { setError(''); run(() => post('/auth/google', { credential, invite: token })).then(done); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!inv) return <AuthCard title="Invitation"><Spinner /></AuthCard>;
  if (inv.bad) return <AuthCard title="Invitation"><Notice kind="error">{inv.bad}</Notice><p className="muted">Ask your admin for a new invite link.</p></AuthCard>;
  return (
    <AuthCard title="Join Creative Studio" sub={`You're invited as ${ROLE_LABEL[inv.role] || inv.role} with ${inv.email}.`}>
      {status && status.google ? <><GoogleButton clientId={status.google} onCredential={google} text="continue_with" /><p className="muted small">Use the Google account for {inv.email}.</p><div className="or"><span>or set a password</span></div></> : null}
      <form onSubmit={submit} className="stack">
        <Field label="Your name"><input required autoComplete="name" value={f.name} onChange={e => setF(Object.assign({}, f, { name: e.target.value }))} /></Field>
        <Field label="Password" hint="At least 10 characters."><input type="password" required minLength={10} autoComplete="new-password" value={f.password} onChange={e => setF(Object.assign({}, f, { password: e.target.value }))} /></Field>
        <Notice kind="error">{error}</Notice>
        <button className="btn primary" disabled={busy}>{busy ? 'Joining…' : 'Join'}</button>
      </form>
    </AuthCard>
  );
}
