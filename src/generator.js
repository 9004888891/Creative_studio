// New versions: distinct creative ideas (angle, layout, colour palette, copy and visual direction) built
// from the original's hero image, each scored with the same attention model as the original.
import { toPixels, peaks, saliency, scores, shareIn, elementsInView } from './core.js';
import { reraBlockSpec } from './rera.js';

export const SIZES = { sq: [1080, 1080, 'Feed 1:1'], port: [1080, 1350, 'Feed 4:5'], story: [1080, 1920, 'Story / Reel 9:16'] };
export const LAYOUTS = {
  editorial: 'Editorial: full photo, headline on top',
  pricecard: 'Price card under the photo',
  framed: 'Framed photo',
  split: 'Photo beside a feature list',
  route: 'Photo with travel times',
  badge: 'Full photo with a price badge',
};
const OLD_LAYOUT = { hero: 'pricecard', full: 'editorial', price: 'pricecard', card: 'framed' };   // names used by earlier versions
export const PALETTES = {
  auto: { label: 'From the image' },
  luxury: { label: 'Charcoal and gold', bg: '#16130f', text: '#f6f0e4', sub: '#c9bda6', line: 'rgba(246,240,228,.18)', accent: '#c8a35a', accentText: '#16130f', serif: true },
  fresh: { label: 'White and teal', bg: '#f7f9f8', text: '#0f2a26', sub: '#4b625d', line: 'rgba(15,42,38,.14)', accent: '#0f766e', accentText: '#ffffff', light: true },
  bold: { label: 'Navy and coral', bg: '#0f2240', text: '#ffffff', sub: '#b9c7e0', line: 'rgba(255,255,255,.16)', accent: '#ff6b4a', accentText: '#ffffff' },
  earthy: { label: 'Forest and sand', bg: '#1d3a2c', text: '#fbf6ea', sub: '#cfd8c8', line: 'rgba(251,246,234,.18)', accent: '#e9c46a', accentText: '#1d3a2c', serif: true },
  sunrise: { label: 'Cream and terracotta', bg: '#fbf4ec', text: '#3a1d10', sub: '#7a5443', line: 'rgba(58,29,16,.14)', accent: '#d9572b', accentText: '#ffffff', light: true },
  mono: { label: 'Clean white and black', bg: '#ffffff', text: '#111418', sub: '#5b6470', line: 'rgba(17,20,24,.12)', accent: '#111418', accentText: '#ffffff', light: true },
};

const first = s => String(s || '').split(/[\/,]/)[0].trim();
const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
const cut = (s, n) => { s = String(s || '').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const TRAVEL_RE = /\b\d+(?:\.\d+)?\s*(?:min|mins|minutes|hr|hrs|hours)\b/i;
function facts(ctx = {}) {
  const spec = reraBlockSpec(ctx, ctx.reraMedium || 'social'), noTravel = spec.bans.includes('travel-time');
  const cfg = (ctx.configs || []).filter(r => r.type && r.price);
  const price = cfg.length ? `${cfg[0].type} from ${cfg[0].price}*` : ctx.priceRange ? `From ${String(ctx.priceRange).split(/[–-]/)[0].trim()}*` : '';
  const usps = String(ctx.usps || '').split(/[,;·|]|\band\b/).map(s => s.trim()).filter(s => s.length > 3 && !(noTravel && TRAVEL_RE.test(s)));
  return {
    loc: first(ctx.micro || ctx.locality || ctx.location), city: first(ctx.location), price, cfg,
    type: cfg.length ? cfg[0].type : (String(ctx.inventory || '').match(/\d\s*(?:&|and|,)?\s*\d?\s*BHK/i) || [''])[0],
    size: (cfg.find(r => r.size) || {}).size || ctx.carpet || '',
    conn: [first(ctx.connectivity)].concat(usps.filter(u => /min|metro|station|highway|airport|road|link/i.test(u))).find(u => u && !(noTravel && TRAVEL_RE.test(u))) || '',
    view: usps.find(u => /view|lake|sea|hill|creek|forest|green|garden/i.test(u)) || '',
    amen: usps.find(u => /amenit|club|pool|podium|gym|deck|park|acre/i.test(u)) || '',
    usps, offer: ctx.offer || '', possession: ctx.possession || '',
    dev: String(ctx.developer || ctx.brand || '').replace(/\s*\(.*\)/, '').replace(/\s+Ltd\.?$/i, ''),
    rera: spec.reg, reraSpec: spec, noTravel,
    chips: chipsOf(ctx, cfg), features: usps.filter(u => u.length <= 38).slice(0, 3), stops: noTravel ? [] : stopsOf([ctx.connectivity, ...usps]),
    eyebrow: [typeWord(ctx, cfg), first(ctx.micro || ctx.locality || ctx.location)].filter(Boolean).join(' · '),
  };
}
function chipsOf(ctx, cfg) {
  const fromCfg = [...new Set(cfg.map(r => String(r.type).trim()))];
  if (fromCfg.length) return fromCfg.slice(0, 4);
  const m = String(ctx.inventory || '').match(/(\d)\s*(?:(?:&|and|,)\s*(\d)\s*)?(?:(?:&|and|,)\s*(\d)\s*)?BHK/i);
  return m ? [m[1], m[2], m[3]].filter(Boolean).map(n => n + ' BHK') : [];
}
function typeWord(ctx, cfg) { const c = chipsOf(ctx, cfg); return c.length ? c.map(x => x.replace(/\s*BHK/i, '')).join(' & ') + ' BHK residences' : ''; }
/** "5 min to the metro", "Airport 20 mins" → "5 min Metro" */
function stopsOf(list) {
  const out = [];
  String(list.filter(Boolean).join(', ')).split(/[,;·|]/).forEach(part => {
    const m = part.match(/(\d+\s*(?:min|mins|minutes|km|kms))\b\s*(?:to|from|away from|drive to|walk to)?\s*(?:the\s)?([A-Za-z][\w .'&-]{1,22})?/i);
    const m2 = !m && part.match(/([A-Za-z][\w .'&-]{1,22}?)\s+(\d+\s*(?:min|mins|minutes|km|kms))\b/i);
    if (m && m[2]) out.push(`${m[1].replace(/\s*minutes?|\s*mins/i, ' min').trim()} ${cap(m[2].trim())}`);
    else if (m2) out.push(`${m2[2].replace(/\s*minutes?|\s*mins/i, ' min').trim()} ${cap(m2[1].trim())}`);
  });
  return [...new Set(out)].slice(0, 4);
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/** Starting text for an editable new version (kept for compatibility; ideas() gives several). */
export function defaults(ctx = {}, ai = null) {
  const nc = (ai && ai.newCopy) || {}, f = facts(ctx);
  return {
    layout: 'pricecard', size: 'port', palette: 'auto', eyebrow: f.eyebrow, chips: f.chips, features: f.features, stops: f.stops,
    headline: nc.headline || `${String(ctx.inventory || 'Homes').replace(/apartments.*$/i, 'residences').trim()}${f.loc ? ' at ' + f.loc : ''}`.slice(0, 48),
    sub: nc.subhead || f.conn || ctx.location || '', price: nc.price || f.price, offer: nc.offer || '', cta: nc.cta || 'Book a site visit',
    dev: f.dev, rera: f.rera, reraSpec: f.reraSpec, reraQr: ctx.reraQr || '', accent: '',
  };
}

/* ---------- creative ideas ---------- */
// Each idea is a different reason to enquire, with its own layout, palette and the photo to use.
// stages: the funnel step it helps with (ctr: people scroll past; form: clicks but few leads; lead: leads but few qualified; sv: qualified but few site visits).
const IDEAS = [
  { id: 'price', angle: 'Price first', stages: ['lead', 'form', 'ctr'], layout: 'pricecard', palette: 'bold',
    make: f => ({ headline: f.type ? `${f.type} homes at ${f.loc || 'a prime address'}` : `Homes at ${f.loc || 'a prime address'}`, sub: f.conn, price: f.price || 'From ₹__ Cr*', cta: 'Get the price sheet' }),
    why: 'Shows the entry price as the biggest element, so people outside the budget skip the ad and leads come in better qualified.',
    visual: 'Keep the building or a bright living room; the price band carries the message.' },
  { id: 'location', angle: 'Location and connectivity', stages: ['sv', 'lead'], layout: 'route', palette: 'fresh',
    make: f => ({ headline: f.stops.length >= 2 ? (f.loc ? `Live at ${f.loc}` : 'Close to what matters') : f.conn ? cut(f.conn, 40) : f.noTravel ? `Live at ${f.loc || f.city || 'the heart of the city'}` : `Everything in ${f.city || f.loc || 'the city'}, minutes away`, sub: f.loc ? `${f.loc}${f.city && f.city !== f.loc ? ', ' + f.city : ''}` : '', price: f.price, cta: 'See it on the map' }),
    why: 'Answers "how far is it?", the commonest reason a qualified lead does not visit. Travel time works better than distance.',
    visual: 'An aerial shot or a clean map-style graphic with the metro or highway and a pin on the project.' },
  { id: 'view', angle: 'The view and lifestyle', stages: ['ctr'], layout: 'editorial', palette: 'luxury',
    make: f => ({ headline: f.view ? `Wake up to ${cut(f.view.replace(/^\w+\s(of|to)\s/i, ''), 30).toLowerCase()}` : `Life above ${f.loc || 'the city'}`, sub: f.loc ? `${f.loc}${f.city && f.city !== f.loc ? ', ' + f.city : ''}` : '', price: f.price, cta: 'Book a site visit' }),
    why: 'A single emotional image stops the scroll. One hero, little text, so attention is not split.',
    visual: 'A golden-hour view from a balcony or living room, with a person looking out if you have one.' },
  { id: 'visit', angle: 'Site-visit invitation', stages: ['sv'], layout: 'framed', palette: 'earthy',
    make: f => ({ eyebrow: 'Site visits this weekend', headline: 'See the sample flat this weekend', sub: f.loc ? `${f.loc} · pick-up and drop on request*` : 'Pick-up and drop on request*', price: f.price, cta: 'Book a weekend visit' }),
    why: 'Makes the next step concrete (a day and a reason to come) for leads that enquire but do not visit.',
    visual: 'The finished sample flat or the experience centre, warm and well lit.', check: 'Offer pick-up only if the sales team provides it.' },
  { id: 'offer', angle: 'Launch offer', stages: ['ctr', 'form', 'sv'], layout: 'badge', palette: 'sunrise',
    make: f => ({ headline: f.offer ? cut(f.offer, 40) : 'Launch prices for early buyers', sub: f.loc, price: f.price, offer: f.offer ? '' : 'Limited units*', cta: 'Lock the launch price' }),
    why: 'A time-bound reason to act now. The badge draws the eye without adding clutter to the image.',
    visual: 'The building in daylight; keep the top-right corner clear for the badge.', check: 'Use only a real, current offer, and keep the T&C line.' },
  { id: 'amenities', angle: 'Amenities', stages: ['ctr', 'lead'], layout: 'split', palette: 'sunrise',
    make: f => ({ headline: f.amen ? cut(f.amen, 40) : 'Amenities for every age', sub: f.type ? `${f.type} homes${f.loc ? ' · ' + f.loc : ''}` : f.loc, price: f.price, cta: 'Take the virtual tour' }),
    why: 'Shows what everyday life looks like. Works best with one strong amenity photo, not a collage.',
    visual: 'One amenity at its best: the pool at dusk or the podium garden with people.' },
  { id: 'trust', angle: 'Developer and delivery', stages: ['sv', 'lead'], layout: 'editorial', palette: 'mono',
    make: f => ({ headline: f.dev ? `By ${f.dev}` : 'From a developer that delivers', sub: f.possession ? `Possession ${f.possession}` : f.rera ? 'RERA registered' : '', price: f.price, cta: 'Visit the site' }),
    why: 'Reassures people who are interested but unsure, which matters most for under-construction projects.',
    visual: 'A recent construction-progress photo or a delivered project by the same developer.', check: 'State the possession date exactly as registered on RERA.' },
  { id: 'space', angle: 'Space and layout', stages: ['lead', 'form'], layout: 'split', palette: 'fresh',
    make: f => ({ headline: f.size ? `${f.type || 'Homes'} · ${f.size}` : `${f.type || 'Homes'} planned for real families`, sub: 'See the floor plans', price: f.price, cta: 'Download floor plans' }),
    why: 'Gives serious buyers the detail they compare projects on (size and layout), which filters out casual clicks.',
    visual: 'A wide shot of the living room, or a clean 3D floor plan.' },
];

/**
 * Creative ideas for new versions: different angles, layouts and palettes.
 * opts: { ai, stage: 'ctr'|'form'|'lead'|'sv'|null, issues: { noPrice, noCta, cluttered }, count = 4, offset = 0, size }
 * Returns [{ id, angle, why, visual, check, source: 'ai'|'library', g: settings for drawCreative }].
 */
export function ideas(ctx = {}, opts = {}) {
  const f = facts(ctx), count = opts.count || 4, size = opts.size || 'port', is = opts.issues || {};
  const fromAI = ((opts.ai && opts.ai.concepts) || []).filter(c => c && c.headline).map((c, i) => ({
    id: 'ai' + i, angle: c.angle || 'AI idea', why: c.why || '', visual: c.visual || '', source: 'ai', layout: null, palette: null,
    copy: { headline: cut(c.headline, 48), sub: c.subhead || '', price: c.price || f.price, offer: c.offer || '', cta: c.cta || 'Book a site visit' } }));
  const lib = IDEAS.map(x => {
    let rank = 0;
    if (opts.stage && x.stages.includes(opts.stage)) rank += x.stages[0] === opts.stage ? 4 : 2;
    if (is.noPrice && x.id === 'price') rank += 3;
    if (is.noCta && x.id === 'visit') rank += 2;
    if (is.cluttered && (x.id === 'view' || x.layout === 'editorial')) rank += 1;
    return { id: x.id, angle: x.angle, why: x.why, visual: x.visual, check: x.check || '', source: 'library', layout: x.layout, palette: x.palette, rank, copy: x.make(f) };
  }).sort((a, b) => b.rank - a.rank);
  // "More ideas": angles not shown yet come first, then the rest
  const seen = new Set(opts.exclude || []), pool = fromAI.concat(lib);
  const fresh = pool.filter(c => !seen.has(c.id)), ordered = fresh.length >= Math.min(count, pool.length) ? fresh.concat(pool.filter(c => seen.has(c.id))) : pool;
  // pick distinct layouts and palettes so the set really differs
  const out = [], usedL = new Set(), usedP = new Set();
  const free = (list, used) => list.find(k => !used.has(k)) || list[0];
  for (const c of ordered) {
    if (out.length >= count) break;
    const layout = c.layout && !usedL.has(c.layout) ? c.layout : free(Object.keys(LAYOUTS), usedL);
    const palette = c.palette && !usedP.has(c.palette) ? c.palette : free(Object.keys(PALETTES).filter(p => p !== 'auto'), usedP);
    usedL.add(layout); usedP.add(palette); out.push(c);
    if (f.noTravel && c.id === 'location') c.why = 'Answers "where is it?" with the location as in the approved plan. Travel times are not allowed in ' + f.reraSpec.authority + ' ads, so name the road, landmark or station instead.';
    if (c.id === 'offer' && f.reraSpec.bans.includes('tnc-disclaimer')) c.check = 'Use only a real, current offer and state its terms in full: ' + f.reraSpec.authority + ' does not allow "T&C apply" disclaimers.';
    c.g = Object.assign({ layout, palette, size, dev: f.dev, rera: f.rera, reraSpec: f.reraSpec, reraQr: ctx.reraQr || '', accent: '', offer: '', eyebrow: f.eyebrow, chips: f.chips, features: f.features, stops: f.stops }, c.copy);
  }
  return out;
}

/** Notes for one drawn idea, from its own predicted attention (not the original's). */
export function ideaNotes(r, g, original) {
  const out = [], p = r.share('price'), h = r.share('headline'), c = r.share('cta');
  if (p != null) out.push(p >= 0.15 ? `Price gets ${Math.round(p * 100)}% of attention: clear.` : `Price gets ${Math.round(p * 100)}% of attention; enlarge it or try the price-card design.`);
  if (h != null && h < 0.06) out.push('The headline is easy to miss here; shorten it or raise the contrast.');
  if (words(g.headline) > 7) out.push(`Headline has ${words(g.headline)} words; 4–7 reads at a glance.`);
  if (c != null && c < 0.03) out.push('The call to action is quiet; it may be lost under the platform button.');
  if (r.scores.clutter > 60) out.push('Busy for a feed ad; use a calmer photo for this layout.');
  if (original && r.scores.overall - original.overall >= 8) out.push(`Predicted ${r.scores.overall} against ${original.overall} for the original.`);
  return out.slice(0, 3);
}

/* ---------- drawing ---------- */
const SANS = "'Inter','Helvetica Neue',Helvetica,Arial,sans-serif";
const SERIF = "'Playfair Display','Cormorant Garamond',Georgia,'Times New Roman',serif";
function dominant(P) {
  const { d } = P, b = {};
  for (let i = 0; i < d.length; i += 16) { const k = (d[i] >> 5) + ',' + (d[i + 1] >> 5) + ',' + (d[i + 2] >> 5); b[k] = (b[k] || 0) + 1; }
  const cols = Object.entries(b).sort((a, c) => c[1] - a[1]).map(([k]) => k.split(',').map(v => +v * 32 + 16));
  const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2], sat = c => Math.max(...c) - Math.min(...c);
  const dark = cols.find(c => lum(c) < 80) || [20, 28, 40];
  const acc = cols.filter(c => sat(c) > 90 && lum(c) > 90).sort((a, c) => sat(c) - sat(a))[0] || [214, 160, 60];
  return { bg: `rgb(${dark.map(v => Math.round(v * 0.55)).join(',')})`, text: '#ffffff', sub: 'rgba(255,255,255,.78)', line: 'rgba(255,255,255,.18)', accent: `rgb(${acc.join(',')})`, accentText: '#111111' };
}
function paletteFor(g, heroImg, heroCrop) {
  const base = g.palette && g.palette !== 'auto' && PALETTES[g.palette] ? Object.assign({}, PALETTES[g.palette]) : dominant(toPixels(heroImg, heroCrop, 80));
  if (g.accent) base.accent = g.accent;
  return base;
}
function wrap(x, t, maxW) {
  const w = String(t || '').split(/\s+/), lines = []; let cur = '';
  w.forEach(word => { const n = cur ? cur + ' ' + word : word; if (x.measureText(n).width > maxW && cur) { lines.push(cur); cur = word; } else cur = n; });
  if (cur) lines.push(cur); return lines;
}
/** "2 BHK from ₹1.15 Cr*" → { label: '2 BHK from', value: '₹1.15 Cr*' } */
export function priceParts(s) {
  s = String(s || '').trim();
  const m = s.match(/^(.*?)\s*(₹\s?[\d.,_]+\s*(?:cr(?:ore)?s?|l(?:akh|ac)?s?|k)?\.?\*?)\s*(.*)$/i);
  if (!m) return { label: '', value: s, rest: '' };
  return { label: m[1].replace(/[:–-]\s*$/, '').trim(), value: m[2].replace(/\s+/g, ' ').trim(), rest: m[3].trim() };
}
const listOf = v => Array.isArray(v) ? v.filter(Boolean) : String(v || '').split(/\s*[,|]\s*/).filter(Boolean);

/**
 * The part of the original to reuse as the hero image: the visual elements (people, building,
 * interiors) from the AI reading, trimmed so baked-in text is left out. Without an AI reading,
 * the middle band of the creative.
 */
export function heroRect(a, ai) {
  const W = a.img.naturalWidth || a.img.width, H = a.img.naturalHeight || a.img.height;
  const cr = a.crop || { x: 0, y: 0, w: W, h: H }, els = elementsInView(ai, a);
  const vis = els.filter(e => ['person', 'building', 'interior', 'amenity'].includes(e.type)); let b;
  if (vis.length) {
    const x0 = Math.min(...vis.map(e => e.cbox[0])), y0 = Math.min(...vis.map(e => e.cbox[1]));
    const x1 = Math.max(...vis.map(e => e.cbox[0] + e.cbox[2])), y1 = Math.max(...vis.map(e => e.cbox[1] + e.cbox[3]));
    const px = (x1 - x0) * 0.25, py = (y1 - y0) * 0.25;
    b = [Math.max(0, x0 - px), Math.max(0, y0 - py), Math.min(1, x1 + px), Math.min(1, y1 + py)];
    const cy = (y0 + y1) / 2, txt = els.filter(e => /headline|subhead|price|offer|cta|logo|project_name|location|contact|website|rera|other_text|qr/.test(e.type));
    txt.forEach(e => {
      const [ex, ey, ew, eh] = e.cbox; if (ex + ew < b[0] || ex > b[2]) return;
      if (ey >= cy && ey < b[3]) b[3] = Math.max(cy + 0.05, ey - 0.01);
      else if (ey + eh <= cy && ey + eh > b[1]) b[1] = Math.min(cy - 0.05, ey + eh + 0.01);
    });
  } else b = [0, 0.1, 1, 0.62];   // no AI reading: stay clear of the usual text zones at the top and bottom
  return { x: Math.round(cr.x + b[0] * cr.w), y: Math.round(cr.y + b[1] * cr.h), w: Math.max(8, Math.round((b[2] - b[0]) * cr.w)), h: Math.max(8, Math.round((b[3] - b[1]) * cr.h)) };
}

/**
 * Draw a new creative onto a canvas. g: { layout, palette, size, eyebrow, headline, sub, price, offer, cta, dev, rera, accent,
 * chips: ['2 BHK', …], features: ['Lake views', …], stops: ['5 min Metro', …] }.
 * Returns the boxes of headline, price, cta, offer and logo (fractions) for scoring.
 */
export function drawCreative(cv, heroImg, heroCrop, g) {
  const [W, H] = SIZES[g.size] || SIZES.port; cv.width = W; cv.height = H;
  const x = cv.getContext('2d'), pal = paletteFor(g, heroImg, heroCrop);
  const S = saliency(toPixels(heroImg, heroCrop, 120)), pk = peaks(S, 1)[0] || { x: .5, y: .45 };
  const u = W / 1080, pad = Math.round(72 * u), boxes = {}, story = g.size === 'story', sq = g.size === 'sq';
  const layout = LAYOUTS[g.layout] ? g.layout : (OLD_LAYOUT[g.layout] || 'editorial');
  const HF = pal.serif ? SERIF : SANS, HW = pal.serif ? 600 : 800, pp = priceParts(g.price);
  const low = t => String(t || '').toLowerCase(), chips = listOf(g.chips), stops = listOf(g.stops).slice(0, 4);
  const feats = listOf(g.features).filter(f => !low(g.headline).includes(low(f)) && !low(f).includes(low(g.headline))).slice(0, 3);

  // ---- primitives
  const font = (w, sz, f) => { x.font = `${w} ${Math.round(sz)}px ${f || SANS}`; };
  const track = px => { if ('letterSpacing' in x) x.letterSpacing = Math.round(px) + 'px'; };
  const rr = (X, Y, w, h, r) => { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); };
  const shade = (y0, y1, a0, a1) => { const gr = x.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, `rgba(0,0,0,${a0})`); gr.addColorStop(1, `rgba(0,0,0,${a1})`); x.fillStyle = gr; x.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0)); };
  const photo = (dx, dy, dw, dh, r) => {
    const cw = heroCrop ? heroCrop.w : heroImg.naturalWidth, ch = heroCrop ? heroCrop.h : heroImg.naturalHeight, cx0 = heroCrop ? heroCrop.x : 0, cy0 = heroCrop ? heroCrop.y : 0;
    const sc = Math.max(dw / cw, dh / ch), sw = dw / sc, sh = dh / sc;
    let sx = cx0 + pk.x * cw - sw / 2, sy = cy0 + pk.y * ch - sh / 2;
    sx = Math.max(cx0, Math.min(cx0 + cw - sw, sx)); sy = Math.max(cy0, Math.min(cy0 + ch - sh, sy));
    x.save(); if (r) { rr(dx, dy, dw, dh, r); x.clip(); } x.imageSmoothingQuality = 'high'; x.drawImage(heroImg, sx, sy, sw, sh, dx, dy, dw, dh); x.restore();
  };
  // text block from the top edge Y; returns the bottom edge
  const text = (t, X, Y, o) => {
    if (!t) return Y; let sz = o.size, ls;
    for (;;) { font(o.w, sz, o.f); track(o.track || 0); ls = wrap(x, o.upper ? String(t).toUpperCase() : t, o.maxW); if (!o.shrink || ls.length <= (o.max || 3) || sz <= o.size * 0.6) break; sz *= 0.92; }
    ls = ls.slice(0, o.max || 3); const lh = sz * (o.lh || 1.12); let y = Y, mw = 0;
    if (o.dry) { track(0); return Y + lh * ls.length; }
    x.fillStyle = o.color; x.textAlign = o.align || 'left'; x.textBaseline = 'alphabetic';
    ls.forEach(l => { y += lh; x.fillText(l, X, y - lh * 0.24); mw = Math.max(mw, x.measureText(l).width); });
    track(0); x.textAlign = 'left';
    if (o.key) { const left = o.align === 'center' ? X - mw / 2 : o.align === 'right' ? X - mw : X; boxes[o.key] = [left / W, Y / H, mw / W, (y - Y) / H]; }
    return y;
  };
  const eyebrow = (t, X, Y, color, align, maxW) => text(t, X, Y, { w: 700, size: 24 * u, color, maxW: maxW || W - 2 * pad, max: 1, upper: true, track: 4 * u, align, lh: 1.3 });
  const headline = (X, Y, color, size, max, maxW, align) => text(g.headline, X, Y, { w: HW, f: HF, size: size * u, color, maxW, max, lh: pal.serif ? 1.08 : 1.04, align, key: 'headline', shrink: true });
  const pin = (cx, cy, s, color, hole) => {
    x.fillStyle = color; x.beginPath(); x.arc(cx, cy - s * 0.18, s * 0.42, Math.PI * 0.85, Math.PI * 2.15); x.lineTo(cx, cy + s * 0.55); x.closePath(); x.fill();
    x.fillStyle = hole; x.beginPath(); x.arc(cx, cy - s * 0.18, s * 0.16, 0, 7); x.fill();
  };
  const place = (X, Y, color, hole, align, maxW) => {   // location line with a pin
    if (!g.sub) return Y; const s = Math.min(30, rb ? rb.place : 30) * u; font(500, s); const tw = Math.min(x.measureText(g.sub).width, (maxW || W) - s * 1.4), total = s * 1.2 + tw;
    const x0 = align === 'center' ? X - total / 2 : X;
    pin(x0 + s * 0.45, Y + s * 0.62, s, color, hole); x.fillStyle = color; x.fillText(g.sub, x0 + s * 1.2, Y + s * 0.92, tw); return Y + s * 1.35;
  };
  const tick = (cx, cy, s, fill, mark) => { x.fillStyle = fill; x.beginPath(); x.arc(cx, cy, s / 2, 0, 7); x.fill(); x.strokeStyle = mark; x.lineWidth = Math.max(2, s * 0.12); x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); x.moveTo(cx - s * 0.22, cy + s * 0.02); x.lineTo(cx - s * 0.05, cy + s * 0.18); x.lineTo(cx + s * 0.24, cy - s * 0.16); x.stroke(); };
  const featureList = (X, Y, maxW, color) => {
    let y = Y; feats.forEach(f => { const s = 34 * u; tick(X + s / 2, y + s * 0.62, s, pal.accent, pal.accentText); y = text(f, X + s * 1.45, y, { w: 500, size: 29 * u, color, maxW: maxW - s * 1.45, max: 2, lh: 1.25 }) + 12 * u; });
    return y;
  };
  const chipRow = (X, Y, color, border, align, maxW) => {
    if (!chips.length) return Y; font(600, 24 * u); const h = 46 * u, gap = 12 * u, ws = chips.map(c => x.measureText(c).width + 36 * u);
    let total = ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1), cx = align === 'center' ? X - total / 2 : X;
    chips.forEach((c, i) => { if (cx + ws[i] > X + (maxW || W)) return; x.strokeStyle = border; x.lineWidth = 2 * u; rr(cx, Y, ws[i], h, h / 2); x.stroke(); x.fillStyle = color; x.fillText(c, cx + 18 * u, Y + h * 0.66); cx += ws[i] + gap; });
    return Y + h;
  };
  const priceBlock = (X, Y, o) => {
    if (!g.price) return Y; const top = Y; let y = Y, mw = 0;
    if (pp.label) { font(600, 24 * u); track(3 * u); x.fillStyle = o.label; x.textAlign = o.align || 'left'; x.fillText(pp.label.toUpperCase(), X, y + 24 * u); mw = x.measureText(pp.label.toUpperCase()).width; track(0); y += 34 * u; }
    font(800, o.size * u); x.fillStyle = o.value; x.textAlign = o.align || 'left';
    let vs = o.size * u; while (x.measureText(pp.value).width > o.maxW && vs > 30 * u) { vs *= 0.92; font(800, vs); }
    x.fillText(pp.value, X, y + vs * 0.84); mw = Math.max(mw, x.measureText(pp.value).width); y += vs; x.textAlign = 'left';
    const left = o.align === 'center' ? X - mw / 2 : o.align === 'right' ? X - mw : X; boxes.price = [left / W, top / H, mw / W, (y - top) / H];
    return y;
  };
  const cta = (X, Y, fill, color, align) => {   // pill button; X is the left edge, the centre or the right edge
    font(700, 32 * u); const label = g.cta || 'Book a site visit', h = 88 * u, w = x.measureText(label).width + 136 * u;
    const left = align === 'center' ? X - w / 2 : align === 'right' ? X - w : X;
    x.fillStyle = fill; rr(left, Y, w, h, h / 2); x.fill(); x.fillStyle = color; x.fillText(label, left + 44 * u, Y + h * 0.63);
    x.beginPath(); const ax = left + w - 50 * u, ay = Y + h / 2; x.strokeStyle = color; x.lineWidth = 3.5 * u; x.lineCap = 'round';
    x.moveTo(ax - 14 * u, ay); x.lineTo(ax + 10 * u, ay); x.moveTo(ax + 1 * u, ay - 9 * u); x.lineTo(ax + 10 * u, ay); x.lineTo(ax + 1 * u, ay + 9 * u); x.stroke();
    boxes.cta = [left / W, Y / H, w / W, h / H]; return h;
  };
  const logo = (X, Y, color, align) => {
    const t = (g.dev || '').toUpperCase(); if (!t) return; font(700, 24 * u); track(5 * u); x.fillStyle = color; x.textAlign = align || 'left'; x.fillText(t, X, Y + 24 * u);
    const w = x.measureText(t).width; track(0); x.textAlign = 'left'; boxes.logo = [(align === 'center' ? X - w / 2 : X) / W, Y / H, w / W, 30 * u / H];
  };
  const spec = g.reraSpec || null, tncOk = !(spec && spec.bans.includes('tnc-disclaimer'));
  const fine = (X, Y, color, align) => { if (!tncOk || !/\*/.test(String(g.price || '') + String(g.offer || ''))) return; font(400, 18 * u); x.fillStyle = color; x.textAlign = align || 'left'; x.fillText('*T&C apply', X, Y); x.textAlign = 'left'; };
  // RERA block (registration number, authority website, QR code), top-right as most states require; drawn last, on top.
  const rb = (() => {
    if (!spec && !g.rera) return null;
    const q = Math.round((story ? 124 : 108) * u), ip = 14 * u, fs = spec && spec.size && spec.size.ref === 'contact' ? 26 : 24;
    const lines = [[`${spec ? spec.authority : 'RERA'} Reg. No.`, 600, 18], [g.rera || '____________', 800, fs], spec && spec.website ? [spec.website, 600, fs - 2] : null, spec && spec.permit !== null && spec.permit !== undefined ? [`Permit: ${spec.permit || '__________'}`, 600, 18] : null].filter(Boolean);
    let tw = 0; lines.forEach(([t, w, z]) => { font(w, z * u); tw = Math.max(tw, x.measureText(t).width); });
    const showQr = !spec || spec.qr, bw = Math.round(ip * 2 + tw + (showQr ? q + ip : 0)), th = lines.reduce((a, l) => a + l[2] * 1.32 * u, 0), bh = Math.round(ip * 2 + Math.max(showQr ? q : 0, th));
    return { x: W - Math.round(pad * 0.55) - bw, y: Math.round(pad * 0.55), w: bw, h: bh, q, ip, lines, showQr, bottom: Math.round(pad * 0.55) + bh, place: fs };
  })();
  const topClear = rb ? rb.bottom + 16 * u : 0;
  const reraBlock = () => {
    if (!rb) return; x.save(); x.shadowColor = 'rgba(0,0,0,.18)'; x.shadowBlur = 12 * u; x.fillStyle = 'rgba(255,255,255,.96)'; rr(rb.x, rb.y, rb.w, rb.h, 12 * u); x.fill(); x.restore();
    let ty = rb.y + rb.ip + (rb.h - 2 * rb.ip - rb.lines.reduce((a, l) => a + l[2] * 1.32 * u, 0)) / 2; const tx = rb.x + rb.ip, r0 = ty;
    rb.lines.forEach(([t, w, z], i) => { font(w, z * u); x.fillStyle = i === 0 ? '#5b6470' : '#111418'; x.textBaseline = 'alphabetic'; x.fillText(t, tx, ty + z * u); ty += z * 1.32 * u; });
    boxes.rera = [tx / W, r0 / H, (rb.w - 2 * rb.ip - (rb.showQr ? rb.q + rb.ip : 0)) / W, (ty - r0) / H];
    if (rb.showQr) {
      const qx = rb.x + rb.w - rb.ip - rb.q, qy = rb.y + (rb.h - rb.q) / 2;
      if (g.reraQrImg) { x.imageSmoothingEnabled = false; x.drawImage(g.reraQrImg, qx, qy, rb.q, rb.q); x.imageSmoothingEnabled = true; }
      else { x.strokeStyle = '#111418'; x.lineWidth = 2 * u; x.setLineDash([6 * u, 5 * u]); x.strokeRect(qx + 1, qy + 1, rb.q - 2, rb.q - 2); x.setLineDash([]);
        font(800, 26 * u); x.fillStyle = '#111418'; x.textAlign = 'center'; x.fillText('QR', qx + rb.q / 2, qy + rb.q / 2 + 2 * u); font(500, 13 * u); x.fillText('from portal', qx + rb.q / 2, qy + rb.q / 2 + 22 * u); x.textAlign = 'left'; }
      boxes.qr = [qx / W, qy / H, rb.q / W, rb.q / H]; boxes.qrPlaceholder = !g.reraQrImg;
    }
  };
  const offerTag = (X, Y, color, align) => {
    if (!g.offer) return Y; font(700, 22 * u); track(2 * u); const t = g.offer.toUpperCase(), w = x.measureText(t).width + 32 * u, h = 42 * u, left = align === 'center' ? X - w / 2 : X;
    x.strokeStyle = color; x.lineWidth = 2 * u; rr(left, Y, w, h, 6 * u); x.stroke(); x.fillStyle = color; x.fillText(t, left + 16 * u, Y + h * 0.66); track(0);
    boxes.offer = [left / W, Y / H, w / W, h / H]; return Y + h;
  };
  const mw = W - 2 * pad;
  x.fillStyle = pal.bg; x.fillRect(0, 0, W, H);

  if (layout === 'editorial') {
    photo(0, 0, W, H); shade(0, H * 0.52, 0.72, 0); shade(H * 0.55, H, 0, 0.86);
    logo(pad, pad, '#fff');
    let y = Math.max(pad + 96 * u, topClear); y = eyebrow(g.eyebrow, pad, y, pal.light ? '#fff' : pal.accent) + 10 * u;
    y = headline(pad, y, '#fff', story ? 104 : 92, 3, mw * 0.92); y += 18 * u; place(pad, y, 'rgba(255,255,255,.92)', 'rgba(0,0,0,.6)', 'left', mw);
    const by = H - pad - 52 * u - 88 * u;
    offerTag(pad, by - (pp.label ? 34 : 0) * u - 104 * u - 30 * u, '#fff');
    priceBlock(pad, by - (pp.label ? 34 : 0) * u - 6 * u, { label: 'rgba(255,255,255,.75)', value: '#fff', size: 80, maxW: mw * 0.55 });
    cta(W - pad, by + 6 * u, pal.accent, pal.accentText, 'right');
    fine(pad, H - pad * 0.62, 'rgba(255,255,255,.7)');
  } else if (layout === 'pricecard') {
    const ph = Math.round(H * (story ? 0.62 : sq ? 0.46 : 0.56)); photo(0, 0, W, ph); shade(0, ph * 0.35, 0.55, 0);
    logo(pad, pad, '#fff');
    x.fillStyle = pal.accent; x.fillRect(0, ph, W, 8 * u);
    const by = H - pad - 40 * u - 88 * u - 26 * u - (pp.label ? 34 : 0) * u;
    let y = ph + (sq ? 44 : 56) * u; y = eyebrow(g.eyebrow, pad, y, pal.accent) + 8 * u;
    y = headline(pad, y, pal.text, sq ? 54 : 66, 2, mw); y += 22 * u; if (y + 46 * u <= by - 54 * u) y = chipRow(pad, y, pal.text, pal.line, 'left', mw);
    x.fillStyle = pal.line; x.fillRect(pad, by - 30 * u, mw, 2 * u);
    priceBlock(pad, by, { label: pal.sub, value: pal.accent, size: 84, maxW: mw * 0.55 });
    cta(W - pad, by + (pp.label ? 34 : 0) * u + 4 * u, pal.text, pal.bg, 'right');
    fine(pad, H - pad * 0.62, pal.sub);
  } else if (layout === 'framed') {
    let y = Math.max(pad * 0.9, topClear); logo(W / 2, y, pal.sub, 'center'); y += 72 * u;
    y = eyebrow(g.eyebrow, W / 2, y, pal.accent, 'center') + 8 * u;
    y = headline(W / 2, y, pal.text, sq ? 58 : 70, 2, mw, 'center') + 40 * u;
    const reserve = (g.sub ? 50 : 0) * u + 88 * u + 120 * u, phh = Math.max(H * 0.28, H - y - reserve - pad * 0.4), px = pad + 10 * u, pw = W - 2 * px;
    x.strokeStyle = pal.accent; x.globalAlpha = 0.55; x.lineWidth = 2 * u; rr(px - 16 * u, y - 16 * u, pw + 32 * u, phh + 32 * u, 40 * u); x.stroke(); x.globalAlpha = 1;
    photo(px, y, pw, phh, 28 * u);
    if (g.price) {   // price ribbon over the photo's lower-left corner
      font(800, 64 * u); const vw = x.measureText(pp.value).width; font(600, 22 * u); const lw = pp.label ? x.measureText(pp.label.toUpperCase()).width + 30 * u : 0;
      const bw = Math.min(pw - 60 * u, Math.max(vw, lw) + 64 * u), bh = (pp.label ? 34 : 0) * u + 64 * u + 44 * u, bx = px + 30 * u, byy = y + phh - bh * 0.62;
      x.fillStyle = pal.accent; rr(bx, byy, bw, bh, 18 * u); x.fill();
      priceBlock(bx + 32 * u, byy + 20 * u, { label: pal.accentText, value: pal.accentText, size: 64, maxW: bw - 64 * u });
    }
    y += phh + 70 * u; y = place(W / 2, y, pal.sub, pal.bg, 'center', mw) + 18 * u;
    cta(W / 2, Math.min(y, H - pad - 88 * u - 30 * u), pal.accent, pal.accentText, 'center');
    fine(W / 2, H - pad * 0.45, pal.sub, 'center');
  } else if (layout === 'split' && !story) {
    const iw = Math.round(W * 0.47); photo(0, 0, iw, H);
    const gr = x.createLinearGradient(iw - 40 * u, 0, iw, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.18)'); x.fillStyle = gr; x.fillRect(iw - 40 * u, 0, 40 * u, H);
    const x0 = iw + 56 * u, cw = W - x0 - 56 * u;
    const top0 = Math.max(pad, topClear); logo(x0, top0, pal.sub);
    const by = H - pad - 30 * u - 88 * u - 34 * u - (pp.label ? 34 : 0) * u - 64 * u;
    const eyeO = { w: 700, size: 22 * u, color: pal.accent, maxW: cw, max: 2, upper: true, track: 3 * u, lh: 1.35 };
    const hlO = { w: HW, f: HF, size: (sq ? 50 : 58) * u, color: pal.text, maxW: cw, max: 4, lh: pal.serif ? 1.08 : 1.04, key: 'headline', shrink: true };
    const blockH = (text(g.eyebrow, 0, 0, Object.assign({ dry: true }, eyeO)) + 10 * u) + text(g.headline, 0, 0, Object.assign({ dry: true }, hlO)) + 67 * u + feats.length * 52 * u;
    let y = Math.max(top0 + 84 * u, top0 + 84 * u + (by - 40 * u - (top0 + 84 * u) - blockH) / 2);
    y = text(g.eyebrow, x0, y, eyeO) + 10 * u;
    y = text(g.headline, x0, y, hlO); y += 26 * u;
    x.fillStyle = pal.accent; x.fillRect(x0, y, 64 * u, 5 * u); y += 36 * u;
    y = featureList(x0, y, cw, pal.text) + 14 * u;
    priceBlock(x0, Math.max(y + 20 * u, by), { label: pal.sub, value: pal.accent, size: 64, maxW: cw });
    cta(x0, H - pad - 30 * u - 88 * u, pal.text, pal.bg, 'left');
    fine(x0, H - pad * 0.62, pal.sub);
  } else if (layout === 'route' || layout === 'split') {
    const ph = Math.round(H * (story ? 0.6 : sq ? 0.42 : 0.5)); photo(0, 0, W, ph); shade(0, ph * 0.35, 0.55, 0); logo(pad, pad, '#fff');
    const by = H - pad - 40 * u - 88 * u - 26 * u - (pp.label ? 34 : 0) * u, room = () => by - 40 * u - y;
    let y = ph + (sq ? 44 : 54) * u; y = eyebrow(g.eyebrow, pad, y, pal.accent) + 8 * u;
    y = headline(pad, y, pal.text, sq ? 52 : 62, 2, mw); y += (sq ? 22 : 34) * u;
    if (layout === 'route' && stops.length >= 2 && room() >= 150 * u) {
      const ly = y + 62 * u, step = mw / (stops.length - 1 || 1);
      x.strokeStyle = pal.line; x.lineWidth = 4 * u; x.beginPath(); x.moveTo(pad, ly); x.lineTo(W - pad, ly); x.stroke();
      x.strokeStyle = pal.accent; x.setLineDash([14 * u, 12 * u]); x.beginPath(); x.moveTo(pad, ly); x.lineTo(W - pad, ly); x.stroke(); x.setLineDash([]);
      stops.forEach((st, i) => {
        const m = st.match(/^(\d+\s*\w+)\s+(.*)$/) || [null, st, ''], cx = pad + step * i, al = i === 0 ? 'left' : i === stops.length - 1 ? 'right' : 'center';
        x.fillStyle = pal.bg; x.beginPath(); x.arc(cx, ly, 13 * u, 0, 7); x.fill(); x.strokeStyle = pal.accent; x.lineWidth = 5 * u; x.stroke();
        font(800, 36 * u); x.fillStyle = pal.text; x.textAlign = al; x.fillText(m[1], cx, ly - 30 * u);
        font(500, 24 * u); x.fillStyle = pal.sub; x.fillText(m[2], cx, ly + 50 * u); x.textAlign = 'left';
      });
      y = ly + 80 * u;
    } else if (room() >= 60 * u) { const keep = Math.max(1, Math.floor(room() / (52 * u))); feats.splice(keep); y = featureList(pad, y, mw, pal.text); }
    x.fillStyle = pal.line; x.fillRect(pad, by - 30 * u, mw, 2 * u);
    priceBlock(pad, by, { label: pal.sub, value: pal.accent, size: 76, maxW: mw * 0.55 });
    cta(W - pad, by + (pp.label ? 34 : 0) * u + 2 * u, pal.accent, pal.accentText, 'right');
    fine(pad, H - pad * 0.62, pal.sub);
  } else {   // badge
    photo(0, 0, W, H); shade(0, H * 0.24, 0.5, 0); shade(H * 0.42, H, 0, 0.88); logo(pad, pad, '#fff');
    if (g.price) {
      const r = (sq ? 138 : 158) * u, cx = W - pad - r + 10 * u, cy = Math.max(pad + r + 40 * u, topClear + r + 10 * u);
      x.fillStyle = pal.accent; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
      x.strokeStyle = pal.accentText; x.globalAlpha = 0.55; x.lineWidth = 2 * u; x.setLineDash([6 * u, 7 * u]); x.beginPath(); x.arc(cx, cy, r - 16 * u, 0, 7); x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
      x.textAlign = 'center'; x.fillStyle = pal.accentText;
      if (pp.label) { font(700, 22 * u); track(3 * u); x.fillText(pp.label.toUpperCase(), cx, cy - 26 * u, r * 1.5); track(0); }
      let vs = 64 * u; font(800, vs); while (x.measureText(pp.value).width > r * 1.6 && vs > 30 * u) { vs *= 0.92; font(800, vs); }
      x.fillText(pp.value, cx, cy + (pp.label ? 40 : 22) * u); x.textAlign = 'left'; boxes.price = [(cx - r) / W, (cy - r) / H, 2 * r / W, 2 * r / H];
    }
    let y = H * (story ? 0.6 : sq ? 0.5 : 0.56);
    y = eyebrow(g.eyebrow, pad, y, pal.light ? '#fff' : pal.accent) + 10 * u;
    y = headline(pad, y, '#fff', story ? 92 : 80, 2, mw) + 18 * u;
    y = place(pad, y, 'rgba(255,255,255,.92)', 'rgba(0,0,0,.6)', 'left', mw) + 14 * u;
    offerTag(pad, y, '#fff');
    cta(pad, H - pad - 52 * u - 88 * u, pal.accent, pal.accentText, 'left');
    fine(pad, H - pad * 0.62, 'rgba(255,255,255,.7)');
  }
  reraBlock();
  return boxes;
}

/** Score a drawn canvas the same way as the original. Returns {map, scores, peaks, share(key)}. */
export function scoreCanvas(cv, boxes) {
  const map = saliency(toPixels(cv, null, 120));
  return { map, scores: scores(map), peaks: peaks(map, 3), share: k => boxes && boxes[k] ? shareIn(map, boxes[k]) : null };
}
