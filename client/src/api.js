// One small wrapper for the API: same-origin cookies, the CSRF header the server expects, and readable errors.
export class ApiError extends Error { constructor(message, status, data) { super(message); this.status = status; this.data = data; } }

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { 'X-Requested-With': 'fetch' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let r;
  try { r = await fetch('/api' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', signal }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new ApiError('Could not reach the server. Check your connection and try again.', 0); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && path !== '/auth/me' && !path.startsWith('/auth/')) window.dispatchEvent(new Event('cs:signed-out'));
    throw new ApiError(data.error || `Something went wrong (${r.status}).`, r.status, data);
  }
  return data;
}

export const get = (p, o) => api(p, o);
export const post = (p, body) => api(p, { method: 'POST', body: body || {} });
export const patch = (p, body) => api(p, { method: 'PATCH', body });
export const del = p => api(p, { method: 'DELETE' });
/** Headers the studio engine sends with its own fetches (library, AI reading, transcription, results). */
export const studioHeaders = { 'X-Requested-With': 'fetch' };
