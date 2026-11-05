// Build without dependencies: node build.mjs
// dist/creative-heatmap.esm.js  ES module (import { CreativeHeatmap } from '...')
// dist/creative-heatmap.js      script tag: window.CreativeHeatmap + <creative-heatmap> element
// dist/creative-heatmap.css     styles
import fs from 'fs';
const files = ['src/voice-model.js', 'src/voice.js', 'src/intel.js', 'src/qc.js', 'src/phone.js', 'src/core.js', 'src/rera-rules.js', 'src/rera.js', 'src/brief.js', 'src/generator.js', 'src/widget.js'];
const names = new Set(); let body = '';
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  s = s.replace(/^import[\s\S]*?from\s+'\.\/[\w.-]+';\s*$/gm, '');                       // local imports
  s = s.replace(/^export\s+(async\s+function|function|const|let|class)\s+([\w$]+)/gm, (m, kw, n) => { names.add(n); return `${kw} ${n}`; });
  body += `\n// ---- ${f} ----\n` + s;
}
if (/^\s*(import|export)\b/m.test(body)) throw new Error('Unhandled import/export left in the bundle');
const list = [...names].sort();
const head = `/*! creative-heatmap 1.0.0 · predicted attention for ad creatives · no dependencies */\n`;
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/creative-heatmap.esm.js', head + body + `\nconst newVersionDefaults = defaults;\nexport { ${list.join(', ')}, newVersionDefaults };\n`);
fs.writeFileSync('dist/creative-heatmap.js', head + `(function () {\n'use strict';\n${body}\nconst newVersionDefaults = defaults;\nconst api = { ${list.join(', ')}, newVersionDefaults };\nObject.keys(api).forEach(k => { if (k !== 'CreativeHeatmap') CreativeHeatmap[k] = api[k]; });\nwindow.CreativeHeatmap = CreativeHeatmap;\ndefineElement();\n})();\n`);
fs.copyFileSync('src/creative-heatmap.css', 'dist/creative-heatmap.css');
console.log('Built dist/ with', list.length, 'exports:', list.join(', '));
