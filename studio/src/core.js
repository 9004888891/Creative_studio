// Creative heatmap engine: predicted attention (visual saliency), scores, viewing order,
// element attention shares and suggestions. Runs in the browser, no dependencies.
//
// The model is Itti-Koch style saliency: multi-scale centre-surround contrast on luminance and
// two colour-opponent channels, plus edge / text density and a centre bias. It predicts where eyes
// go in the first seconds. It is not eye-tracking.
import { speechProbabilities, speechSegments } from './voice.js';
import { tagPromptPart } from './intel.js';
import { qcPromptPart } from './qc.js';
import { readPromptPart } from './brief.js';

/** Load an image from a URL, data URL or object URL. */
export function loadImage(src) {
  return new Promise((ok, bad) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => ok(im);
    im.onerror = () => bad(new Error('The image could not be loaded: ' + String(src).slice(0, 80)));
    im.src = src;
  });
}

const natW = img => img.naturalWidth || img.videoWidth || img.width;
const natH = img => img.naturalHeight || img.videoHeight || img.height;

/** Draw an image (optionally a crop of it) at width W and return its pixels. */
export function toPixels(img, crop, W) {
  const cw = crop ? crop.w : natW(img), ch = crop ? crop.h : natH(img);
  const H = Math.max(1, Math.round(W * ch / cw));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, crop ? crop.x : 0, crop ? crop.y : 0, cw, ch, 0, 0, W, H);
  return { c, w: W, h: H, d: x.getImageData(0, 0, W, H).data };
}

/** For screenshots of a feed: find the ad inside the white app frame. Returns a crop or null. */
export function autoCrop(img) {
  const P = toPixels(img, null, Math.min(240, natW(img))), { w, h, d } = P;
  const white = i => d[i] > 232 && d[i + 1] > 232 && d[i + 2] > 232;
  const rowW = [];
  for (let y = 0; y < h; y++) { let n = 0; for (let x = 0; x < w; x++) if (white((y * w + x) * 4)) n++; rowW.push(n / w); }
  let best = [0, h - 1, 0], s = -1;
  for (let y = 0; y <= h; y++) {
    const ink = y < h && rowW[y] < 0.55;
    if (ink && s < 0) s = y;
    if ((!ink || y === h) && s >= 0) { if (y - s > best[2]) best = [s, y - 1, y - s]; s = -1; }
  }
  if (best[2] < h * 0.3) return null;
  const y0 = best[0], y1 = best[1], colW = [];
  for (let x = 0; x < w; x++) { let n = 0; for (let y = y0; y <= y1; y++) if (white((y * w + x) * 4)) n++; colW.push(n / (y1 - y0 + 1)); }
  let x0 = 0, x1 = w - 1;
  while (x0 < x1 && colW[x0] > 0.5) x0++;
  while (x1 > x0 && colW[x1] > 0.5) x1--;
  const k = natW(img) / w;
  const r = { x: Math.round(x0 * k), y: Math.round(y0 * k), w: Math.round((x1 - x0 + 1) * k), h: Math.round((y1 - y0 + 1) * k) };
  return r.w * r.h < natW(img) * natH(img) * 0.92 ? r : null;
}

function boxBlur(a, w, h, r) {
  if (r < 1) return a.slice();
  const t = new Float32Array(a.length), o = new Float32Array(a.length);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += a[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { t[y * w + x] = s / (2 * r + 1); s += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { o[y * w + x] = s / (2 * r + 1); s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; }
  }
  return o;
}
const gblur = (a, w, h, r) => boxBlur(boxBlur(boxBlur(a, w, h, r), w, h, r), w, h, r);

/**
 * Predicted attention map from pixels (use a ~120 px wide version for speed).
 * Returns {w, h, s: Float32Array 0..1, tot, focus, clutter, contrast}.
 */
export function saliency(P) {
  const { w, h, d } = P, n = w * h, L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[i * 4] / 255, g = d[i * 4 + 1] / 255, b = d[i * 4 + 2] / 255;
    L[i] = 0.299 * r + 0.587 * g + 0.114 * b; A[i] = r - g; B[i] = (r + g) / 2 - b;
  }
  const S = new Float32Array(n), sc = [Math.max(1, Math.round(w / 48)), Math.max(2, Math.round(w / 24)), Math.max(3, Math.round(w / 12))];
  [[L, 1.0], [A, 0.7], [B, 0.7]].forEach(([C, wt]) => sc.forEach(r => {
    const bl = gblur(C, w, h, r); for (let i = 0; i < n; i++) S[i] += wt * Math.abs(C[i] - bl[i]);
  }));
  // edge / text density (Sobel)
  const E = new Float32Array(n); let edgeN = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = L[i + 1 - w] + 2 * L[i + 1] + L[i + 1 + w] - L[i - 1 - w] - 2 * L[i - 1] - L[i - 1 + w];
    const gy = L[i + w - 1] + 2 * L[i + w] + L[i + w + 1] - L[i - w - 1] - 2 * L[i - w] - L[i - w + 1];
    const m = Math.hypot(gx, gy); E[i] = m; if (m > 0.6) edgeN++;
  }
  const Ed = gblur(E, w, h, Math.max(2, Math.round(w / 30)));
  let mx = 0;
  for (let i = 0; i < n; i++) { S[i] += 0.6 * Ed[i]; mx = Math.max(mx, S[i]); }
  // centre bias and fall-off at the edges
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, dx = (x / w - 0.5) / 0.45, dy = (y / h - 0.48) / 0.5;
    const ex = Math.min(1, Math.min(x, w - 1 - x) / (w * 0.06)), ey = Math.min(1, Math.min(y, h - 1 - y) / (h * 0.06));
    S[i] = (S[i] / (mx || 1)) * (0.55 + 0.45 * Math.exp(-(dx * dx + dy * dy))) * (0.35 + 0.65 * Math.min(ex, ey));
  }
  const s2 = gblur(S, w, h, Math.max(2, Math.round(w / 28)));
  mx = 0; for (let i = 0; i < n; i++) mx = Math.max(mx, s2[i]);
  let tot = 0; for (let i = 0; i < n; i++) { s2[i] = Math.pow(s2[i] / (mx || 1), 1.6); tot += s2[i]; }
  let lm = 0; for (let i = 0; i < n; i++) lm += L[i]; lm /= n;
  let lv = 0; for (let i = 0; i < n; i++) lv += (L[i] - lm) ** 2;
  const sorted = Array.from(s2).sort((a, b) => b - a);
  let top = 0; for (let i = 0; i < Math.round(n * 0.15); i++) top += sorted[i];
  return { w, h, s: s2, tot, focus: top / (tot || 1), clutter: edgeN / n, contrast: Math.sqrt(lv / n) };
}

/** The k strongest attention points, in likely viewing order. Each {x, y, v}, x/y as 0..1. */
export function peaks(S, k = 3) {
  const { w, h, s } = S, a = Float32Array.from(s), out = [], R = Math.round(w * 0.16);
  for (let t = 0; t < k; t++) {
    let bi = 0; for (let i = 1; i < a.length; i++) if (a[i] > a[bi]) bi = i;
    if (a[bi] <= 0.05) break;
    const px = bi % w, py = Math.floor(bi / w); out.push({ x: px / w, y: py / h, v: a[bi] });
    for (let y = Math.max(0, py - R); y < Math.min(h, py + R); y++) for (let x = Math.max(0, px - R); x < Math.min(w, px + R); x++)
      if ((x - px) ** 2 + (y - py) ** 2 < R * R) a[y * w + x] = 0;
  }
  return out;
}

/** Share of total predicted attention inside a box [x, y, w, h] (fractions 0..1). */
export function shareIn(S, b) {
  if (!b) return null;
  const { w, h, s } = S; let t = 0;
  const x0 = Math.max(0, Math.floor(b[0] * w)), y0 = Math.max(0, Math.floor(b[1] * h));
  const x1 = Math.min(w, Math.ceil((b[0] + b[2]) * w)), y1 = Math.min(h, Math.ceil((b[1] + b[3]) * h));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) t += s[y * w + x];
  return t / (S.tot || 1);
}

/** 0..100 scores, calibrated on real-estate feed creatives. Clutter: lower is better. */
export function scores(S) {
  const cl = v => Math.round(Math.max(0, Math.min(1, v)) * 100);
  const focus = cl((S.focus - 0.18) / 0.3), clutter = cl((S.clutter - 0.06) / 0.28), contrast = cl((S.contrast - 0.06) / 0.22);
  return { focus, clutter, contrast, overall: Math.round(focus * 0.45 + (100 - clutter) * 0.3 + contrast * 0.25) };
}
export const scoreWord = v => v >= 70 ? 'Strong' : v >= 45 ? 'Fair' : 'Weak';

export function heatColor(v) {
  const st = [[0, [40, 60, 200]], [0.35, [30, 190, 120]], [0.6, [250, 220, 40]], [0.85, [250, 120, 30]], [1, [220, 30, 30]]];
  for (let i = 1; i < st.length; i++) if (v <= st[i][0]) {
    const [a, ca] = st[i - 1], [b, cb] = st[i], t = (v - a) / (b - a);
    return ca.map((c, j) => Math.round(c + (cb[j] - c) * t));
  }
  return st[st.length - 1][1];
}

/**
 * Paint a view onto a canvas. mode: 'original' | 'heat' | 'fog' (focus view).
 * els: optional [{type, cbox:[x,y,w,h]}] element boxes to outline.
 */
export function paintView(cv, src, S, mode = 'heat', pk = null, els = null) {
  const W = cv.width, H = cv.height, x = cv.getContext('2d');
  x.clearRect(0, 0, W, H); x.drawImage(src, 0, 0, W, H);
  if (mode === 'heat' || mode === 'fog') {
    const o = document.createElement('canvas'); o.width = S.w; o.height = S.h;
    const ox = o.getContext('2d'), im = ox.createImageData(S.w, S.h);
    for (let i = 0; i < S.s.length; i++) {
      const v = S.s[i];
      if (mode === 'heat') { const c = heatColor(v); im.data[i * 4] = c[0]; im.data[i * 4 + 1] = c[1]; im.data[i * 4 + 2] = c[2]; im.data[i * 4 + 3] = Math.round(40 + 150 * Math.min(1, v * 1.3)); }
      else { im.data[i * 4] = 12; im.data[i * 4 + 1] = 16; im.data[i * 4 + 2] = 22; im.data[i * 4 + 3] = Math.round(235 * (1 - Math.min(1, v * 1.6))); }
    }
    ox.putImageData(im, 0, 0); x.imageSmoothingEnabled = true; x.drawImage(o, 0, 0, W, H);
  }
  if (els && mode !== 'fog') els.forEach(e => {
    if (!e.cbox) return;
    x.strokeStyle = 'rgba(255,255,255,.9)'; x.lineWidth = 2; x.setLineDash([5, 4]);
    x.strokeRect(e.cbox[0] * W, e.cbox[1] * H, e.cbox[2] * W, e.cbox[3] * H); x.setLineDash([]);
    x.fillStyle = 'rgba(0,0,0,.65)'; x.font = '600 11px system-ui,sans-serif';
    const t = String(e.type).replace('_', ' ');
    x.fillRect(e.cbox[0] * W, e.cbox[1] * H, x.measureText(t).width + 8, 15);
    x.fillStyle = '#fff'; x.fillText(t, e.cbox[0] * W + 4, e.cbox[1] * H + 11);
  });
  if (pk && mode !== 'original') pk.forEach((p, i) => {
    x.beginPath(); x.arc(p.x * W, p.y * H, 13, 0, 7); x.fillStyle = 'rgba(255,255,255,.95)'; x.fill();
    x.lineWidth = 2; x.strokeStyle = '#111'; x.stroke(); x.fillStyle = '#111'; x.font = '700 13px system-ui,sans-serif';
    x.textAlign = 'center'; x.fillText(String(i + 1), p.x * W, p.y * H + 4.5); x.textAlign = 'start';
  });
}

/**
 * One-call analysis of an image (HTMLImageElement, canvas or video frame).
 * opts.screenshot: crop a feed screenshot down to the ad first.
 * Returns {img, crop, display: pixels for showing, map, scores, peaks}.
 */
export function analyseImage(img, opts = {}) {
  const crop = opts.screenshot ? autoCrop(img) : null;
  const display = toPixels(img, crop, Math.min(opts.displayWidth || 640, crop ? crop.w : natW(img)));
  const map = saliency(toPixels(img, crop, 120));
  return { img, crop, display, map, scores: scores(map), peaks: peaks(map, 3) };
}

/** Convenience: analyse from a URL / data URL. */
export async function analyse(src, opts = {}) { return analyseImage(await loadImage(src), opts); }

/** Map AI element boxes (fractions of the full image) into the cropped view. */
export function elementsInView(ai, a) {
  if (!ai || !a) return [];
  const cr = a.crop, iw = natW(a.img), ih = natH(a.img);
  const els = (ai.elements || []).filter(e => Array.isArray(e.box) && e.box.length === 4 && e.box.every(v => isFinite(Number(v))));
  const px = els.some(e => e.box.some(v => Number(v) > 1.5));   // some replies give pixels instead of fractions
  return els.map(e => {
    let [x, y, w, h] = e.box.map(Number);
    if (px) { x /= iw; y /= ih; w /= iw; h /= ih; }
    if (cr) { x = (x * iw - cr.x) / cr.w; y = (y * ih - cr.y) / cr.h; w = w * iw / cr.w; h = h * ih / cr.h; }
    const cx = Math.max(0, x), cy = Math.max(0, y), cw = Math.min(1, x + w) - cx, ch = Math.min(1, y + h) - cy;
    return Object.assign({}, e, { cbox: cw > 0.01 && ch > 0.01 ? [cx, cy, cw, ch] : null });
  }).filter(e => e.cbox);
}

export const ELEMENT_LABELS = { headline: 'Headline', subhead: 'Sub-headline', price: 'Price', offer: 'Offer', cta: 'Call to action', logo: 'Logo', project_name: 'Project name', location: 'Location', person: 'Person', building: 'Building', interior: 'Interior', amenity: 'Amenity', map: 'Map', qr: 'QR code', rera: 'RERA number', website: 'Website', contact: 'Contact / address', other_text: 'Other text' };

/** Attention share per element type, highest first: [[type, share], ...]. */
export function elementShares(a, els) {
  const by = {}; els.forEach(e => { by[e.type] = (by[e.type] || 0) + shareIn(a.map, e.cbox); });
  return Object.entries(by).sort((p, q) => q[1] - p[1]);
}

/** Where a point sits, in words. */
export function placeWord(pk) {
  const v = pk.y < 0.4 ? 'upper' : pk.y > 0.6 ? 'lower' : '', h = pk.x < 0.4 ? 'left' : pk.x > 0.6 ? 'right' : '';
  return v && h ? v + ' ' + h : v ? v + ' middle' : h ? 'middle ' + h : 'centre';
}

/** Likely viewing order as readable items: [{label, text}] (uses AI elements when present). */
export function viewingOrder(a, els) {
  const nearest = pk => {
    let best = null, bd = 1e9;
    els.forEach(e => { const b = e.cbox; const dx = Math.max(b[0] - pk.x, 0, pk.x - (b[0] + b[2])), dy = Math.max(b[1] - pk.y, 0, pk.y - (b[1] + b[3])); const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = e; } });
    return bd < 0.01 ? best : null;
  };
  const seen = new Set(), out = [];
  a.peaks.slice(0, 3).forEach(pk => {
    const e = nearest(pk), k = e ? e.type + '|' + e.text : placeWord(pk);
    if (seen.has(k)) return; seen.add(k);
    out.push(e ? { label: ELEMENT_LABELS[e.type] || e.type, text: e.text ? String(e.text).slice(0, 40) : '' } : { label: placeWord(pk) + ' of the creative', text: '' });
  });
  return out;
}

/**
 * Practical suggestions. perf (optional): {cost, avgCost, metric:'CPQL'|'CPL', format:(n)=>string}.
 */
export function suggestions(a, els = [], ai = null, perf = null) {
  const sc = a.scores, out = [];
  const sh = t => { const e = els.filter(x => x.type === t); return e.length ? e.reduce((s, x) => s + shareIn(a.map, x.cbox), 0) : null; };
  const price = sh('price'), cta = sh('cta'), logo = (sh('logo') || 0) + (sh('project_name') || 0), hl = sh('headline');
  if (els.length) {
    if (price == null) out.push('No price is visible. Real-estate creatives that show the entry price ("2 BHK from ₹1.53 Cr") filter out buyers outside the budget and usually lift the QL rate.');
    else if (price < 0.08) out.push(`The price gets only ${Math.round(price * 100)}% of predicted attention. Make it 1.5–2× larger, put it on a solid colour band and move it into the upper half.`);
    if (cta == null) out.push('There is no call to action in the creative itself. Add one short line such as "Book a site visit" near the price.');
    if (logo > 0.25) out.push(`Logo and project name take ${Math.round(logo * 100)}% of attention, more than the offer. Shrink the lock-up and give the space to the hero image and price.`);
    if (hl != null && hl < 0.06) out.push('The headline is hard to notice. Use fewer words, a heavier weight and stronger contrast against the image.');
    const nT = els.filter(e => /text|headline|subhead|price|offer|location|rera|project_name/.test(e.type)).length;
    if (nT >= 7) out.push(`There are ${nT} separate text blocks. Keep three: headline, price and call to action; move the rest into the ad copy.`);
  }
  if (sc.focus < 45) out.push(`Attention is spread out (focus ${sc.focus}/100). Give the creative one clear hero: a single building shot, a person or the price, not all at once.`);
  if (sc.clutter > 65) out.push(`The layout is busy (clutter ${sc.clutter}/100). Remove decorative elements and small text, and leave more empty space around the price.`);
  if (sc.contrast < 40) out.push(`Contrast is low (${sc.contrast}/100), so the creative will blend into the feed. Brighten the hero or add a dark band behind the text.`);
  const pk = a.peaks[0];
  if (pk && pk.y > 0.66) out.push('The first look lands in the bottom third. Move the main message up; the bottom of feed creatives is often covered by captions and buttons.');
  if (perf && perf.cost && perf.avgCost) {
    const f = perf.format || (n => '₹' + Math.round(n).toLocaleString('en-IN')), m = ({ CPQL: 'cost per qualified lead', CPL: 'cost per lead' })[perf.metric || 'CPL'] || perf.metric, r = perf.cost / perf.avgCost;
    if (r > 1.2) out.push(`This creative's ${m} is ${Math.round((r - 1) * 100)}% higher than your usual (${f(perf.cost)} against ${f(perf.avgCost)}). Test a new version to replace it.`);
    else if (r < 0.85) out.push(`This creative's ${m} is ${Math.round((1 - r) * 100)}% better than the average. Keep it running and test a new version against it rather than replacing it.`);
  }
  ((ai && ai.suggestions) || []).forEach(t => out.push(String(t)));
  return [...new Set(out)].slice(0, 9);
}

/** Prompt for the AI reading. ctx: {project, brand, location, inventory, priceRange, micro, usps, title, results, frame} */
export function aiPrompt(ctx = {}) {
  const c = ctx;
  return `You are reviewing a real-estate performance ad for an Indian property project, like an ad-creative analyst. The image may be a screenshot of a Facebook/Instagram feed ad; analyse only the ad creative itself.
${c.project ? `Project: ${c.project}${c.brand || c.location ? ` (${[c.brand, c.location].filter(Boolean).join(', ')})` : ''}.` : ''} ${c.inventory || ''} ${c.priceRange ? 'Price range: ' + c.priceRange + '.' : ''} ${c.micro ? 'Micro-market: ' + c.micro + '.' : ''} ${c.usps ? 'USPs: ' + c.usps + '.' : ''}
${c.title ? `Creative name: ${c.title}.` : ''} ${c.card ? `This image is card ${c.card.n} of ${c.card.of} of a carousel ad; judge it as that card in the swipe sequence (card 1 must stop the scroll, the last card should ask for action). ` : ''}${c.frame ? `This image is the frame at ${Number(c.frame.t).toFixed(1)} s of a ${c.frame.duration ? Math.round(c.frame.duration) + ' s ' : ''}video ad; judge it as that moment of the video. ` : ''}${c.results ? `Results: ${c.results}.` : ''}${c.transcript ? ` Voiceover (transcribed): "${String(c.transcript).slice(0, 1500)}". Judge the script too: does it name the project, location and price, and ask for a site visit?` : ''}
Reply with only one JSON object, no other text:
{"creativeBox":[x,y,w,h],"elements":[{"type":"headline|subhead|price|offer|cta|logo|project_name|location|contact|website|person|building|interior|amenity|map|qr|rera|other_text","text":"visible text if any","box":[x,y,w,h]}],"hook":"one sentence: what a viewer notices first and whether it sells the project","strengths":["..."],"issues":["..."],"suggestions":["specific, practical changes for the next version, max 5"],"newCopy":{"headline":"max 7 words","subhead":"max 10 words","price":"e.g. 2 BHK from ₹1.53 Cr*","offer":"short offer line or empty","cta":"max 4 words"},${readPromptPart()},${tagPromptPart()},${qcPromptPart()},"concepts":[{"angle":"2-4 words, e.g. Location and connectivity","headline":"max 7 words","subhead":"max 10 words","price":"price line or empty","offer":"only a real offer visible in the ad, else empty","cta":"max 4 words","visual":"the photo or graphic to use, one sentence","why":"why this idea fits this project and the results, one sentence"}]}
concepts: 3 clearly different ideas for the next creative (different angle, e.g. location, lifestyle or view, price-first, trust in the developer, site-visit invitation, amenities), not small edits of this ad and not only colour changes. Do not invent prices, offers, distances or dates that are not in the ad or the project details; write __ where a number is needed.\nType rera = the RERA registration number line, website = a web address (for example the RERA authority site), contact = phone numbers, e-mail or a site / office address, qr = a QR code; give every separate line of small print its own element with its exact text, including disclaimers.\ntags: classify the creative into those fixed values only (pick the closest; usp and proof may hold several).\nread: describe the ad in plain words that someone with no marketing background understands. clarity is clear when there is one main message, mixed when two or more compete, unclear when it is hard to tell what the ad is selling.\nqc: a quality-check reading. brandLogo is the developer's logo, projectLogo the project's own logo. visualType: render (3D render), stock (stock photo or footage), ai (AI-generated), actual (real site photo); mixed if more than one, listing each in visualSources; unknown if you cannot tell. Copy disclaimers exactly. List only problems you can actually see; leave lists empty when there are none.\nAll boxes are fractions (0-1) of the full image: x, y of the top-left corner, then width, height. creativeBox is the ad creative area inside the screenshot. List every visible element.`;
}

/** Image as a PNG/JPEG data URL (for sending to the AI endpoint). Large images are scaled to maxSide. */
export function imageDataURL(img, maxSide = 1568, type = 'image/jpeg') {
  const k = Math.min(1, maxSide / Math.max(natW(img), natH(img)));
  const c = document.createElement('canvas'); c.width = Math.round(natW(img) * k); c.height = Math.round(natH(img) * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL(type, 0.9);
}

/** Read three frames of a video file (hook ~1 s, early, middle). Returns {frames:[{t, src}], duration, url}. */
export async function videoFrames(file) {
  const url = typeof file === 'string' ? file : URL.createObjectURL(file), v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
  await new Promise((ok, bad) => { v.onloadeddata = ok; v.onerror = () => bad(new Error('video')); setTimeout(() => bad(new Error('timeout')), 20000); });
  const dur = isFinite(v.duration) ? v.duration : 0;
  const marks = videoMarks(dur), frames = [];
  for (const m of marks) {
    const t = m.t;
    if (Math.abs(v.currentTime - t) > 0.01) await new Promise(ok => { v.onseeked = ok; v.currentTime = t; setTimeout(ok, 4000); });
    const W = Math.min(720, v.videoWidth || 720), H = Math.round(W * (v.videoHeight || 1280) / (v.videoWidth || 720));
    const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(v, 0, 0, W, H);
    frames.push({ id: m.id, t, label: m.label, src: c.toDataURL('image/jpeg', 0.82) });
  }
  return { frames, duration: dur, url };
}

/**
 * The moments of a video that get a heatmap: 1 s (the hook), 3 s, and 5%, 10%, 15%, 25%, 50% (the middle) and 75% of its length,
 * plus the end frame (0.3 s before the end), which the quality check reads for the logos, price, RERA and disclaimers.
 * In a video too short for 1 s or 3 s, those become an early hook frame and an early frame.
 * Moments closer than 0.25 s are merged into one frame, so a short video is not read twice at the same spot.
 * Ids stay stable (f0 = 1 s, f1 = 3 s, f2 = middle, as before; p5…p75 for the others), so stored AI readings still match.
 */
export const VIDEO_MARKS = [
  { id: 'f0', at: d => d >= 1.5 ? 1 : d * 0.15, sec: 1, name: t => Math.abs(t - 1) < 0.05 ? '1 s (hook)' : 'Hook' },
  { id: 'f1', at: d => d >= 4 ? 3 : d * 0.35, sec: 3, name: t => Math.abs(t - 3) < 0.05 ? '3 s' : 'Early' },
  { id: 'p5', at: d => d * 0.05, name: () => '5%' },
  { id: 'p10', at: d => d * 0.10, name: () => '10%' },
  { id: 'p15', at: d => d * 0.15, name: () => '15%' },
  { id: 'p25', at: d => d * 0.25, name: () => '25%' },
  { id: 'f2', at: d => d * 0.5, name: () => '50% (middle)' },
  { id: 'p75', at: d => d * 0.75, name: () => '75%' },
  { id: 'end', at: d => Math.max(0, d - 0.3), name: () => 'End frame' },
];
export function videoMarks(dur, marks = VIDEO_MARKS) {
  const end = Math.max(0, dur - 0.05), pts = marks.map((m, k) => { const t = Math.max(0, Math.min(end, m.at(dur))); return { id: m.id, k, t, names: [{ k, n: m.name(t), exact: m.sec != null && Math.abs(t - m.sec) < 0.05 }] }; }).sort((a, b) => a.t - b.t || a.k - b.k);
  const out = [];
  pts.forEach(p => { const last = out[out.length - 1]; if (last && p.t - last.t < 0.25) { last.names.push(p.names[0]); if (/^f/.test(p.id) && !/^f/.test(last.id)) last.id = p.id; } else out.push(p); });
  return out.map(p => { const ns = p.names.sort((a, b) => a.k - b.k); return { id: p.id, t: p.t, label: ns.map(x => x.n).join(' / ') + (ns.some(x => x.exact) ? '' : ` · ${p.t.toFixed(1)} s`) }; });
}

/**
 * Checks across the moments of a video. frames: [{ t, label, scores }] in time order. Returns suggestions (strings).
 */
export function videoNotes(frames) {
  const out = []; if (!frames || frames.length < 2) return out;
  const ov = frames.map(f => f.scores.overall), avg = ov.reduce((a, b) => a + b, 0) / ov.length;
  const lo = ov.indexOf(Math.min(...ov)), hi = ov.indexOf(Math.max(...ov)), hook = frames.findIndex(f => /hook|1 s/i.test(f.label));
  const early = frames.filter(f => f.t <= 3), first = early.length ? Math.min(...early.map(f => f.scores.overall)) : ov[0];
  if (hook >= 0 && ov[hook] < avg - 5) out.push(`The hook at 1 s scores ${ov[hook]}, below the video's average of ${Math.round(avg)}. The first second decides whether people keep watching: open on the strongest shot (the ${frames[hi].label} frame scores ${ov[hi]}), with one clear subject and large text.`);
  else if (first < 45) out.push(`The opening seconds are weak (as low as ${first}/100). Put one clear subject and a short line on screen in the first 3 seconds.`);
  if (lo !== hook && ov[lo] < avg - 12) out.push(`Attention dips at ${frames[lo].label} (${ov[lo]} against an average of ${Math.round(avg)}). Tighten or replace that shot, or put a text line or the price on screen there to hold people.`);
  const cl = frames.filter(f => f.scores.clutter >= 75);
  if (cl.length >= Math.ceil(frames.length / 2)) out.push(`${cl.length} of ${frames.length} moments are busy (clutter 75 or more). Fewer elements per shot will make each one easier to read on a phone.`);
  const tail = frames.filter(f => f.t >= frames[frames.length - 1].t * 0.7);
  if (tail.length && Math.max(...tail.map(f => f.scores.overall)) < avg - 8) out.push('The later part of the video holds less attention than the start. Keep the project name, price and call to action on screen there, so people who stay get the offer.');
  return out;
}

/**
 * Carousel checks across cards. cards: [{ a: analysis, ai: AI reading or null, name }] in swipe order.
 * Returns { best: index of the strongest card, notes: [string] }.
 */
export function carouselNotes(cards) {
  const out = [], n = cards.length; if (!n) return { best: -1, notes: out };
  const ov = cards.map(c => c.a.scores.overall), best = ov.indexOf(Math.max(...ov));
  const has = (c, t) => c.ai ? (c.ai.elements || []).some(e => e.type === t) : null;
  if (n === 1) out.push('This carousel has one card. Add 3–5 cards: each card should add one reason to enquire (view, layout, amenity, location, price).');
  if (best > 0 && ov[best] - ov[0] >= 8) out.push(`Card ${best + 1} scores ${ov[best]} against ${ov[0]} for card 1. Consider leading with it: the first card decides whether people swipe at all.`);
  else if (ov[0] < 45) out.push(`The first card is weak (${ov[0]}/100). Give it one clear hero and a short hook; most people never see card 2.`);
  const spread = Math.max(...ov) - Math.min(...ov);
  if (n > 1 && spread > 30) { const lo = ov.indexOf(Math.min(...ov)); out.push(`Cards vary a lot (${Math.min(...ov)} to ${Math.max(...ov)}). Card ${lo + 1} is the weakest: rework or drop it, and keep one layout and colour band across cards so the set reads as one ad.`); }
  if (n > 5) out.push(`There are ${n} cards. Few people swipe past card 3 or 4, so keep the price, location and call to action in the first three.`);
  const ratios = cards.map(c => c.a.display.w / c.a.display.h);
  if (n > 1 && Math.max(...ratios) / Math.min(...ratios) > 1.05) out.push('The cards have different shapes. Platforms crop every card to the first card\'s ratio (1:1 or 4:5), so export all cards at one size.');
  const read = cards.filter(c => c.ai).length;
  if (read === n) {
    const pIdx = cards.findIndex(c => has(c, 'price'));
    if (pIdx < 0) out.push('No card shows a price. Put the entry price ("2 BHK from ₹1.15 Cr*") on card 1 or 2 to filter out buyers outside the budget.');
    else if (pIdx > 1) out.push(`The price first appears on card ${pIdx + 1}. Move it to card 1 or 2; many people never swipe that far.`);
    if (!has(cards[n - 1], 'cta')) out.push('The last card has no call to action. End on a card with one clear line such as "Book a site visit".');
    const logos = cards.filter(c => has(c, 'logo')).length;
    if (logos === 0) out.push('No card shows the logo or project name. Put a small lock-up on card 1 so the ad is recognised.');
    else if (logos === n && n > 2) out.push('Every card repeats the logo. Keep it on the first and last cards and give the space in between to visuals.');
  } else if (n > 1) out.push(`Read ${read ? 'the remaining' : 'all'} cards with AI to check where the price and call to action sit in the sequence.`);
  return { best, notes: out };
}

/* ---------- performance: the funnel down to site visits ---------- */
const num = v => (v == null || v === '' || isNaN(+v)) ? null : +v;
/**
 * Normalise a performance row from any dashboard. Accepts common field names:
 * spend/amount_spent, impressions/impr, clicks/link_clicks, leads, ql/qualified_leads, sv/site_visits, bookings.
 */
export function toFunnel(r = {}) {
  const g = (...k) => { for (const x of k) if (r[x] != null && r[x] !== '') return num(r[x]); return null; };
  return { name: r.name || r.ad || r.ad_name || r.creative || '', spend: g('spend', 'amount_spent', 'cost') || 0, impressions: g('impressions', 'impr'),
    clicks: g('clicks', 'link_clicks'), leads: g('leads', 'results') || 0, ql: g('ql', 'qualified_leads', 'qualified'), sv: g('sv', 'site_visits', 'siteVisits', 'visits'),
    bookings: g('bookings', 'sales') };
}
/** Add up rows into one funnel (used for the project average). */
export function sumFunnel(rows) {
  const o = { name: 'Average', spend: 0, impressions: null, clicks: null, leads: 0, ql: null, sv: null, bookings: null };
  const fr = rows.map(toFunnel), pairs = { ctr: ['clicks', 'impressions'], clickToLead: ['leads', 'clicks'], leadToQl: ['ql', 'leads'], qlToSv: ['sv', 'ql'],
    cpc: ['spend', 'clicks'], cpl: ['spend', 'leads'], cpql: ['spend', 'ql'], cpsv: ['spend', 'sv'], leadToSv: ['sv', 'leads'] };
  fr.forEach(r => ['spend', 'impressions', 'clicks', 'leads', 'ql', 'sv', 'bookings'].forEach(k => { if (r[k] != null) o[k] = (o[k] || 0) + r[k]; }));
  // each rate only from the rows that have both of its numbers, so a row without impressions does not inflate the average CTR
  o.rates = {}; Object.entries(pairs).forEach(([k, [a, b]]) => { let x = 0, y = 0, n = 0; fr.forEach(r => { if (r[a] != null && r[b] != null && (k !== 'cpql' || r.ql) && (k !== 'cpsv' || r.sv)) { x += r[a]; y += r[b]; n++; } }); o.rates[k] = n && y ? x / y : null; });
  return o;
}
/** Rates and costs for a funnel (null when not available). */
export function funnelRates(f) {
  if (f && f.rates) return Object.assign({}, f.rates);
  const d = (a, b) => a != null && b ? a / b : null;
  return { ctr: d(f.clicks, f.impressions), clickToLead: d(f.leads, f.clicks), leadToQl: f.ql != null ? d(f.ql, f.leads) : null, qlToSv: f.sv != null ? d(f.sv, f.ql) : null,
    cpc: d(f.spend, f.clicks), cpl: d(f.spend, f.leads), cpql: f.ql ? d(f.spend, f.ql) : null, cpsv: f.sv ? d(f.spend, f.sv) : null, leadToSv: f.sv != null ? d(f.sv, f.leads) : null };
}

// The funnel in the order people move through it: stop and click → enquire → qualify → visit.
const STEPS = [
  { key: 'ctr', label: 'Click-through (CTR)', from: 'impressions', to: 'clicks', rate: 'ctr', cost: 'cpc', costLabel: 'Cost per click', min: f => (f.impressions || 0) >= 1000,
    low: (r, a) => `Click-through is ${r} against ${a} on average: people scroll past. The first look needs one strong hero and a short hook (see the heatmap's viewing order and the ideas under New versions).`,
    high: (r, a) => `Click-through ${r} is above the ${a} average: the hook works.` },
  { key: 'form', label: 'Click → lead', from: 'clicks', to: 'leads', rate: 'clickToLead', cost: 'cpl', costLabel: 'Cost per lead', min: f => (f.clicks || 0) >= 100,
    low: (r, a) => `${r} of clicks become leads (average ${a}). People click but do not enquire: the ad may promise something the form or page does not show (price, configuration, offer). Keep the form short and repeat the ad's main line on it.`,
    high: (r, a) => `${r} of clicks become leads, above the ${a} average.` },
  { key: 'lead', label: 'Lead → qualified lead', from: 'leads', to: 'ql', rate: 'leadToQl', cost: 'cpql', costLabel: 'Cost per QL', min: f => (f.leads || 0) >= 10,
    low: (r, a) => `Only ${r} of leads qualify (average ${a}). The creative attracts people outside the budget or location: show the price and configuration clearly and avoid freebie-style hooks.`,
    high: (r, a) => `${r} of leads qualify, better than the ${a} average: the message filters well.` },
  { key: 'sv', label: 'Qualified lead → site visit', from: 'ql', to: 'sv', rate: 'qlToSv', cost: 'cpsv', costLabel: 'Cost per site visit', min: f => (f.ql || 0) >= 5,
    low: (r, a) => `${r} of qualified leads visit the site (average ${a}). Give a concrete reason to come: sample flat, weekend slots, travel time, possession date or a visit-only offer.`,
    high: (r, a) => `${r} of qualified leads visit, above the ${a} average.` },
];
export const FUNNEL_STEPS = STEPS.map(s => ({ key: s.key, label: s.label, from: s.from, to: s.to, costLabel: s.costLabel }));

/**
 * Step-by-step funnel from CTR down to site visits, each against the average.
 * Returns [{ key, label, rate, avgRate, ratio, from, to, cost, avgCost, costLabel, status: 'below'|'par'|'above'|'early'|'missing', note }].
 */
export function funnelSteps(f, avg) {
  const r = funnelRates(f), a = avg ? funnelRates(avg) : {};
  const pc = v => (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
  return STEPS.map(st => {
    const rate = r[st.rate], ar = a[st.rate], o = { key: st.key, label: st.label, rate, avgRate: ar ?? null, from: f[st.from], to: f[st.to], cost: r[st.cost], avgCost: a[st.cost] ?? null, costLabel: st.costLabel, ratio: null, note: '' };
    if (rate == null) { o.status = 'missing'; o.note = st.key === 'lead' ? 'Qualified leads are not available for this creative. Feed CRM data with the ad name (or UTM content) to see quality.'
      : st.key === 'sv' ? 'Site visits are not available for this creative yet. Feed site-visit data from the CRM with the ad name to see it.' : st.key === 'ctr' ? 'Impressions and clicks are not in the data for this creative.' : 'Clicks are not in the data for this creative.'; return o; }
    if (!st.min(f)) { o.status = 'early'; o.note = 'Too few so far to judge this step.'; return o; }
    if (st.key === 'form' && rate > 1) { o.status = 'na'; o.note = `There are more leads (${Math.round(f.leads)}) than link clicks (${Math.round(f.clicks)}): leads come through an instant form, which opens without a link click, so this step cannot be measured. Judge the ad on CTR, lead → QL and QL → SV.`; return o; }
    if (st.key === 'form' && ar != null && ar > 1) { o.status = 'na'; o.note = 'Across all ads there are more leads than link clicks (instant forms), so this step has no fair average.'; return o; }
    if (!ar) { o.status = 'par'; return o; }
    o.ratio = rate / ar;
    o.status = o.ratio < 0.75 ? 'below' : o.ratio > 1.25 ? 'above' : 'par';
    o.note = o.status === 'below' ? st.low(pc(rate), pc(ar)) : o.status === 'above' ? st.high(pc(rate), pc(ar)) : '';
    return o;
  });
}

/**
 * Where this creative leaks compared with the average, and what to change, in funnel order (CTR first).
 * Returns { stage: 'ctr'|'form'|'lead'|'sv'|null (the weakest step), steps, notes: [string], good: [string] }.
 */
export function funnelNotes(f, avg, fmt = n => '₹' + Math.round(n).toLocaleString('en-IN')) {
  if (!f.leads && !f.spend && !f.clicks) return { stage: null, steps: [], notes: ['No results for this creative yet.'], good: [] };
  const steps = funnelSteps(f, avg), notes = [], good = [];
  steps.forEach(s => { if (s.status === 'below' || s.status === 'missing') notes.push(s.note); else if (s.status === 'above') good.push(s.note); });
  const r = funnelRates(f), a = avg ? funnelRates(avg) : {};
  if (r.cpsv != null && a.cpsv && f.sv >= 3) { const k = r.cpsv / a.cpsv; if (k > 1.3) notes.push(`Cost per site visit is ${fmt(r.cpsv)} against ${fmt(a.cpsv)} on average.`); else if (k < 0.75) good.push(`Cost per site visit ${fmt(r.cpsv)} is well below the ${fmt(a.cpsv)} average: a candidate to scale.`); }
  else if (r.cpql != null && a.cpql && f.ql >= 3) { const k = r.cpql / a.cpql; if (k > 1.3) notes.push(`Cost per qualified lead is ${fmt(r.cpql)} against ${fmt(a.cpql)} on average.`); else if (k < 0.75) good.push(`Cost per qualified lead (${fmt(r.cpql)}) is well below the ${fmt(a.cpql)} average.`); }
  if (f.sv != null && f.sv > 0 && f.sv < 3) notes.push(`Only ${Math.round(f.sv)} site visit${Math.round(f.sv) === 1 ? '' : 's'} so far, so cost per visit is not judged yet.`);
  if ((f.leads || 0) < 10) notes.push(`Only ${Math.round(f.leads || 0)} leads so far, so treat these rates as early signals.`);
  const worst = steps.filter(s => s.status === 'below').sort((p, q) => p.ratio - q.ratio)[0];
  return { stage: worst ? worst.key : null, steps, notes, good };
}
/** Find the performance row for a creative by name (file names and ad names rarely match exactly). */
export function matchRow(rows, name) {
  const norm = s => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9]+/g, ' ').replace(/\b(final|copy|new|v\d+|jpg|png|mp4)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const n = norm(name); if (!n) return null; const nt = new Set(n.split(' '));
  let best = null, bs = 0;
  rows.forEach(r => {
    const m = norm(r.name || r.ad || r.ad_name || r.creative); if (!m) return;
    const mj = m.replace(/ /g, ''), nj = n.replace(/ /g, ''), within = (a, b) => (' ' + a + ' ').includes(' ' + b + ' ');
    const joinedIn = (a, b) => { const i = a.indexOf(b); return i >= 0 && !/\d/.test(b.slice(-1) + (a[i + b.length] || '')) ? true : i >= 0 && !/\d/.test(a[i + b.length] || ''); };
    let s = m === n || mj === nj ? 1 : (within(m, n) || within(n, m) || joinedIn(mj, nj) || joinedIn(nj, mj)) ? 0.85 : 0;
    if (!s) { const mt = new Set(m.split(' ')), inter = [...nt].filter(t => mt.has(t)).length; s = inter / new Set([...nt, ...mt]).size; }
    if (s > bs) { bs = s; best = r; }
  });
  return bs >= 0.5 ? best : null;
}

/* ---------- sound: listen to a video's soundtrack in the browser ---------- */
async function decodeAudio(input) {
  const buf = input instanceof ArrayBuffer ? input : typeof input === 'string' ? await (await fetch(input)).arrayBuffer() : await input.arrayBuffer();
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!AC) throw new Error('Audio is not supported in this browser.');
  const ctx = new AC(1, 1, 48000);
  return await new Promise((ok, bad) => { const p = ctx.decodeAudioData(buf.slice(0), ok, bad); if (p && p.catch) p.catch(bad); });
}
async function to16k(ab, maxSeconds) {   // mono 16 kHz for the speech detector (the browser's resampler)
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext, secs = Math.min(ab.duration, maxSeconds || ab.duration);
  const off = new AC(1, Math.max(1, Math.ceil(secs * 16000)), 16000), src = off.createBufferSource();
  src.buffer = ab; src.connect(off.destination); src.start(0); return (await off.startRendering()).getChannelData(0);
}
/**
 * Integrated loudness in LUFS (ITU-R BS.1770-4 / EBU R128: K-weighting, 400 ms blocks, absolute and relative gates),
 * the measure the platforms normalise to. channels: Float32Array per channel; sr: sample rate.
 */
export function loudnessLUFS(channels, sr) {
  // K-weighting as two biquads with coefficients for any sample rate (same derivation as libebur128)
  const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196, K = Math.tan(Math.PI * f0 / sr), Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  const a0 = 1 + K / Q + K * K, pb = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], pa = [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  const f1 = 38.13547087602444, Q1 = 0.5003270373238773, K1 = Math.tan(Math.PI * f1 / sr), rb = [1, -2, 1], ra = [1, 2 * (K1 * K1 - 1) / (1 + K1 / Q1 + K1 * K1), (1 - K1 / Q1 + K1 * K1) / (1 + K1 / Q1 + K1 * K1)];
  const n = channels[0].length, block = Math.round(0.4 * sr), hop = Math.round(0.1 * sr), nb = n >= block ? Math.floor((n - block) / hop) + 1 : 0;
  if (!nb) return null;
  const sq = new Float64Array(Math.floor(n / hop) + 1);   // per-100 ms sums of squares, summed over channels
  channels.slice(0, 2).forEach(x => {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0, w1 = 0, w2 = 0;
    for (let i = 0; i < n; i++) {
      const y = pb[0] * x[i] + pb[1] * x1 + pb[2] * x2 - pa[1] * y1 - pa[2] * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
      const z = rb[0] * y + rb[1] * w1 + rb[2] * w2 - ra[1] * z1 - ra[2] * z2; w2 = w1; w1 = y; z2 = z1; z1 = z;
      sq[Math.floor(i / hop)] += z * z;
    }
  });
  const L = [];
  for (let b = 0; b < nb; b++) { let s = 0; for (let k = 0; k < 4; k++) s += sq[b + k] || 0; const ms = s / block; L.push(ms); }
  const lufs = ms => -0.691 + 10 * Math.log10(ms + 1e-20);
  const abs = L.filter(ms => lufs(ms) > -70); if (!abs.length) return -Infinity;
  const rel = lufs(abs.reduce((p, q) => p + q, 0) / abs.length) - 10, gated = abs.filter(ms => lufs(ms) > rel);
  return Math.round(10 * lufs(gated.reduce((p, q) => p + q, 0) / gated.length)) / 10;
}
/**
 * The sound analysis on decoded samples (works without a browser audio stack, for tests and servers).
 * channels: Float32Array per channel at sr; x16: mono 16 kHz Float32Array.
 */
export async function analyseSound(channels, sr, x16, onProgress) {
  const n16 = x16.length, dur = n16 / 16000, hop = 1600, nF = Math.floor(n16 / hop);
  if (!nF) return { hasAudio: false, reason: 'The soundtrack is empty.' };
  const env = []; let peak = 0, clip = 0, total = 0;
  for (let k = 0; k < nF; k++) { let s = 0; for (let i = k * hop; i < (k + 1) * hop; i++) s += x16[i] * x16[i]; env.push(10 * Math.log10(s / hop + 1e-12)); }
  channels.forEach(x => { for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; if (a >= 0.999) clip++; } total += x.length; });
  const SIL = -50;
  if (!env.some(v => v > SIL)) return { hasAudio: false, reason: 'The soundtrack is silent.', duration: dur };
  // speech: the Silero VAD network, run here in the browser
  const P = await speechProbabilities(x16, onProgress), speech = speechSegments(P);
  const isVoice = t => speech.some(s => t >= s.t0 && t < s.t1);
  // timeline in 100 ms steps: voice, other sound (music, effects) or silence
  const type = env.map((v, k) => isVoice((k + 0.5) / 10) ? 'voice' : v > SIL ? 'music' : 'silence');
  const segs = []; type.forEach((t, k) => { const last = segs[segs.length - 1]; if (last && last.type === t) last.t1 = (k + 1) / 10; else segs.push({ t0: k / 10, t1: (k + 1) / 10, type: t }); });
  const share = t => type.filter(x => x === t).length / type.length;
  const med = a => { if (!a.length) return null; const s = [...a].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const voiceLevel = med(env.filter((v, k) => type[k] === 'voice')), otherLevel = med(env.filter((v, k) => type[k] === 'music'));
  const fs = env.findIndex(v => v > SIL);
  return {
    hasAudio: true, duration: dur, step: 0.1, envelope: env.map(v => Math.round(v * 10) / 10), segments: segs, speech,
    loudness: loudnessLUFS(channels, sr), loudnessUnit: 'LUFS', peak: Math.round(200 * Math.log10(peak + 1e-12)) / 10, clipped: clip / (total || 1),
    firstSoundAt: fs < 0 ? null : fs / 10, firstVoiceAt: speech.length ? Math.round(speech[0].t0 * 10) / 10 : null,
    voiceShare: share('voice'), musicShare: share('music'), silentShare: share('silence'),
    voiceLevel: voiceLevel == null ? null : Math.round(voiceLevel), otherLevel: otherLevel == null ? null : Math.round(otherLevel),
    detector: 'Silero VAD v5',
  };
}

/**
 * Listen to a video (File, Blob, URL or ArrayBuffer). Returns
 * { hasAudio, duration, step, envelope: [dB every 100 ms], segments: [{ t0, t1, type: 'silence'|'voice'|'music' }], speech: [{ t0, t1 }],
 *   loudness (integrated LUFS), peak (dBFS), clipped (share of clipped samples), firstSoundAt, firstVoiceAt,
 *   voiceShare, musicShare (music and other non-voice sound), silentShare, voiceLevel / otherLevel (typical dB of each) }.
 * Voice is found by the Silero speech-detection network, which also hears a voiceover over a music bed.
 */
export async function audioProfile(input, onProgress) {
  let ab; try { ab = await decodeAudio(input); } catch (e) { return { hasAudio: false, reason: 'No soundtrack could be read from this video.' }; }
  if (!ab || !ab.length) return { hasAudio: false, reason: 'The soundtrack is empty.' };
  const channels = []; for (let c = 0; c < ab.numberOfChannels; c++) channels.push(ab.getChannelData(c));
  return analyseSound(channels, ab.sampleRate, await to16k(ab), onProgress);
}

/** 16 kHz mono WAV of the soundtrack (small enough to send for transcription: about 32 KB per second). */
export async function audioWav(input, maxSeconds = 120) {
  const ab = await decodeAudio(input), AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const secs = Math.min(ab.duration, maxSeconds), off = new AC(1, Math.ceil(secs * 16000), 16000), src = off.createBufferSource();
  src.buffer = ab; src.connect(off.destination); src.start(0); const r = await off.startRendering(), d = r.getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + d.length * 2)), w = (o, s) => [...s].forEach((ch, i) => out.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + d.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, 16000, true); out.setUint32(28, 32000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, d.length * 2, true);
  for (let i = 0; i < d.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, d[i])) * 0x7fff, true);
  return new Blob([out], { type: 'audio/wav' });
}

/**
 * Suggestions on the sound. p: audioProfile(); tr: optional transcript { text, segments: [{ start, end, text }] }; ctx: project details.
 * Returns { notes: [string], checks: [{ label, ok }] }.
 */
export function soundNotes(p, tr = null, ctx = {}) {
  const notes = [], checks = [], s = v => (Math.round(v * 10) / 10) + ' s';
  if (!p || !p.hasAudio) {
    notes.push('This video has no sound. It can still work in the feed, where most people watch muted, but Reels and Stories play with sound: add a music bed and one voice line with the project, location and price.');
    return { notes, checks };
  }
  if (p.firstSoundAt != null && p.firstSoundAt >= 1) notes.push(`The first ${s(p.firstSoundAt)} are silent. Start the sound with the first frame; people decide in the first second whether to keep watching.`);
  if (p.firstVoiceAt == null) notes.push('No voice is heard: the soundtrack is music only. Add a short voiceover that names the project, the location and the price, and burn the same words in as captions for muted viewers.');
  else {
    if (p.firstVoiceAt > 3) notes.push(`The voice starts at ${s(p.firstVoiceAt)}. Bring the first line into the first 3 seconds, while the hook frame is on screen.`);
    notes.push('Most feed videos are watched muted: burn in captions for every spoken line, large and in the top two-thirds of the frame.');
  }
  if (p.loudness != null && isFinite(p.loudness)) {
    if (p.loudness < -20) notes.push(`The sound is quiet (${p.loudness} LUFS). Instagram, Facebook and YouTube play ads at about -14 LUFS; master it to between -16 and -12 LUFS so it does not sound weaker than the ads around it.`);
    else if (p.loudness > -9) notes.push(`The sound is very loud (${p.loudness} LUFS). Platforms turn it down to about -14 LUFS anyway, and a master this loud often distorts; aim for -16 to -12 LUFS.`);
  }
  if (p.clipped > 0.001) notes.push('Parts of the soundtrack clip (distort at full volume). Lower the master level slightly before export.');
  const gap = p.voiceLevel != null && p.otherLevel != null && p.musicShare > 0.03 ? p.voiceLevel - p.otherLevel : null;
  if (p.firstVoiceAt != null && gap != null && gap < 6) notes.push(`Between spoken lines the music is only about ${Math.max(0, Math.round(gap))} dB quieter than the voice, so it is probably as loud under the voice too. Duck the music by about 10 dB while someone speaks so every word is clear on phone speakers.`);
  if (tr && tr.text) {
    const t = String(tr.text), low = t.toLowerCase(), has = re => re.test(low);
    const GENERIC = /^(the|and|residences?|homes?|apartments?|towers?|heights|city|park|phase|project|estates?|villas?|enclave|gardens?|greens?|plaza|avenue|one|by|at|of)$/;
    const name = String(ctx.project || '').toLowerCase().split(/[\s,]+/).filter(w => w.length > 2 && !GENERIC.test(w)), place = String(ctx.micro || ctx.location || '').toLowerCase().split(/[\s,\/]+/).filter(w => w.length > 2);
    const said = { project: name.length ? name.some(w => low.includes(w)) : null, location: place.length ? place.some(w => low.includes(w)) : null,
      price: has(/(₹|rs\.?\s?\d|\d+(\.\d+)?\s*(lakh|lac|lakhs|cr|crore|crores)\b|लाख|करोड़|करोड)/), config: has(/((\d|one|two|three|four|five)\s*(bhk|b\s?h\s?k|बीएचके)|studio|penthouse|villa|plot)/),
      cta: has(/(site visit|visit|book|call|enquire|inquire|register|whatsapp|click|tap|साइट|विज़िट|बुक|कॉल)/) };
    [['Project name', said.project], ['Location', said.location], ['Price', said.price], ['Configuration (e.g. 2 BHK)', said.config], ['Call to action', said.cta]]
      .forEach(([label, ok]) => { if (ok !== null) checks.push({ label, ok }); });
    if (said.price === false) notes.push('The voiceover never says the price. Say the entry price ("2 BHK from ₹1.15 Cr") once; it filters out buyers outside the budget.');
    if (said.location === false) notes.push('The voiceover does not name the location. Say it with a travel time ("5 minutes from the metro") rather than only the area name.');
    if (said.cta === false) notes.push('The voiceover ends without asking for action. Close with one line such as "Book your site visit today".');
    const segs = (tr.segments || []).filter(x => x && x.text);
    const words = String(t).trim().split(/\s+/).filter(Boolean).length, spoken = segs.length ? segs.reduce((q, x) => q + Math.max(0, (x.end || 0) - (x.start || 0)), 0) : p.speech && p.speech.length ? p.speech.reduce((q, x) => q + x.t1 - x.t0, 0) : p.voiceShare * p.duration;
    if (spoken > 3 && words / spoken > 3.3) notes.push(`The voiceover is fast (about ${(words / spoken).toFixed(1)} words a second). Cut words rather than speed up: 2.5 a second is easy to follow.`);
    const early = segs.filter(x => (x.start || 0) < 3).map(x => x.text).join(' ').trim();
    if (segs.length && !early) notes.push('Nothing is said in the first 3 seconds. Open with the strongest line (the view, the price or the location).');
  }
  return { notes, checks };
}
