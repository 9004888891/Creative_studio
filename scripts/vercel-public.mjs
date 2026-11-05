// Builds the folder Vercel serves (public/): the studio page and the built module. Nothing else is published,
// so server code, examples and notes stay off the site.
import fs from 'fs';
fs.rmSync('public', { recursive: true, force: true });
fs.mkdirSync('public', { recursive: true });
for (const f of ['creative-heatmap.js', 'creative-heatmap.css']) fs.copyFileSync('dist/' + f, 'public/' + f);
fs.copyFileSync('app/index.html', 'public/index.html');
console.log('public/ ready');
