// Browser test of the built app: first admin, a project, an invited junior, the studio and learning pages.
// Needs the app running (SERVE_APP=1 npm start) on an empty database:  E2E_URL=http://localhost:3001 node tests/e2e/app.e2e.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const URL0 = process.env.E2E_URL || 'http://localhost:3001', KEY = process.env.SETUP_KEY || 'smoke';
const browser = await chromium.launch(), problems = [];
const page = async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } }), p = await ctx.newPage();
  p.on('pageerror', e => problems.push('page error: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) problems.push('console: ' + m.text()); });
  return p;
};
const step = async (name, fn) => { process.stdout.write(`- ${name} … `); await fn(); console.log('ok'); };
const field = (p, label) => p.getByLabel(label, { exact: true });

const admin = await page();
await step('first admin is created with the setup key', async () => {
  await admin.goto(URL0);
  await admin.getByRole('heading', { name: 'Set up Creative Studio' }).waitFor();
  await field(admin, 'Your name').fill('Asha Admin');
  await field(admin, 'Email').fill('admin@example.test');
  await field(admin, 'Password').fill('admin-password-1');
  await field(admin, 'Setup key').fill('wrong');
  await admin.getByRole('button', { name: 'Create admin account' }).click();
  await admin.getByText('That setup key is not right.').waitFor();
  await field(admin, 'Setup key').fill(KEY);
  await admin.getByRole('button', { name: 'Create admin account' }).click();
  await admin.getByRole('heading', { name: 'Projects' }).waitFor();
});

await step('admin creates two projects', async () => {
  for (const [name, dev] of [['Harbourline Residences', 'Harbourline'], ['Cedar Point', 'Cedar']]) {
    await admin.goto(URL0 + '/');
    await admin.getByRole('button', { name: 'New project' }).click();
    await field(admin, 'Project name').fill(name);
    await field(admin, 'Developer / brand').fill(dev);
    await admin.getByRole('button', { name: 'Create project' }).click();
    await admin.getByRole('heading', { name }).waitFor();
    await admin.locator('.chm').first().waitFor();   // the studio engine is drawn
  }
});

let invite;
await step('admin invites a junior to one project', async () => {
  await admin.getByRole('link', { name: 'People' }).click();
  await field(admin, 'Email').fill('junior@example.test');
  await admin.getByLabel('Role').selectOption('junior');
  await admin.getByLabel('Harbourline Residences').check();
  await admin.getByRole('button', { name: 'Create invite link' }).click();
  invite = await admin.getByLabel('Link').inputValue();
  assert.match(invite, /\/invite\/[\w-]{20,}$/);
});

const junior = await page();
await step('junior joins and sees only their project', async () => {
  await junior.goto(invite.replace(/^https?:\/\/[^/]+/, URL0));
  await junior.getByText(/invited as Junior/).waitFor();
  await field(junior, 'Your name').fill('Jay Junior');
  await field(junior, 'Password').fill('junior-password-1');
  await junior.getByRole('button', { name: 'Join' }).click();
  await junior.getByRole('heading', { name: 'Projects' }).waitFor();
  await junior.getByText('Harbourline Residences').waitFor();
  assert.equal(await junior.getByText('Cedar Point').count(), 0);
  assert.equal(await junior.getByRole('link', { name: 'People' }).count(), 0);
  assert.equal(await junior.getByRole('button', { name: 'New project' }).count(), 0);
});

await step('junior cannot open the other project by its address', async () => {
  const ids = await admin.evaluate(() => fetch('/api/projects').then(r => r.json()).then(j => j.projects.map(p => [p.name, p.id])));
  const other = ids.find(x => x[0] === 'Cedar Point')[1];
  await junior.goto(URL0 + '/projects/' + other);
  await junior.getByText('Project not found.').or(junior.getByText('Not found')).first().waitFor();
});

await step('studio opens on the project, with its brief form', async () => {
  await junior.goto(URL0 + '/');
  await junior.getByText('Harbourline Residences').click();
  await junior.locator('.chm').first().waitFor();
  assert.ok((await junior.locator('.chm').first().innerText()).length > 20);
});

await step('learning page loads', async () => {
  await junior.getByRole('link', { name: 'Learning' }).click();
  await junior.getByRole('heading', { name: 'Learning' }).waitFor();
  await junior.locator('.chm').first().waitFor();
});

await step('switching the junior off signs them out', async () => {
  await admin.getByRole('link', { name: 'People' }).click();
  const row = admin.locator('tr', { hasText: 'junior@example.test' });
  await row.getByRole('button', { name: 'Switch off' }).click();
  await row.getByRole('button', { name: 'Switch on' }).waitFor();
  await junior.goto(URL0 + '/');
  await junior.getByRole('heading', { name: 'Sign in' }).waitFor();
});

await step('signing in with a wrong password fails, right one works', async () => {
  const p = await page();
  await p.goto(URL0 + '/login');
  await field(p, 'Email').fill('admin@example.test');
  await field(p, 'Password').fill('nope-nope-nope');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.getByText('That email and password do not match.').waitFor();
  await field(p, 'Password').fill('admin-password-1');
  await p.getByRole('button', { name: 'Sign in' }).click();
  await p.getByRole('heading', { name: 'Projects' }).waitFor();
  await p.setViewportSize({ width: 390, height: 844 });   // phone width: no sideways scroll
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'page scrolls sideways on a phone');
});

await browser.close();
if (problems.length) { console.log('\nProblems in the browser:\n' + problems.join('\n')); process.exit(1); }
console.log('\nAll browser checks passed.');
