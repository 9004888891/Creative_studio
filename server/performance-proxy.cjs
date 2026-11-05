// Relay for creative performance: your dashboard's backend fetches from Realty Funnel Desk (or any
// dashboard with the same JSON shape) with an API token, so the token never reaches the browser.
//
//   const { createPerformanceProxy } = require('./creative-heatmap/server/performance-proxy.cjs');
//   app.get('/api/creative-performance', requireLogin, createPerformanceProxy({
//     source: 'https://rfd.example.com/api/creative-performance',   // PERF_SOURCE_URL
//     token: process.env.PERF_API_TOKEN,                              // the same value as PERF_API_TOKEN on Realty Funnel Desk
//   }));
//
// Then in the browser: performanceFeed: { url: '/api/creative-performance?project=Harbourline Residences&from=2026-09-01&to=2026-09-30' }
// Response: { project, from, to, rows: [{ name, platform, campaign, spend, impressions, clicks, leads, ql, sv }], average }

function createPerformanceProxy(opts = {}) {
  const source = opts.source || process.env.PERF_SOURCE_URL, token = opts.token || process.env.PERF_API_TOKEN;
  const allowed = new Set(['project', 'from', 'to']);
  return async function performanceProxy(req, res) {
    const send = (code, obj) => {
      if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(code).json(obj);
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj));
    };
    if (!source || !token) return send(501, { error: 'Set PERF_SOURCE_URL and PERF_API_TOKEN on this server.' });
    try {
      const inUrl = new URL(req.url, 'http://x'), out = new URL(source);
      for (const [k, v] of inUrl.searchParams) if (allowed.has(k)) out.searchParams.set(k, v);
      if (typeof opts.allowProject === 'function' && out.searchParams.get('project') && !(await opts.allowProject(req, out.searchParams.get('project'))))
        return send(403, { error: 'You cannot see this project.' });
      const r = await fetch(out, { headers: { Authorization: 'Bearer ' + token } });
      const j = await r.json().catch(() => ({ error: 'The performance source sent an unreadable reply.' }));
      return send(r.status, j);
    } catch (e) { return send(502, { error: 'The performance source could not be reached.' }); }
  };
}

module.exports = { createPerformanceProxy };
