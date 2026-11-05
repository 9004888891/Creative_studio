// Sign-in for the Vercel deployment: HTTP Basic sign-in checked by proxy.js on every request, and again here by
// each API function (the browser resends the same sign-in with every request to the site).
//
// Set ONE of these in Vercel → Project → Settings → Environment Variables:
//   STUDIO_PASSWORD   one shared password (user name: anything, or STUDIO_USER if set)
//   STUDIO_USERS      people and what they may see, as JSON:
//     [{"user":"thomas","password":"…","role":"admin"},
//      {"user":"asha","password":"…","role":"junior","projects":["Harbourline Residences","Harbourline Heights"]},
//      {"user":"client-viewer","password":"…","role":"viewer","projects":["Harbourline Residences"],"hideBudget":true}]
//   role: admin (everything) | editor (all projects unless "projects" is given) | junior (only "projects") | viewer (read-only)
const crypto = require('crypto');

function users() {
  if (process.env.STUDIO_USERS) { try { return JSON.parse(process.env.STUDIO_USERS); } catch (e) { console.error('STUDIO_USERS is not valid JSON'); return []; } }
  if (process.env.STUDIO_PASSWORD) return [{ user: process.env.STUDIO_USER || '*', password: process.env.STUDIO_PASSWORD, role: 'admin' }];
  return [];
}
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** The signed-in person from an Authorization header (string), or null. */
function userFromHeader(h) {
  const m = /^Basic\s+(.+)$/i.exec(h || ''); if (!m) return null;
  let dec; try { dec = Buffer.from(m[1], 'base64').toString('utf8'); } catch (e) { return null; }
  const i = dec.indexOf(':'), name = dec.slice(0, i), pass = dec.slice(i + 1);
  const u = users().find(x => (x.user === '*' || same(x.user, name)) && same(x.password, pass));
  return u ? { user: u.user === '*' ? name : u.user, role: u.role || 'editor', projects: Array.isArray(u.projects) ? u.projects : null, hideBudget: !!u.hideBudget } : null;
}
const userOf = req => userFromHeader((req.headers && (req.headers.authorization || req.headers.Authorization)) || '');
const mayProject = (u, project) => !!u && (u.role === 'admin' || !u.projects || u.projects.includes(project));
const configured = () => users().length > 0;

/** Wrap an API handler so only signed-in people reach it. */
function requireUser(handler) {
  return (req, res) => {
    const u = userOf(req);
    if (!u) { res.statusCode = 401; res.setHeader('WWW-Authenticate', 'Basic realm="Creative Studio", charset="UTF-8"'); res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: configured() ? 'Sign in first.' : 'Sign-in is not set up: add STUDIO_PASSWORD or STUDIO_USERS to the project.' })); }
    req.studioUser = u; return handler(req, res);
  };
}

module.exports = { userOf, userFromHeader, mayProject, requireUser, configured };
