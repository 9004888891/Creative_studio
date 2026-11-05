import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { get, post } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, status: null });
  const refresh = useCallback(async () => {
    const status = await get('/auth/status').catch(e => ({ error: e.message + (e.data && e.data.problems ? ' ' + e.data.problems.join(' ') : '') }));
    const me = status.error || status.needsSetup ? null : await get('/auth/me').catch(() => null);
    setState({ loading: false, user: me ? me.user : null, status, features: (me && me.features) || status.features || {} });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { const f = () => setState(s => Object.assign({}, s, { user: null })); window.addEventListener('cs:signed-out', f); return () => window.removeEventListener('cs:signed-out', f); }, []);
  const signedIn = user => setState(s => Object.assign({}, s, { user, status: Object.assign({}, s.status, { needsSetup: false }) }));
  const signOut = async (everywhere) => { await post(everywhere ? '/auth/logout-all' : '/auth/logout').catch(() => {}); setState(s => Object.assign({}, s, { user: null })); };
  return <Ctx.Provider value={Object.assign({}, state, { refresh, signedIn, signOut })}>{children}</Ctx.Provider>;
}

export const ROLE_LABEL = { admin: 'Admin', editor: 'Editor', junior: 'Junior', viewer: 'Viewer' };
export const canEdit = u => !!u && u.role !== 'viewer';
export const canManageProjects = u => !!u && (u.role === 'admin' || u.role === 'editor');
export const isAdmin = u => !!u && u.role === 'admin';
