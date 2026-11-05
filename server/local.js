// Run the API on your computer: npm run dev (with the React app) or npm start (API only).
import fs from 'fs';
if (fs.existsSync('.env')) for (const line of fs.readFileSync('.env', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
const { default: app } = await import('./app.js');
const port = Number(process.env.PORT || 3001);
app.listen(port, () => console.log(`Creative Studio API on http://localhost:${port}`));
