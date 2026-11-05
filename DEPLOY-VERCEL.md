# Put Creative Studio on Vercel

What you get: the studio at your own `….vercel.app` address (or your domain), behind a sign-in, with the AI reading,
results from Realty Funnel Desk, and one shared creative library that learns from every brand.

## 1. Import the repository

1. Go to vercel.com → **Add New… → Project** → **Import** `Creative_studio` from GitHub.
2. Leave the settings as they are: `vercel.json` already sets the build (`node build.mjs && node scripts/vercel-public.mjs`) and the output folder (`public`).
3. Don't deploy yet: add the settings below first (or deploy, add them, then **Redeploy**).

## 2. Add a database for the library (Redis)

Vercel functions have no lasting disk, so the library lives in Redis.

1. In the project: **Storage → Create / Connect → Upstash (Redis)** from the Marketplace, free plan is enough to start.
2. Connect it to the project. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
   (If you create the database on upstash.com instead, add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` yourself.)

## 3. Environment variables

**Settings → Environment Variables** (Production, and Preview if you use preview links):

| Name | What | Needed |
|---|---|---|
| `STUDIO_PASSWORD` | One shared password for the whole team (any user name) | Yes, unless you use `STUDIO_USERS` |
| `STUDIO_USERS` | People, roles and projects, as JSON (below) | Instead of `STUDIO_PASSWORD` |
| `ANTHROPIC_API_KEY` | AI reading: what the ad says, checks, ideas | Strongly recommended |
| `PERF_SOURCE_URL` | Realty Funnel Desk's `/api/creative-performance` address | For results |
| `PERF_API_TOKEN` | The same token as `PERF_API_TOKEN` on Realty Funnel Desk | For results |
| `TRANSCRIBE_API_KEY` | Speech-to-text for video voiceovers (OpenAI-compatible) | Optional |

`STUDIO_USERS` example (one line in Vercel):

```json
[{"user":"thomas","password":"long-random-1","role":"admin"},
 {"user":"asha","password":"long-random-2","role":"junior","projects":["Harbourline Residences","Harbourline Heights"]},
 {"user":"client-viewer","password":"long-random-3","role":"viewer","projects":["Harbourline Residences"],"hideBudget":true}]
```

Roles: `admin` sees everything; `editor` sees all projects (or only `projects` if given); `junior` sees only its `projects`;
`viewer` can look but not change anything. `hideBudget` hides spend and cost per qualified lead.

Until `STUDIO_PASSWORD` or `STUDIO_USERS` is set, the site stays closed (it shows a message instead), so client data is
never exposed by a missing setting. Keys stay on Vercel; the browser never sees them.

## 4. Deploy and sign in

**Deployments → Redeploy** (or push to `main`). Open the address: the browser asks for the user name and password.

## 5. Load the existing library (once)

From any computer with Node 20+, in a copy of this repository:

```
STUDIO_URL=https://your-studio.vercel.app STUDIO_AUTH=thomas:your-password node scripts/import-library.mjs creative-library.json
```

`creative-library.json` is your tagged creative library (kept separately). It is deliberately not in the
repository (see `.gitignore`).

## 6. Your own domain (optional)

**Settings → Domains → Add**, e.g. `studio.yourcompany.com`, then add the DNS record Vercel shows.

## Limits to know

- Uploads to the AI reading and transcription go through Vercel functions, which accept up to 4.5 MB per request. The
  studio sends compressed images and a 16 kHz voice track, which stays well under that for normal ads (a voiceover of
  up to about two minutes).
- AI readings can take 20–60 seconds; `vercel.json` gives those functions up to 120 seconds.
- The library is one Redis value. That is fine for thousands of creatives; if it grows past a few MB, move it to a
  Postgres table (the storage adapter in `server/storage.cjs` is the only part to change).
- Sign-in is a browser password prompt. For company single sign-on, put Vercel's Deployment Protection or your own
  login in front instead.

## How it fits together

| Path | What |
|---|---|
| `proxy.js` | Runs before every request: nobody gets the page, scripts or API without signing in |
| `api/*.js` | Vercel functions: AI reading, results relay, library, voiceover, `/api/me` |
| `server/*.cjs` | The same handlers used on your own server (Express or plain Node) |
| `app/index.html` | The page people use (project picker + studio) |
| `public/` | Built on deploy; the only folder served as files |
