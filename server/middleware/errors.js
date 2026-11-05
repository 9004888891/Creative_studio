// Errors the API sends back on purpose, and the catch-all that hides internals in production.
import { config } from '../config.js';

export class HttpError extends Error { constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; } }
export const bad = (m, x) => new HttpError(400, m, x);
export const unauthorized = m => new HttpError(401, m || 'Please sign in.');
export const forbidden = m => new HttpError(403, m || 'You do not have access to this.');
export const notFound = m => new HttpError(404, m || 'Not found.');

export function notFoundHandler(req, res) { res.status(404).json({ error: 'Not found.' }); }

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large.' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request could not be read.' });
  if (err && err.name === 'CastError') return res.status(404).json({ error: 'Not found.' });
  if (err && err.code === 11000) return res.status(409).json({ error: 'That already exists.' });
  const status = err && (err.status || err.statusCode);
  if (status && status < 500) return res.status(status).json(Object.assign({ error: err.message }, err.extra || {}));
  console.error('[api]', req.method, req.originalUrl, err);
  res.status(status && status >= 500 ? status : 500).json({ error: status === 501 || status === 502 ? err.message : 'Something went wrong. Please try again.', ...(config.production ? {} : { detail: String(err && err.message) }) });
}
