import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, patch, del } from '../api.js';
import { useAuth, canEdit, canManageProjects, isAdmin } from '../auth.jsx';
import { Notice, Spinner } from '../components/ui.jsx';
import StudioView from '../components/StudioView.jsx';

const STATUS = [['draft', 'Draft'], ['in_review', 'In review'], ['changes', 'Changes asked'], ['approved', 'Approved']];

export default function ProjectPage() {
  const { id } = useParams(), { user, features } = useAuth(), nav = useNavigate();
  const [project, setProject] = useState(null), [creatives, setCreatives] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState('');
  const [cur, setCur] = useState(null), [settings, setSettings] = useState(false), [edit, setEdit] = useState({ name: '', developer: '' });
  const briefTimer = useRef(null);

  useEffect(() => {
    let gone = false; setProject(null); setCreatives(null); setErr('');
    Promise.all([get('/projects/' + id), get(`/projects/${id}/creatives`)])
      .then(([p, c]) => { if (gone) return; setProject(p.project); setCreatives(c.creatives); setEdit({ name: p.project.name, developer: p.project.developer || '' }); })
      .catch(e => !gone && setErr(e.message));
    return () => { gone = true; };
  }, [id]);

  const upsert = useCallback(c => setCreatives(list => { const i = (list || []).findIndex(x => x.id === c.id); if (i < 0) return (list || []).concat(c); const n = list.slice(); n[i] = c; return n; }), []);
  const onBrief = useCallback(brief => {   // the studio's brief form: save it to the project (debounced)
    clearTimeout(briefTimer.current);
    briefTimer.current = setTimeout(() => patch('/projects/' + id, { brief }).then(r => { setProject(r.project); setMsg('Brief saved.'); setTimeout(() => setMsg(''), 2500); }).catch(e => setMsg('The brief could not be saved: ' + e.message)), 400);
  }, [id]);

  if (err) return <div className="page"><Notice kind="error">{err}</Notice><Link to="/">Back to projects</Link></div>;
  if (!project || !creatives) return <Spinner />;
  const current = creatives.find(c => c.id === cur);
  const setStatus = async status => { try { const r = await patch('/creatives/' + current.id, { status }); upsert(r.creative); } catch (e) { setMsg(e.message); } };
  const saveSettings = async e => { e.preventDefault(); try { const r = await patch('/projects/' + id, edit); setProject(r.project); setSettings(false); setMsg('Saved. Reload to see the new name in the studio.'); } catch (x) { setMsg(x.message); } };
  const archive = async () => { try { const r = await patch('/projects/' + id, { archived: !project.archived }); setProject(r.project); } catch (x) { setMsg(x.message); } };
  const remove = async () => { if (!window.confirm(`Delete “${project.name}”? This cannot be undone.`)) return; try { await del('/projects/' + id); nav('/'); } catch (x) { setMsg(x.message); } };
  const reviewer = user.role === 'admin' || user.role === 'editor';

  return (
    <div className="page wide">
      <div className="page-head">
        <div>
          <p className="crumbs"><Link to="/">Projects</Link> /</p>
          <h1>{project.name}{project.archived ? <span className="pill">Archived</span> : null}</h1>
          <p className="muted">{project.developer || ''}{project.developer ? ' · ' : ''}{creatives.length} creative{creatives.length === 1 ? '' : 's'}</p>
        </div>
        {canManageProjects(user) ? <button className="btn" onClick={() => setSettings(!settings)}>{settings ? 'Close' : 'Project settings'}</button> : null}
      </div>
      {settings ? (
        <form className="card stack row-form" onSubmit={saveSettings}>
          <label className="field"><span className="field-label">Project name</span><input required minLength={2} value={edit.name} onChange={e => setEdit(Object.assign({}, edit, { name: e.target.value }))} /></label>
          <label className="field"><span className="field-label">Developer / brand</span><input value={edit.developer} onChange={e => setEdit(Object.assign({}, edit, { developer: e.target.value }))} /></label>
          <div className="actions"><button className="btn primary">Save</button><button type="button" className="btn" onClick={archive}>{project.archived ? 'Unarchive' : 'Archive'}</button>{isAdmin(user) ? <button type="button" className="btn danger" onClick={remove} disabled={creatives.length > 0} title={creatives.length ? 'Remove its creatives first' : ''}>Delete</button> : null}</div>
        </form>
      ) : null}
      <Notice kind={/could not|only|not allowed/i.test(msg) ? 'error' : 'info'}>{msg}</Notice>
      {current ? (
        <div className="statusbar">
          <span className="muted">Review status of <b>{current.name}</b></span>
          <div className="seg" role="group" aria-label="Review status">
            {STATUS.map(([k, l]) => <button key={k} type="button" className={'seg-btn st-' + k + (current.status === k ? ' on' : '')} disabled={!canEdit(user) || (!reviewer && ['approved', 'changes'].includes(k))} onClick={() => setStatus(k)}>{l}</button>)}
          </div>
        </div>
      ) : null}
      <StudioView project={project} creatives={creatives} user={user} features={features || {}} onSelect={setCur}
        onCreated={c => { upsert(c); setCur(c.id); }} onUpdated={upsert} onRemoved={rid => setCreatives(l => l.filter(c => c.id !== rid))} onProjectBrief={onBrief} />
    </div>
  );
}
