import React from 'react';
export default function AuthCard({ title, sub, children }) {
  return <div className="auth-wrap"><div className="auth-card"><div className="auth-brand"><img src="/favicon.svg" alt="" width="32" height="32" /><span>Creative Studio</span></div><h1>{title}</h1>{sub ? <p className="muted">{sub}</p> : null}{children}</div></div>;
}
