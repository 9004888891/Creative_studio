import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../api.js';
import { useAuth, canManageProjects } from '../auth.jsx';
import { Empty, Field, Notice, Spinner, useAction } from '../components/ui.jsx';

const STATUS = [['draft', 'Draft'], ['in_review', 'In review'], ['changes', 'Changes asked'], ['approved', 'Approved']];

export default function Projects() {
  const { user } = useAuth(), nav = useNavigate();
  const [list, setList] = useState(null), [q, setQ] = useState(''), [showArchived, setShowArchived] = useState(false), [adding, setAdding] = useState(false);
  const [f, setF] = useState({ name: '', developer: '' }), { busy, error, run } = useAction(), [loadErr, setLoadErr] = useState('');
  useEffect(() => { get('/projects' + (showArchived ? '?archived=1' : '')).then(r => setList(r.projects)).catch(e => setLoadErr(e.message)); }, [showArchived]);
  const shown = useMemo(() => (list || []).filter(p => (p.name + ' ' + (p.developer || '')).toLowerCase().includes(q.trim().toLowerCase())), [list, q, showArchived]);
  const create = e => { e.preventDefault(); run(() => post('/projects', { name: f.name, developer: f.developer, brief: { project: f.name, developer: f.developer } })).then(r => r && nav('/projects/' + r.project.id)); };
  if (loadErr) return <Notice kind="error">{loadErr}</Notice>;
  if (!list) return <Spinner />;
  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Projects</h1><p className="muted">{user.role === 'junior' ? 'The projects assigned to you.' : 'Each project keeps its brief, creatives and results together.'}</p></div>
        {canManageProjects(user) ? <button className="btn primary" onClick={() => setAdding(!adding)}>{adding ? 'Cancel' : 'New project'}</button> : null}
      </div>
      {adding ? (
        <form className="card stack row-form" onSubmit={create}>
          <Field label="Project name"><input required minLength={2} value={f.name} onChange={e => setF(Object.assign({}, f, { name: e.target.value }))} placeholder="e.g. Harbourline Residences" /></Field>
          <Field label="Developer / brand"><input value={f.developer} onChange={e => setF(Object.assign({}, f, { developer: e.target.value }))} /></Field>
          <Notice kind="error">{error}</Notice>
          <button className="btn primary" disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button>
        </form>
      ) : null}
      {list.length || showArchived ? (
        <div className="toolbar">
          <input type="search" placeholder="Search projects" value={q} onChange={e => setQ(e.target.value)} aria-label="Search projects" />
          <label className="check"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Archived projects only</label>
        </div>
      ) : null}
      {!list.length && !showArchived ? <Empty title="No projects yet">{canManageProjects(user) ? <p>Create the first project to start adding creatives.</p> : <p>Your admin has not assigned you to a project yet.</p>}</Empty> : (
        <div className="grid">
          {shown.map(p => (
            <Link key={p.id} to={'/projects/' + p.id} className={'card project-card' + (p.archived ? ' archived' : '')}>
              <h3>{p.name}</h3>
              <p className="muted">{p.developer || '—'}{p.archived ? ' · archived' : ''}</p>
              <div className="counts">
                <span><b>{(p.creatives && p.creatives.total) || 0}</b> creatives</span>
                {STATUS.filter(([k]) => p.creatives && p.creatives[k]).map(([k, l]) => <span key={k} className={'pill st-' + k}>{p.creatives[k]} {l.toLowerCase()}</span>)}
              </div>
              <p className="small muted">{p.brief && p.brief.objective ? 'Brief filled in' : 'No brief yet'}</p>
            </Link>
          ))}
          {!shown.length ? <p className="muted">No projects match.</p> : null}
        </div>
      )}
    </div>
  );
}
