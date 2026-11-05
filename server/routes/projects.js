import { Router } from 'express';
import { z } from 'zod';
import { Project } from '../models/Project.js';
import { Creative } from '../models/Creative.js';
import { User } from '../models/User.js';
import { requireAuth, projectFilter, mayProject, mayEdit, mayManageProjects } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { forbidden, notFound, bad } from '../middleware/errors.js';
import { briefSchema } from '../lib/brief.js';

const r = Router();
r.use(requireAuth);

const view = (p, counts) => ({ id: String(p._id), name: p.name, developer: p.developer, brief: p.brief || {}, archived: p.archived, updatedAt: p.updatedAt,
  creatives: counts ? counts[String(p._id)] || { total: 0 } : undefined });

r.get('/', async (req, res) => {
  const f = Object.assign({ archived: req.query.archived === '1' }, projectFilter(req.user));
  const ps = await Project.find(f).sort({ name: 1 });
  const agg = await Creative.aggregate([{ $match: { project: { $in: ps.map(p => p._id) } } }, { $group: { _id: { p: '$project', s: '$status' }, n: { $sum: 1 } } }]);
  const counts = {}; agg.forEach(a => { const k = String(a._id.p), c = counts[k] || (counts[k] = { total: 0 }); c.total += a.n; c[a._id.s] = a.n; });
  res.json({ projects: ps.map(p => view(p, counts)) });
});

r.post('/', validate(z.object({ name: z.string().trim().min(2).max(160), developer: z.string().trim().max(160).optional().default(''), brief: briefSchema.optional() })), async (req, res) => {
  if (!mayManageProjects(req.user)) throw forbidden('Only admins and editors can add projects.');
  if (await Project.exists({ name: req.body.name })) throw bad('A project with this name already exists.');
  const p = await Project.create({ name: req.body.name, developer: req.body.developer, brief: Object.assign({}, req.body.brief || {}, { project: req.body.name, developer: req.body.developer || (req.body.brief || {}).developer || '' }), createdBy: req.user._id });
  // an editor limited to some projects gets access to the one they created
  if (req.user.role !== 'admin' && (req.user.projects || []).length) await User.updateOne({ _id: req.user._id }, { $addToSet: { projects: p._id } });
  res.status(201).json({ project: view(p) });
});

r.get('/:id', async (req, res) => {
  if (!mayProject(req.user, req.params.id)) throw notFound();
  const p = await Project.findById(req.params.id); if (!p) throw notFound();
  res.json({ project: view(p) });
});

r.patch('/:id', validate(z.object({ name: z.string().trim().min(2).max(160).optional(), developer: z.string().trim().max(160).optional(), brief: briefSchema.optional(), archived: z.boolean().optional() })), async (req, res) => {
  if (!mayProject(req.user, req.params.id)) throw notFound();
  if (!mayEdit(req.user)) throw forbidden('You can view this project but not change it.');
  if ((req.body.archived !== undefined || req.body.name) && !mayManageProjects(req.user)) throw forbidden('Only admins and editors can rename or archive projects.');
  const p = await Project.findById(req.params.id); if (!p) throw notFound();
  if (req.body.name && req.body.name !== p.name && await Project.exists({ name: req.body.name })) throw bad('A project with this name already exists.');
  ['name', 'developer', 'archived'].forEach(k => { if (req.body[k] !== undefined) p[k] = req.body[k]; });
  if (req.body.brief) { p.brief = Object.assign({}, req.body.brief, { project: p.name }); p.markModified('brief'); if (!p.developer && req.body.brief.developer) p.developer = req.body.brief.developer; }
  p.updatedBy = req.user._id; await p.save();
  res.json({ project: view(p) });
});

r.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') throw forbidden('Only admins can delete projects.');
  const p = await Project.findById(req.params.id); if (!p) throw notFound();
  if (await Creative.exists({ project: p._id })) throw bad('Archive the project instead: it still has creatives.');
  await p.deleteOne(); res.json({ ok: true });
});

export default r;
