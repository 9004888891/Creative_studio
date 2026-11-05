// The studio engine (studio/src) inside the React app. The engine draws its own panel; this component feeds it the
// project's saved creatives, uploads new ones to private Blob storage, and saves every change back to the API.
import React, { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { CreativeHeatmap } from '@studio/widget.js';
import '@studio/creative-heatmap.css';
import { api, patch, studioHeaders } from '../api.js';
import { Notice } from './ui.jsx';

const ext = f => (f.name.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
const safe = s => String(s || 'creative').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'creative';

/** A saved creative, in the shape the engine restores (images and carousels by URL, videos as a File so frames can be read). */
async function toStudio(c) {
  const meta = { id: c.id, name: c.name, tags: c.tags || undefined, qcManual: c.qcManual || undefined, perfName: c.perfName || undefined, qcVisual: c.qcVisual || undefined,
    transcript: c.transcript || undefined, status: c.status, addedAt: c.createdAt, aiByPart: c.ai && Object.keys(c.ai).length ? c.ai : undefined };
  const f0 = c.files[0];
  if (!f0) return null;
  if (c.kind === 'carousel') return Object.assign({ cards: c.files.map(f => ({ src: f.url, name: f.name })) }, meta);
  if (c.kind === 'image') return Object.assign({ src: f0.url }, meta);
  const r = await fetch(f0.url, { credentials: 'same-origin' });
  if (!r.ok) throw new Error('The video could not be loaded.');
  const blob = await r.blob(), file = new File([blob], f0.name || c.name + '.mp4', { type: f0.contentType || blob.type || 'video/mp4' });
  file._restore = meta;
  return file;
}

export default function StudioView({ project, creatives, user, features, onSelect, onCreated, onRemoved, onUpdated, onProjectBrief, startView }) {
  const host = useRef(null), studio = useRef(null), [note, setNote] = useState(''), [loading, setLoading] = useState(true);
  const cb = useRef({}); cb.current = { onSelect, onCreated, onRemoved, onUpdated, onProjectBrief };

  useEffect(() => {
    let gone = false;
    const serverId = new Map();        // studio id -> Promise<server id>
    const known = new Set(creatives.map(c => c.id));
    const editable = user.role !== 'viewer';
    const names = new Set(creatives.map(c => c.name.toLowerCase()));
    const uniqueName = n => { let s = n, i = 2; while (names.has(s.toLowerCase())) s = `${n} (${i++})`; names.add(s.toLowerCase()); return s; };
    creatives.forEach(c => serverId.set(c.id, Promise.resolve(c.id)));

    const save = async (item, body) => {
      const p = serverId.get(item.id); if (!p || !editable) return;
      try { const id = await p; if (!id) return; const r = await patch('/creatives/' + id, body); cb.current.onUpdated && cb.current.onUpdated(r.creative); }
      catch (e) { if (!gone) setNote('A change could not be saved: ' + e.message); }
    };

    const send = async (file, i) => {
      const pathname = `projects/${project.id}/${Date.now().toString(36)}-${i}-${safe(file.name.replace(/\.[^.]+$/, ''))}${ext(file)}`;
      const b = await upload(pathname, file, { access: 'private', handleUploadUrl: '/api/uploads', clientPayload: JSON.stringify({ project: project.id }), multipart: file.size > 20 * 1024 * 1024 });
      return { pathname: b.pathname, contentType: file.type || b.contentType, size: file.size, name: file.name };
    };

    const create = async item => {
      const files = item.kind === 'carousel' ? item.cards.map(k => k.file).filter(Boolean) : [item.file].filter(Boolean);
      if (!files.length) return null;
      if (!features.uploads) throw new Error('File storage is not connected yet, so new creatives are not saved. Connect a private Vercel Blob store.');
      setNote(`Saving “${item.name}”…`);
      const name = uniqueName(item.name); if (name !== item.name) item.name = name;
      const up = []; for (let i = 0; i < files.length; i++) up.push(await send(files[i], i));
      const r = await api(`/projects/${project.id}/creatives`, { method: 'POST', body: { name, kind: item.kind, files: up, duration: item.duration || undefined } });
      known.add(r.creative.id); setNote('');
      cb.current.onCreated && cb.current.onCreated(r.creative, item.id);
      return r.creative.id;
    };

    const s = new CreativeHeatmap(host.current, {
      title: project.name,
      context: () => Object.assign({ project: project.name, developer: project.developer || '' }, project.brief || {}, { project: project.name }),
      briefs: project.brief && Object.keys(project.brief).length ? { [project.name]: project.brief } : {},
      ai: features.ai && editable ? { endpoint: '/api/ai/analyze', headers: studioHeaders } : null,
      transcribe: features.transcribe && editable ? { endpoint: '/api/ai/transcribe', headers: studioHeaders } : undefined,
      performanceFeed: features.performance ? { url: '/api/performance?project=' + encodeURIComponent(project.name), headers: studioHeaders, credentials: 'same-origin' } : undefined,
      library: { url: '/api/library', headers: studioHeaders, credentials: 'same-origin', save: editable },
      can: { upload: editable && !!features.uploads, ai: editable && !!features.ai, versions: editable, save: editable, remove: editable, edit: editable,
        performance: !!features.performance, compliance: true, qc: true, learning: true, budget: !user.hideBudget },
      allowRemove: editable,
      startView,
      download: async (blob, filename) => { const a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); },
      onBrief: (key, brief) => { if (editable) cb.current.onProjectBrief && cb.current.onProjectBrief(brief); },
      onAIResult: (item, result, f) => {
        if (!result) return;
        const key = item.kind === 'carousel' ? String(f || 0) : String(s._pk(item, f || 0));
        save(item, { aiPart: { key, value: result } });
      },
      onChange: (ev, item) => {
        if (!item) return;
        if (ev === 'selected') { serverId.get(item.id)?.then(id => cb.current.onSelect && cb.current.onSelect(id)); return; }
        if (ev === 'added' && !known.has(item.id) && !serverId.has(item.id)) {
          if (!editable) return;
          const p = create(item).catch(e => { if (!gone) setNote(`“${item.name}” was not saved: ${e.message}`); return null; });
          serverId.set(item.id, p);
          p.then(id => { if (id && s.cur === item.id) cb.current.onSelect && cb.current.onSelect(id); });
          return;
        }
        if (ev === 'removed') { const p = serverId.get(item.id); serverId.delete(item.id); if (p && editable) p.then(id => id && api('/creatives/' + id, { method: 'DELETE' }).then(() => cb.current.onRemoved && cb.current.onRemoved(id)).catch(e => setNote('Could not delete: ' + e.message))); return; }
        if (ev === 'tagged') return save(item, { tags: item.tags, tagsBy: 'person' });
        if (ev === 'matched') return save(item, { perfName: item.perfName || null });
        if (ev === 'qc') return save(item, { qcManual: item.qcManual || {} });
        if (ev === 'transcribed' && item.transcript) return save(item, { transcript: item.transcript });
        return undefined;
      },
    });
    studio.current = s;

    (async () => {
      const list = [];
      for (const c of creatives) { try { const x = await toStudio(c); if (x) list.push(x); } catch (e) { setNote(`“${c.name}” could not be loaded.`); } }
      if (gone) return;
      if (list.length) { await s.add(list); s.select(list[0].id || (list[0]._restore || {}).id); }
      setLoading(false);
    })();

    return () => { gone = true; try { s.destroy && s.destroy(); } catch (e) { /* ignore */ } if (host.current) host.current.innerHTML = ''; };
    // the studio is rebuilt only when the project changes; creatives and brief updates flow through the engine itself
  }, [project.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (studio.current) studio.current.o.title = project.name; }, [project.name]);

  return (
    <div className="studio-wrap">
      <Notice kind={/not saved|could not/i.test(note) ? 'error' : 'info'}>{note}</Notice>
      {loading && creatives.length ? <p className="muted small">Loading {creatives.length} creative{creatives.length === 1 ? '' : 's'}…</p> : null}
      <div ref={host} className="studio-host" />
    </div>
  );
}

export { toStudio };
