// The creative library the studio learns from: every creative with its elements and results, plus project details
// and briefs. GET feeds the Learning view and recommendations; POST is how the studio (and the import script) saves.
import { Router } from 'express';
import { z } from 'zod';
import { Creative } from '../models/Creative.js';
import { Project } from '../models/Project.js';
import { requireAuth, projectFilter, mayProject, mayEdit, mayManageProjects } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { forbidden } from '../middleware/errors.js';
import { briefSchema } from '../lib/brief.js';

const r = Router();
r.use(requireAuth);
const keyOf = (project, name) => `${String(project).toLowerCase()}|${String(name).trim().toLowerCase()}`;

r.get('/', async (req, res) => {
  const ps = await Project.find(Object.assign({ archived: false }, projectFilter(req.user))).lean();
  const byId = new Map(ps.map(p => [String(p._id), p]));
  const cs = await Creative.find({ project: { $in: ps.map(p => p._id) } }).select('project name kind source tags tagsBy headlineText hash metrics createdAt extra').lean();
  const records = cs.map(c => { const p = byId.get(String(c.project));
    return Object.assign({}, c.extra || {}, { id: String(c._id), name: c.name, brand: p.developer || (p.brief || {}).developer || '', project: p.name, cohort: p.name, source: c.source, kind: c.kind,
      tags: c.tags || undefined, tagsBy: c.tagsBy || undefined, headlineText: c.headlineText || '', hash: c.hash || undefined, metrics: c.metrics || null, addedAt: c.createdAt }); });
  const facts = Object.fromEntries(ps.map(p => [p.name, Object.assign({}, p.facts || {}, { project: p.name, developer: p.developer || (p.facts || {}).developer || '' })]));
  const briefs = Object.fromEntries(ps.filter(p => p.brief && Object.keys(p.brief).length).map(p => [p.name, p.brief]));
  res.set('Cache-Control', 'private, no-store');
  res.json({ records, facts, briefs });
});

const rec = z.object({ name: z.string().trim().min(1).max(200), project: z.string().trim().max(160).optional().default(''), brand: z.string().max(160).optional(), kind: z.string().max(20).optional(),
  source: z.string().max(20).optional(), tags: z.any().optional(), tagsBy: z.string().max(10).optional(), headlineText: z.string().max(2000).optional(), hash: z.string().max(32).optional(), metrics: z.any().optional() }).passthrough();

r.post('/', validate(z.object({ records: z.array(rec).max(2000).default([]), facts: z.record(z.string(), z.any()).optional(), briefs: z.record(z.string(), z.any()).optional() })), async (req, res) => {
  if (!mayEdit(req.user)) throw forbidden('You can view the library but not add to it.');
  const u = req.user, names = [...new Set(req.body.records.map(x => x.project).concat(Object.keys(req.body.briefs || {}), Object.keys(req.body.facts || {})).filter(Boolean))];
  const ps = await Project.find({ name: { $in: names } });
  const byName = new Map(ps.map(p => [p.name.toLowerCase(), p]));
  // an imported library may name projects that are not set up yet: admins and editors can create them
  for (const n of names) if (!byName.has(n.toLowerCase()) && mayManageProjects(u) && req.body.records.some(x => x.project === n)) {
    const brand = (req.body.records.find(x => x.project === n) || {}).brand || '';
    const p = await Project.create({ name: n, developer: brand, brief: { project: n, developer: brand }, createdBy: u._id }); byName.set(n.toLowerCase(), p);
  }
  const allowed = p => p && !p.archived && mayProject(u, p._id);
  let saved = 0, skipped = 0;
  const existing = await Creative.find({ project: { $in: [...byName.values()].map(p => p._id) } });
  const have = new Map(existing.map(c => [keyOf(c.project, c.name), c]));
  for (const x of req.body.records) {
    const p = byName.get(String(x.project).toLowerCase()); if (!allowed(p)) { skipped++; continue; }
    const c = have.get(keyOf(p._id, x.name));
    const hasRes = x.metrics && +x.metrics.spend > 0, personTags = c && c.tagsBy === 'person' && x.tagsBy !== 'person';
    const { name, project, brand, kind, source, tags, tagsBy, headlineText, hash, metrics, id, cohort, addedAt, ...rest } = x;
    if (c) {
      if (tags && !personTags) { c.tags = tags; c.tagsBy = tagsBy || c.tagsBy; c.markModified('tags'); }
      if (headlineText) c.headlineText = headlineText; if (hash) c.hash = hash;
      if (hasRes) { c.metrics = metrics; c.markModified('metrics'); }
      if (c.source === 'import' && Object.keys(rest).length) { c.extra = Object.assign({}, c.extra || {}, rest); c.markModified('extra'); }
      c.updatedBy = u._id; await c.save();
    } else if (source !== 'studio') {   // studio creatives are created with their files first; anything else is an imported record
      const n = await Creative.create({ project: p._id, name, kind: ['image', 'carousel', 'video'].includes(kind) ? kind : (tags && tags.format === 'video' ? 'video' : tags && tags.format === 'carousel' ? 'carousel' : 'image'),
        source: 'import', tags: tags || null, tagsBy: tagsBy || null, headlineText: headlineText || '', hash, metrics: hasRes ? metrics : null, extra: rest, createdBy: u._id, updatedBy: u._id });
      have.set(keyOf(p._id, name), n);
    } else { skipped++; continue; }
    saved++;
  }
  for (const [n, b] of Object.entries(req.body.briefs || {})) { const p = byName.get(n.toLowerCase()); if (!allowed(p)) continue; const v = briefSchema.safeParse(b || {}); if (v.success) { p.brief = Object.assign({}, v.data, { project: p.name }); p.markModified('brief'); p.updatedBy = u._id; await p.save(); } }
  for (const [n, f] of Object.entries(req.body.facts || {})) { const p = byName.get(n.toLowerCase()); if (!allowed(p) || !f || typeof f !== 'object') continue; const s = JSON.stringify(f); if (s.length > 20000) continue; p.facts = Object.assign({}, p.facts || {}, JSON.parse(s)); p.markModified('facts'); await p.save(); }
  res.json({ ok: true, saved, skipped, records: await Creative.countDocuments({ project: { $in: [...byName.values()].map(p => p._id) } }) });
});

export default r;
