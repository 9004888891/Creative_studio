// RERA compliance check for real-estate creatives, by state / region.
// - finds QR codes in the image (the browser's BarcodeDetector when it has one, else a built-in finder-pattern search)
// - reads the registration number, authority website and other text from the AI reading (element boxes + text)
// - checks presence, placement (e.g. MahaRERA: top-right corner), relative size and banned claims against RERA_RULES
// It is an aid, not legal advice: items it cannot see are marked "check" for a person to confirm.
import { RERA_RULES, RERA_PLACES, RERA_CHECKED } from './rera-rules.js';

const norm = s => String(s || '').toLowerCase();
const flat = s => norm(s).replace(/https?:\/\//g, '').replace(/^www\./, '').replace(/\s+/g, '');

/** State code for a project: from ctx.reraState / ctx.state (code or name), else from the location fields. 'IN' when unknown. */
export function reraRegion(ctx = {}, rules = RERA_RULES) {
  const direct = String(ctx.reraState || ctx.state || '').trim();
  if (direct) {
    const up = direct.toUpperCase(); if (rules[up]) return up;
    const hit = Object.keys(rules).find(k => norm(rules[k].name) === norm(direct)); if (hit) return hit;
  }
  const where = norm([ctx.location, ctx.micro, ctx.locality, ctx.city, ctx.address, ctx.project].filter(Boolean).join(' , '));
  if (where) for (const [code, places] of Object.entries(RERA_PLACES)) if (places.some(p => new RegExp(`(^|[^a-z])${p.replace(/ /g, '\\s+')}([^a-z]|$)`).test(where))) return code;
  // a registration number gives the state away too
  if (ctx.rera) for (const [code, r] of Object.entries(rules)) if (r.reg && r.reg.test(String(ctx.rera))) return code;
  return 'IN';
}

/** The rule for a state, merged with any override ({ MH: {...} }) the dashboard passes. */
export function reraRule(code, overrides) {
  const base = RERA_RULES[code] || RERA_RULES.IN, o = overrides && overrides[code];
  return Object.assign({ code }, base, o || {}, { media: Object.assign({}, base.media, (o && o.media) || {}) });
}
/** The rule for one medium (social, video, print, hoarding, brochure, portal, audio). */
export function reraMedium(rule, medium) { return Object.assign({ requires: ['reg', 'website'] }, (rule.media && (rule.media[medium] || rule.media.default)) || {}); }
export const RERA_MEDIA = { social: 'Social feed ad (static or carousel)', video: 'Video ad', print: 'Print', hoarding: 'Hoarding / outdoor', brochure: 'Brochure / leaflet', portal: 'Property portal listing', audio: 'Radio / audio' };

/* ---------- QR codes ---------- */

/** Grey pixels of an image or canvas, longest side at most maxSide: { g: Uint8Array, w, h }. */
export function grayOf(src, maxSide = 900) {
  const W = src.naturalWidth || src.videoWidth || src.width, H = src.naturalHeight || src.videoHeight || src.height;
  const k = Math.min(1, maxSide / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data, g = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = (d[4 * i] * 77 + d[4 * i + 1] * 150 + d[4 * i + 2] * 29) >> 8;
  return { g, w, h };
}

/**
 * Find QR codes from their three finder squares (the 1:1:3:1:1 rings in three corners). Pure JavaScript, no decoding.
 * gray: { g, w, h }. Returns [{ box:[x,y,w,h] (fractions), module (px) }].
 */
export function findQR(gray) {
  const { g, w, h } = gray; if (w < 21 || h < 21) return [];
  // adaptive threshold: dark when below the local mean (integral image, window ~1/20 of the image)
  const S = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += g[y * w + x]; S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + row; } }
  const r = Math.max(6, Math.round(Math.max(w, h) / 40)), dark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), n = (y1 - y0) * (x1 - x0);
      const m = (S[y1 * (w + 1) + x1] - S[y0 * (w + 1) + x1] - S[y1 * (w + 1) + x0] + S[y0 * (w + 1) + x0]) / n;
      dark[y * w + x] = g[y * w + x] < m - 6 ? 1 : 0;
    }
  }
  const at = (x, y) => dark[y * w + x];
  const ratioOk = rs => { const t = rs[0] + rs[1] + rs[2] + rs[3] + rs[4]; if (t < 7) return false; const m = t / 7, v = m * 0.6;
    return Math.abs(rs[0] - m) < v && Math.abs(rs[1] - m) < v && Math.abs(rs[2] - 3 * m) < 3 * v && Math.abs(rs[3] - m) < v && Math.abs(rs[4] - m) < v; };
  // runs along a line through (cx, cy) in direction (dx, dy): returns [5 runs] centred on the dark core, or null
  const cross = (cx, cy, dx, dy, maxRun) => {
    if (!at(cx, cy)) return null; const rs = [0, 0, 0, 0, 0]; let x = cx, y = cy, back = 0, fwd = 0;
    while (x >= 0 && y >= 0 && x < w && y < h && at(x, y)) { rs[2]++; back++; x -= dx; y -= dy; }
    while (x >= 0 && y >= 0 && x < w && y < h && !at(x, y) && rs[1] <= maxRun) { rs[1]++; x -= dx; y -= dy; }
    while (x >= 0 && y >= 0 && x < w && y < h && at(x, y) && rs[0] <= maxRun) { rs[0]++; x -= dx; y -= dy; }
    x = cx + dx; y = cy + dy;
    while (x >= 0 && y >= 0 && x < w && y < h && at(x, y)) { rs[2]++; fwd++; x += dx; y += dy; }
    while (x >= 0 && y >= 0 && x < w && y < h && !at(x, y) && rs[3] <= maxRun) { rs[3]++; x += dx; y += dy; }
    while (x >= 0 && y >= 0 && x < w && y < h && at(x, y) && rs[4] <= maxRun) { rs[4]++; x += dx; y += dy; }
    if (!(rs[0] && rs[1] && rs[3] && rs[4])) return null;
    rs.mid = (fwd - (back - 1)) / 2;   // offset of the core's centre from the start point
    return rs;
  };
  const cand = [];
  for (let y = 0; y < h; y += 1) {
    const runs = []; let x = 0;
    while (x < w) { const v = at(x, y), s = x; while (x < w && at(x, y) === v) x++; runs.push([v, x - s, s]); }
    for (let i = 0; i + 4 < runs.length; i++) {
      if (runs[i][0] !== 1) continue; const rs = [runs[i][1], runs[i + 1][1], runs[i + 2][1], runs[i + 3][1], runs[i + 4][1]];
      if (!ratioOk(rs)) continue;
      const t = rs.reduce((a, b) => a + b, 0), cx = Math.round(runs[i + 2][2] + runs[i + 2][1] / 2);
      const v = cross(cx, y, 0, 1, t); if (!v || !ratioOk(v)) continue;
      const tv = v.reduce((a, b) => a + b, 0); if (Math.abs(tv - t) > t * 0.5) continue;
      const cy = Math.round(y + v.mid);   // centre of the vertical core
      // a finder square is the same ring in every direction: re-check across the centre row and both diagonals
      const hz = cross(cx, cy, 1, 0, t); if (!hz || !ratioOk(hz) || Math.abs(hz.reduce((a, b) => a + b, 0) - t) > t * 0.35) continue;
      const d1 = cross(cx, cy, 1, 1, t), d2 = cross(cx, cy, 1, -1, t);
      if (!d1 || !d2) continue;
      const dOk = d => { const s = d.reduce((a, b) => a + b, 0); return s > t * 0.55 && s < t * 1.6 && d[2] > d[1] && d[2] > d[3]; };
      if (!dOk(d1) && !dOk(d2)) continue;   // rotated codes pass on at least one diagonal; text and grids on neither
      cand.push({ x: cx, y: cy, s: (t + tv) / 2 });
    }
  }
  // merge hits from neighbouring rows into one centre per finder square
  const pts = [];
  cand.forEach(c => { const p = pts.find(q => Math.abs(q.x - c.x) < q.s / 4 && Math.abs(q.y / q.n - c.y) < q.s / 4 && Math.abs(q.s - c.s) < q.s * 0.4);
    if (p) { p.x = (p.x * p.n + c.x) / (p.n + 1); p.y += c.y; p.s = (p.s * p.n + c.s) / (p.n + 1); p.n++; } else pts.push({ x: c.x, y: c.y, s: c.s, n: 1 }); });
  const fp = pts.filter(p => p.n >= 2).map(p => ({ x: p.x, y: p.y / p.n, s: p.s }));
  // three finder squares of similar size forming a right angle = one QR code
  const out = [], used = new Set();
  for (let a = 0; a < fp.length; a++) for (let b = a + 1; b < fp.length; b++) for (let c = b + 1; c < fp.length; c++) {
    if (used.has(a) || used.has(b) || used.has(c)) continue;
    const P = [fp[a], fp[b], fp[c]], ss = P.map(p => p.s), sm = (ss[0] + ss[1] + ss[2]) / 3;
    if (ss.some(s => Math.abs(s - sm) > sm * 0.35)) continue;
    const d = (p, q) => Math.hypot(p.x - q.x, p.y - q.y), D = [d(P[0], P[1]), d(P[1], P[2]), d(P[0], P[2])].sort((m, n) => m - n);
    if (D[0] < sm * 2.2 || D[2] > sm * 25) continue;                       // a QR code is at least 21 modules (3 finder widths)
    if (Math.abs(D[0] - D[1]) > D[1] * 0.2 || Math.abs(D[2] - Math.SQRT2 * D[1]) > D[1] * 0.25) continue;
    const xs = P.map(p => p.x), ys = P.map(p => p.y), pad = sm / 2;
    // the fourth corner sits opposite the right-angle finder
    const corner = P.find(p => { const o = P.filter(q => q !== p); return Math.abs(d(o[0], o[1]) - D[2]) < 1e-6 || Math.abs(d(o[0], o[1]) - D[2]) < D[2] * 0.02; }) || P[0];
    const opp = P.filter(q => q !== corner), fx = opp[0].x + opp[1].x - corner.x, fy = opp[0].y + opp[1].y - corner.y;
    xs.push(fx); ys.push(fy);
    const x0 = Math.max(0, Math.min(...xs) - pad), y0 = Math.max(0, Math.min(...ys) - pad), x1 = Math.min(w, Math.max(...xs) + pad), y1 = Math.min(h, Math.max(...ys) + pad);
    out.push({ box: [x0 / w, y0 / h, (x1 - x0) / w, (y1 - y0) / h], module: sm / 7 }); used.add(a); used.add(b); used.add(c);
  }
  return out;
}

/** QR codes in an image or canvas: [{ box (fractions), value? (decoded text, when the browser can decode) }]. */
export async function detectQR(src) {
  const W = src.naturalWidth || src.videoWidth || src.width, H = src.naturalHeight || src.videoHeight || src.height;
  if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
    try {
      const det = new window.BarcodeDetector({ formats: ['qr_code'] }), r = await det.detect(src);
      if (r && r.length) return r.map(q => ({ box: [q.boundingBox.x / W, q.boundingBox.y / H, q.boundingBox.width / W, q.boundingBox.height / H], value: q.rawValue || '' }));
    } catch (e) { /* fall back to the finder search */ }
  }
  let res = findQR(grayOf(src, 900));
  if (!res.length && Math.max(W, H) > 900) res = findQR(grayOf(src, 1600));   // small QR codes on large creatives
  return res;
}

/**
 * Where and for how long a QR code is on screen in a video. src: File/Blob/URL. Samples every `step` seconds.
 * Returns { duration, seconds, inZoneSeconds, longestInZone, samples:[{t, boxes}] }.
 */
export async function qrTimeline(src, opts = {}) {
  const step = opts.step || 0.5, maxSeconds = opts.maxSeconds || 120, zone = opts.zone || 'top-right';
  const url = typeof src === 'string' ? src : URL.createObjectURL(src), v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  try {
    await new Promise((ok, bad) => { v.onloadeddata = ok; v.onerror = () => bad(new Error('video')); setTimeout(() => bad(new Error('timeout')), 20000); });
    const dur = isFinite(v.duration) ? v.duration : 0, end = Math.min(dur, maxSeconds), samples = [];
    const W = Math.min(1080, v.videoWidth || 720), H = Math.round(W * (v.videoHeight || 1280) / (v.videoWidth || 720));
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true });
    for (let t = Math.min(0.1, end); t <= end; t += step) {
      await new Promise(ok => { v.onseeked = ok; v.currentTime = Math.min(t, Math.max(0, dur - 0.05)); setTimeout(ok, 3000); });
      x.drawImage(v, 0, 0, W, H); samples.push({ t, boxes: (await detectQR(c)).map(q => q.box) });
      if (opts.onProgress) opts.onProgress(Math.min(1, t / (end || 1)));
    }
    let seconds = 0, inZone = 0, run = 0, longest = 0;
    samples.forEach(s => { const any = s.boxes.length > 0, z = s.boxes.some(b => inZoneBox(b, zone)); if (any) seconds += step; if (z) { inZone += step; run += step; longest = Math.max(longest, run); } else run = 0; });
    return { duration: dur, seconds, inZoneSeconds: inZone, longestInZone: longest, samples, step };
  } finally { if (typeof src !== 'string') URL.revokeObjectURL(url); }
}

/** Is a box (fractions) in the zone? top-right = its centre in the right half and the top half. */
export function inZoneBox(b, zone) {
  if (!zone || !b) return true; const cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2;
  if (zone === 'top-right') return cx >= 0.5 && cy <= 0.5;
  return true;
}

/* ---------- the check ---------- */

const TRAVEL = /\b\d+(?:\.\d+)?\s*(?:min|mins|minutes|hr|hrs|hours)\b(?!\s*(?:walk-?in|read))/i;
const TNC = /\bT\s*&\s*C\b|\bterms\s*(?:and|&)\s*conditions\s*apply\b|\bT&Cs?\s*apply\b/i;
const VAGUE = /\b\d+\s*\+\s*(?:lifestyle\s+)?(?:amenities|facilities|features)\b|\b(?:\d+|several|many|world[- ]class)\s+(?:lifestyle\s+)?(?:amenities|facilities)\b/i;
const PERMIT = /\b(?:HMDA|GHMC|DTCP|LP\s*No|BP\s*No|permit\s*no|building\s*permission|panchayat)\b/i;
const PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/;

/**
 * Check one creative (or one card / frame) against a state's RERA advertising rules.
 * input: {
 *   region       state code ('MH') or name; default from ctx
 *   medium       social | video | print | hoarding | brochure | portal | audio (default from kind)
 *   kind         image | video | carousel
 *   elements     AI elements in view: [{ type, text, cbox:[x,y,w,h] }] (empty = no AI reading)
 *   qr           [{ box, value? }] from detectQR(), or null when not run
 *   timeline     qrTimeline() result for videos, or null
 *   caption      the ad's post text (optional; some states accept the number in the post)
 *   transcript   voiceover text (optional; audio rules)
 *   ctx          project details: { rera (the registered number), developer/brand, project, phone, reraState, location, ... }
 *   manual       { itemId: true } items a person has confirmed by eye
 *   rules        overrides for RERA_RULES
 *   cardIndex    for carousels: which card this is (0 = first)
 * }
 * Returns { code, rule, medium, items:[{id, label, status:'pass'|'fail'|'check'|'na', detail, fix}], counts, checked, sources }.
 */
export function checkRera(input = {}) {
  const ctx = input.ctx || {}, code = input.region ? reraRegion({ reraState: input.region }, Object.assign({}, RERA_RULES, input.rules || {})) : reraRegion(ctx);
  const rule = reraRule(code, input.rules), medium = input.medium || (input.kind === 'video' ? 'video' : 'social'), m = reraMedium(rule, medium);
  const els = (input.elements || []).filter(e => e && e.cbox), read = els.length > 0, man = input.manual || {};
  const txt = els.map(e => String(e.text || '')).join(' \n '), all = [txt, m.caption ? input.caption : ''].filter(Boolean).join(' \n ');
  const items = [], add = (id, label, status, detail, fix) => items.push({ id, label, status: man[id] && status !== 'pass' && status !== 'na' ? 'pass' : status, confirmed: !!man[id] && status !== 'pass', detail, fix });
  const req = new Set(m.requires || []), firstCardOnly = input.kind === 'carousel' && m.cards === 'first' && input.cardIndex > 0;
  const textOf = re => els.filter(e => re.test(String(e.text || '')));

  if (firstCardOnly) {
    add('cards', 'Later carousel cards', 'na', `${rule.authority} asks for the details on the first card or page; later cards are not checked.`, '');
    return finish();
  }
  // registration number
  const regEls = els.filter(e => e.type === 'rera' || (rule.reg && rule.reg.test(String(e.text || ''))) || /\bRERA\b.*\d{4,}/i.test(String(e.text || '')));
  const shown = (() => { const s = (rule.reg && all.match(rule.reg)) || all.match(/\b(?:P[A-Z]?\s?\d{11,13}|[A-Z0-9-]+(?:\/[A-Z0-9 .-]+){3,})\b/); return s ? s[0].replace(/\s+/g, '') : ''; })();
  if (req.has('reg')) {
    const want = String(ctx.rera || '').split(/[\s,;]+/)[0].replace(/\s+/g, '');
    if (shown && want && norm(shown) !== norm(want) && !norm(all.replace(/\s+/g, '')).includes(norm(want)))
      add('reg', 'Registration number', 'fail', `The creative shows ${shown}, but the project is registered as ${want}.`, `Use ${want}, exactly as on the ${rule.authority} certificate.`);
    else if (shown || regEls.length) add('reg', 'Registration number', 'pass', `Shown: ${shown || (regEls[0].text || 'RERA block')}.`, '');
    else add('reg', 'Registration number', read ? 'fail' : 'check', read ? 'No registration number was found in the creative.' : 'Read the creative with AI to find the number, or confirm it by eye.', `Add the ${rule.authority} registration number${m.zone ? ' in the ' + m.zone.replace('-', ' ') + ' corner' : ''}.`);
  }
  // authority website
  if (req.has('website') && rule.website) {
    const f = flat(all), old = (rule.oldWebsites || []).find(o => f.includes(flat(o)));
    if (f.includes(flat(rule.website))) add('website', 'Authority website', 'pass', `Shown: ${rule.website}.`, '');
    else if (old) add('website', 'Authority website', 'fail', `The creative shows ${old}, the authority's older address.`, `Change it to ${rule.website}.`);
    else add('website', 'Authority website', read ? 'fail' : 'check', read ? `${rule.website} was not found in the creative.` : 'Read the creative with AI to find it, or confirm it by eye.', `Add ${rule.website} beside the registration number.`);
  }
  // permit number (Telangana)
  if (req.has('permit')) {
    if (PERMIT.test(all)) add('permit', 'Permit number', 'pass', 'A permit / approval reference is shown.', '');
    else add('permit', 'Permit number', read ? 'fail' : 'check', read ? 'No HMDA / GHMC / DTCP permit number was found.' : 'Confirm the permit number by eye.', 'Add the competent authority\'s permit number (for example "HMDA LP No. …") in the RERA block.');
  }
  // QR code
  const aiQr = els.filter(e => e.type === 'qr'), qrs = (input.qr || []).concat(aiQr.map(e => ({ box: e.cbox, ai: true })));
  if (req.has('qr')) {
    if (input.kind === 'video' && input.timeline) {
      const tl = input.timeline;
      if (!tl.seconds) add('qr', 'QR code', 'check', `No QR code was found in ${Math.round(tl.duration)} s of video. Small QR codes can be missed; confirm by eye.`, `Show the project QR code from the ${rule.authority} portal${m.zone ? ' in the top-right corner' : ''}.`);
      else add('qr', 'QR code', 'pass', `On screen for about ${tl.seconds.toFixed(1)} s of ${Math.round(tl.duration)} s.`, '');
    } else if (qrs.length) {
      const val = qrs.find(q => q.value);
      if (val && rule.website && !flat(val.value).includes(flat(rule.website).split('.')[0])) add('qr', 'QR code', 'check', `A QR code was found, but it opens ${String(val.value).slice(0, 60)}, not the ${rule.authority} project page.`, `Use the QR code downloaded from the project's ${rule.authority} page.`);
      else add('qr', 'QR code', 'pass', val ? `Found; it opens the ${rule.authority} site.` : 'Found.', '');
    } else add('qr', 'QR code', input.qr && read ? 'fail' : 'check', input.qr ? (read ? 'No QR code was found in the creative.' : 'No QR code was found. A very small or low-contrast code can be missed, so confirm by eye.') : 'The QR search did not run on this image.', `Add the project QR code from the ${rule.authority} portal${m.zone ? ', top-right' : ''}, large and high-contrast enough to scan.`);
  }
  // placement
  if (m.zone) {
    const zoneWord = m.zone.replace('-', ' ');
    if (input.kind === 'video' && input.timeline && req.has('qr')) {
      const tl = input.timeline, need = m.minSeconds || 0;
      if (!tl.seconds) add('zone', `Placement: ${zoneWord}`, 'check', 'No QR code found to place; confirm the RERA block\'s position by eye.', '');
      else if (tl.longestInZone + 1e-6 < Math.max(need, tl.step || 0.5)) add('zone', `Placement: ${zoneWord}`, 'fail', need ? `The QR code is in the ${zoneWord} corner for ${tl.longestInZone.toFixed(1)} s at a stretch; ${rule.authority} asks for at least ${need} s.` : `The QR code is not in the ${zoneWord} corner.`, `Keep the RERA block in the ${zoneWord} corner${need ? ` for at least ${need} s` : ' while it is on screen'}.`);
      else add('zone', `Placement: ${zoneWord}`, 'pass', `In the ${zoneWord} corner for ${tl.longestInZone.toFixed(1)} s at a stretch.`, '');
    } else {
      const placed = regEls.map(e => e.cbox).concat(req.has('qr') ? qrs.map(q => q.box) : []);
      if (!placed.length) add('zone', `Placement: ${zoneWord}`, 'check', 'The RERA block was not located, so its position could not be checked.', `Place the registration number, website${req.has('qr') ? ' and QR code' : ''} in the ${zoneWord} corner.`);
      else { const off = placed.filter(b => !inZoneBox(b, m.zone));
        if (off.length) add('zone', `Placement: ${zoneWord}`, 'fail', `${off.length === placed.length ? 'The RERA details are' : 'Part of the RERA block is'} outside the ${zoneWord} corner (found near the ${where(off[0])}).`, `Move the registration number, website${req.has('qr') ? ' and QR code' : ''} into the ${zoneWord} corner.`);
        else add('zone', `Placement: ${zoneWord}`, 'pass', `In the ${zoneWord} corner.`, ''); }
    }
  } else if (m.together && regEls.length && qrs.length) {
    const r = regEls[0].cbox, q = qrs[0].box, gap = Math.hypot((r[0] + r[2] / 2) - (q[0] + q[2] / 2), (r[1] + r[3] / 2) - (q[1] + q[3] / 2));
    add('zone', 'QR code beside the number', gap < 0.3 ? 'pass' : 'fail', gap < 0.3 ? 'The QR code sits next to the registration number.' : 'The QR code is far from the registration number.', 'Put the QR code right next to the registration number and website.');
  }
  // size
  if (m.size) {
    const h = e => e.cbox[3], regH = Math.max(0, ...els.filter(e => e.type === 'rera' || e.type === 'website' || (rule.reg && rule.reg.test(String(e.text || '')))).map(h));
    if (m.size.pt) add('size', `Text size: at least ${m.size.pt} pt`, 'check', 'Point size depends on the printed size; check it in the print file.', `Set the registration number and website at ${m.size.pt} pt or more.`);
    else if (m.size.ref === 'prominent') add('size', 'Text size: bold and prominent', regH ? (regH >= 0.018 ? 'pass' : 'fail') : 'check', regH ? (regH >= 0.018 ? 'The RERA text is a readable size.' : 'The RERA text is fine print.') : 'Confirm the RERA text is bold and easy to read.', 'Set the RERA details in bold, readable type, not as fine print.');
    else {
      const refEls = m.size.ref === 'project' ? els.filter(e => e.type === 'project_name' || e.type === 'logo') : els.filter(e => e.type === 'contact' || e.type === 'location' || PHONE.test(String(e.text || '')) || (e.type !== 'headline' && e.type !== 'subhead' && /\b(?:site|office|sales|corporate|registered)\s+(?:address|office|lounge)\b|\baddress\s*:/i.test(String(e.text || ''))));
      const refH = Math.max(0, ...refEls.map(h)), ratio = m.size.ratio || 1, what = m.size.ref === 'project' ? 'project name' : 'contact details / address';
      const label = m.size.ref === 'project' ? `Text size: at least ${ratio === 0.5 ? 'half' : ratio < 0.4 ? 'one-third' : Math.round(ratio * 100) + '%'} of the project name` : 'Text size: at least the contact details / address';
      if (!regH || !refH) add('size', label, 'check', !regH ? 'The RERA text was not located, so its size could not be compared.' : `No ${what} text was found to compare with.`, '');
      else { const k = regH / refH;
        if (k >= ratio * 0.9) add('size', label, 'pass', `The RERA text is about ${Math.round(k * 100)}% of the ${what} height (estimated from text-box heights).`, '');
        else add('size', label, k >= ratio * 0.7 ? 'check' : 'fail', `The RERA text is about ${Math.round(k * 100)}% of the ${what} height (estimated from text-box heights).`, `Enlarge the registration number and website to at least the size of the ${what}.`); }
    }
  }
  // promoter details (Tamil Nadu)
  if (req.has('promoter')) {
    const dev = norm(ctx.developer || ctx.brand || ''), hasDev = dev && norm(all).includes(dev.split(/\s+/)[0]), hasContact = PHONE.test(all) || /\b(?:office|address)\b/i.test(all);
    add('promoter', 'Promoter name, office address and contact', hasDev && hasContact ? 'pass' : read ? 'fail' : 'check', hasDev && hasContact ? 'Shown.' : read ? `Missing: ${[!hasDev && 'promoter name', !hasContact && 'office address / contact'].filter(Boolean).join(' and ')}.` : 'Confirm by eye.', 'Add the promoter\'s name, office address and contact details.');
  }
  // banned claims
  const bans = rule.bans || [], scan = [txt, input.caption || ''].join(' \n ');
  if (bans.includes('travel-time')) { const t = scan.match(TRAVEL);
    add('travel', 'No travel times', t ? 'fail' : read ? 'pass' : 'check', t ? `"${t[0]}" is a travel time, which ${rule.authority} does not allow (it depends on traffic).` : read ? 'No travel times found.' : 'Confirm there are no "X min to …" claims.', 'Replace travel times with the location as in the approved plan (for example the road or landmark).'); }
  if (bans.includes('tnc-disclaimer')) { const t = scan.match(TNC);
    add('tnc', 'No "T&C apply" disclaimers', t ? 'fail' : read ? 'pass' : 'check', t ? `"${t[0]}" is a disclaimer ${rule.authority} does not allow.` : read ? 'None found.' : 'Confirm there is no "T&C apply" line.', 'Remove the disclaimer; state the actual terms instead.'); }
  if (bans.includes('vague-amenities')) { const t = scan.match(VAGUE);
    add('amenities', 'Amenities named, not counted', t ? 'fail' : read ? 'pass' : 'check', t ? `"${t[0]}" is a vague amenity claim.` : read ? 'No vague amenity counts found.' : 'Confirm amenities are named, not counted.', 'Name the amenities promised in the agreement (for example "pool, gym, clubhouse").'); }
  // spoken details (audio, TV)
  if (m.spoken && input.transcript) {
    const t = flat(input.transcript), num = String(ctx.rera || '').replace(/\D/g, ''), said = (num && t.replace(/\D/g, '').includes(num.slice(-6))) || /rera/.test(t);
    add('spoken', 'Registration details spoken', said ? 'pass' : 'fail', said ? 'The voiceover mentions RERA / the number.' : 'The voiceover does not mention the registration details.', 'Say the registration number and website slowly and clearly.');
  }
  if (m.note) add('note', 'Note for this medium', 'na', m.note, '');
  return finish();

  function finish() {
    const counts = { pass: 0, fail: 0, check: 0, na: 0 }; items.forEach(i => counts[i.status]++);
    return { code, rule, medium, mediumRule: m, items, counts, checked: RERA_CHECKED, basis: rule.basis, sources: rule.sources || [], ok: counts.fail === 0 && counts.check === 0 };
  }
}
function where(b) { const cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2; return `${cy < 0.33 ? 'top' : cy > 0.66 ? 'bottom' : 'middle'} ${cx < 0.33 ? 'left' : cx > 0.66 ? 'right' : 'centre'}`; }

/** Short suggestion lines from a check, for the Suggestions tab. */
export function reraNotes(res) {
  if (!res) return [];
  return res.items.filter(i => i.status === 'fail').map(i => `${res.rule.authority}: ${i.detail} ${i.fix}`.trim())
    .concat(res.items.filter(i => i.status === 'check').length ? [`${res.items.filter(i => i.status === 'check').length} RERA item(s) need a check by eye (see the RERA tab).`] : []);
}

/** What the new-version generator must draw for a state: { authority, website, reg, qr, zone, sizeRef, bans }. */
export function reraBlockSpec(ctx = {}, medium = 'social', overrides) {
  const code = reraRegion(ctx), rule = reraRule(code, overrides), m = reraMedium(rule, medium);
  return { code, authority: rule.authority, website: rule.website, reg: String(ctx.rera || '').split(/[\s,;]+/)[0], qr: (m.requires || []).includes('qr'),
    permit: (m.requires || []).includes('permit') ? (ctx.permit || '') : null, zone: m.zone || 'top-right', size: m.size || null, bans: rule.bans || [] };
}
