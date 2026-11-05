# Creative Studio (MERN)

Real-estate ad creative analysis for a team: predicted attention heatmaps, quality and RERA checks, phone placements,
voiceover and pacing checks, results from your ad dashboard, and a library that learns across projects which elements
work and suggests the next creative.

**Stack:** MongoDB (Atlas) · Express 5 · React 19 (Vite) · Node 20+, deployed as one Vercel project.
Uploaded creatives are kept in a **private** Vercel Blob store and are only served to signed-in people who can see that project.

```
api/index.js          Vercel Function: the whole Express API (every /api/* request)
server/               Express app, models (Mongoose), routes, auth and access rules
client/               React app (Vite) → built to client/dist and served as static files
studio/src/           The studio engine (plain JavaScript, runs in the browser), used by the React app
scripts/              create-admin, import-library, dev
tests/                API tests (node --test + supertest)
```

## Who can do what

| Role | Projects | Can |
| --- | --- | --- |
| Admin | All | Everything, including inviting people, choosing their access, and deleting projects |
| Editor | All (or only the ones ticked) | Add projects, upload, run checks, approve or send back creatives |
| Junior | Only the ones ticked | Upload and work on creatives, mark them for review; cannot approve |
| Viewer | Only the ones ticked | Look only |

"Hide spend" on a person hides spend and cost figures from them in the studio and its reports.
Sign-in is by invitation only: email + password, or Google with the invited address. Sessions are httpOnly cookies;
switching someone off, changing a password or "Sign out everywhere" ends their sessions at once.

## Run it on your computer

```bash
cp .env.example .env        # fill in MONGODB_URI and JWT_SECRET at least
npm install
npm run dev                 # API on :3001, app on http://localhost:5173
```

Create the first admin either on the web page (it asks for `SETUP_KEY`) or from the command line:

```bash
npm run create-admin -- you@company.com "Your Name"
```

Bring in an existing `creative-library.json` (from the earlier studio):

```bash
npm run import-library -- creative-library.json http://localhost:5173 you@company.com
```

Tests (they wipe the database you point them at):

```bash
TEST_MONGODB_URI="mongodb://127.0.0.1:27017/cs-test" npm test
```

Deploying: see [DEPLOY.md](DEPLOY.md).
