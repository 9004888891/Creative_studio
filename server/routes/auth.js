import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { LoginAttempt } from '../models/LoginAttempt.js';
import { setSession, clearSession, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { bad, unauthorized, forbidden, HttpError } from '../middleware/errors.js';
import { findLink } from '../lib/tokens.js';

import crypto from 'crypto';
const safeEqual = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };
const r = Router();
const email = z.string().trim().toLowerCase().email().max(200);
const password = z.string().min(10, 'must be at least 10 characters').max(200);
const name = z.string().trim().min(1).max(120);
const google = config.googleClientId ? new OAuth2Client(config.googleClientId) : null;

// ---- throttling: 8 failed attempts per email or per address in 15 minutes ----
const WINDOW = 15 * 60e3, LIMIT = 8;
const ipOf = req => String(req.get('x-forwarded-for') || req.ip || '').split(',')[0].trim();
async function checkThrottle(keys) { const n = await LoginAttempt.find({ key: { $in: keys }, expiresAt: { $gt: new Date() } }).lean(); if (n.some(x => x.count >= LIMIT)) throw new HttpError(429, 'Too many attempts. Wait 15 minutes and try again.'); }
const failed = keys => Promise.all(keys.map(key => LoginAttempt.updateOne({ key }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(Date.now() + WINDOW) } }, { upsert: true })));
const cleared = keys => LoginAttempt.deleteMany({ key: { $in: keys } });

async function signIn(req, res, user) { user.lastLoginAt = new Date(); await user.save(); setSession(res, user); res.json({ user: user.toPublic() }); }

/** Public: whether the app needs its first admin, and which sign-in options exist. */
r.get('/status', async (req, res) => {
  const needsSetup = (await User.countDocuments()) === 0;
  res.json({ needsSetup, setupKey: needsSetup && !!config.setupKey, google: config.googleClientId || null, features: config.features });
});

/** One time only: create the first admin. */
r.post('/setup', validate(z.object({ name, email, password, setupKey: z.string().max(200).optional().default('') })), async (req, res) => {
  if (await User.countDocuments()) throw forbidden('The app is already set up. Sign in instead.');
  // On a public URL anyone could reach this page first, so the first admin must know SETUP_KEY (required in production).
  if (!config.setupKey && config.production) throw forbidden('Set SETUP_KEY in Vercel (or run npm run create-admin) before creating the first admin.');
  if (config.setupKey && !safeEqual(req.body.setupKey, config.setupKey)) { await new Promise(r => setTimeout(r, 800)); throw forbidden('That setup key is not right.'); }
  const u = await User.create({ email: req.body.email, name: req.body.name, passwordHash: await bcrypt.hash(req.body.password, 12), role: 'admin' });
  await signIn(req, res, u);
});

r.post('/login', validate(z.object({ email, password: z.string().min(1).max(200) })), async (req, res) => {
  const keys = ['e:' + req.body.email, 'i:' + ipOf(req)];
  await checkThrottle(keys);
  const u = await User.findOne({ email: req.body.email }).select('+passwordHash');
  const ok = u && u.active && u.passwordHash && await bcrypt.compare(req.body.password, u.passwordHash);
  if (!ok) { await failed(keys); throw unauthorized('That email and password do not match.'); }
  await cleared(keys); await signIn(req, res, u);
});

/** Sign in with Google: an ID token from Google Identity Services. Only people already added (or invited) get in. */
r.post('/google', validate(z.object({ credential: z.string().min(10).max(5000), invite: z.string().max(200).optional() })), async (req, res) => {
  if (!google) throw new HttpError(501, 'Google sign-in is not set up (GOOGLE_CLIENT_ID).');
  let p; try { p = (await google.verifyIdToken({ idToken: req.body.credential, audience: config.googleClientId })).getPayload(); } catch (e) { throw unauthorized('Google could not confirm this sign-in.'); }
  if (!p || !p.email || !p.email_verified) throw unauthorized('Your Google email is not verified.');
  const em = p.email.toLowerCase(), domain = em.split('@')[1];
  if (config.googleDomains.length && !config.googleDomains.includes(domain)) throw forbidden('This Google account is not from an allowed domain.');
  let u = await User.findOne({ $or: [{ googleId: p.sub }, { email: em }] });
  if (!u && req.body.invite) {
    const t = await findLink('invite', req.body.invite);
    if (!t || t.email !== em) throw forbidden('This invitation is for a different email, or it has expired.');
    u = await User.create({ email: em, name: p.name || '', googleId: p.sub, role: t.role, projects: t.projects, hideBudget: !!t.hideBudget, invitedBy: t.createdBy });
    t.usedAt = new Date(); await t.save();
  }
  if (!u) throw forbidden('No account for this Google email. Ask an admin to invite you.');
  if (!u.active) throw forbidden('This account has been switched off.');
  if (!u.googleId) u.googleId = p.sub; if (!u.name && p.name) u.name = p.name;
  await signIn(req, res, u);
});

/** Accept an invitation with a password. */
r.get('/invite/:token', async (req, res) => {
  const t = await findLink('invite', req.params.token); if (!t) throw bad('This invitation has expired or was already used.');
  res.json({ email: t.email, role: t.role });
});
r.post('/invite/:token', validate(z.object({ name, password })), async (req, res) => {
  const t = await findLink('invite', req.params.token); if (!t) throw bad('This invitation has expired or was already used.');
  if (await User.exists({ email: t.email })) throw bad('An account with this email already exists. Sign in instead.');
  const u = await User.create({ email: t.email, name: req.body.name, passwordHash: await bcrypt.hash(req.body.password, 12), role: t.role, projects: t.projects, hideBudget: !!t.hideBudget, invitedBy: t.createdBy });
  t.usedAt = new Date(); await t.save();
  await signIn(req, res, u);
});

/** Set a new password from a reset link (made by an admin). */
r.post('/reset/:token', validate(z.object({ password })), async (req, res) => {
  const t = await findLink('reset', req.params.token); if (!t) throw bad('This link has expired or was already used.');
  const u = await User.findById(t.user); if (!u || !u.active) throw bad('This account is not available.');
  u.passwordHash = await bcrypt.hash(req.body.password, 12); u.tokenVersion = (u.tokenVersion || 0) + 1;
  t.usedAt = new Date(); await t.save();
  await signIn(req, res, u);
});

r.post('/logout', (req, res) => { clearSession(res); res.json({ ok: true }); });

r.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toPublic(), features: config.features }));

r.patch('/me', requireAuth, validate(z.object({ name: name.optional(), currentPassword: z.string().max(200).optional(), newPassword: password.optional() })), async (req, res) => {
  const u = await User.findById(req.user._id).select('+passwordHash');
  if (req.body.name) u.name = req.body.name;
  if (req.body.newPassword) {
    if (u.passwordHash && !(req.body.currentPassword && await bcrypt.compare(req.body.currentPassword, u.passwordHash))) throw bad('Your current password is not right.');
    u.passwordHash = await bcrypt.hash(req.body.newPassword, 12); u.tokenVersion = (u.tokenVersion || 0) + 1;
  }
  await u.save(); setSession(res, u); res.json({ user: u.toPublic() });
});

/** Sign out on every device. */
r.post('/logout-all', requireAuth, async (req, res) => { await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } }); clearSession(res); res.json({ ok: true }); });

export default r;
