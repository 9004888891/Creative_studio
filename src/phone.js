// Phone & placements: how a creative survives the real screen.
//
// 1. Placements: each Meta placement shows the creative at its own shape, and Reels and Stories lay the app's own
//    interface (profile line, caption, buttons) over parts of it. placementPlan() fits the creative to a placement
//    (a smart crop, or the whole creative on a blurred background when a crop would cut something important) and
//    lists the key elements that would be cut off or sit under the interface. drawPlacement() draws it for a preview
//    or a full-size download.
// 2. Readability: legibility() measures every text element as it will appear in a phone feed (its size in screen
//    pixels) and its contrast with what is behind it (WCAG contrast ratio), from the creative's own pixels.

/** Placements and the parts of the screen the app covers (fractions of the placement frame). Meta's safe-zone guidance, rounded. */
export const PLACEMENTS = {
  feed: { label: 'Feed 4:5', ratio: 4 / 5, size: [1080, 1350], ui: [], note: 'Feeds show at most 4:5; a taller creative is cropped to 4:5.' },
  square: { label: 'Feed 1:1', ratio: 1, size: [1080, 1080], ui: [] },
  reels: { label: 'Reels 9:16', ratio: 9 / 16, size: [1080, 1920], ui: [
    { name: 'profile and audio line', box: [0, 0, 1, 0.14] },
    { name: 'caption, call-to-action button and profile', box: [0, 0.65, 1, 0.35] },
    { name: 'like, comment and share buttons', box: [0.86, 0.38, 0.14, 0.62] }],
    note: 'Keep text out of the top 14% and bottom 35%, and away from the buttons on the right.' },
  stories: { label: 'Stories 9:16', ratio: 9 / 16, size: [1080, 1920], ui: [
    { name: 'profile line', box: [0, 0, 1, 0.14] },
    { name: 'call-to-action and reply bar', box: [0, 0.8, 1, 0.2] }],
    note: 'Keep text out of the top 14% and bottom 20%.' },
  landscape: { label: 'Landscape 1.91:1', ratio: 1.91, size: [1200, 628], ui: [], note: 'Right column, Audience Network and some in-stream slots.' },
};
const PH_KEY = { price: 4, rera: 4, qr: 4, website: 3, cta: 3, logo: 3, project_name: 3, offer: 3, headline: 2, location: 2, contact: 2, subhead: 1, other_text: 1 };
const PH_LABEL = { price: 'price', rera: 'RERA number', qr: 'RERA QR code', website: 'website', cta: 'call to action', logo: 'logo', project_name: 'project name', offer: 'offer', headline: 'headline', location: 'location', contact: 'contact details', subhead: 'subhead', other_text: 'small print' };

const phArea = b => Math.max(0, b[2]) * Math.max(0, b[3]);
const phInter = (a, b) => { const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]), x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]); return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null; };

/** Map a box from the creative (fractions) into the placement frame. */
function phMap(b, fit) {
  if (fit.mode === 'crop') return [(b[0] - fit.x) / fit.w, (b[1] - fit.y) / fit.h, b[2] / fit.w, b[3] / fit.h];
  return [fit.x + b[0] * fit.w, fit.y + b[1] * fit.h, b[2] * fit.w, b[3] * fit.h];
}

function phScore(els, fit, P, map) {
  let s = 0;
  els.forEach(e => { const k = PH_KEY[e.type] || 0; if (!k) return; const m = phMap(e.cbox, fit), inn = phInter(m, [0, 0, 1, 1]), kept = inn ? phArea(inn) / Math.max(1e-6, phArea(m)) : 0;
    let under = 0; P.ui.forEach(z => { const i = phInter(m, z.box); if (i) under = Math.max(under, phArea(i) / Math.max(1e-6, phArea(m))); });
    s += k * (kept - 0.8 * under); });
  if (map && fit.mode === 'crop') s += 2 * phShare(map, [fit.x, fit.y, fit.w, fit.h]);
  return s;
}
function phShare(map, b) {   // share of the saliency inside a box (map: { w, h, s })
  if (!map || !map.s) return 0; let t = 0, inn = 0; const x0 = Math.floor(b[0] * map.w), y0 = Math.floor(b[1] * map.h), x1 = Math.ceil((b[0] + b[2]) * map.w), y1 = Math.ceil((b[1] + b[3]) * map.h);
  for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) { const v = map.s[y * map.w + x]; t += v; if (x >= x0 && x < x1 && y >= y0 && y < y1) inn += v; }
  return t ? inn / t : 0;
}

/**
 * How the creative lands in one placement. ratio: the creative's width ÷ height; els: elements with cbox (fractions of the creative);
 * map: the saliency map (optional, steers the crop). mode: 'auto' (crop unless it cuts something important), 'crop' or 'pad'.
 * Returns { key, label, fit, issues: [{ type, label, text, problem: 'cut'|'ui', zone }], ok, mode, same }.
 */
export function placementPlan(ratio, els, key, opts = {}) {
  const P = PLACEMENTS[key], rp = P.ratio, rc = ratio, list = (els || []).filter(e => e.cbox && PH_KEY[e.type]);
  const same = Math.abs(rc - rp) / rp < 0.02;
  const crops = [];
  if (same) crops.push({ mode: 'crop', x: 0, y: 0, w: 1, h: 1 });
  else if (rc > rp) { const w = rp / rc; for (let i = 0; i <= 20; i++) crops.push({ mode: 'crop', x: (1 - w) * i / 20, y: 0, w, h: 1 }); }
  else { const h = rc / rp; for (let i = 0; i <= 20; i++) crops.push({ mode: 'crop', x: 0, y: (1 - h) * i / 20, w: 1, h }); }
  let best = crops[0], bs = -Infinity;
  crops.forEach(f => { const s = phScore(list, f, P, opts.map); if (s > bs + 1e-9) { bs = s; best = f; } });
  // padding: the whole creative inside the frame, kept clear of the interface where it fits
  const pad = (() => { if (same) return null; const top = P.ui.filter(z => z.box[1] === 0 && z.box[2] === 1).reduce((m, z) => Math.max(m, z.box[3]), 0), bot = P.ui.filter(z => z.box[1] + z.box[3] >= 0.999 && z.box[2] === 1).reduce((m, z) => Math.max(m, z.box[3]), 0);
    if (rc > rp) { const h = rp / rc, room = 1 - top - bot; return { mode: 'pad', x: 0, y: h <= room ? top + (room - h) / 2 : (1 - h) / 2, w: 1, h }; }
    const w = rc / rp; return { mode: 'pad', x: (1 - w) / 2, y: 0, w, h: 1 }; })();
  const issuesOf = fit => { const out = []; list.forEach(e => { const m = phMap(e.cbox, fit), inn = phInter(m, [0, 0, 1, 1]), kept = inn ? phArea(inn) / Math.max(1e-6, phArea(m)) : 0;
    if (kept < 0.85) out.push({ type: e.type, label: PH_LABEL[e.type] || e.type, text: e.text || '', problem: 'cut', part: e.part });
    else { const z = P.ui.map(u => ({ u, i: phInter(m, u.box) })).filter(x => x.i && phArea(x.i) / phArea(m) > 0.3)[0];
      if (z) out.push({ type: e.type, label: PH_LABEL[e.type] || e.type, text: e.text || '', problem: 'ui', zone: z.u.name, part: e.part }); } }); return out; };
  const cropIssues = issuesOf(best), cutKey = cropIssues.some(i => i.problem === 'cut' && (PH_KEY[i.type] || 0) >= 3);
  const pen = list => list.reduce((p, i) => p + (PH_KEY[i.type] || 1) * (i.problem === 'cut' ? 1.5 : 1), 0), padIssues = pad ? issuesOf(pad) : null;
  const mode = opts.mode === 'crop' || opts.mode === 'pad' ? opts.mode : same ? 'crop' : pad && (cutKey || pen(padIssues) < pen(cropIssues)) ? 'pad' : 'crop';
  const fit = mode === 'pad' && pad ? pad : best, issues = mode === 'pad' && pad ? padIssues : cropIssues;
  return { key, label: P.label, note: P.note || '', fit, issues, ok: !issues.length, mode: fit.mode, same, ui: P.ui, size: P.size, cropCuts: cutKey, padBetter: !!pad && fit.mode === 'pad' && !cutKey };
}

/** Plans for every placement at once. */
export function placementPlans(ratio, els, opts = {}) { return Object.keys(PLACEMENTS).map(k => placementPlan(ratio, els, k, Object.assign({}, opts, { mode: (opts.modes || {})[k] }))); }

/**
 * Draw a creative into a placement frame. src: an image or canvas of the creative (already cropped to the creative area);
 * W×H: the output size. opts: { zones: true to shade the interface, boxes: [{ cbox, bad }] to outline elements }.
 */
export function drawPlacement(canvas, src, plan, W, H, opts = {}) {
  canvas.width = W; canvas.height = H; const x = canvas.getContext('2d'), sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height, f = plan.fit;
  x.clearRect(0, 0, W, H);
  if (f.mode === 'pad') {   // blurred cover behind the whole creative
    const k = Math.max(W / sw, H / sh); x.save(); x.filter = `blur(${Math.round(Math.max(W, H) / 40)}px) brightness(0.8)`; x.drawImage(src, (W - sw * k) / 2, (H - sh * k) / 2, sw * k, sh * k); x.restore();
    x.drawImage(src, f.x * W, f.y * H, f.w * W, f.h * H);
  } else x.drawImage(src, f.x * sw, f.y * sh, f.w * sw, f.h * sh, 0, 0, W, H);
  if (opts.zones) plan.ui.forEach(z => { x.fillStyle = 'rgba(15,23,42,.42)'; x.fillRect(z.box[0] * W, z.box[1] * H, z.box[2] * W, z.box[3] * H); x.strokeStyle = 'rgba(255,255,255,.55)'; x.setLineDash([5, 4]); x.lineWidth = 1; x.strokeRect(z.box[0] * W + 0.5, z.box[1] * H + 0.5, z.box[2] * W - 1, z.box[3] * H - 1); x.setLineDash([]); });
  (opts.boxes || []).forEach(b => { const m = phMap(b.cbox, f); x.strokeStyle = b.bad ? '#dc2626' : '#16a34a'; x.lineWidth = Math.max(2, W / 260); x.strokeRect(m[0] * W, m[1] * H, m[2] * W, m[3] * H); });
  return canvas;
}

// ---------- readability ----------
const phLin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const phLum = (r, g, b) => 0.2126 * phLin(r) + 0.7152 * phLin(g) + 0.0722 * phLin(b);
/** WCAG contrast ratio of two relative luminances. */
export const contrastRatio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Text colour against background inside a box of a pixel buffer: two-cluster split on luminance. */
export function textContrast(P, box) {
  const x0 = Math.max(0, Math.floor(box[0] * P.w)), y0 = Math.max(0, Math.floor(box[1] * P.h)), x1 = Math.min(P.w, Math.ceil((box[0] + box[2]) * P.w)), y1 = Math.min(P.h, Math.ceil((box[1] + box[3]) * P.h));
  const L = []; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * P.w + x) * 4; L.push(phLum(P.d[i], P.d[i + 1], P.d[i + 2])); }
  if (L.length < 12) return null;
  const s = L.slice().sort((a, b) => a - b); let c0 = s[Math.floor(s.length * 0.08)], c1 = s[Math.floor(s.length * 0.92)];
  if (c1 - c0 < 1e-4) return { ratio: 1, text: c0, bg: c0, busy: 0, share: 0 };
  let a0 = [], a1 = [];
  for (let it = 0; it < 6; it++) { a0 = []; a1 = []; L.forEach(v => (Math.abs(v - c0) <= Math.abs(v - c1) ? a0 : a1).push(v)); c0 = a0.reduce((p, v) => p + v, 0) / Math.max(1, a0.length); c1 = a1.reduce((p, v) => p + v, 0) / Math.max(1, a1.length); }
  const textIs0 = a0.length < a1.length, tx = textIs0 ? c0 : c1, bg = textIs0 ? c1 : c0, bgArr = textIs0 ? a1 : a0;
  const bm = bgArr.reduce((p, v) => p + v, 0) / Math.max(1, bgArr.length), busy = Math.sqrt(bgArr.reduce((p, v) => p + (v - bm) * (v - bm), 0) / Math.max(1, bgArr.length));
  return { ratio: contrastRatio(tx, bg), text: tx, bg, busy, share: Math.min(a0.length, a1.length) / L.length };
}

/**
 * Readability of every text element on a phone. P: the creative's pixels ({ w, h, d }); ratio: creative width ÷ height;
 * opts.screenWidth: CSS pixels the creative fills in the feed (360 by default, a typical phone).
 * Returns [{ type, text, part, px, contrast, busy, size: 'ok'|'small'|'tiny', contrastOk: 'ok'|'low'|'poor', verdict: 'ok'|'warn'|'fail', why }].
 */
export function legibility(P, els, ratio, opts = {}) {
  const sw = opts.screenWidth || 360, shPx = sw / ratio, small = new Set(['rera', 'website', 'contact', 'other_text']);
  return (els || []).filter(e => e.cbox && e.text && String(e.text).trim().length > 1 && e.type !== 'qr' && e.type !== 'logo').map(e => {
    const t = String(e.text).trim(), bw = e.cbox[2] * sw, bh = e.cbox[3] * shPx;
    let lines = Math.max(1, (t.match(/\n/g) || []).length + 1), lh = bh / lines;
    for (let k = 0; k < 8 && t.length * 0.52 * lh * 0.8 > bw * lines * 1.08; k++) { lines++; lh = bh / lines; }
    const px = Math.round(lh * 0.8 * 10) / 10, isSmall = small.has(e.type), big = px >= 18;
    const size = isSmall ? (px >= 7 ? 'ok' : px >= 5.5 ? 'small' : 'tiny') : (px >= 13 ? 'ok' : px >= 10 ? 'small' : 'tiny');
    const c = P ? textContrast(P, e.cbox) : null, need = big ? 3 : 4.5;
    const contrastOk = !c ? 'ok' : c.ratio >= need ? 'ok' : c.ratio >= (big ? 2 : 3) ? 'low' : 'poor';
    const verdict = size === 'tiny' || contrastOk === 'poor' ? 'fail' : size === 'small' || contrastOk === 'low' || (c && c.busy > 0.16) ? 'warn' : 'ok';
    const why = [size !== 'ok' ? `about ${px} px tall on a phone (${isSmall ? 'small print needs about 7 px' : 'main text needs about 13 px'})` : '',
      contrastOk !== 'ok' ? `contrast ${c.ratio.toFixed(1)}:1 (needs ${need}:1)` : '', c && c.busy > 0.16 ? 'busy background behind it' : ''].filter(Boolean).join('; ');
    return { type: e.type, text: t, part: e.part, cbox: e.cbox, px, contrast: c ? Math.round(c.ratio * 10) / 10 : null, busy: c ? c.busy : null, size, contrastOk, verdict, why, small: isSmall };
  });
}
