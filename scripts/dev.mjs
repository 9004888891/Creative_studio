// npm run dev: the API on :3001 and the React app on :5173 (which forwards /api to the API).
import { spawn } from 'child_process';
const run = (args, name) => { const p = spawn(process.execPath, args, { stdio: 'inherit', env: process.env }); p.on('exit', c => { console.log(`[${name}] stopped (${c})`); process.exit(c || 0); }); return p; };
const kids = [run(['--watch', 'server/local.js'], 'api'), run(['node_modules/vite/bin/vite.js', '--config', 'client/vite.config.js'], 'web')];
const stop = () => { kids.forEach(k => k.kill()); process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
