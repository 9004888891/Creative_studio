// People and invitations (admins only).
import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { User, ROLES } from '../models/User.js';
import { Token } from '../models/Token.js';
import { Project } from '../models/Project.js';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { bad, notFound } from '../middleware/errors.js';
import { makeLink } from '../lib/tokens.js';

const r = Router();
r.use(requireRole('admin'));
const oid = z.string().refine(v => mongoose.isValidObjectId(v), 'not a valid id');
const access = { role: z.enum(ROLES), projects: z.array(oid).max(500).default([]), hideBudget: z.boolean().default(false) };
const checkProjects = async ids => { if (ids.length && (await Project.countDocuments({ _id: { $in: ids } })) !== ids.length) throw bad('One of the projects does not exist.'); };

r.get('/', async (req, res) => {
  const [users, invites] = await Promise.all([User.find().sort({ createdAt: 1 }), Token.find({ kind: 'invite', usedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean()]);
  res.json({ users: users.map(u => u.toPublic()), invites: invites.map(t => ({ id: String(t._id), email: t.email, role: t.role, projects: (t.projects || []).map(String), hideBudget: !!t.hideBudget, expiresAt: t.expiresAt })) });
});

/** Invite someone: returns a link to send them (valid 7 days). They set a password or use Google with the same email. */
r.post('/invite', validate(z.object({ email: z.string().trim().toLowerCase().email().max(200), ...access })), async (req, res) => {
  if (await User.exists({ email: req.body.email })) throw bad('This person already has an account.');
  await checkProjects(req.body.projects);
  await Token.deleteMany({ kind: 'invite', email: req.body.email, usedAt: null });
  const link = await makeLink('invite', { email: req.body.email, role: req.body.role, projects: req.body.projects, hideBudget: req.body.hideBudget, createdBy: req.user._id }, 24 * 7);
  res.status(201).json({ link });
});
r.delete('/invites/:id', async (req, res) => { await Token.deleteOne({ _id: req.params.id, kind: 'invite' }); res.json({ ok: true }); });

r.patch('/:id', validate(z.object({ role: access.role.optional(), projects: access.projects.optional(), hideBudget: z.boolean().optional(), active: z.boolean().optional(), name: z.string().trim().max(120).optional() })), async (req, res) => {
  const u = await User.findById(req.params.id); if (!u) throw notFound();
  const self = String(u._id) === String(req.user._id);
  if (self && (req.body.role && req.body.role !== 'admin' || req.body.active === false)) throw bad('You cannot remove your own admin access.');
  if (u.role === 'admin' && (req.body.role && req.body.role !== 'admin' || req.body.active === false) && (await User.countDocuments({ role: 'admin', active: true })) <= 1) throw bad('There must always be at least one active admin.');
  if (req.body.projects) await checkProjects(req.body.projects);
  const changedAccess = ['role', 'projects', 'active'].some(k => req.body[k] !== undefined);
  Object.assign(u, req.body); if (changedAccess && req.body.active === false) u.tokenVersion = (u.tokenVersion || 0) + 1;
  await u.save(); res.json({ user: u.toPublic() });
});

/** A one-time link (valid 24 hours) for this person to set a new password. */
r.post('/:id/reset-link', async (req, res) => {
  const u = await User.findById(req.params.id); if (!u || !u.active) throw notFound();
  await Token.deleteMany({ kind: 'reset', user: u._id, usedAt: null });
  res.status(201).json({ link: await makeLink('reset', { user: u._id, email: u.email, createdBy: req.user._id }, 24) });
});

/** Sign this person out everywhere. */
r.post('/:id/sign-out', async (req, res) => { await User.updateOne({ _id: req.params.id }, { $inc: { tokenVersion: 1 } }); res.json({ ok: true }); });

export default r;
