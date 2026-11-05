// The creative library on your server: the studio's memory of past creatives, their elements and results.
//
//   GET  /api/creative-library   → { records: [...], facts: { [project]: details } }
//   POST /api/creative-library   ← { records: [...], facts: {...}, briefs: { [project]: brief } }   (adds or updates by brand + project + name)
//
// The studio POSTs its creatives (tags, headline, and results once matched) whenever something changes, so every
// creative added across brands joins the library and the Learning view keeps learning from it.
//
//   const { createLibraryStore } = require('./server/library-store.cjs');
//   const library = createLibraryStore({
//     file: '/var/data/creative-library.json',          // keep it outside any folder you serve as static files
//     seed: './creative-library.json',                   // optional: the starting library, copied on first run
//     canRead: (req, record) => userMaySee(req, record.brand, record.project),   // e.g. juniors see only their projects
//     canWrite: req => req.session && req.session.user && req.session.user.role !== 'viewer',
//   });
//   app.get('/api/creative-library', requireLogin, library);
//   app.post('/api/creative-library', requireLogin, library);
//
// Works with Express, a plain Node http server or a Vercel function. By default the library is one JSON file
// (atomic writes, serialised). On hosts without a lasting disk (Vercel, other serverless), pass a storage adapter
// from ./storage.cjs instead, e.g. createLibraryStore({ storage: redisStorage() }).
const { fileStorage } = require('./storage.cjs');

const MAX_BODY = 4 * 1024 * 1024, MAX_RECORDS = 20000;   // 4 MB keeps under serverless request limits; import big libraries in batches
const keyOf = r => [r.brand, r.project, r.name].map(s => String(s || '').trim().toLowerCase()).join('|');
const clean = (v, depth = 0) => {   // plain JSON only, bounded
  if (depth > 6) return null;
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.slice(0, 2000);
  if (Array.isArray(v)) return v.slice(0, 50).map(x => clean(x, depth + 1));
  if (typeof v === 'object') { const o = {}; Object.keys(v).slice(0, 60).forEach(k => { if (k !== '__proto__' && k !== 'constructor') o[k] = clean(v[k], depth + 1); }); return o; }
  return null;
};

function createLibraryStore(opts = {}) {
  const storage = opts.storage || fileStorage(opts.file);
  const canRead = opts.canRead || (() => true), canWrite = opts.canWrite || (() => true);
  let chain = Promise.resolve();

  const load = async () => {
    const lib = await storage.load(); if (lib && Array.isArray(lib.records)) return Object.assign({ facts: {}, briefs: {} }, lib);
    const seed = opts.seed || process.env.LIBRARY_SEED;
    if (seed) { try { const j = JSON.parse(require('fs').readFileSync(seed, 'utf8')); return { records: j.records || [], facts: j.facts || {}, briefs: j.briefs || {} }; } catch (e) { console.error('Library seed could not be read:', e.message); } }
    return { records: [], facts: {}, briefs: {} };
  };
  const save = lib => storage.save(lib);

  const send = (res, code, obj) => {
    if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(code).json(obj);
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj));
  };
  const body = req => req.body && typeof req.body === 'object' ? Promise.resolve(req.body) : new Promise((ok, bad) => {
    let n = 0; const parts = [];
    req.on('data', c => { n += c.length; if (n > MAX_BODY) { bad(Object.assign(new Error('too large'), { code: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { bad(Object.assign(new Error('bad json'), { code: 400 })); } });
    req.on('error', bad);
  });

  /** Merge records into the library: newer details win, results are never wiped by a record that has none. */
  function merge(lib, incoming, facts, briefs) {
    const byKey = new Map(lib.records.map(r => [keyOf(r), r])), now = new Date().toISOString();
    incoming.forEach(r0 => {
      const r = clean(r0); if (!r || !r.name) return;
      const k = keyOf(r), old = byKey.get(k);
      const next = Object.assign({}, old || {}, r, { updatedAt: now });
      if (old && old.metrics && !(r.metrics && +r.metrics.spend > 0)) next.metrics = old.metrics;
      if (old && old.tagsBy === 'person' && r.tagsBy !== 'person') { next.tags = old.tags; next.tagsBy = 'person'; }   // a person's correction beats a later guess
      if (!old) next.firstSeen = now;
      byKey.set(k, next);
    });
    lib.records = [...byKey.values()].slice(-MAX_RECORDS);
    if (facts && typeof facts === 'object') Object.entries(clean(facts) || {}).forEach(([p, f]) => { if (p && f && typeof f === 'object') lib.facts[p] = Object.assign({}, lib.facts[p] || {}, f); });
    if (briefs && typeof briefs === 'object') { lib.briefs = lib.briefs || {}; Object.entries(clean(briefs) || {}).forEach(([p, b]) => { if (p && b && typeof b === 'object') lib.briefs[p] = b; }); }
    lib.updated = now; return lib;
  }

  return async function libraryStore(req, res) {
    try {
      if (req.method === 'GET') {
        const lib = await load(), records = lib.records.filter(r => { try { return canRead(req, r); } catch (e) { return false; } });
        const projects = new Set(records.map(r => r.project));
        const facts = Object.fromEntries(Object.entries(lib.facts || {}).filter(([p, f]) => projects.has(p) || (() => { try { return canRead(req, Object.assign({ project: p }, f)); } catch (e) { return false; } })()));
        const briefs = Object.fromEntries(Object.entries(lib.briefs || {}).filter(([p]) => { try { return canRead(req, { project: p }); } catch (e) { return false; } }));
        return send(res, 200, { records, facts, briefs, updated: lib.updated || null });
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        if (!canWrite(req)) return send(res, 403, { error: 'You can view the library but not add to it.' });
        const b = await body(req), recs = Array.isArray(b.records) ? b.records : [];
        if (recs.some(r => { try { return !canRead(req, r); } catch (e) { return true; } })) return send(res, 403, { error: 'Some creatives belong to projects you are not assigned to.' });
        let count = 0;
        chain = chain.then(async () => { const lib = merge(await load(), recs, b.facts, b.briefs); await save(lib); count = lib.records.length; });
        await chain;
        return send(res, 200, { ok: true, records: count });
      }
      return send(res, 405, { error: 'Use GET or POST.' });
    } catch (e) {
      chain = Promise.resolve();
      return send(res, e.code === 413 ? 413 : e.code === 400 ? 400 : 500, { error: e.code === 413 ? 'The library update is too large.' : e.code === 400 ? 'The library update could not be read.' : 'The library could not be saved.' });
    }
  };
}

module.exports = { createLibraryStore };
module.exports.storage = require('./storage.cjs');
