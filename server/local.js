// Run the API on your computer: npm run dev (with the React app) or npm start (API, plus the built app when SERVE_APP=1).
import fs from 'fs';
import path from 'path';
if (fs.existsSync('.env')) for (const line of fs.readFileSync('.env', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const { default: app } = await import('./app.js');
const { default: express } = await import('express');
const dist = path.resolve('client/dist');
if (process.env.SERVE_APP === '1' && fs.existsSync(dist)) {   // like Vercel: static files, and index.html for app routes
  const root = express();
  root.use(app);
  root.use(express.static(dist, { index: false }));
  root.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  app.listen = root.listen.bind(root);
}
const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`Creative Studio on http://localhost:${port}`));
