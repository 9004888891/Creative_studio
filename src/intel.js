// Creative intelligence: break creatives into elements, learn which elements go with better results,
// and recommend new creatives as combinations of proven elements (plus a measured share of untested ones).
//
// 1. Every creative is described by the same slots (ELEMENT_SLOTS): headline approach, USP, offer, price display,
//    visual, proof, CTA, talent, tone, format and audience. Tags come from the AI reading, from autoTag() on the
//    creative's text and name, or from a person.
// 2. Results are compared within a cohort (one project or campaign), so a ₹6 Cr project is never compared with a
//    ₹90 lakh one: each creative's expected outcome = its spend (or leads) × the cohort's own rate.
// 3. elementEffects() gives each element's lift (observed ÷ expected, shrunk towards 1 when evidence is thin) with an
//    80% interval; fitModel() separates elements that always appear together (a ridge Poisson regression).
// 4. recommend() builds new combinations by Thompson sampling from those estimates: proven elements win most draws,
//    untested ones still get tried, and every choice cites the creatives it came from.
// 5. Feed new results back in and everything is recomputed: the library is the memory.

export const ELEMENT_SLOTS = {
  format: { label: 'Format', multi: false, values: { static: 'Static', carousel: 'Carousel', video: 'Video' } },
  headline: { label: 'Headline approach', multi: false, values: {
    usp: 'A concrete USP', location: 'Location / landmark', price: 'Price-led', reason: 'Claim + reasons why', urgency: 'Urgency (why now)',
    scarcity: 'Scarcity (last few)', claim: 'Claim / superlative', benefit: 'Lifestyle benefit', mood: 'Mood / aspiration', metaphor: 'Metaphor',
    offer: 'Offer-led', festive: 'Festive', question: 'Question' } },
  usp: { label: 'USP shown', multi: true, values: {
    size: 'Size / configuration', deck: 'Deck / balcony', view: 'View', location: 'Location', connectivity: 'Connectivity', amenities: 'Amenities',
    vastu: 'Vastu', floor_height: 'Higher floors', brand_trust: 'Developer trust', lifestyle: 'Lifestyle', family: 'Family', luxury: 'Luxury',
    investment: 'Investment value', possession: 'Possession / ready' } },
  offer: { label: 'Offer', multi: false, values: {
    none: 'No offer', discount: 'Discount / save ₹', payment_plan: 'Payment plan (e.g. 30:70)', deferred_payment: 'Book small, pay later',
    prize: 'Prize / lucky draw', deadline: 'Deadline offer', booking_amount: 'Low booking amount', spot_offer: 'Spot / event offer' } },
  price: { label: 'Price on creative', multi: false, values: { shown: 'Price shown', all_inclusive: 'All-inclusive price', absent: 'No price' } },
  visual: { label: 'Main visual', multi: false, values: {
    exterior_render: 'Building render', interior_render: 'Interior render', amenity_render: 'Amenity render', actual_photo: 'Actual photo',
    people: 'People in the scene', presenter: 'Presenter on camera', ai_film: 'AI / CGI film', graphic: 'Graphic / illustration', map: 'Map / location graphic' } },
  proof: { label: 'Proof / trust signal', multi: true, values: {
    none: 'None', actual_image: '"Actual image"', shot_at_location: '"Shot at location"', construction: 'Construction progress', reason_line: 'Reason-why line',
    numbers: 'Hard numbers (sq ft, minutes, floors)', brand: 'Developer track record' } },
  cta: { label: 'Call to action', multi: false, values: {
    none: 'None in creative', learn_more: 'Learn more', book_now: 'Book now', site_visit: 'Site visit', price_sheet: 'Price sheet / floor plans',
    whatsapp: 'WhatsApp', private_viewing: 'Private viewing', register: 'Register', call: 'Call' } },
  talent: { label: 'Voice / talent', multi: false, values: { none: 'None', voiceover: 'Voiceover', presenter: 'Presenter / influencer' } },
  tone: { label: 'Tone', multi: false, values: { aspirational: 'Aspirational', rational: 'Rational / factual', urgent: 'Urgent', festive: 'Festive', emotional: 'Emotional' } },
  audience: { label: 'Audience (targeting)', multi: false, values: { local: 'Local', other_city: 'Other city', nri: 'NRI' } },
};

export const GOALS = {
  ql: { label: 'Qualified leads for the money', obs: 'ql', base: 'spend' },
  sv: { label: 'Site visits for the money', obs: 'sv', base: 'spend' },
  leads: { label: 'Leads for the money', obs: 'leads', base: 'spend' },
  quality: { label: 'Share of leads that qualify', obs: 'ql', base: 'leads' },
};

const iNum = v => { const n = Number(v); return isFinite(n) ? n : 0; };
const iArr = v => v == null ? [] : Array.isArray(v) ? v : [v];
const iKey = (s, v) => s + ':' + v;

/** Normalise a library entry: { id, name, brand, project, cohort, tags: { slot: value|[values] }, metrics: { spend, leads, ql, sv, impressions, clicks } }. */
export function toRecord(r) {
  const m = r.metrics || r;
  return { id: r.id || r.name, name: r.name || r.id, brand: r.brand || '', project: r.project || '', cohort: r.cohort || r.project || 'all',
    tags: Object.assign({}, r.tags || {}), facts: r.facts || null, headlineText: r.headlineText || '',
    metrics: { spend: iNum(m.spend), impressions: iNum(m.impressions), clicks: iNum(m.clicks), leads: iNum(m.leads), ql: iNum(m.ql), sv: iNum(m.sv) } };
}

/** Each creative's observed and expected outcome under a goal, against its own cohort's rate. */
export function prepare(records, goal = 'ql') {
  const G = GOALS[goal] || GOALS.ql, recs = records.map(toRecord).filter(r => r.metrics[G.base] > 0);
  const co = {};
  recs.forEach(r => { const c = co[r.cohort] || (co[r.cohort] = { obs: 0, base: 0, n: 0 }); c.obs += r.metrics[G.obs]; c.base += r.metrics[G.base]; c.n++; });
  Object.values(co).forEach(c => { c.rate = c.base ? c.obs / c.base : 0; });
  return recs.filter(r => co[r.cohort].rate > 0).map(r => Object.assign(r, { obs: r.metrics[G.obs], exp: r.metrics[G.base] * co[r.cohort].rate, cohortRate: co[r.cohort].rate }));
}

// Gamma(shape, rate) quantile, Wilson–Hilferty approximation (good enough for intervals on a lift)
function iGammaQ(shape, rate, z) { const k = Math.max(shape, 0.05), c = 1 / (9 * k); return Math.max(0, (k / rate) * Math.pow(Math.max(0, 1 - c + z * Math.sqrt(c)), 3)); }

/**
 * Lift of every element value: observed ÷ expected outcome in the creatives that use it, shrunk towards 1.
 * Returns [{ slot, value, label, n, spend, obs, exp, lift, lo, hi, evidence: 'strong'|'some'|'thin', exemplars: [record] }] sorted by lift.
 */
export function elementEffects(records, opts = {}) {
  const prior = opts.prior == null ? 3 : opts.prior, recs = opts.prepared ? records : prepare(records, opts.goal), acc = {};
  recs.forEach(r => Object.entries(r.tags).forEach(([s, vs]) => { if (!ELEMENT_SLOTS[s]) return; iArr(vs).forEach(v => {
    const a = acc[iKey(s, v)] || (acc[iKey(s, v)] = { slot: s, value: v, n: 0, spend: 0, obs: 0, exp: 0, recs: [] });
    a.n++; a.spend += r.metrics.spend; a.obs += r.obs; a.exp += r.exp; a.recs.push(r); }); }));
  return Object.values(acc).map(a => {
    const sh = a.obs + prior, rt = a.exp + prior, lift = sh / rt;
    const ex = a.recs.filter(r => r.exp > 0).map(r => ({ r, e: (r.obs + 1) / (r.exp + 1) })).sort((p, q) => q.e - p.e).slice(0, 3).map(x => x.r);
    return { slot: a.slot, value: a.value, label: (ELEMENT_SLOTS[a.slot].values[a.value] || a.value), slotLabel: ELEMENT_SLOTS[a.slot].label, n: a.n, spend: a.spend,
      obs: a.obs, exp: a.exp, lift, lo: iGammaQ(sh, rt, -1.2816), hi: iGammaQ(sh, rt, 1.2816),
      evidence: a.exp >= 8 && a.n >= 3 ? 'strong' : a.exp >= 3 && a.n >= 2 ? 'some' : 'thin', exemplars: ex };
  }).sort((p, q) => q.lift - p.lift);
}

/**
 * Ridge Poisson regression of the outcome on all element values at once (offset = expected outcome), so an element
 * that always rides with a strong one does not take its credit. Returns { effects: { 'slot:value': { b, sd, mult } }, lambda, n }.
 */
export function fitModel(records, opts = {}) {
  const recs = opts.prepared ? records : prepare(records, opts.goal), lambda = opts.lambda || 4;
  const feats = [], idx = {};
  recs.forEach(r => Object.entries(r.tags).forEach(([s, vs]) => { if (!ELEMENT_SLOTS[s] || s === 'audience' && opts.noAudience) return; iArr(vs).forEach(v => { const k = iKey(s, v); if (!(k in idx)) { idx[k] = feats.length; feats.push(k); } }); }));
  const X = recs.map(r => { const row = []; Object.entries(r.tags).forEach(([s, vs]) => iArr(vs).forEach(v => { const j = idx[iKey(s, v)]; if (j != null) row.push(j); })); return row; });
  const off = recs.map(r => Math.log(Math.max(r.exp, 1e-6))), y = recs.map(r => r.obs), P = feats.length;
  let b = new Float64Array(P);
  const etaOf = (bb, i) => { let e = off[i]; X[i].forEach(j => { e += bb[j]; }); return Math.min(e, 30); };
  const objective = bb => { let ll = 0; for (let i = 0; i < recs.length; i++) { const e = etaOf(bb, i); ll += y[i] * e - Math.exp(e); } let pen = 0; for (let j = 0; j < P; j++) pen += bb[j] * bb[j]; return ll - lambda / 2 * pen; };
  let H = null;
  for (let it = 0; it < 50; it++) {   // ridge-penalised Newton (IRLS) with step halving
    const g = new Float64Array(P); H = Array.from({ length: P }, () => new Float64Array(P));
    for (let i = 0; i < recs.length; i++) { const mu = Math.exp(etaOf(b, i)), xi = X[i]; xi.forEach(j => { g[j] += y[i] - mu; xi.forEach(k => { H[j][k] += mu; }); }); }
    for (let j = 0; j < P; j++) { g[j] -= lambda * b[j]; H[j][j] += lambda; }
    const d = iSolve(H, g); let t = 1, base = objective(b), nb;
    for (let h = 0; h < 20; h++) { nb = b.map((v, j) => v + t * d[j]); if (objective(nb) >= base - 1e-9) break; t /= 2; }
    const move = Math.max(...d.map(v => Math.abs(v * t))); b = nb; if (move < 1e-6) break;
  }
  const Hinv = iInvert(H), hh = new Float64Array(P);
  for (let i = 0; i < recs.length; i++) { const mu = Math.exp(etaOf(b, i)); X[i].forEach(j => { hh[j] += mu; }); }
  // One-hot values within a slot share an intercept, so report each value relative to its slot's exposure-weighted average:
  // mult 1.3 = 30% more of the outcome than the slot's typical value, other elements held equal.
  const slotMean = {};
  feats.forEach((k, j) => { const s = k.split(':')[0], m = slotMean[s] || (slotMean[s] = { w: 0, sum: 0 }); m.w += hh[j]; m.sum += hh[j] * b[j]; });
  const effects = {}; feats.forEach((k, j) => { const m = slotMean[k.split(':')[0]], c = b[j] - (m.w ? m.sum / m.w : 0); effects[k] = { b: c, sd: Math.sqrt(Math.max(Hinv[j][j], 1e-9)), mult: Math.exp(c), exposure: hh[j] }; });
  return { effects, lambda, n: recs.length };
}

// small dense linear algebra (P is a few dozen element values)
function iSolve(A, bv) { const n = bv.length, M = A.map((r, i) => [...r, bv[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
    const piv = M[c][c] || 1e-12; for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / piv; if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } }
  return M.map((r, i) => r[n] / (r[i] || 1e-12)); }
function iInvert(A) { const n = A.length; return A.map((_, i) => { const e = new Array(n).fill(0); e[i] = 1; return iSolve(A, e); }).reduce((inv, col, j) => { col.forEach((v, i) => { inv[i][j] = v; }); return inv; }, Array.from({ length: n }, () => new Array(n).fill(0))); }

/* ---------- recommendations ---------- */

const I_CTA = { site_visit: 'Book a site visit', book_now: 'Book now', price_sheet: 'Get the price sheet', private_viewing: 'Request a private viewing', whatsapp: 'Chat on WhatsApp', register: 'Register now', learn_more: 'Learn more', call: 'Call now', none: '' };
const I_VISUAL = {
  exterior_render: 'The building at golden hour, one clear hero, nothing else competing.', interior_render: 'The living room or master bedroom, wide and bright.',
  amenity_render: 'One amenity at its best (pool at dusk, clubhouse), not a collage.', actual_photo: 'A real photograph of the site, sample flat or view, labelled "Actual image".',
  people: 'A person or family in the home (on the deck, at the window), not looking at the camera.', presenter: 'A presenter on camera at the site, speaking to the viewer.',
  ai_film: 'A short CGI / AI walk-through with the building and the view.', graphic: 'A clean typographic or illustrated card.', map: 'A simple map with the landmark and the project pin.',
};
const I_LAYOUT = { price: 'pricecard', location: 'route', usp: 'editorial', reason: 'framed', urgency: 'editorial', scarcity: 'badge', claim: 'editorial', benefit: 'editorial', mood: 'editorial', metaphor: 'editorial', offer: 'badge', festive: 'badge', question: 'framed' };

/** Project facts → short iPhrases the copy formulas use. ctx: { project, location, micro, landmark, inventory, configs:[{type, price, size}], priceRange, usps, offer, possession, developer, festival, allInclusive } */
function iPhrases(ctx = {}) {
  const usps = String(ctx.usps || '').split(/[,;·|]/).map(s => s.trim()).filter(Boolean);
  const cfg = (ctx.configs || []).filter(c => c.type);
  const type = cfg.length ? cfg.map(c => c.type.replace(/\s*BHK/i, '')).join(' & ') + '-bed homes' : (ctx.inventory || 'Homes');
  const price = cfg.length && cfg[0].price ? `${cfg[0].type} from ${cfg[0].price}*` : ctx.priceRange ? `From ${String(ctx.priceRange).split(/[–-]/)[0].trim()}*` : '';
  const find = re => usps.find(u => re.test(u)) || '';
  return { project: ctx.project || 'the project', loc: ctx.micro || ctx.location || '', landmark: ctx.landmark || find(/next to|near|connector|metro|station|highway|bkc/i),
    type, price, usps, size: (cfg.find(c => c.size) || {}).size || find(/sq\.?\s?ft|carpet|spacious|large/i), deck: find(/deck|balcon/i), view: find(/view/i),
    amen: find(/amenit|club|pool|gym/i), vastu: find(/vastu/i), floors: find(/floor/i), offer: ctx.offer || '', possession: ctx.possession || '', dev: ctx.developer || ctx.brand || '' };
}
const iCap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/** Copy for one combination, from the project's own facts. Unknown facts become "__" for a person to fill. */
export function composeCopy(combo, ctx = {}) {
  const p = iPhrases(ctx), u = iArr(combo.usp), h = combo.headline;
  const uspText = v => ({ size: p.size || (p.type !== 'Homes' ? `Spacious ${p.type}` : ''), deck: p.deck, view: p.view, location: p.loc && `In ${p.loc}`, connectivity: p.landmark && iCap(p.landmark), amenities: p.amen,
    vastu: p.vastu || 'Vastu-compliant homes', floor_height: p.floors, possession: p.possession && `Possession ${p.possession}`, brand_trust: p.dev && `By ${p.dev}`, investment: 'Built to hold its value',
    family: 'Room for every generation', lifestyle: p.usps[0], luxury: p.usps[0] }[v] || '');
  const nonLoc = u.filter(v => v !== 'location').map(uspText).find(Boolean);
  const first = nonLoc || u.map(uspText).find(Boolean) || p.usps[0] || '__';
  const reasons = [...new Set(u.map(uspText).filter(Boolean).concat(p.usps, p.landmark ? [iCap(p.landmark)] : []))].slice(0, 3);
  const pv = ((ctx.configs || [])[0] || {}).price || (ctx.priceRange ? String(ctx.priceRange).split(/[–-]/)[0].trim() : '');
  const headline = {
    usp: iCap(first), location: p.landmark ? `${iCap(p.type)} ${/^(next|near|off|on|at)\b/i.test(p.landmark) ? p.landmark : /^\d/.test(p.landmark) ? '· ' + p.landmark : 'near ' + p.landmark}` : `${iCap(p.type)} ${/^(off|near|next|on|at|in)\b/i.test(p.loc) ? p.loc : 'in ' + (p.loc || '__')}`,
    price: `${iCap(p.type)} from ${pv || '₹__'}*`, reason: reasons.length >= 2 ? reasons.slice(0, 2).map(r => iCap(r.replace(/\.$/, ''))).join('. ') + '.' : `${iCap(first)}. __.`,
    urgency: `The best ${/plot/i.test(p.type) ? 'plots' : 'homes'} at ${p.project} go first`, scarcity: ctx.scarcity || 'Last few homes in this phase*', claim: ctx.claim || `${p.loc || 'The city'}'s most-wanted address*`,
    benefit: iCap(first), mood: `${p.project}: __`, metaphor: '__ (metaphor line)', offer: p.offer || 'Booking offer: __', festive: `${ctx.festival || 'Festive'} offers at ${p.project}`, question: `Looking for ${p.type.toLowerCase()} ${/^(off|near|next|on|at|in)\b/i.test(p.loc) ? p.loc : 'in ' + (p.loc || '__')}?`,
  }[h] || iCap(first);
  const sub = [h !== 'price' && combo.price !== 'absent' ? p.price : '', h !== 'location' && p.loc ? p.loc : ''].filter(Boolean).join(' · ');
  const offer = combo.offer && combo.offer !== 'none' ? ({ discount: 'Save ₹__ on booking*', payment_plan: '__:__ payment plan*', deferred_payment: 'Book with ₹__, pay the rest at possession*', prize: 'Assured gift on booking*', deadline: 'Offer ends __*', booking_amount: 'Book with ₹__*', spot_offer: 'Spot booking benefit: __*' }[combo.offer] || '') : '';
  return { headline, sub, price: combo.price === 'absent' ? '' : (combo.price === 'all_inclusive' && p.price ? p.price.replace('*', ' all-inclusive*') : p.price), offer, cta: I_CTA[combo.cta] || 'Book a site visit',
    visual: I_VISUAL[combo.visual] || '', proofLine: iArr(combo.proof).includes('actual_image') ? 'Actual image' : iArr(combo.proof).includes('shot_at_location') ? 'Shot at location' : '' };
}

/** USPs and proof points the project's own facts can support (so the engine never invents one). */
export function supported(ctx = {}) {
  const p = iPhrases(ctx), u = new Set(), pr = new Set(['reason_line']), all = (p.usps.join(' ') + ' ' + (ctx.inventory || '')).toLowerCase();
  if (p.size || (ctx.configs || []).length) u.add('size'); if (p.deck) u.add('deck'); if (p.view) u.add('view'); if (p.loc) u.add('location'); if (p.landmark) u.add('connectivity');
  if (p.amen) u.add('amenities'); if (p.vastu) u.add('vastu'); if (p.floors) u.add('floor_height'); if (p.dev && ctx.trackRecord) u.add('brand_trust'); if (p.possession) u.add('possession');
  if (/famil|generation|kids|school/.test(all)) u.add('family'); if (/luxe|luxur|premium|ultra/.test(all)) u.add('luxury'); if (/invest|rental|appreciat/.test(all)) u.add('investment'); if (p.usps.length) u.add('lifestyle');
  if (p.size || /\d[\d,]*\s?sq|\d+\s?(acre|floor|min)/i.test(all)) pr.add('numbers'); if (ctx.actualImages) { pr.add('actual_image'); pr.add('shot_at_location'); }
  if (ctx.construction) pr.add('construction'); if (ctx.trackRecord) pr.add('brand');
  return { usp: u, proof: pr };
}

// rules that keep a combination coherent
function iAllowed(slot, value, combo, t) {
  if (t.fixed && t.fixed[slot] != null) return iArr(t.fixed[slot]).includes(value);
  if (t.exclude && iArr(t.exclude[slot]).includes(value)) return false;
  if (slot === 'audience') return false;                                      // targeting is chosen in the ad set, not the creative
  if (slot === 'talent' && value !== 'none' && combo.format && combo.format !== 'video') return false;
  if (slot === 'visual' && (value === 'presenter' || value === 'ai_film') && combo.format && combo.format !== 'video') return false;
  if (slot === 'headline' && value === 'offer' && !(t.ctx && t.ctx.offer)) return false;
  if (slot === 'offer' && value !== 'none' && !(t.ctx && t.ctx.offer)) return false;   // never invent an offer
  if (slot === 'headline' && value === 'festive' && !(t.ctx && t.ctx.festival)) return false;
  if (slot === 'headline' && value === 'scarcity' && !(t.ctx && t.ctx.scarcity)) return false;   // only when it is true
  if (slot === 'headline' && value === 'claim' && !(t.ctx && t.ctx.claim)) return false;         // superlatives need proof
  if (slot === 'proof' && value === 'none') return false;
  if ((slot === 'usp' || slot === 'proof') && t.ctx && Object.keys(t.ctx).length) { const sp = t._sup || (t._sup = supported(t.ctx)); if (sp[slot].size && !sp[slot].has(value)) return false; }
  if (slot === 'price' && value === 'absent' && combo.headline === 'price') return false;
  if (slot === 'cta' && value === 'register' && !(t.ctx && t.ctx.event)) return false;
  if (slot === 'price' && value === 'all_inclusive' && !(t.ctx && t.ctx.allInclusive)) return false;
  return true;
}
const I_ORDER = ['format', 'headline', 'usp', 'offer', 'price', 'visual', 'proof', 'cta', 'talent', 'tone'];
function iRandn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/**
 * New creative recommendations as combinations of elements.
 * records: the library (with metrics); target: { ctx (project facts), fixed: { slot: value }, exclude: { slot: [values] }, bans: ['travel-time', …] }
 * opts: { goal: 'ql'|'sv'|'leads'|'quality', count = 4, explore = 0.25 (share of draws that favour untested elements), seed }
 * Returns { concepts: [{ id, combo, score (expected multiple of the project average), pBeat (chance of beating it), explore, why: [{ slot, value, label, mult, evidence, from: [names] }], copy, g }], effects, model, learning }.
 */
export function recommend(records, target = {}, opts = {}) {
  const goal = opts.goal || 'ql', prepped = prepare(records, goal), effects = elementEffects(prepped, { prepared: true }), model = fitModel(prepped, { prepared: true, noAudience: true });
  const byKey = {}; effects.forEach(e => { byKey[iKey(e.slot, e.value)] = e; });
  // Each element's estimate = its shrunk lift on the log scale (sd from the Gamma posterior). The joint model only flags
  // elements whose lift shrinks once the other elements are held equal (they may be borrowing another element's credit).
  // sd adds creative-to-creative spread (1/n): an element seen in one creative is mostly that creative, not the element
  const est = {}; effects.forEach(e => { est[iKey(e.slot, e.value)] = { mu: Math.log(e.lift), sd: Math.sqrt(1 / (e.obs + 3) + 0.5 / e.n), exp: e.exp, n: e.n }; });
  const tested = (slot, v) => { const m = est[iKey(slot, v)]; return !!m && m.exp >= (opts.minExpected || 2) && m.n >= (opts.minCreatives || 2); };
  const used = {};   // values already in earlier concepts get a small penalty, so the set covers different ideas
  const confounded = (slot, v) => { const e = est[iKey(slot, v)], m = model.effects[iKey(slot, v)]; return !!(e && m) && Math.sign(e.mu) !== Math.sign(m.b) && Math.abs(e.mu) > 0.15; };
  const SHRINK = 0.5;   // combining slots double-counts elements that travel together; halve the sum to stay conservative
  const totalExp = prepped.reduce((s, r) => s + r.exp, 0), count = opts.count || 4;
  const nExplore = Math.max(0, Math.min(count - 1, Math.round(count * (opts.explore == null ? 0.25 : opts.explore))));
  const seen = new Set(), concepts = [];
  const weak = (slot, v) => { const e = byKey[iKey(slot, v)]; return !!e && e.n >= 2 && e.hi < 1 && e.lift < 0.9; };   // known to underperform: never re-used
  const build = (exploreSlot, greedy) => {
    const combo = {};
    I_ORDER.forEach(slot => {
      const S = ELEMENT_SLOTS[slot], fixed = target.fixed && target.fixed[slot] != null;
      let all = Object.keys(S.values).filter(v => iAllowed(slot, v, combo, target));
      if (!fixed && all.some(v => !weak(slot, v))) all = all.filter(v => !weak(slot, v));
      if (!all.length) return;
      const proven = all.filter(v => tested(slot, v)), untested = all.filter(v => !tested(slot, v));
      const open = !proven.some(v => est[iKey(slot, v)].mu > 0.05);   // nothing in this slot has proven better than average yet
      const pool = slot === exploreSlot && untested.length ? untested : open ? all : proven.length ? proven : all;
      const pen = v => (used[iKey(slot, v)] || 0) * (['headline', 'visual', 'format', 'usp'].includes(slot) ? 0.2 : 0.05);
      const draw = v => { const m = est[iKey(slot, v)]; return (m && tested(slot, v) ? (confounded(slot, v) ? m.mu * 0.3 : m.mu) + (greedy ? 0 : iRandn() * m.sd) : (greedy ? (open ? 0.02 : -0.05) : iRandn() * 0.3)) - pen(v); };
      const scored = pool.map(v => [v, draw(v)]).sort((p, q) => q[1] - p[1]);
      combo[slot] = S.multi ? scored.filter(([, sc], i) => i === 0 || (i < 2 && sc > 0)).map(([v]) => v) : scored[0][0];
    });
    return combo;
  };
  const slotsToExplore = I_ORDER.filter(slot => Object.keys(ELEMENT_SLOTS[slot].values).some(v => !tested(slot, v)));
  for (let attempt = 0; attempt < count * 15 && concepts.length < count; attempt++) {
    const wantExplore = concepts.filter(c => c.explore).length < nExplore && concepts.filter(c => !c.explore).length >= count - nExplore;
    const exploreSlot = wantExplore ? slotsToExplore[Math.floor(Math.random() * slotsToExplore.length)] : null;
    const combo = build(exploreSlot, concepts.length === 0 && !exploreSlot);
    const sig = I_ORDER.map(s => s + '=' + iArr(combo[s]).join('+')).join('|'); if (seen.has(sig)) continue; seen.add(sig);
    let lb = 0, varb = 0, untested = 0; const why = [];
    I_ORDER.forEach(slot => iArr(combo[slot]).forEach(v => {
      const m = est[iKey(slot, v)], e = byKey[iKey(slot, v)], ok = tested(slot, v), cf = ok && confounded(slot, v);
      if (ok) { lb += SHRINK * (cf ? m.mu * 0.3 : m.mu); varb += SHRINK * SHRINK * m.sd * m.sd; } else untested++;
      why.push({ slot, value: v, label: ELEMENT_SLOTS[slot].values[v] || v, slotLabel: ELEMENT_SLOTS[slot].label, lift: e ? e.lift : null, lo: e ? e.lo : null, hi: e ? e.hi : null,
        model: model.effects[iKey(slot, v)] ? model.effects[iKey(slot, v)].mult : null, confounded: cf,
        evidence: ok && e ? e.evidence : 'untested', n: e ? e.n : 0, from: e ? e.exemplars.slice(0, 2).map(r => `${r.brand ? r.brand + ' · ' : ''}${r.name}`) : [],
        quote: e && slot === 'headline' ? (e.exemplars.map(r => r.headlineText).find(Boolean) || '') : '' });
    }));
    I_ORDER.forEach(slot => iArr(combo[slot]).forEach(v => { used[iKey(slot, v)] = (used[iKey(slot, v)] || 0) + 1; }));
    const sd = Math.sqrt(varb), pBeat = sd ? 0.5 * (1 + iErf(lb / (sd * Math.SQRT2))) : 0.5, copy = composeCopy(combo, target.ctx || {});
    const tests = why.filter(w => w.evidence === 'untested').map(w => w.slotLabel);
    concepts.push({ id: 'k' + concepts.length, combo, score: Math.exp(lb), pBeat, explore: untested > 0, untested, tests: [...new Set(tests)], why, copy,
      g: { layout: I_LAYOUT[combo.headline] || 'editorial', headline: copy.headline, sub: copy.sub, price: copy.price, offer: copy.offer, cta: copy.cta, eyebrow: copy.proofLine } });
  }
  concepts.sort((p, q) => (p.explore === q.explore ? q.pBeat - p.pBeat : p.explore ? 1 : -1));
  return { concepts, effects, model, goal, learning: totalExp < 20 ? 'early' : totalExp < 80 ? 'growing' : 'established', records: prepped.length };
}
function iErf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }

/* ---------- tagging ---------- */

const I_RX = {
  offer: [['prize', /bumper prize|lucky draw|cruise|win a|gold coin|assured gift/i], ['discount', /save (up to )?₹?\s?\d|discount|\boff\b on|cashback/i], ['payment_plan', /\b\d{2}\s?:\s?\d{2}\b|payment plan|subvention|no emi/i],
    ['deferred_payment', /relax till|pay (the )?rest|book (with|at) (just )?₹?\s?\d+\s?(lakh|l\b)/i], ['deadline', /offer ends|till \d|last date|valid till|only till/i], ['spot_offer', /spot (booking|offer)/i], ['booking_amount', /book (now )?(with|at) ₹?\s?\d/i]],
  headline: [['scarcity', /last few|limited (units|homes)|selling fast|few left/i], ['urgency', /running out|don't wait|move in early|before (it'?s|prices)|prices set to rise|book (now|today)/i],
    ['price', /^(starting|from|at)\s*₹|₹\s?\d/i], ['location', /next to|near|minutes? (from|to)|connector|off .* road|at the centre of/i], ['festive', /diwali|navratri|ganesh|ganpati|carnival|festiv|home fest/i],
    ['claim', /finest|largest|most loved|best|no\.?\s?1|landmark|gold standard/i], ['metaphor', /like flying|first class|forecast|cheque|portfolio manager/i], ['question', /\?$/]],
  usp: [['deck', /deck|balcon/i], ['size', /sq\.?\s?ft|kingsize|spacious|large|grand \d|ultra spacious|\d(\.\d)?[- ]bed/i], ['view', /view/i], ['connectivity', /metro|station|connector|highway|bkc|airport|minutes? (from|to)/i],
    ['amenities', /amenit|club|pool|gym|podium/i], ['vastu', /vastu/i], ['floor_height', /higher floors|20\+|high[- ]rise floors/i], ['family', /family|generation|kids/i], ['luxury', /luxe|luxury|premium|grandeur/i],
    ['investment', /invest|portfolio|value|legacy/i], ['possession', /possession|ready to move|oc received/i]],
  cta: [['site_visit', /site visit|visit (the|our) site|sample flat/i], ['book_now', /book now|book today|book yours/i], ['price_sheet', /price sheet|floor plan|brochure/i], ['whatsapp', /whatsapp/i], ['private_viewing', /private (viewing|tour)/i], ['register', /register/i], ['call', /call (now|us)/i]],
  proof: [['actual_image', /actual image/i], ['shot_at_location', /shot at location/i], ['construction', /construction|progress/i], ['reason_line', /because|loved for|blend of/i], ['numbers', /\d[\d,]*\s?sq\.?\s?ft|\d+\s?min|\d+(st|nd|rd|th) floor/i]],
};

/** Element tags from a creative's text (OCR or AI reading) and its file name. A person or the AI reading can correct them. */
export function autoTag({ text = '', name = '', kind = 'image' } = {}) {
  const t = String(text), n = String(name), all = t + ' ' + n, tags = {};
  tags.format = kind === 'video' || /video/i.test(n) ? 'video' : kind === 'carousel' || /carousel/i.test(n) ? 'carousel' : 'static';
  tags.offer = (I_RX.offer.find(([, r]) => r.test(t)) || ['none'])[0];
  tags.price = /all[- ]incl/i.test(t) ? 'all_inclusive' : /₹|\bcr\b|lakh|lacs|\bl\b\s|\$\s?\d/i.test(t) && /\d/.test(t) ? 'shown' : /\bWOP\b/.test(n) ? 'absent' : /\bWP\b/.test(n) ? 'shown' : 'absent';
  const hl = I_RX.headline.find(([, r]) => r.test(t)); tags.headline = tags.offer !== 'none' && /^(save|book|offer|rain cheque)/i.test(t.trim()) ? 'offer' : hl ? hl[0] : 'mood';
  tags.usp = I_RX.usp.filter(([, r]) => r.test(all)).map(([v]) => v); if (!tags.usp.length) tags.usp = ['lifestyle'];
  tags.cta = (I_RX.cta.find(([, r]) => r.test(t)) || ['none'])[0];
  tags.proof = I_RX.proof.filter(([, r]) => r.test(t)).map(([v]) => v); if (!tags.proof.length) tags.proof = ['none'];
  tags.tone = tags.headline === 'festive' || tags.offer === 'prize' ? 'festive' : tags.headline === 'urgency' || tags.headline === 'scarcity' ? 'urgent' : tags.headline === 'price' || tags.headline === 'location' || tags.headline === 'usp' ? 'rational' : 'aspirational';
  tags.talent = /voice ?over|\bVO\b/i.test(n) ? 'voiceover' : /influencer|presenter|anchor/i.test(n) ? 'presenter' : 'none';
  return tags;
}

/** The "tags" instruction added to the AI reading, so the AI fills the same slots. */
export function tagPromptPart() {
  const lines = Object.entries(ELEMENT_SLOTS).filter(([s]) => s !== 'audience' && s !== 'format').map(([s, d]) => `"${s}":${d.multi ? '[' : ''}"${Object.keys(d.values).join('|')}"${d.multi ? ']' : ''}`);
  return `"tags":{${lines.join(',')}}`;
}

/* ---------- similarity: how close a creative is to what has already run ---------- */
const I_SIMW = { format: 1, headline: 1.5, usp: 1.5, offer: 1, price: 0.5, visual: 1.5, proof: 0.5, cta: 0.5, talent: 1, tone: 1 };
const I_STOP = /^(the|and|for|with|your|you|our|from|at|in|on|of|to|a|an|is|are|now|new|homes?|bhk|cr|lakh|starting|onwards)$/;
const iJac = (a, b) => { const A = new Set(iArr(a).filter(v => v !== 'none')), B = new Set(iArr(b).filter(v => v !== 'none')); if (!A.size && !B.size) return iArr(a)[0] === iArr(b)[0] ? 1 : null; let n = 0; A.forEach(v => { if (B.has(v)) n++; }); return n / (A.size + B.size - n || 1); };
const iTok = s => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9₹ ]+/g, ' ').split(' ').filter(w => w.length > 2 && !I_STOP.test(w)));
const iHam = (a, b) => { let d = 0; for (let i = 0; i < 16; i += 4) { let x = parseInt(a.slice(i, i + 4), 16) ^ parseInt(b.slice(i, i + 4), 16); while (x) { d += x & 1; x >>= 1; } } return d; };

/**
 * How alike two creatives are, 0–1: their elements (weighted by slot), their headline words, and their look (a visual hash,
 * when both have one). Returns { score, shared: [labels of shared elements], elements, text, look }.
 */
export function similarity(a, b) {
  const ta = a.tags || {}, tb = b.tags || {}; let s = 0, w = 0, poss = 0; const shared = [], set = v => v != null && iArr(v).length > 0;
  Object.entries(I_SIMW).forEach(([k, wt]) => { if (set(ta[k]) || set(tb[k])) poss += wt; if (!set(ta[k]) || !set(tb[k])) return; const j = iJac(ta[k], tb[k]); if (j == null) return; s += wt * j; w += wt;
    if (j > 0) iArr(ta[k]).filter(v => v !== 'none' && iArr(tb[k]).includes(v)).forEach(v => shared.push((ELEMENT_SLOTS[k].values[v] || v))); });
  const elements = w ? (s / w) * Math.sqrt(w / Math.max(w, poss)) : null;   // only partly comparable when one side has fewer elements tagged
  let text = null; if (a.headlineText && b.headlineText) { const A = iTok(a.headlineText), B = iTok(b.headlineText); let n = 0; A.forEach(v => { if (B.has(v)) n++; }); text = A.size + B.size ? n / (A.size + B.size - n) : null; }
  const look = a.hash && b.hash && a.hash.length === 16 && b.hash.length === 16 ? 1 - iHam(a.hash, b.hash) / 64 : null;
  let tot = 0, tw = 0; if (elements != null) { tot += elements * 3; tw += 3; } if (text != null) { tot += text * 1; tw += 1; } if (look != null) { tot += Math.max(0, (look - 0.5) * 2) * 2; tw += 2; }
  return { score: tw ? tot / tw : 0, shared, elements, text, look };
}

/**
 * The past creatives closest to this one, with their results against their own project.
 * target: a record ({ tags, headlineText, hash, brand, project, name }); records: the library. opts: { goal, limit = 5, min = 0.55 }.
 * Returns { list: [{ record, score, shared, vs }], alike: number of creatives at 0.8 or more, alikeVs: their combined result }.
 */
export function similarCreatives(target, records, opts = {}) {
  const key = r => [r.brand, r.project, r.name].map(s => String(s || '').toLowerCase()).join('|'), tk = key(target);
  const prepped = prepare((records || []).filter(r => r.metrics), opts.goal || 'ql'), by = new Map(prepped.map(r => [r.id, r]));
  const list = (records || []).filter(r => key(r) !== tk && r.tags).map(r => { const s = similarity(target, r), p = by.get(r.id || r.name);
    return { record: r, score: s.score, shared: s.shared, look: s.look, vs: p && p.exp >= 0.5 ? p.obs / p.exp : null, obs: p ? p.obs : 0, exp: p ? p.exp : 0 }; })
    .filter(x => x.score >= (opts.min == null ? 0.55 : opts.min)).sort((a, b) => b.score - a.score);
  const close = list.filter(x => x.score >= 0.8), withRes = close.filter(x => x.exp > 0), o = withRes.reduce((s, x) => s + x.obs, 0), e = withRes.reduce((s, x) => s + x.exp, 0);
  return { list: list.slice(0, opts.limit || 5), alike: close.length, alikeVs: e >= 1 ? o / e : null, alikeN: withRes.length };
}

/**
 * The ideas that have run most often: creatives grouped by format, headline approach, main visual and tone,
 * with how many there were, across which brands, and how they did against their projects.
 */
export function ideaClusters(records, opts = {}) {
  const prepped = prepare((records || []).filter(r => r.metrics), opts.goal || 'ql'), by = new Map(prepped.map(r => [r.id, r])), g = new Map();
  (records || []).filter(r => r.tags && r.tags.format).forEach(r => { const t = r.tags, k = ['format', 'headline', 'visual', 'tone'].map(s => iArr(t[s])[0] || '?').join('|');
    const c = g.get(k) || { key: k, tags: { format: t.format, headline: iArr(t.headline)[0], visual: iArr(t.visual)[0], tone: iArr(t.tone)[0] }, n: 0, brands: new Set(), obs: 0, exp: 0, withRes: 0, examples: [] };
    c.n++; if (r.brand) c.brands.add(r.brand); if (c.examples.length < 3) c.examples.push(r.name); const p = by.get(r.id || r.name); if (p) { c.obs += p.obs; c.exp += p.exp; c.withRes++; } g.set(k, c); });
  return [...g.values()].filter(c => c.n >= (opts.min || 2)).map(c => Object.assign(c, { brands: [...c.brands], vs: c.exp >= 1 ? (c.obs + 3) / (c.exp + 3) : null,
    label: ['format', 'headline', 'visual', 'tone'].map(s => c.tags[s] && ELEMENT_SLOTS[s].values[c.tags[s]] ? (s === 'headline' ? ELEMENT_SLOTS[s].values[c.tags[s]] + ' headline' : ELEMENT_SLOTS[s].values[c.tags[s]]) : '').filter(Boolean).join(' · ') }))
    .sort((a, b) => b.n - a.n);
}
