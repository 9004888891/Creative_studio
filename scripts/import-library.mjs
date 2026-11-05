// Import an existing creative library (creative-library.json: { records, facts, briefs }) into the app.
// Signs in as you through the API, so the same permissions apply. Projects that do not exist yet are created
// (admins and editors). Run once per library file; running again updates records by project + name.
//
//   npm run import-library -- creative-library.json https://your-app.vercel.app you@company.com
//   (the password is read from IMPORT_PASSWORD, or asked for)
import './env.mjs';
import fs from 'fs';
import readline from 'readline';

const [file, base0, email] = process.argv.slice(2);
if (!file || !base0 || !email) { console.error('Usage: npm run import-library -- creative-library.json https://your-app.vercel.app you@company.com'); process.exit(1); }
const base = base0.replace(/\/$/, '');
const ask = q => new Promise(ok => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, a => { rl.close(); ok(a); }); });
const password = process.env.IMPORT_PASSWORD || await ask('Password: ');
const lib = JSON.parse(fs.readFileSync(file, 'utf8')), records = (lib.records || (Array.isArray(lib) ? lib : [])).map(r => Object.assign({}, r, { source: 'import' }));

let cookie = '';
const call = async (path, body) => {
  const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', Origin: base, Cookie: cookie }, body: JSON.stringify(body) });
  const set = r.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.status); return j;
};
await call('/api/auth/login', { email, password });
console.log(`Signed in. Importing ${records.length} creatives…`);
const size = 200; let saved = 0, skipped = 0;
for (let i = 0; i < records.length; i += size) {
  const part = records.slice(i, i + size), names = new Set(part.map(r => r.project));
  const pick = o => Object.fromEntries(Object.entries(o || {}).filter(([k]) => names.has(k)));
  const j = await call('/api/library', { records: part, facts: pick(lib.facts), briefs: pick(lib.briefs) });
  saved += j.saved; skipped += j.skipped; process.stdout.write(`  ${Math.min(i + size, records.length)}/${records.length}\r`);
}
console.log(`\nDone: ${saved} saved, ${skipped} skipped (projects you cannot see, or studio creatives without files).`);
