// Sessions: a signed token in an httpOnly cookie. Every request reloads the person from the database, so a role
// change, removed project or deactivation takes effect at once.
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { unauthorized, forbidden } from './errors.js';

export const COOKIE = 'cs_session';

export function setSession(res, user) {
  const token = jwt.sign({ sub: String(user._id), tv: user.tokenVersion || 0 }, config.jwtSecret, { expiresIn: `${config.sessionDays}d`, algorithm: 'HS256' });
  res.cookie(COOKIE, token, { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/', maxAge: config.sessionDays * 864e5 });
}
export function clearSession(res) { res.clearCookie(COOKIE, { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' }); }

/** Loads req.user when a valid session cookie is present. */
export async function loadUser(req, res, next) {
  const t = req.cookies && req.cookies[COOKIE];
  if (!t) return next();
  try {
    const p = jwt.verify(t, config.jwtSecret, { algorithms: ['HS256'] });
    if (!mongoose.isValidObjectId(p.sub)) return next();
    const u = await User.findById(p.sub);
    if (u && u.active && (u.tokenVersion || 0) === p.tv) req.user = u; else clearSession(res);
  } catch (e) { clearSession(res); }
  next();
}

export const requireAuth = (req, res, next) => (req.user ? next() : next(unauthorized()));
export const requireRole = (...roles) => (req, res, next) => (!req.user ? next(unauthorized()) : roles.includes(req.user.role) ? next() : next(forbidden()));

/** Unsafe requests must come from this site (with SameSite cookies this closes cross-site request forgery). */
export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin') || req.get('referer');
  if (!origin) return req.get('x-requested-with') === 'fetch' ? next() : next(forbidden('Requests must come from the app.'));
  let host; try { host = new URL(origin).host; } catch (e) { return next(forbidden('Requests must come from the app.')); }
  const allowed = new Set([req.get('host'), req.get('x-forwarded-host'), new URL(config.appUrl).host].filter(Boolean));
  return allowed.has(host) ? next() : next(forbidden('Requests must come from the app.'));
}

// ---------- what a person may see and do ----------
export const seesAllProjects = u => u.role === 'admin' || (u.role === 'editor' && !(u.projects || []).length);
export const projectFilter = u => (seesAllProjects(u) ? {} : { _id: { $in: u.projects || [] } });
export const mayProject = (u, projectId) => seesAllProjects(u) || (u.projects || []).some(p => String(p) === String(projectId));
export const mayEdit = u => u.role !== 'viewer';
export const mayManageProjects = u => u.role === 'admin' || u.role === 'editor';
