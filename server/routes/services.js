// AI reading, voiceover transcription and ad results: all keys stay on the server.
import { Router } from 'express';
import { createRequire } from 'module';
import { Project } from '../models/Project.js';
import { requireAuth, mayProject, mayEdit } from '../middleware/auth.js';
import { forbidden, notFound } from '../middleware/errors.js';

const require = createRequire(import.meta.url);
const { createAnalyzeHandler } = require('../lib/analyze.cjs');
const { createTranscribeHandler } = require('../lib/transcribe.cjs');
const { createPerformanceProxy } = require('../lib/performance-proxy.cjs');

const r = Router();
r.use(requireAuth);
const analyze = createAnalyzeHandler(), transcribe = createTranscribeHandler(), perf = createPerformanceProxy({ allowProject: () => true });
const editors = (req, res, next) => (mayEdit(req.user) ? next() : next(forbidden('Viewers cannot run the AI reading.')));

r.post('/ai/analyze', editors, (req, res) => analyze(req, res));
r.post('/ai/transcribe', editors, (req, res) => transcribe(req, res));

r.get('/performance', async (req, res) => {
  const name = String(req.query.project || '').trim(); if (!name) return res.status(400).json({ error: 'Choose a project.' });
  const p = await Project.findOne({ name }).lean();
  if (!p || !mayProject(req.user, p._id)) throw notFound('Project not found.');
  // hideBudget hides spend and cost in the studio and its reports (can.budget = false); the figures still drive the results maths.
  return perf(req, res);
});

export default r;
