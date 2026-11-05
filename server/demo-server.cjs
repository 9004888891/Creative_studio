// Demo: node server/demo-server.cjs  →  http://localhost:8080/demo/
// Serves the demo page and the built files, and the AI endpoint at /api/creative-analyze
// (set ANTHROPIC_API_KEY to try the AI reading; the heatmap works without it), and /api/creative-performance
// relayed from Realty Funnel Desk when PERF_SOURCE_URL and PERF_API_TOKEN are set, and the creative library at /api/creative-library.
const http = require('http'), fs = require('fs'), path = require('path');
const { createAnalyzeHandler } = require('./analyze.cjs');
const { createPerformanceProxy } = require('./performance-proxy.cjs');
const { createTranscribeHandler } = require('./transcribe.cjs');
const { createLibraryStore } = require('./library-store.cjs');
const ROOT = path.join(__dirname, '..'), PORT = +process.env.PORT || 8080;
// The demo library starts from the made-up sample and is kept in the temp folder (set LIBRARY_FILE to keep it elsewhere).
const library = createLibraryStore({ file: process.env.LIBRARY_FILE || path.join(require('os').tmpdir(), 'creative-studio-demo-library.json'), seed: process.env.LIBRARY_SEED || path.join(ROOT, 'examples', 'creative-library.sample.json') });
const TYPES = { '.webm': 'video/webm', '.mp4': 'video/mp4', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const analyze = createAnalyzeHandler(), perf = createPerformanceProxy(), transcribe = createTranscribeHandler();   // perf: set PERF_SOURCE_URL and PERF_API_TOKEN
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/api/creative-analyze') return analyze(req, res);
  if (p === '/api/creative-performance') return perf(req, res);
  if (p === '/api/creative-transcribe') return transcribe(req, res);   // set TRANSCRIBE_API_KEY
  if (p === '/api/creative-library') return library(req, res);
  let f = path.normalize(path.join(ROOT, p === '/' ? '/demo/index.html' : p));
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  fs.readFile(f, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(buf);
  });
}).listen(PORT, () => console.log(`Creative heatmap demo: http://localhost:${PORT}/demo/`));
