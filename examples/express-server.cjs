// Express: the AI reading route, behind your own login check.
const express = require('express');
const { createAnalyzeHandler } = require('../server/analyze.cjs');
const { createPerformanceProxy } = require('../server/performance-proxy.cjs');
const { createLibraryStore } = require('../server/library-store.cjs');

const app = express();
app.use(express.json({ limit: '12mb' }));            // creatives are sent as data URLs
const requireLogin = (req, res, next) => (req.session && req.session.user) ? next() : res.status(401).json({ error: 'Sign in first.' });
app.post('/api/creative-analyze', requireLogin, createAnalyzeHandler());   // reads ANTHROPIC_API_KEY
// creative results down to site visits, from Realty Funnel Desk (token stays on this server)
app.get('/api/creative-performance', requireLogin, createPerformanceProxy({ source: process.env.PERF_SOURCE_URL, token: process.env.PERF_API_TOKEN }));
// The creative library: the studio's memory across brands. Each person sees and adds only the projects they are assigned to.
const assigned = (req, project) => { const u = req.session.user; return u.role === 'admin' || (u.projects || []).includes(project); };
const library = createLibraryStore({
  file: process.env.LIBRARY_FILE || '/var/data/creative-library.json',   // outside any static folder
  seed: process.env.LIBRARY_SEED,                                          // e.g. your tagged library to start from
  canRead: (req, record) => assigned(req, record.project),
  canWrite: req => req.session.user.role !== 'viewer',
});
app.get('/api/creative-library', requireLogin, library);
app.post('/api/creative-library', requireLogin, library);
app.listen(3000);
