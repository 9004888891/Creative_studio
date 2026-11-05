// Load an existing library (e.g. creative-library.json) into the deployed studio, once.
//   STUDIO_URL=https://your-studio.vercel.app STUDIO_AUTH=thomas:password node scripts/import-library.mjs creative-library.json
import fs from 'fs';
const file = process.argv[2], url = (process.env.STUDIO_URL || '').replace(/\/$/, ''), auth = process.env.STUDIO_AUTH;
if (!file || !url || !auth) { console.error('Usage: STUDIO_URL=https://… STUDIO_AUTH=user:password node scripts/import-library.mjs creative-library.json'); process.exit(1); }
const lib = JSON.parse(fs.readFileSync(file, 'utf8')), records = lib.records || lib, size = 300;
for (let i = 0; i < records.length; i += size) {
  const body = { records: records.slice(i, i + size), facts: i === 0 ? lib.facts || {} : undefined, briefs: i === 0 ? lib.briefs || undefined : undefined };
  const r = await fetch(url + '/api/creative-library', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(auth).toString('base64') }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) { console.error('Failed:', r.status, j.error || ''); process.exit(1); }
  console.log(`Imported ${Math.min(i + size, records.length)} of ${records.length} (library now ${j.records})`);
}
