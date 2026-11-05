import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { get, post, patch, del } from '../api.js';
import { useAuth, isAdmin, ROLE_LABEL } from '../auth.jsx';
import { CopyLink, Field, Notice, Spinner, useAction } from '../components/ui.jsx';

const ROLE_HELP = { admin: 'Everything, including people and settings', editor: 'All projects; can add projects and approve', junior: 'Only assigned projects; cannot approve', viewer: 'Only assigned projects; read-only' };
const scoped = role => role === 'junior' || role === 'viewer';

function Access({ value, onChange, projects }) {
  const v = value, set = k => x => onChange(Object.assign({}, v, { [k]: x }));
  const toggle = id => set('projects')(v.projects.includes(id) ? v.projects.filter(p => p !== id) : v.projects.concat(id));
  return (
    <div className="stack">
      <Field label="Role"><select value={v.role} onChange={e => set('role')(e.target.value)}>{Object.keys(ROLE_LABEL).map(r => <option key={r} value={r}>{ROLE_LABEL[r]} — {ROLE_HELP[r]}</option>)}</select></Field>
      {scoped(v.role) ? (
        <fieldset className="field"><legend className="field-label">Projects they can see</legend>
          <div className="checks">{projects.map(p => <label key={p.id} className="check"><input type="checkbox" checked={v.projects.includes(p.id)} onChange={() => toggle(p.id)} /> {p.name}</label>)}</div>
          {!v.projects.length ? <span className="field-hint">No projects ticked: they will see nothing until you add one.</span> : null}
        </fieldset>
      ) : null}
      <label className="check"><input type="checkbox" checked={v.hideBudget} onChange={e => set('hideBudget')(e.target.checked)} /> Hide spend and cost figures from this person</label>
    </div>
  );
}

export default function Users() {
  const { user } = useAuth();
  const [data, setData] = useState(null), [projects, setProjects] = useState([]), [link, setLink] = useState(null), [editing, setEditing] = useState(null);
  const [inv, setInv] = useState({ email: '', role: 'junior', projects: [], hideBudget: false }), { busy, error, setError, run } = useAction();
  const load = () => Promise.all([get('/users'), get('/projects')]).then(([u, p]) => { setData(u); setProjects(p.projects); }).catch(e => setError(e.message));
  useEffect(() => { if (isAdmin(user)) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!isAdmin(user)) return <Navigate to="/" replace />;
  if (!data) return error ? <Notice kind="error">{error}</Notice> : <Spinner />;

  const invite = e => { e.preventDefault(); run(() => post('/users/invite', Object.assign({}, inv, { projects: scoped(inv.role) ? inv.projects : [] }))).then(r => { if (r) { setLink({ url: r.link, who: inv.email, kind: 'invite' }); setInv({ email: '', role: 'junior', projects: [], hideBudget: false }); load(); } }); };
  const saveUser = u => run(() => patch('/users/' + u.id, { role: editing.role, projects: scoped(editing.role) ? editing.projects : [], hideBudget: editing.hideBudget })).then(r => { if (r) { setEditing(null); load(); } });
  const act = (fn, after) => run(fn).then(r => { if (r) { after && after(r); load(); } });
  const pname = id => (projects.find(p => p.id === id) || {}).name || 'a removed project';

  return (
    <div className="page">
      <div className="page-head"><div><h1>People</h1><p className="muted">Invite your team and choose what each person can see.</p></div></div>
      <form className="card stack" onSubmit={invite}>
        <h2>Invite someone</h2>
        <Field label="Email"><input type="email" required value={inv.email} onChange={e => setInv(Object.assign({}, inv, { email: e.target.value }))} /></Field>
        <Access value={inv} onChange={setInv} projects={projects} />
        <Notice kind="error">{error}</Notice>
        <button className="btn primary" disabled={busy}>Create invite link</button>
      </form>
      {link ? <div className="card"><h3>{link.kind === 'invite' ? `Invite link for ${link.who}` : `Password reset link for ${link.who}`}</h3><CopyLink url={link.url} note={(link.kind === 'invite' ? 'Valid for 7 days.' : 'Valid for 24 hours.') + ' Send it to them directly. It is shown only once.'} /><button className="btn" onClick={() => setLink(null)}>Done</button></div> : null}

      <h2>Team</h2>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Person</th><th>Role</th><th>Can see</th><th /></tr></thead>
        <tbody>{data.users.map(u => (
          <React.Fragment key={u.id}>
            <tr className={u.active ? '' : 'inactive'}>
              <td><b>{u.name || '—'}</b><br /><span className="muted small">{u.email}{u.active ? '' : ' · switched off'}</span></td>
              <td>{ROLE_LABEL[u.role]}{u.hideBudget ? <><br /><span className="small muted">spend hidden</span></> : null}</td>
              <td className="small">{scoped(u.role) ? (u.projects.length ? u.projects.map(pname).join(', ') : 'Nothing yet') : 'All projects'}</td>
              <td className="actions">
                {u.id !== user.id ? <>
                  <button className="btn small" onClick={() => setEditing(editing && editing.id === u.id ? null : { id: u.id, role: u.role, projects: u.projects, hideBudget: !!u.hideBudget })}>Access</button>
                  <button className="btn small" onClick={() => act(() => post(`/users/${u.id}/reset-link`), r => setLink({ url: r.link, who: u.email, kind: 'reset' }))}>Reset link</button>
                  <button className="btn small" onClick={() => act(() => post(`/users/${u.id}/sign-out`))}>Sign out</button>
                  <button className="btn small" onClick={() => act(() => patch('/users/' + u.id, { active: !u.active }))}>{u.active ? 'Switch off' : 'Switch on'}</button>
                </> : <span className="muted small">You</span>}
              </td>
            </tr>
            {editing && editing.id === u.id ? <tr><td colSpan={4}><div className="stack"><Access value={editing} onChange={v => setEditing(Object.assign({}, v, { id: u.id }))} projects={projects} /><div className="actions"><button className="btn primary" onClick={() => saveUser(u)} disabled={busy}>Save access</button><button className="btn" onClick={() => setEditing(null)}>Cancel</button></div></div></td></tr> : null}
          </React.Fragment>
        ))}</tbody>
      </table></div>

      {data.invites.length ? <>
        <h2>Waiting to join</h2>
        <div className="table-wrap"><table className="table"><tbody>{data.invites.map(t => (
          <tr key={t.id}><td>{t.email}</td><td>{ROLE_LABEL[t.role]}</td><td className="small muted">expires {new Date(t.expiresAt).toLocaleDateString()}</td><td className="actions"><button className="btn small" onClick={() => act(() => del('/users/invites/' + t.id))}>Cancel invite</button></td></tr>
        ))}</tbody></table></div>
      </> : null}
    </div>
  );
}
