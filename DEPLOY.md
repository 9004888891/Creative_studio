# Deploy to Vercel

About 20 minutes. You need a Vercel account, a MongoDB Atlas account (the free tier is fine to start), and this
repository on GitHub.

## 1. Database (MongoDB Atlas)

1. In Atlas create a cluster, then **Database Access → Add user** with a long random password.
2. **Network Access → Add IP address → `0.0.0.0/0`** (Vercel Functions do not have fixed addresses). The database user's
   password is what protects it, so keep it long. On a paid Vercel plan you can use Secure Compute or the Atlas
   Vercel integration instead.
3. **Connect → Drivers** and copy the connection string. Put a database name in it, e.g.
   `mongodb+srv://studio:<password>@cluster0.xxxxx.mongodb.net/creative-studio?retryWrites=true&w=majority`.

Tip: Vercel's Marketplace has a MongoDB Atlas integration that creates the cluster and sets `MONGODB_URI` for you.

## 2. Vercel project

1. **Add New → Project**, import the GitHub repository, and choose the **`mern`** branch as the production branch
   (Settings → Environments → Production → Branch), or merge `mern` into `main`.
2. Framework preset: **Vite**. `vercel.json` already sets the install and build commands and the output folder
   (`client/dist`); leave them as they are.
3. **Storage → Create → Blob**, choose **Private**, and connect it to the project. This adds `BLOB_READ_WRITE_TOKEN`.

## 3. Environment variables (Settings → Environment Variables)

| Name | Needed | What to put |
| --- | --- | --- |
| `MONGODB_URI` | yes | The Atlas connection string from step 1 |
| `JWT_SECRET` | yes | A random string of 32+ characters, e.g. the output of `openssl rand -base64 48` |
| `SETUP_KEY` | for the first admin | Any long secret. The setup page asks for it. Remove it after you have signed in |
| `APP_URL` | yes, once you have a domain | e.g. `https://studio.yourcompany.com` (used in invite and reset links) |
| `BLOB_READ_WRITE_TOKEN` | yes | Added by connecting the private Blob store |
| `GOOGLE_CLIENT_ID` | for Google sign-in | See step 4 |
| `GOOGLE_ALLOWED_DOMAINS` | optional | e.g. `yourcompany.com` – only these Google accounts may sign in |
| `ANTHROPIC_API_KEY` | for the AI reading | The studio's "read this ad" and tagging |
| `TRANSCRIBE_API_KEY` | for voiceover checks | Speech-to-text key used by the Sound check |
| `PERF_SOURCE_URL`, `PERF_API_TOKEN` | for results | Your ad-results dashboard's creative-performance URL and its token |
| `MAX_UPLOAD_MB` | optional | Largest upload, default 200 |
| `SESSION_DAYS` | optional | How long a sign-in lasts, default 7 |

All keys stay on the server; none of them are sent to the browser. Redeploy after changing variables.

## 4. Google sign-in (optional)

1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
2. **Authorised JavaScript origins:** your app URL (e.g. `https://studio.yourcompany.com`) and `http://localhost:5173` for local work.
   No redirect URI is needed.
3. Copy the client ID into `GOOGLE_CLIENT_ID`.

People still need an invite (or an existing account with the same email) to get in with Google.

## 5. First sign-in

1. Open the site. It shows **Set up Creative Studio**: enter your name, email, a password and the `SETUP_KEY`.
   (Or run `npm run create-admin -- you@company.com "Your Name"` with `MONGODB_URI` set.)
2. Delete `SETUP_KEY` from Vercel.
3. **Projects → New project**, then **People → Invite someone** for each teammate. Copy the link shown and send it to them.
4. Optional: import the old library with `npm run import-library -- creative-library.json https://your-app.vercel.app you@company.com`.

## Notes

- Uploads go straight from the browser to the private Blob store (so large videos do not hit the Function size limit).
  The API checks the person may upload to that project before handing out an upload token, and files are only served
  through `/api/files/...` after the same check.
- Health check: `GET /api/health`.
- Turn on **Vercel Authentication / Deployment Protection** for preview deployments, so preview links of the app are not
  public.
- Backups: Atlas takes snapshots on paid tiers; on the free tier, run `mongodump` on a schedule.
