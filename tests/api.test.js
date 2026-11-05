// API tests against a real MongoDB. Use a throwaway database: the tests delete everything in it.
//   TEST_MONGODB_URI="mongodb://127.0.0.1:27017/cs-test" npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const uri = process.env.TEST_MONGODB_URI;
const skip = !uri && 'set TEST_MONGODB_URI to a throwaway database to run the API tests';
let app, request, mongoose;

before(async () => {
  if (skip) return;
  Object.assign(process.env, { MONGODB_URI: uri, JWT_SECRET: 'test-secret-'.padEnd(48, 'x'), SETUP_KEY: 'let-me-in', APP_URL: 'http://app.test', NODE_ENV: 'test' });
  delete process.env.VERCEL; delete process.env.BLOB_READ_WRITE_TOKEN;
  ({ default: app } = await import('../server/app.js'));
  ({ default: request } = await import('supertest'));
  ({ default: mongoose } = await import('mongoose'));
  const { connectDb } = await import('../server/db.js');
  await connectDb(); await mongoose.connection.db.dropDatabase();
});
after(async () => { if (!skip) await mongoose.disconnect(); });

const H = { 'X-Requested-With': 'fetch' };
const agent = () => request.agent(app);
const send = (a, m, url, body) => a[m](url).set(H).send(body);

test('sign-in, roles and project access', { skip }, async () => {
  const anon = agent();
  assert.equal((await anon.get('/api/auth/status')).body.needsSetup, true);
  assert.equal((await send(anon, 'post', '/api/auth/setup', { name: 'Ad', email: 'admin@x.test', password: 'password-123' })).status, 403, 'setup needs the key');
  const admin = agent();
  assert.equal((await send(admin, 'post', '/api/auth/setup', { name: 'Ad', email: 'admin@x.test', password: 'password-123', setupKey: 'let-me-in' })).status, 200);
  assert.equal((await send(anon, 'post', '/api/auth/setup', { name: 'B', email: 'b@x.test', password: 'password-123', setupKey: 'let-me-in' })).status, 403, 'only once');

  // CSRF: a cross-site form post is refused
  assert.equal((await admin.post('/api/projects').set('Origin', 'https://evil.test').send({ name: 'Nope' })).status, 403);

  const a = (await send(admin, 'post', '/api/projects', { name: 'Harbourline Residences', developer: 'Harbourline' })).body.project;
  const b = (await send(admin, 'post', '/api/projects', { name: 'Other Towers', developer: 'Other' })).body.project;

  // invite a junior to project A only
  const inv = await send(admin, 'post', '/api/users/invite', { email: 'jr@x.test', role: 'junior', projects: [a.id], hideBudget: true });
  assert.equal(inv.status, 201);
  const token = inv.body.link.split('/invite/')[1];
  const jr = agent();
  assert.equal((await send(jr, 'post', '/api/auth/invite/' + token, { name: 'Jr', password: 'password-456' })).status, 200);
  assert.equal((await send(agent(), 'post', '/api/auth/invite/' + token, { name: 'Again', password: 'password-456' })).status >= 400, true, 'invite links work once');

  const list = (await jr.get('/api/projects')).body.projects.map(p => p.name);
  assert.deepEqual(list, ['Harbourline Residences']);
  assert.equal((await jr.get('/api/projects/' + b.id)).status, 404, 'junior cannot open an unassigned project');
  assert.equal((await jr.get(`/api/projects/${b.id}/creatives`)).status, 404);
  assert.equal((await send(jr, 'post', '/api/projects', { name: 'Mine' })).status, 403, 'juniors cannot add projects');
  assert.equal((await jr.get('/api/users')).status, 403);
  assert.equal((await jr.get('/api/auth/me')).body.user.hideBudget, true);

  // library: imported records land in the right project; the junior sees only theirs
  const lib = await send(admin, 'post', '/api/library', { records: [
    { name: 'A1', project: 'Harbourline Residences', brand: 'Harbourline', tags: { format: 'static' }, metrics: { spend: 1000, leads: 10 } },
    { name: 'B1', project: 'Other Towers', brand: 'Other', tags: { format: 'static' }, metrics: { spend: 500, leads: 2 } },
  ], briefs: { 'Harbourline Residences': { objective: 'leads', priceFrom: '1.2 Cr' } } });
  assert.equal(lib.status, 200); assert.equal(lib.body.saved, 2);
  const seen = (await jr.get('/api/library')).body;
  assert.deepEqual(seen.records.map(r => r.name), ['A1']);
  assert.equal(Object.keys(seen.briefs).join(), 'Harbourline Residences');
  assert.equal((await send(jr, 'post', '/api/library', { records: [{ name: 'B2', project: 'Other Towers', tags: {} }] })).body.saved, 0, 'cannot write into another project');

  // a person's tag correction is not overwritten by a later automatic guess
  await send(admin, 'post', '/api/library', { records: [{ name: 'A1', project: 'Harbourline Residences', tags: { format: 'static', offer: 'price' }, tagsBy: 'person' }] });
  await send(admin, 'post', '/api/library', { records: [{ name: 'A1', project: 'Harbourline Residences', tags: { format: 'video' }, tagsBy: 'ai' }] });
  const a1 = (await admin.get('/api/library')).body.records.find(r => r.name === 'A1');
  assert.equal(a1.tags.offer, 'price'); assert.equal(a1.metrics.leads, 10);

  // viewer: read-only
  const vi = await send(admin, 'post', '/api/users/invite', { email: 'view@x.test', role: 'viewer', projects: [a.id] });
  const viewer = agent(); await send(viewer, 'post', '/api/auth/invite/' + vi.body.link.split('/invite/')[1], { name: 'V', password: 'password-789' });
  assert.equal((await send(viewer, 'post', '/api/library', { records: [] })).status, 403);
  assert.equal((await send(viewer, 'post', `/api/projects/${a.id}/creatives`, { name: 'x', kind: 'image', files: [] })).status, 403);
  assert.equal((await send(viewer, 'post', '/api/ai/analyze', { prompt: 'x' })).status, 403);

  // creatives: files must belong to the project; juniors cannot approve
  assert.equal((await send(jr, 'post', `/api/projects/${a.id}/creatives`, { name: 'Bad', kind: 'image', files: [{ pathname: `projects/${b.id}/x.png` }] })).status, 400);
  const c = (await send(jr, 'post', `/api/projects/${a.id}/creatives`, { name: 'Hero', kind: 'image', files: [{ pathname: `projects/${a.id}/hero.png`, contentType: 'image/png' }] })).body.creative;
  assert.equal(c.files[0].url, `/api/files/${c.id}/0`);
  assert.equal((await send(jr, 'patch', '/api/creatives/' + c.id, { status: 'approved' })).status, 403);
  assert.equal((await send(jr, 'patch', '/api/creatives/' + c.id, { status: 'in_review', aiPart: { key: '0', value: { headline: 'x' } } })).body.creative.status, 'in_review');
  assert.equal((await send(admin, 'patch', '/api/creatives/' + c.id, { status: 'approved' })).body.creative.status, 'approved');
  const counts = (await admin.get('/api/projects')).body.projects.find(p => p.id === a.id).creatives;
  assert.equal(counts.approved, 1);

  // switching someone off ends their session at once
  const people = (await admin.get('/api/users')).body.users, jrId = people.find(u => u.email === 'jr@x.test').id;
  await send(admin, 'patch', '/api/users/' + jrId, { active: false });
  assert.equal((await jr.get('/api/projects')).status, 401);

  // wrong passwords are throttled
  let last; for (let i = 0; i < 9; i++) last = await send(agent(), 'post', '/api/auth/login', { email: 'admin@x.test', password: 'wrong-password' });
  assert.equal(last.status, 429);
});
