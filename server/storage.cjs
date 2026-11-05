// Where the creative library lives.
//
//   fileStorage(file)    one JSON file on disk (your own server, a VM, Docker with a volume). Default.
//   redisStorage(opts)   Redis over HTTPS (Upstash, e.g. added from the Vercel Marketplace). For Vercel and other
//                        serverless hosts, whose disks do not last. Reads KV_REST_API_URL / KV_REST_API_TOKEN
//                        (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN) from the environment.
//
// Both have the same shape: { load: async () => library | null, save: async library => void }.
const fs = require('fs'), path = require('path'), os = require('os');

function fileStorage(file) {
  const f = file || process.env.LIBRARY_FILE || path.join(os.homedir(), '.creative-studio', 'creative-library.json');
  return {
    async load() { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } },
    async save(lib) { fs.mkdirSync(path.dirname(f), { recursive: true }); const tmp = f + '.' + process.pid + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(lib)); fs.renameSync(tmp, f); },
  };
}

function redisStorage(opts = {}) {
  const url = (opts.url || process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  const token = opts.token || process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const key = opts.key || process.env.LIBRARY_KEY || 'creative-studio:library';
  const call = async cmd => {
    if (!url || !token) throw new Error('Set KV_REST_API_URL and KV_REST_API_TOKEN (connect an Upstash Redis store to the project).');
    const r = await fetch(url, { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error('Redis: ' + (j.error || r.status));
    return j.result;
  };
  return {
    async load() { const v = await call(['GET', key]); return v ? JSON.parse(v) : null; },
    async save(lib) { await call(['SET', key, JSON.stringify(lib)]); },
  };
}

module.exports = { fileStorage, redisStorage };
