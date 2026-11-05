import { test } from 'node:test';
import assert from 'node:assert/strict';

test('the API refuses to start without its secrets', async () => {
  const keep = { ...process.env };
  delete process.env.MONGODB_URI; process.env.JWT_SECRET = 'short';
  const { configProblems } = await import('../server/config.js?x=' + Date.now());
  const p = configProblems();
  assert.ok(p.some(x => /MONGODB_URI/.test(x)));
  assert.ok(p.some(x => /JWT_SECRET/.test(x)));
  process.env = keep;
});
