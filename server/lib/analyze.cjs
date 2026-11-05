// Server side of the AI reading. Keeps your Anthropic API key on the server.
// Works with plain Node http, Express, Fastify (via raw req/res) or Next.js API routes.
//
//   const { createAnalyzeHandler } = require('./server/analyze.cjs');
//   app.post('/api/creative-analyze', requireLogin, createAnalyzeHandler());   // Express
//
// Environment: ANTHROPIC_API_KEY (required), ANTHROPIC_MODEL (optional).
// Node 18+ (uses the built-in fetch).

const DEFAULT_MODEL = 'claude-sonnet-5-5';
const MAX_BYTES = 12 * 1024 * 1024;

/** Analyse one creative. image: data URL (png / jpeg / webp / gif); prompt: from aiPrompt(). Resolves to the parsed JSON. */
async function analyzeCreative({ image, prompt }, opts = {}) {
  const key = opts.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) { const e = new Error('The AI reading needs ANTHROPIC_API_KEY on the server. The heatmap and scores work without it.'); e.status = 501; throw e; }
  const m = String(image || '').match(/^data:(image\/(?:png|jpeg|webp|gif));base64,(.+)$/);
  if (!m || !prompt) { const e = new Error('An image and a prompt are needed.'); e.status = 400; throw e; }
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: opts.model || process.env.ANTHROPIC_MODEL || DEFAULT_MODEL, max_tokens: 4096,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
        { type: 'text', text: String(prompt).slice(0, 20000) },
      ] }],
    }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('The AI service returned an error: ' + ((out.error && out.error.message) || r.status)); e.status = 502; throw e; }
  const text = (out.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  try { return JSON.parse(text.slice(a, b + 1)); }
  catch (e) { const err = new Error('The AI reply could not be read. Try again.'); err.status = 502; throw err; }
}

function readJson(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);   // already parsed (Express json(), Next.js)
  return new Promise((ok, bad) => {
    let n = 0; const parts = [];
    req.on('data', c => { n += c.length; if (n > MAX_BYTES) { bad(Object.assign(new Error('The image is too large.'), { status: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { ok(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch (e) { bad(Object.assign(new Error('Bad request'), { status: 400 })); } });
    req.on('error', bad);
  });
}

/** (req, res) handler: POST { prompt, image } → 200 { result } or { error }. Put your own login check in front of it. */
function createAnalyzeHandler(opts = {}) {
  return async function analyzeHandler(req, res) {
    const send = (code, obj) => {
      if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(code).json(obj);
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj));
    };
    if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
    try { const body = await readJson(req); return send(200, { result: await analyzeCreative(body, opts) }); }
    catch (e) { return send(e.status || 500, { error: e.message || 'The AI reading failed.' }); }
  };
}

module.exports = { analyzeCreative, createAnalyzeHandler };
