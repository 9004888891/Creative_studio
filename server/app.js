// The Express API. Runs as one Vercel Function (api/index.js) and as a normal Node server locally (server/local.js).
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config, configProblems } from './config.js';
import { connectDb } from './db.js';
import { loadUser, sameOrigin } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import auth from './routes/auth.js';
import users from './routes/users.js';
import projects from './routes/projects.js';
import creatives from './routes/creatives.js';
import library from './routes/library.js';
import services from './routes/services.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', (req, res, next) => { const p = configProblems(); if (p.length) return res.status(503).json({ error: 'The app is not configured yet.', problems: p }); next(); });
// Why the database could not be reached, in words a person can act on (no secrets in it).
const dbReason = (m = '') =>
  /bad auth|authentication failed|auth.*fail/i.test(m) ? 'MongoDB refused the username or password in MONGODB_URI. Check the database user under Atlas → Database Access, and that <db_password> was replaced with the real password (no < >).'
  : /querySrv|ENOTFOUND|EAI_AGAIN/i.test(m) ? 'The cluster address in MONGODB_URI was not found. Copy the connection string again from Atlas → Connect → Drivers. If the password has symbols like @ : / ? #, change it to letters and numbers only, because they break the address.'
  : /Invalid scheme|Invalid connection string|URI|must be|parse|malformed|Password contains/i.test(m) ? 'MONGODB_URI is not written correctly. It must start with mongodb+srv:// and have no quotes, spaces or < > in it. If the password has symbols like @ : / ? #, change it to letters and numbers only.'
  : /timed out|Server selection|ECONNREFUSED|ETIMEDOUT|whitelist|IP.*access|not authorized to access/i.test(m) ? 'Atlas is not letting this app connect. In Atlas → Network Access, add 0.0.0.0/0 (Allow access from anywhere) and wait until it shows Active.'
  : 'The database is not reachable right now. Try again in a minute.';
app.use('/api', async (req, res, next) => { try { await connectDb(); next(); } catch (e) { console.error('[db]', e.message); res.status(503).json({ error: dbReason(e.message) }); } });
app.use('/api', sameOrigin);
app.use('/api', loadUser);
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });

app.use('/api/auth', auth);
app.use('/api/users', users);
app.use('/api/projects', projects);
app.use('/api/library', library);
app.use('/api', creatives);
app.use('/api', services);
app.use('/api', notFoundHandler);
app.use(errorHandler);

export default app;
export { config };
