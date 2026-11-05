import React, { useEffect, useRef } from 'react';
import { CreativeHeatmap } from '@studio/widget.js';
import '@studio/creative-heatmap.css';
import { useAuth } from '../auth.jsx';
import { studioHeaders } from '../api.js';

/** Everything the studio has learned from past creatives across the projects this person can see. */
export default function Learning() {
  const { user } = useAuth(), host = useRef(null);
  useEffect(() => {
    const s = new CreativeHeatmap(host.current, {
      title: 'What the studio has learned', startView: 'learning',
      library: { url: '/api/library', headers: studioHeaders, credentials: 'same-origin', save: false },
      can: { upload: false, ai: false, versions: false, save: false, remove: false, edit: false, learning: true, budget: !user.hideBudget },
    });
    return () => { try { s.destroy && s.destroy(); } catch (e) { /* ignore */ } if (host.current) host.current.innerHTML = ''; };
  }, [user.hideBudget]);
  return <div className="page wide"><div className="page-head"><div><h1>Learning</h1><p className="muted">What has worked across your projects, and ideas for the next creative. Open a project to add creatives.</p></div></div><div ref={host} className="studio-host" /></div>;
}
