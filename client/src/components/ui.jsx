import React, { useEffect, useRef, useState } from 'react';

export function Field({ label, hint, children }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint ? <span className="field-hint">{hint}</span> : null}</label>;
}
export function Notice({ kind = 'info', children }) { return children ? <div className={'notice notice-' + kind} role={kind === 'error' ? 'alert' : 'status'}>{children}</div> : null; }
export function Spinner({ label = 'Loading…' }) { return <div className="spinner" role="status"><span className="spinner-dot" />{label}</div>; }
export function Empty({ title, children }) { return <div className="empty"><h3>{title}</h3>{children}</div>; }

/** Run an async action with a busy flag and an error message. */
export function useAction() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const run = async fn => { setBusy(true); setError(''); try { return await fn(); } catch (e) { setError(e.message || String(e)); return undefined; } finally { setBusy(false); } };
  return { busy, error, setError, run };
}

/** A link the person copies once (invites and password resets). */
export function CopyLink({ url, note }) {
  const [done, setDone] = useState(false), ref = useRef(null);
  const copy = async () => { try { await navigator.clipboard.writeText(url); setDone(true); } catch (e) { ref.current && ref.current.select(); } };
  return <div className="copylink"><input ref={ref} readOnly value={url} onFocus={e => e.target.select()} aria-label="Link" /><button type="button" className="btn" onClick={copy}>{done ? 'Copied' : 'Copy'}</button>{note ? <p className="field-hint">{note}</p> : null}</div>;
}

export function GoogleButton({ clientId, onCredential, text = 'signin_with' }) {
  const ref = useRef(null), [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!clientId) return undefined;
    let gone = false;
    const draw = () => {
      if (gone || !window.google || !window.google.accounts) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: r => onCredential(r.credential), ux_mode: 'popup', auto_select: false, itp_support: true });
      window.google.accounts.id.renderButton(ref.current, { theme: 'outline', size: 'large', text, shape: 'pill', width: 300 });
    };
    if (window.google && window.google.accounts) draw();
    else {
      let s = document.getElementById('gsi-client');
      if (!s) { s = document.createElement('script'); s.id = 'gsi-client'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; document.head.appendChild(s); }
      s.addEventListener('load', draw); s.addEventListener('error', () => setFailed(true));
    }
    return () => { gone = true; };
  }, [clientId, onCredential, text]);
  if (!clientId) return null;
  return <div className="google-btn">{failed ? <p className="field-hint">Google sign-in could not load. Use your email and password.</p> : <div ref={ref} />}</div>;
}
