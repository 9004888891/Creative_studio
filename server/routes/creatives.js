// Creatives: their files (in private Vercel Blob), AI readings, tags, checks and approval status.
import { Router } from 'express';
import mongoose from 'mongoose';
import { Readable } from 'node:stream';
import { z } from 'zod';
import { handleUpload } from '@vercel/blob/client';
import { get as blobGet, del as blobDel } from '@vercel/blob';
import { config } from '../config.js';
import { Creative, STATUSES } from '../models/Creative.js';
import { Project } from '../models/Project.js';
import { requireAuth, mayProject, mayEdit } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { bad, forbidden, notFound, HttpError } from '../middleware/errors.js';

const r = Router();
r.use(requireAuth);
const json = z.any().refine(v => JSON.stringify(v === undefined ? null : v).length < 400000, 'is too large');
const file = z.object({ pathname: z.string().max(600), contentType: z.string().max(100).optional(), size: z.number().nonnegative().optional(), name: z.string().max(300).optional() });

async function projectFor(req, id) { if (!mongoose.isValidObjectId(id) || !mayProject(req.user, id)) throw notFound('Project not found.'); const p = await Project.findById(id); if (!p || p.archived && req.method !== 'GET') throw notFound('Project not found.'); return p; }
async function creativeFor(req, id) { if (!mongoose.isValidObjectId(id)) throw notFound(); const c = await Creative.findById(id); if (!c || !mayProject(req.user, c.project)) throw notFound(); return c; }
const view = c => ({ id: String(c._id), project: String(c.project), name: c.name, kind: c.kind, source: c.source, files: (c.files || []).map((f, i) => ({ url: `/api/files/${c._id}/${i}`, contentType: f.contentType, name: f.name, size: f.size })),
  duration: c.duration, ai: c.ai || {}, tags: c.tags, tagsBy: c.tagsBy, headlineText: c.headlineText, hash: c.hash, metrics: c.metrics, perfName: c.perfName, qcManual: c.qcManual || {}, qcVisual: c.qcVisual,
  transcript: c.transcript, status: c.status, statusAt: c.statusAt, createdAt: c.createdAt, updatedAt: c.updatedAt });

r.get('/projects/:pid/creatives', async (req, res) => {
  const p = await projectFor(req, req.params.pid);
  const cs = await Creative.find({ project: p._id, source: 'studio' }).sort({ createdAt: 1 });
  res.json({ creatives: cs.map(view) });
});

/** Browser uploads go straight to the private Blob store; this only hands out a short-lived, limited upload token. */
r.post('/uploads', async (req, res) => {
  if (!config.features.uploads) throw new HttpError(501, 'File storage is not set up (connect a private Vercel Blob store).');
  if (!mayEdit(req.user)) throw forbidden();
  const out = await handleUpload({
    body: req.body, request: req,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      let pl = {}; try { pl = JSON.parse(clientPayload || '{}'); } catch (e) { /* checked below */ }
      if (!pl.project || !mongoose.isValidObjectId(pl.project) || !mayProject(req.user, pl.project)) throw forbidden('Not allowed to upload to this project.');
      if (!String(pathname).startsWith(`projects/${pl.project}/`) || pathname.includes('..')) throw bad('Upload path not allowed.');
      return { allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'], maximumSizeInBytes: config.maxUploadMb * 1024 * 1024, addRandomSuffix: true, tokenPayload: JSON.stringify({ user: String(req.user._id), project: pl.project }) };
    },
  });
  res.json(out);
});

r.post('/projects/:pid/creatives', validate(z.object({ name: z.string().trim().min(1).max(200), kind: z.enum(['image', 'carousel', 'video']), files: z.array(file).max(20).default([]), duration: z.number().optional(),
  ai: json.optional(), tags: json.optional(), tagsBy: z.enum(['person', 'ai', 'auto']).optional(), headlineText: z.string().max(2000).optional(), hash: z.string().max(32).optional() })), async (req, res) => {
  const p = await projectFor(req, req.params.pid); if (!mayEdit(req.user)) throw forbidden();
  if (req.body.files.some(f => !f.pathname.startsWith(`projects/${p._id}/`))) throw bad('Those files do not belong to this project.');
  const c = await Creative.create(Object.assign({}, req.body, { project: p._id, source: 'studio', createdBy: req.user._id, updatedBy: req.user._id }));
  res.status(201).json({ creative: view(c) });
});

r.get('/creatives/:id', async (req, res) => res.json({ creative: view(await creativeFor(req, req.params.id)) }));

r.patch('/creatives/:id', validate(z.object({ name: z.string().trim().min(1).max(200).optional(), aiPart: z.object({ key: z.string().max(20).regex(/^[\w-]+$/), value: json }).optional(),
  tags: json.optional(), tagsBy: z.enum(['person', 'ai', 'auto']).optional(), headlineText: z.string().max(2000).optional(), hash: z.string().max(32).optional(), perfName: z.string().max(300).nullable().optional(),
  qcManual: z.record(z.string().max(80), z.boolean()).optional(), qcVisual: z.string().max(20).nullable().optional(), transcript: json.optional(), status: z.enum(STATUSES).optional(), duration: z.number().optional() })), async (req, res) => {
  const c = await creativeFor(req, req.params.id); if (!mayEdit(req.user)) throw forbidden();
  const b = req.body;
  if (b.status && b.status !== c.status) {
    if (['approved', 'changes'].includes(b.status) && !['admin', 'editor'].includes(req.user.role)) throw forbidden('Only admins and editors can approve or send back creatives.');
    c.status = b.status; c.statusBy = req.user._id; c.statusAt = new Date();
  }
  if (b.aiPart) { c.ai = Object.assign({}, c.ai || {}, { [b.aiPart.key]: b.aiPart.value }); c.markModified('ai'); }
  ['name', 'tags', 'tagsBy', 'headlineText', 'hash', 'perfName', 'qcManual', 'qcVisual', 'transcript', 'duration'].forEach(k => { if (b[k] !== undefined) { c[k] = b[k]; if (['tags', 'qcManual', 'transcript'].includes(k)) c.markModified(k); } });
  c.updatedBy = req.user._id; await c.save();
  res.json({ creative: view(c) });
});

r.delete('/creatives/:id', async (req, res) => {
  const c = await creativeFor(req, req.params.id);
  if (!(['admin', 'editor'].includes(req.user.role) || String(c.createdBy) === String(req.user._id) && mayEdit(req.user))) throw forbidden('Only admins, editors or the person who added it can delete a creative.');
  const paths = (c.files || []).map(f => f.pathname);
  if (paths.length && config.features.uploads) { try { await blobDel(paths); } catch (e) { console.error('[blob] delete failed', e.message); } }
  await c.deleteOne(); res.json({ ok: true });
});

/** Files are private: they are streamed through here, after the access check, never linked directly. */
r.get('/files/:id/:i', async (req, res) => {
  const c = await creativeFor(req, req.params.id), f = (c.files || [])[Number(req.params.i)];
  if (!f) throw notFound();
  const out = await blobGet(f.pathname, { access: 'private', ifNoneMatch: req.get('if-none-match') || undefined });
  if (!out) throw notFound();
  res.set({ 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff', ETag: out.blob.etag });
  if (out.statusCode === 304) return res.status(304).end();
  if (out.statusCode !== 200) throw notFound();
  res.set('Content-Type', out.blob.contentType || f.contentType || 'application/octet-stream');
  Readable.fromWeb(out.stream).pipe(res);
});

export default r;
