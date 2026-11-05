// Drop-in Creative studio panel. Framework-free: mount it into any element.
//
//   const studio = new CreativeHeatmap(document.getElementById('studio'), {
//     context: { project: 'Harbourline Residences', brand: 'Harbourline Homes', location: 'Thane', priceRange: '₹1.2 Cr – ₹2.1 Cr' },
//     ai: { endpoint: '/api/creative-analyze' },          // optional
//     onSave: (blob, info) => uploadToYourStorage(blob, info.name),   // optional
//   });
//
import {
  loadImage, analyseImage, paintView, elementsInView, elementShares, viewingOrder, suggestions,
  aiPrompt, imageDataURL, videoFrames, shareIn, carouselNotes, ELEMENT_LABELS,
  toFunnel, sumFunnel, funnelRates, funnelNotes, matchRow, scoreWord, audioProfile, audioWav, soundNotes, videoNotes,
} from './core.js';
import { SIZES, LAYOUTS, PALETTES, defaults, ideas, ideaNotes, heroRect, drawCreative, scoreCanvas } from './generator.js';
import { ELEMENT_SLOTS, GOALS, toRecord, prepare, elementEffects, fitModel, recommend, autoTag, similarCreatives, ideaClusters } from './intel.js';
import { checkQuality, qcReportText, videoScan, videoPacing, qcThumb, visualHash, QC_DISCLAIMERS } from './qc.js';
import { PLACEMENTS, placementPlan, placementPlans, drawPlacement, legibility } from './phone.js';
import { BRIEF_FIELDS, briefToContext, briefStatus, designerBrief, briefHtml, briefText, reportHtml } from './brief.js';
import { checkRera, detectQR, qrTimeline, reraRegion, reraRule, reraMedium, reraNotes, RERA_MEDIA, inZoneBox } from './rera.js';
import { RERA_RULES, RERA_CHECKED } from './rera-rules.js';

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let seq = 0;
const newId = () => 'c' + Date.now().toString(36) + (seq++).toString(36);

export class CreativeHeatmap {
  /**
   * @param {HTMLElement} el  where to draw the panel
   * @param {object} opts
   *   context      project details for the AI prompt and the new version, or a function (creative) => details
   *   ai           { endpoint, headers } to POST {prompt, image} to your server, or { read: async ({prompt, image, creative}) => result }, or null
   *   performance  optional (creative) => funnel for this creative, sync or async:
   *                { spend, impressions, clicks, leads, ql, sv, bookings, average: { same fields } }  (or the older { cost, avgCost, metric })
   *   performanceFeed optional { url, headers, credentials } or { rows: [...] }: a list of ad rows from your dashboard;
   *                each creative is matched to its row by name, and the average is the total of all rows (or feed.average)
   *   creatives    optional starting list: statics [{ name, src, screenshot, ai }], carousels [{ name, cards: [{ src, name, ai }] }],
   *                videos [{ name, frames: [{ t, src }], duration }]
   *   onSave       optional async (blob, { name, source }) => void   (shows "Save new version")
   *   onAIResult   optional (creative, result) => void   (store the reading so it is not paid for twice)
   *   onChange     optional (event, creative) => void   events: 'added', 'selected', 'analysed', 'changed', 'matched', 'listened', 'transcribed', 'qc' (a check ticked by eye), 'removed'
   *   download     optional async (blob, filename) => void, for pages where plain download links are blocked
   *   title        heading, default 'Creative studio'
   *   allowRemove  show Remove on each creative, default true
   *   transcribe   optional speech-to-text for video voiceovers: { endpoint, headers } (POSTs a 16 kHz WAV, expects { result: { text, segments, language } })
   *                or async (wavBlob, creative) => ({ text, segments: [{ start, end, text }], language })
   *   can          what this user may do, from your dashboard's own login and roles (all true by default):
   *                { upload, ai, versions, save, remove, edit, performance, compliance }
   *   compliance   RERA check (on by default; false hides it): { region: 'MH' (default: from context.reraState / location),
   *                medium: 'social'|'video'|'print'|'hoarding'|'brochure'|'portal', rules: { MH: {...} } overrides, onResult: (creative, result) => void }
   *   library      creative intelligence: { records: [{ name, brand, project, cohort, tags, metrics, headlineText }], url, headers }
   *                past creatives broken into elements, with their results. Creatives in the studio join it once they have
   *                tags and a matched performance row. save: true (or { url, headers }) POSTs the studio's creatives to the
   *                library whenever they change, so it learns across brands and sessions (server/library-store.cjs).
   *                onLibrary(records, { studio, facts }) is called on the same changes.
   *   startView    'learning' to open on the Learning view (everything learned across brands) instead of the creatives
   *                context.rera = the project's registration number, context.reraQr = URL of its QR image from the RERA portal,
   *                context.reraState = state code or name, context.caption = the ad's post text (some states accept details there)
   */
  constructor(el, opts = {}) {
    this.el = el; this.o = opts;
    this._briefs = Object.assign({}, opts.briefs || {}); this.items = []; this.cur = null; this.view = opts.startView === 'learning' ? 'learning' : 'creatives'; this.mode = 'heat'; this.boxes = false; (this.gen = null, this.ideas = null); this.aiState = ''; this.busy = false;
    this.cache = new Map(); // key -> analysis
    el.classList.add('chm');
    this._click = e => this._onClick(e); this._change = e => this._onChange(e); this._input = e => this._onInput(e);
    this._drag = e => this._onDrag(e);
    el.addEventListener('click', this._click); el.addEventListener('change', this._change); el.addEventListener('input', this._input);
    ['dragover', 'dragleave', 'drop'].forEach(t => el.addEventListener(t, this._drag));
    this._w = 0;   // redraw only when the panel's width really changes (not on its own repaints)
    this._ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { const w = Math.round(el.clientWidth); if (w && w !== this._w) { this._w = w; clearTimeout(this._rt); this._rt = setTimeout(() => this._paint(), 80); } }) : null;
    if (this._ro) this._ro.observe(el);
    this.render();
    if (this.o.library) this._libRecords().then(() => { if (this.items.length) this.render(); });
    if (Array.isArray(this.o.creatives) && this.o.creatives.length) this.add(this.o.creatives);
  }

  // ---------- public API ----------
  /** Add creatives: a FileList / File[] (images or videos), or [{ name, src, screenshot, ai }]. Resolves to the added ids. */
  async add(list) {
    const arr = [...(list || [])], ids = [], bad = [];
    this.busy = true; this.render();
    for (const f of arr) {
      try {
        if (typeof File !== 'undefined' && f instanceof File) {
          const isVid = /^video\//.test(f.type) || /\.(mp4|mov|webm|m4v)$/i.test(f.name);
          const isImg = /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif)$/i.test(f.name);
          if (!isVid && !isImg) { bad.push(f.name); continue; }
          const base = { id: newId(), name: f.name.replace(/\.[^.]+$/, ''), file: f, screenshot: /screenshot|screen shot/i.test(f.name), ai: {} };
          if (f._restore) this._restore(base, f._restore);
          if (isVid) { const v = await videoFrames(f); Object.assign(base, { kind: 'video', frames: v.frames.map((x, i) => Object.assign({ id: 'f' + i }, x)), duration: v.duration, videoUrl: v.url }); if (f._restore && f._restore.aiByPart) base.ai = Object.assign({}, f._restore.aiByPart); }
          else Object.assign(base, { kind: 'image', src: URL.createObjectURL(f) });
          this.items.push(base); ids.push(base.id);
        } else if (f && Array.isArray(f.cards) && f.cards.length) {
          const base = this._carousel(f.cards.map(x => typeof x === 'string' ? { src: x } : x), f.name || 'Carousel', f);
          const ab = f.aiByPart; this._restore(base, Object.assign({}, f, { aiByPart: null })); if (ab) base.cards.forEach((k, i) => { if (ab[i] && !k.ai) k.ai = ab[i]; });
          this.items.push(base); ids.push(base.id);
        } else if (f && (f.src || f.frames)) {
          const base = { id: f.id || newId(), name: f.name || 'Creative', kind: f.frames ? 'video' : 'image', src: f.src, duration: f.duration, videoSrc: f.videoSrc, transcript: f.transcript || null,
            frames: f.frames ? f.frames.map((x, i) => Object.assign({ id: 'f' + i }, x)) : undefined,
            screenshot: !!f.screenshot, ai: f.ai ? (f.frames ? Object.fromEntries(Object.entries(f.ai).map(([k, v]) => [/^\d+$/.test(k) ? 'f' + k : k, v])) : { 0: f.ai }) : {}, meta: f.meta };
          this._restore(base, f);
          this.items.push(base); ids.push(base.id);
        }
      } catch (e) { bad.push(f && f.name || 'file'); }
    }
    this.busy = false;
    if (ids.length) { this.cur = ids[0]; this.frame = 0; (this.gen = null, this.ideas = null); this.aiState = ''; this.view = 'creatives'; const now = new Date().toISOString(); ids.forEach(id => { const x = this._item(id); if (x && !x.addedAt) x.addedAt = now; }); this._learnChanged(); }   // open the first new creative
    this.render();
    if (bad.length) this._note(`Could not read ${bad.join(', ')}. Use JPG, PNG or WebP images, or MP4, MOV or WebM videos.`);
    ids.forEach(id => this._emit('added', id));
    return ids;
  }
  /** Saved state of a creative coming back from your database: its id, AI readings, tags, checks ticked by eye, and so on. */
  _restore(base, r) {
    if (!r) return;
    if (r.id) base.id = r.id; if (r.name) base.name = r.name; if (r.meta) base.meta = r.meta;
    ['tags', 'qcManual', 'perfName', 'qcVisual', 'briefKey', 'addedAt', 'transcript', 'status'].forEach(k => { if (r[k] != null) base[k] = r[k]; });
    if (r.aiByPart && base.kind !== 'video') base.ai = Object.assign({}, base.ai || {}, r.aiByPart);
  }
  /** Add one carousel: its cards as image Files or [{ src, name }], in swipe order (files are sorted by name: card-1, card-2…). */
  async addCarousel(list, name) {
    let arr = [...(list || [])];
    const files = arr.filter(f => typeof File !== 'undefined' && f instanceof File);
    if (files.length) {
      const bad = files.filter(f => !(/^image\//.test(f.type) || /\.(jpe?g|png|webp|gif)$/i.test(f.name)));
      if (bad.length) this._note(`A carousel takes images only. Left out: ${bad.map(f => f.name).join(', ')}.`);
      arr = files.filter(f => !bad.includes(f)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        .map(f => ({ src: URL.createObjectURL(f), name: f.name.replace(/\.[^.]+$/, ''), file: f }));
    }
    if (!arr.length) return null;
    if (arr.length > 10) { this._note('A carousel has at most 10 cards. The first 10 were kept.'); arr = arr.slice(0, 10); }
    const guess = name || commonName(arr.map(x => x.name || '')) || 'Carousel';
    const ids = await this.add([{ name: guess, cards: arr }]);
    return ids[0] || null;
  }
  /** Move a carousel card (index from → to). */
  moveCard(id, from, to) {
    const c = this._item(id); if (!c || c.kind !== 'carousel' || to < 0 || to >= c.cards.length) return;
    const [x] = c.cards.splice(from, 1); c.cards.splice(to, 0, x); if (this.cur === id) { this.frame = to; (this.gen = null, this.ideas = null); } this.render(); this._emit('changed', id);
  }
  /** Show one creative. */
  select(id) { if (!this.items.some(c => c.id === id)) return; this.cur = id; this.openStep = undefined; this.frame = 0; (this.gen = null, this.ideas = null); this.aiState = ''; this.render(); this._emit('selected', id); }
  /** Remove a creative. */
  remove(id) { const c = this._item(id); if (!c) return; this.items = this.items.filter(x => x !== c); if (c.src && c.file) URL.revokeObjectURL(c.src); if (this.cur === id) { this.cur = this.items[0] ? this.items[0].id : null; (this.gen = null, this.ideas = null); } this.render(); this._emit('removed', id, c); }
  /** All creatives with their latest results: [{ id, name, kind, scores, peaks, ai }]. */
  list() {
    return this.items.map(c => { const a = this.cache.get(this._key(c, 0)), o = { id: c.id, name: c.name, kind: c.kind, scores: a ? a.scores : null, peaks: a ? a.peaks : null, ai: this._ai(c, 0) };
      if (c.kind === 'carousel') o.cards = c.cards.map((k, i) => { const x = this.cache.get(this._key(c, i)); return { name: k.name, scores: x ? x.scores : null, ai: k.ai || null }; });
      return o; });
  }
  /** Results for one creative (analyses it if needed). */
  async result(id, frame = 0) {
    const c = this._item(id); if (!c) return null; const a = await this._analyse(c, frame);
    const out = { scores: a.scores, peaks: a.peaks, ai: this._ai(c, frame), suggestions: this._sugs(c, a, frame) };
    if (c.kind === 'carousel') { const all = []; for (let i = 0; i < c.cards.length; i++) all.push({ a: await this._analyse(c, i), ai: c.cards[i].ai, name: c.cards[i].name }); out.carousel = carouselNotes(all); out.cards = all.map(x => ({ name: x.name, scores: x.a.scores })); }
    return out;
  }
  /** Open a view of the current creative: 'summary', 'attention', 'qc', 'rera', 'phone', 'sound', 'performance', 'recommend', 'versions' or 'similar'; or 'learning'. */
  open(panel) { if (panel === 'learning') this.view = 'learning'; else { this.view = 'creatives'; this.tab = panel; } this.render(); }
  /** Update what this viewer may do when the signed-in person or their role changes in your dashboard. */
  setPermissions(can) { this.o.can = Object.assign({}, can || {}); (this.gen = null, this.ideas = null); this.render(); }
  /** Change the project details used by the AI prompt and the new version. */
  setContext(ctx) { this.o.context = ctx; (this.gen = null, this.ideas = null); this.render(); }
  destroy() {
    this.el.removeEventListener('click', this._click); this.el.removeEventListener('change', this._change); this.el.removeEventListener('input', this._input);
    ['dragover', 'dragleave', 'drop'].forEach(t => this.el.removeEventListener(t, this._drag));
    if (this._ro) this._ro.disconnect();
    this.items.forEach(c => { if (c.file && c.src) URL.revokeObjectURL(c.src); if (c.videoUrl) URL.revokeObjectURL(c.videoUrl); (c.cards || []).forEach(k => { if (k.file) URL.revokeObjectURL(k.src); }); });
    this.el.innerHTML = ''; this.el.classList.remove('chm');
  }

  // ---------- internals ----------
  _carousel(cards, name, f = {}) {
    return { id: f.id || newId(), name, kind: 'carousel', meta: f.meta, ai: {},
      cards: cards.map((x, i) => ({ id: x.id || 'k' + i + Math.random().toString(36).slice(2, 6), src: x.src, name: x.name || 'Card ' + (i + 1), file: x.file, ai: x.ai || null })) };
  }
  _parts(c) { return c.kind === 'video' ? c.frames : c.kind === 'carousel' ? c.cards : null; }
  _pk(c, f) { const p = this._parts(c); return p ? p[Math.min(f, p.length - 1)].id : 0; }
  _ai(c, f) { return c.kind === 'carousel' ? (c.cards[Math.min(f, c.cards.length - 1)].ai || null) : (c.ai[this._pk(c, f)] || null); }
  _setAi(c, f, v) { if (c.kind === 'carousel') c.cards[f].ai = v; else c.ai[this._pk(c, f)] = v; }
  _item(id) { return this.items.find(c => c.id === id) || null; }
  _save(b, name) { if (this.o.download) Promise.resolve(this.o.download(b, String(name).replace(/[\\/:*?"<>|]+/g, ' '))).catch(e => this._note('The file was not saved' + (e && e.message ? ': ' + e.message : '.'))); else saveBlob(b, name); }
  _ctx(c) { const base = this._baseCtx(c), b = c ? this._briefOf(c) : null; return b ? briefToContext(base, b) : base; }
  _emit(ev, id, item) { if (this.o.onChange) try { this.o.onChange(ev, item || this._item(id)); } catch (e) { console.error(e); } }
  _key(c, f) { return c.id + '#' + this._pk(c, f); }
  _srcOf(c, f) { const p = this._parts(c); return p ? p[Math.min(f, p.length - 1)].src : c.src; }
  async _analyse(c, f = 0) {
    const k = this._key(c, f); if (this.cache.has(k)) return this.cache.get(k);
    const img = await loadImage(this._srcOf(c, f)); const a = analyseImage(img, { screenshot: c.screenshot });
    this.cache.set(k, a); this._emit('analysed', c.id); return a;
  }
  _sugs(c, a, f) { const ai = this._ai(c, f), perf = this._perfLegacy(c); return suggestions(a, elementsInView(ai, a), ai, perf); }
  _note(t) { const n = this.el.querySelector('.chm-note'); if (n) { n.textContent = t; n.hidden = false; clearTimeout(this._nt); this._nt = setTimeout(() => { n.hidden = true; }, 6000); } }

  _can(k) { const c = this.o.can || {}; if (k === 'remove' && this.o.allowRemove === false) return false; if (k === 'compliance' && this.o.compliance === false) return false; return c[k] !== false; }
  // ---------- creative intelligence ----------
  _tagsOf(c) {
    if (c.tags) return c.tags;
    const ai = this._ai(c, 0), txt = ai ? (ai.elements || []).map(e => e.text || '').join(' \n ') : '';
    const t = autoTag({ text: txt, name: c.name, kind: c.kind === 'video' ? 'video' : c.kind === 'carousel' ? 'carousel' : 'image' });
    if (ai && ai.tags) Object.entries(ai.tags).forEach(([k, v]) => { if (ELEMENT_SLOTS[k] && v != null && v !== '') t[k] = ELEMENT_SLOTS[k].multi ? [].concat(v) : String(v).split('|')[0]; });
    c._autoTags = true; return t;
  }
  async _libRecords() {
    const L = this.o.library; if (!L) return [];
    if (!this._lib) {
      if (Array.isArray(L.records)) this._lib = L.records.slice();
      else if (L.url) { try { const r = await fetch(L.url, { credentials: L.credentials || 'same-origin', headers: L.headers || {} }); const j = await r.json(); this._lib = (j.records || j || []).slice(); this._libFacts = j.facts || null; if (j.briefs) Object.entries(j.briefs).forEach(([k, v]) => { if (!this._briefs[k]) this._briefs[k] = v; }); } catch (e) { this._lib = []; this._libErr = 'The creative library could not be loaded.'; } }
      else this._lib = [];
      if (L.facts) this._libFacts = L.facts;
    }
    return this._lib;
  }
  /** Library + this studio's creatives (with or without results yet), as records for the engine. A studio creative replaces its saved copy. */
  libraryRecords() {
    const lib = this._lib || [], byKey = new Map(lib.map(r => [this._recKey(r), r]));
    const own = this.items.map(c => { const o = this._ownRecord(c), l = byKey.get(this._recKey(o));
      return l ? Object.assign({}, l, o, { metrics: o.metrics || l.metrics || null, tags: c.tags || !l.tags ? o.tags : l.tags, headlineText: o.headlineText || l.headlineText || '' }) : o; });
    const keys = new Set(own.map(r => this._recKey(r))); return lib.filter(r => !keys.has(this._recKey(r))).concat(own);
  }
  _recHtml(c, f, a) {
    if (this._lib === undefined) { this._libRecords().then(() => { if (this.cur === c.id && this.tab === 'recommend') this.render(); }); return '<p class="chm-muted">Loading the creative library…</p>'; }
    const st = this._recSt || (this._recSt = { goal: 'ql', format: '' }), ctx = Object.assign({}, (this._libFacts || {})[this._ctx(c).project] || {}, this._ctx(c));
    const recs = this.libraryRecords(), withRes = recs.filter(r => r.metrics && (r.metrics.spend || 0) > 0), tags = this._tagsOf(c), canEdit = this._can('edit');
    const goals = Object.entries(GOALS).map(([k, g]) => `<option value="${k}" ${st.goal === k ? 'selected' : ''}>${esc(g.label)}</option>`).join('');
    const fmts = [['', 'Any format'], ['static', 'Static'], ['video', 'Video'], ['carousel', 'Carousel']].map(([k, l]) => `<option value="${k}" ${st.format === k ? 'selected' : ''}>${l}</option>`).join('');
    // 1. this creative's elements
    const slotRow = ([s, d]) => {
      if (s === 'audience') return '';
      const cur = tags[s];
      const ctl = !canEdit ? esc([].concat(cur || []).map(v => d.values[v] || v).join(', ') || '—')
        : d.multi ? Object.entries(d.values).map(([v, l]) => `<label class="chm-check chm-tagck"><input type="checkbox" data-chm="tagm" data-s="${s}" data-v="${v}" ${[].concat(cur || []).includes(v) ? 'checked' : ''}>${esc(l)}</label>`).join('')
        : `<select data-chm="tag" data-s="${s}"><option value="">—</option>${Object.entries(d.values).map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      return `<tr><th scope="row">${esc(d.label)}</th><td>${ctl}</td></tr>`;
    };
    const elems = `<section><p class="chm-small">The studio describes every creative by these elements so it can learn which ones work. ${c.tags ? 'Edited by hand.' : this._ai(c, 0) ? 'Filled in from the AI reading; correct anything that is wrong.' : 'Guessed from the name and text: read with AI for a better breakdown, or correct them here.'}</p>
      <table class="chm-table chm-tags">${Object.entries(ELEMENT_SLOTS).map(slotRow).join('')}</table></section>`;
    if (!withRes.length) return `<section><h3>Ideas</h3><p class="chm-muted">Ideas start once a few past creatives have results. Add past creatives with their results, or match creatives here to the performance feed.</p></section><details class="chm-ezmore"><summary>How this creative is tagged</summary>${elems}</details>`;
    // 2. what the data says
    const ef = elementEffects(withRes, { goal: st.goal }).filter(e => e.slot !== 'format' || true), solid = ef.filter(e => e.evidence !== 'thin' && e.n >= 2);
    const top = solid.filter(e => e.lo > 1).slice(0, 6), bottom = solid.filter(e => e.hi < 1).slice(-6).reverse();
    const bar = e => { const w = Math.min(100, Math.round(e.lift / 2.5 * 100)), lo = Math.min(100, Math.round(e.lo / 2.5 * 100)), hi = Math.min(100, Math.round(e.hi / 2.5 * 100));
      return `<tr><td><strong>${esc(e.label)}</strong><br><span class="chm-small">${esc(e.slotLabel)} · ${e.n} creatives · e.g. ${esc(e.exemplars.slice(0, 2).map(r => r.name).join(', '))}</span></td>
        <td class="chm-liftc"><span class="chm-lift"><i class="chm-lift-band" style="left:${lo}%;width:${Math.max(1, hi - lo)}%"></i><i class="chm-lift-avg" style="left:40%"></i><b class="${e.lift >= 1 ? 'up' : 'down'}" style="left:${w}%"></b></span><span class="chm-small">${e.lift.toFixed(2)}× <span class="chm-muted">(${e.lo.toFixed(2)}–${e.hi.toFixed(2)})</span></span></td></tr>`; };
    const projects = new Set(withRes.map(r => r.cohort)).size;
    const data = `<section><h3>What the results say</h3><p class="chm-small">${esc(GOALS[st.goal].label)}, compared within each project (1.00× = that project's average). Learning from ${withRes.length} creatives with results across ${projects} project${projects > 1 ? 's' : ''}. Bars show the estimate and its 80% range.</p>
      ${top.length ? `<h4>Doing better</h4><table class="chm-table chm-lifts">${top.map(bar).join('')}</table>` : '<p class="chm-small">No element is clearly above average yet.</p>'}
      ${bottom.length ? `<h4>Doing worse</h4><table class="chm-table chm-lifts">${bottom.map(bar).join('')}</table>` : ''}</section>`;
    // 3. recommendations
    if (!st.res || st.key !== st.goal + st.format + withRes.length + c.id) {
      st.res = recommend(withRes, { ctx, fixed: st.format ? { format: st.format } : null }, { goal: st.goal, count: 3 }); st.key = st.goal + st.format + withRes.length + c.id;
    }
    const pct = v => Math.round(v * 100) + '%';
    const cards = st.res.concepts.map((k, i) => this._ideaCard(k, i, `<div class="chm-actions"><button type="button" class="chm-btn chm-primary" data-chm="dbrief" data-src="rec" data-v="${i}">Designer brief</button>${this._can('versions') && k.combo.format !== 'video' ? `<button type="button" class="chm-btn" data-chm="recdraw" data-v="${i}">Make this version</button>` : ''}</div>`)).join('');
    return `<div class="chm-form chm-rec-pick"><label>Goal<select data-chm="recgoal">${goals}</select></label><label>Format<select data-chm="recfmt">${fmts}</select></label>
        <button type="button" class="chm-btn" data-chm="recmore">Show other ideas</button></div>
      <section><h3>Ideas for ${ctx.project ? esc(ctx.project) : 'this project'}</h3><p class="chm-small">Each idea uses what has worked best in past results and tries one new thing we don't have an answer for yet. The copy uses this project's details; "__" marks what to fill in.</p>
        <div class="chm-recs">${cards || '<p class="chm-muted">No combination fits the project details yet.</p>'}</div></section>
      ${this._learnOn() ? '<p class="chm-small">To see which elements work best across all brands, open <button type="button" class="chm-link" data-chm="view" data-v="learning">Learning</button>.</p>' : ''}
      <details class="chm-ezmore"><summary>How this creative is tagged${canEdit ? ' (edit)' : ''}</summary>${elems}</details>
      <p class="chm-small">These ideas come from past results and get better as more creatives and results are added. Treat them as what to try next, not a guarantee.</p>`;
  }
  /** One recommended idea as a card; acts = the buttons under it. */
  _ideaCard(k, i, acts) {
    const fig = (String(k.copy.price || '').match(/₹\s?[\d.,]+/) || [''])[0], pc = v => `${Math.round(Math.abs(v - 1) * 100)}% ${v >= 1 ? 'better' : 'worse'}`;
    const showPrice = !!k.copy.price && !(k.copy.sub || '').includes(k.copy.price) && !(fig && String(k.copy.headline).includes(fig));
    const best = k.why.filter(w => w.evidence !== 'untested' && w.lift > 1.05 && !w.confounded).sort((x, y) => y.lift - x.lift).filter((w, j, arr) => arr.findIndex(z => z.n === w.n && Math.abs(z.lift - w.lift) < 1e-6) === j).slice(0, 2);
    return `<article class="chm-rec">
        <div class="chm-rec-h"><strong>Idea ${i + 1}</strong> ${k.explore ? '<span class="chm-chip chm-chip-test">Tries something new</span>' : '<span class="chm-chip">Built on what worked</span>'}
          <span class="chm-rec-odds" title="How likely this idea is to beat this project's usual results, from past creatives">${Math.round(k.pBeat * 100)}% likely to beat this project's usual results</span></div>
        <p class="chm-rec-copy"><strong>${esc(k.copy.headline)}</strong>${k.copy.sub ? `<br>${esc(k.copy.sub)}` : ''}${showPrice ? `<br>${esc(k.copy.price)}` : ''}<br><em>${esc(k.copy.cta)}</em>${k.copy.proofLine ? ` · ${esc(k.copy.proofLine)}` : ''}</p>
        <p class="chm-small"><strong>Visual:</strong> ${esc(k.copy.visual)}</p>
        ${best.length ? `<p class="chm-small"><strong>Why:</strong> ${best.map(w => `${esc(w.label.toLowerCase())} did ${pc(w.lift)} in ${w.n} past creatives`).join('; ')}.</p>` : ''}
        ${k.tests.length ? `<p class="chm-small"><strong>Also tries:</strong> a new ${esc(k.tests.join(', ').toLowerCase())}, which past results don't answer yet.</p>` : ''}
        <details class="chm-small"><summary>How this idea is built</summary><ul class="chm-rec-why">${k.why.filter(w => !(w.value === 'none' && ['proof', 'offer', 'talent', 'cta'].includes(w.slot))).map(w => `<li><span>${esc(w.slotLabel)}:</span> <strong>${esc(w.label)}</strong> ${w.evidence === 'untested' ? '<em>new, not tried enough yet</em>' : `${pc(w.lift)} in ${w.n} past creatives${w.confounded ? ' (usually ran with other strong elements, so not certain)' : ''}${w.from[0] ? ` · e.g. ${esc(w.from[0])}` : ''}`}</li>`).join('')}</ul></details>
        ${acts || ''}</article>`;
  }
  // ---------- learning: the studio-wide view across brands ----------
  _learnOn() { return !!(this.o.library || this.o.performanceFeed || this.o.performance) && this._can('performance') && this._can('learning'); }
  _recKey(r) { return [r.brand, r.project, r.name].map(s0 => String(s0 || '').trim().toLowerCase()).join('|'); }
  _ownRecord(c) {
    const ctx = this._ctx(c), r = c.perf && c.perf.row, brand = ctx.brand || ctx.developer || '', project = ctx.project || '';
    return { id: 'studio-' + this._recKey({ brand, project, name: c.name }).replace(/[^a-z0-9|]+/g, '-'), name: c.name, brand, project, cohort: project || 'studio', source: 'studio', kind: c.kind,
      tags: this._tagsOf(c), tagsBy: c.tags ? 'person' : this._ai(c, 0) ? 'ai' : 'auto', addedAt: c.addedAt || (c.addedAt = new Date().toISOString()),
      hash: c._hash || (() => { const a0 = this.cache.get(this._key(c, 0)); if (!a0 || !a0.display) return undefined; try { return (c._hash = visualHash(a0.display.c)); } catch (e) { return undefined; } })(),
      headlineText: ((this._ai(c, 0) || {}).elements || []).filter(e => e.type === 'headline').map(e => e.text).join(' '),
      metrics: r ? { spend: r.spend, impressions: r.impressions, clicks: r.clicks, leads: r.leads, ql: r.ql, sv: r.sv } : null };
  }
  /** Something the library learns from changed: drop cached ideas and save the studio's creatives to the library (debounced). */
  _learnChanged() {
    if (this._recSt) this._recSt.res = null; if (this._lst) this._lst.res = null;
    clearTimeout(this._syncT); this._syncT = setTimeout(() => this._syncLib(), 1200);
  }
  _saveCfg() { const L = this.o.library || {}, s0 = L.save; return s0 === true ? (L.url ? { url: L.url, headers: L.headers, credentials: L.credentials } : null) : s0 && s0.url ? s0 : null; }
  _studioFacts() {
    const facts = {};
    this.items.forEach(c => { const x = this._ctx(c); if (x && x.project) { try { facts[x.project] = JSON.parse(JSON.stringify(x)); } catch (e) { /* not plain data */ } } });
    return facts;
  }
  async _syncLib() {
    if (!this._can('edit')) return;
    const own = this.items.map(c => this._ownRecord(c)).concat(this._libMatched || []), facts = this._studioFacts();
    if (!own.length) return;
    if (this.o.onLibrary) try { this.o.onLibrary(this.libraryRecords(), { studio: own, facts }); } catch (e) { console.error(e); }
    const sv = this._saveCfg(); if (!sv) return;
    this._syncSt = 'saving';
    try {
      const r = await fetch(sv.url, { method: 'POST', credentials: sv.credentials || 'same-origin', headers: Object.assign({ 'Content-Type': 'application/json' }, sv.headers || {}), body: JSON.stringify({ records: own, facts, briefs: this._briefs }) });
      if (!r.ok) throw new Error(String(r.status));
      this._syncSt = 'saved'; this._syncAt = new Date(); this._libMatched = [];
    } catch (e) { this._syncSt = 'error'; }
    if (this.view === 'learning') this.render();
  }
  /** Load the library, match studio creatives saved earlier to the performance feed, and load results for creatives open now. */
  async _learnLoad() {
    if (!this._learnP) this._learnP = (async () => {
      await this._libRecords();
      if (this.o.performanceFeed && this._can('performance')) {
        try {
          const fd = await this._feed(); this._libMatched = this._libMatched || [];
          (this._lib || []).forEach(r => { if (r.source !== 'studio' || (r.metrics && +r.metrics.spend > 0)) return; const row = matchRow(fd.rows, r.name);
            if (row) { r.metrics = { spend: row.spend, impressions: row.impressions, clicks: row.clicks, leads: row.leads, ql: row.ql, sv: row.sv }; this._libMatched.push(r); } });
          if (this._libMatched.length) this._learnChanged();
        } catch (e) { /* the feed is optional here */ }
      }
      await Promise.all(this.items.map(c => this._loadPerf(c).catch(() => {})));
    })();
    await this._learnP; this._learnReady = true; if (this.view === 'learning') this.render();
  }
  _learnHtml() {
    if (!this._learnReady) { this._learnLoad(); return '<p class="chm-muted">Loading the creative library and results…</p>'; }
    const st = this._lst || (this._lst = { goal: 'ql', brand: '', slot: '', q: '', sort: 'vs', dir: -1, all: false, open: null, proj: '', fmt: '', res: null, key: '' });
    const money = this._can('budget'), all = this.libraryRecords(), hasRes = r => r.metrics && +r.metrics.spend > 0;
    const brands = [...new Set(all.map(r => r.brand).filter(Boolean))].sort();
    if (st.brand && !brands.includes(st.brand)) st.brand = '';
    const inBrand = all.filter(r => !st.brand || r.brand === st.brand), withRes = inBrand.filter(hasRes), withResAll = all.filter(hasRes);
    const inr = n => n == null ? '—' : n >= 1e7 ? '₹' + (n / 1e7).toFixed(2) + ' Cr' : n >= 1e5 ? '₹' + (n / 1e5).toFixed(1) + ' L' : '₹' + Math.round(n).toLocaleString('en-IN');
    const int = n => n == null ? '—' : Math.round(n).toLocaleString('en-IN');
    const sel = (k, opts, cur, label) => `<label>${label}<select data-chm="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    // status: how much it has learned, and whether it is being kept
    const projN = new Set(withResAll.map(r => r.cohort)).size, brandN = new Set(withResAll.map(r => r.brand).filter(Boolean)).size;
    const fromStudio = all.filter(r => r.source === 'studio'), waiting = fromStudio.filter(r => !hasRes(r)).length;
    const stage = withResAll.length < 20 ? 'Early' : withResAll.length < 80 ? 'Growing' : 'Established';
    const save = this._saveCfg() || this.o.onLibrary;
    const syncTxt = !save ? 'What the studio learns is kept for this session only; connect library.save to keep it.'
      : this._syncSt === 'saving' ? 'Saving to the library…' : this._syncSt === 'error' ? 'Could not save to the library just now; it will try again on the next change.'
      : this._syncSt === 'saved' ? `Saved to the library at ${this._syncAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : 'New creatives are added to the library automatically.';
    const stageTxt = { Early: 'Still early: findings will change as results come in.', Growing: 'Findings are taking shape; treat them as strong hints.', Established: 'Enough results for the main findings to be reliable.' }[stage];
    const status = `<div class="chm-learn-status"><span class="chm-pill chm-learn-stage">${stage}</span><p>The studio has learned from <strong>${withResAll.length} past creatives</strong> with results (${brandN} brand${brandN === 1 ? '' : 's'}, ${projN} project${projN === 1 ? '' : 's'}). ${stageTxt}
      ${fromStudio.length ? `${fromStudio.length} came from this studio${waiting ? ` (${waiting} still waiting for results)` : ''}.` : 'Every creative you add here joins automatically and counts once its results arrive.'}</p><p class="chm-small">${esc(syncTxt)}</p></div>`;
    const controls = `<div class="chm-form chm-learn-pick">${sel('lgoal', Object.entries(GOALS).map(([k, g]) => [k, g.label]), st.goal, 'Goal')}${sel('lbrand', [['', 'All brands']].concat(brands.map(b => [b, b])), st.brand, 'Brand')}</div>`;
    // totals
    const tot = withRes.reduce((a0, r) => { const m = r.metrics; a0.spend += +m.spend || 0; a0.leads += +m.leads || 0; a0.ql += +m.ql || 0; if (m.sv != null) { a0.sv += +m.sv || 0; a0.svN++; } return a0; }, { spend: 0, leads: 0, ql: 0, sv: 0, svN: 0 });
    const tile = (l, v, s1) => `<div class="chm-kpi"><span class="chm-kpi-l">${l}</span><span class="chm-kpi-v">${v}</span>${s1 ? `<span class="chm-kpi-s">${s1}</span>` : ''}</div>`;
    const tiles = `<div class="chm-kpis">${tile('Creatives with results', int(withRes.length), `${inBrand.length - withRes.length} without yet`)}${money ? tile('Spend', inr(tot.spend)) : ''}${tile('Leads', int(tot.leads))}
      ${tile('Qualified leads', int(tot.ql), tot.leads ? Math.round(tot.ql / tot.leads * 100) + '% of leads' : '')}${money ? tile('Cost per qualified lead', tot.ql ? inr(tot.spend / tot.ql) : '—') : ''}${tile('Site visits', tot.svN ? int(tot.sv) : '—', tot.svN ? `tracked on ${tot.svN} creatives` : 'not tracked yet')}</div>`;
    // 1. the way forward
    const facts = Object.assign({}, this._libFacts || {}, this._studioFacts());
    const projOk = p => !st.brand || inBrand.some(r => r.project === p) || [facts[p].brand, facts[p].developer].includes(st.brand);
    const projects = [...new Set(Object.keys(facts).concat(inBrand.map(r => r.project).filter(Boolean)))].filter(p => !facts[p] || projOk(p)).sort();
    if (!projects.includes(st.proj)) { st.proj = projects.find(p => facts[p]) || projects[0] || ''; st.res = null; }
    let ideasHtml;
    if (withResAll.length < 4) ideasHtml = '<p class="chm-muted">Ideas start once a few creatives have results. Add creatives, analyse them, and match them to the performance feed.</p>';
    else {
      const ctx = Object.assign({ project: st.proj }, facts[st.proj] || {}), key = [st.goal, st.fmt, st.proj, withResAll.length].join('|');
      if (!st.res || st.key !== key) { try { st.res = recommend(withResAll, { ctx, fixed: st.fmt ? { format: st.fmt } : null }, { goal: st.goal, count: 3 }); } catch (e) { st.res = { concepts: [] }; } st.key = key; }
      const open = this.items.find(c => this._ctx(c).project === st.proj);
      const acts = i => `<div class="chm-actions"><button type="button" class="chm-btn chm-primary" data-chm="dbrief" data-src="learn" data-v="${i}">Designer brief</button>${open && this._can('versions') && st.res.concepts[i].combo.format !== 'video' ? `<button type="button" class="chm-btn" data-chm="ldraw" data-v="${i}">Make this version</button>` : ''}</div>`;
      ideasHtml = `<div class="chm-recs">${st.res.concepts.map((k, i) => this._ideaCard(k, i, acts(i))).join('') || '<p class="chm-muted">No combination fits this project yet.</p>'}</div>
        ${facts[st.proj] ? '' : '<p class="chm-small">No project details saved for this project, so the copy has more "__" to fill. Add a creative for it with its project details and they are kept.</p>'}`;
    }
    const fwd = st.dbOpen && this._db ? `<section><h3>What to make next</h3>${this._dbriefHtml(this._db)}</section>` : `<section><h3>What to make next</h3><p class="chm-small">Pick a project: each idea uses what worked across all brands and tries one new thing.</p>
      <div class="chm-form chm-learn-pick">${sel('lproj', projects.map(p => [p, p]), st.proj, 'Project')}${sel('lfmt', [['', 'Any format'], ['static', 'Static'], ['video', 'Video'], ['carousel', 'Carousel']], st.fmt, 'Format')}<button type="button" class="chm-btn" data-chm="lmore">Show other ideas</button></div>${ideasHtml}</section>`;
    // 2. elements: what is working, and what has not been tried
    const prepped = prepare(withRes, st.goal);
    let lifts = '', gaps = '';
    if (prepped.length < 4) lifts = `<p class="chm-muted">Not enough creatives with ${esc(GOALS[st.goal].label.toLowerCase())}${st.brand ? ' for ' + esc(st.brand) : ''} yet.</p>`;
    else {
      const ef = elementEffects(prepped, { prepared: true }); let model = { effects: {} }; try { model = fitModel(prepped, { prepared: true }); } catch (e) { /* optional */ }
      const flag = e => { const m = model.effects[e.slot + ':' + e.value]; return !!m && Math.sign(Math.log(e.lift)) !== Math.sign(m.b) && Math.abs(Math.log(e.lift)) > 0.15; };
      const rows = ef.filter(e => e.n >= 2 && e.evidence !== 'thin');
      // the simple read: what to use more, what to use less, what is not clear yet
      const what = { ql: ['more', 'fewer', 'qualified leads for the money'], sv: ['more', 'fewer', 'site visits for the money'], leads: ['more', 'fewer', 'leads for the money'], quality: ['higher', 'lower', 'share of leads that qualify'] }[st.goal] || ['more', 'fewer', 'results'];
      // creative choices only (targeting goes in its own line), no "none" values, one entry per set of creatives, best-evidenced first
      const seenEz = new Set(), ezRows = rows.filter(e => e.slot !== 'audience' && (e.value !== 'none' || e.slot === 'offer')).filter(e => { const k0 = e.n + ':' + e.lift.toFixed(4); if (seenEz.has(k0)) return false; seenEz.add(k0); return true; });
      const weight = e => Math.abs(Math.log(e.lift)) * Math.min(1, e.n / 8);
      const better = ezRows.filter(e => e.lo > 1 && !flag(e)).sort((x, y) => weight(y) - weight(x)), worse = ezRows.filter(e => e.hi < 1 && !flag(e)).sort((x, y) => weight(y) - weight(x));
      const unclear = ezRows.filter(e => !better.includes(e) && !worse.includes(e)).sort((x, y) => y.n - x.n);
      const aud = rows.filter(e => e.slot === 'audience' && (e.lo > 1 || e.hi < 1));
      const item = (e, up) => { const pc = Math.round(Math.abs(e.lift - 1) * 100), ex = e.exemplars[0];
        return `<li class="chm-ez ${up ? 'chm-ez-up' : 'chm-ez-down'}"><span class="chm-ez-n"><strong>${esc(e.label)}</strong><span class="chm-small">${esc(ELEMENT_SLOTS[e.slot].label)}</span></span>
          <span class="chm-ez-v"><span class="chm-ez-bar" aria-hidden="true"><i style="width:${Math.min(100, pc)}%"></i></span><strong>${pc}% ${up ? what[0] : what[1]}</strong></span>
          <span class="chm-small chm-ez-e">${e.n} creatives${e.n < 5 ? ' · early sign' : ''}${ex ? ` · e.g. ${esc(ex.name)}` : ''}</span></li>`; };
      const col = (h, list, up, none) => `<div class="chm-ezcol"><h4>${h}</h4>${list.length ? `<ul class="chm-ezl">${list.slice(0, 6).map(e => item(e, up)).join('')}</ul>${list.length > 6 ? `<p class="chm-small">and ${list.slice(6).map(e => esc(e.label.toLowerCase())).join(', ')}.</p>` : ''}` : `<p class="chm-small">${none}</p>`}</div>`;
      const max = Math.max(2, Math.ceil(Math.max(1, ...rows.map(e => e.hi)) * 2) / 2), pos = v => (Math.min(v, max) / max * 100).toFixed(1) + '%';
      const row = e => `<div class="chm-lrow chm-l-${e.lo > 1 ? 'up' : e.hi < 1 ? 'down' : 'flat'}"><span class="chm-lrow-l">${esc(e.label)}${flag(e) ? ' †' : ''}</span>
        <span class="chm-ltrack" role="img" aria-label="${esc(e.label)}: ${e.lift.toFixed(2)} times the project average, likely ${e.lo.toFixed(2)} to ${e.hi.toFixed(2)}, ${e.n} creatives"><i class="chm-lref" style="left:${pos(1)}"></i><i class="chm-lrng" style="left:${pos(e.lo)};width:calc(${pos(e.hi)} - ${pos(e.lo)})"></i><i class="chm-ldot" style="left:${pos(e.lift)}" title="Best examples: ${esc(e.exemplars.map(r => r.name).join(', '))}"></i></span>
        <span class="chm-lrow-v"><strong>${e.lift.toFixed(2)}×</strong> · ${e.n}</span></div>`;
      const groups = Object.keys(ELEMENT_SLOTS).map(s0 => { const g = rows.filter(e => e.slot === s0); return g.length ? `<div class="chm-lgroup">${esc(ELEMENT_SLOTS[s0].label)}</div>${g.map(row).join('')}` : ''; }).join('');
      lifts = `<div class="chm-ez2">${col('Use more', better, true, 'Nothing is clearly better yet.')}${col('Use less', worse, false, 'Nothing is clearly worse yet.')}</div>
        ${aud.length ? `<p class="chm-small chm-ez-unclear"><strong>Targeting:</strong> ${aud.map(e => `${esc(e.label.toLowerCase())} audiences got ${Math.round(Math.abs(e.lift - 1) * 100)}% ${e.lift > 1 ? what[0] : what[1]} (${e.n} creatives)`).join('; ')}. This is about who saw the ad, not the creative.</p>` : ''}
        ${unclear.length ? `<p class="chm-small chm-ez-unclear"><strong>Not clear yet:</strong> ${unclear.slice(0, 8).map(e => esc(e.label.toLowerCase())).join(', ')}${unclear.length > 8 ? ` and ${unclear.length - 8} more` : ''}. Close to average, or they usually ran alongside stronger elements, so their effect can't be separated yet.</p>` : ''}
        <details class="chm-ezmore"${st.det ? ' open' : ''}><summary data-chm="ldet">See every element on one chart</summary>
        <div class="chm-lifts2"><div class="chm-lrow chm-laxis" aria-hidden="true"><span></span><span class="chm-ltrack">${[0, 0.5, 1, 1.5, 2, 2.5, 3].filter(v => v <= max).map(v => `<b style="left:${pos(v)}">${v === 1 ? '1.0 = average' : v}</b>`).join('')}</span><span class="chm-lrow-v">× avg · n</span></div>${groups}</div>
        <p class="chm-small">Dot: results against the creative's own project average (1.0). Bar: the likely range. Green: clearly better; red: clearly worse; grey: not clear yet. † When all elements are weighed together this one points the other way, so it may be borrowing credit from an element it usually ran with.</p></details>`;
      const n = {}; ef.forEach(e => { n[e.slot + ':' + e.value] = e.n; });
      gaps = Object.entries(ELEMENT_SLOTS).filter(([s0]) => s0 !== 'audience').map(([s0, d]) => { const vs = Object.entries(d.values).filter(([v]) => v !== 'none' && (n[s0 + ':' + v] || 0) < 2);
        return vs.length ? `<tr><th scope="row">${esc(d.label)}</th><td><div class="chm-chips">${vs.map(([v, l]) => `<span class="chm-chip chm-chip-test">${esc(l)}${n[s0 + ':' + v] ? ' · 1' : ''}</span>`).join('')}</div></td></tr>` : ''; }).join('');
    }
    const els = `<section><h3>What's working</h3>
      <p class="chm-small">Elements that got better or worse results than usual for their project, on ${esc(GOALS[st.goal].label.toLowerCase())}${st.brand ? ' for ' + esc(st.brand) : ' across all brands'}. ${st.goal === 'quality' ? '"26% higher" means a 26% higher share of leads qualified.' : '"26% more" means 26% more for the same spend.'}</p>${lifts}</section>
`;
    const gapsHtml = gaps ? `<details class="chm-ezmore"><summary>Not tried yet</summary><p class="chm-small">Used in fewer than two past creatives with results, so there is nothing to learn from yet. The ideas take turns trying them.</p><table class="chm-table chm-tags">${gaps}</table></details>` : '';
    // 3. every creative and its result
    const byId = {}; prepped.forEach(r => { byId[r.id] = r; });
    const q = st.q.trim().toLowerCase();
    let list = inBrand.map(r => { const m = r.metrics || {}, p = byId[r.id || r.name], ok = hasRes(r);
      return { r, name: r.name || '', proj: r.project || '', format: (r.tags || {}).format || '', spend: ok ? +m.spend : null, leads: ok ? +m.leads || 0 : null, ql: ok ? +m.ql || 0 : null, sv: ok && m.sv != null ? +m.sv : null,
        cpql: ok && m.ql ? m.spend / m.ql : null, vs: p && p.exp >= 0.5 ? p.obs / p.exp : null, ok }; });
    if (q) list = list.filter(x => (x.name + ' ' + x.proj + ' ' + (x.r.brand || '') + ' ' + (x.r.headlineText || '')).toLowerCase().includes(q));
    const sk = st.sort, dir = st.dir;
    list.sort((a0, b0) => { const va = a0[sk], vb = b0[sk]; if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1; return typeof va === 'string' ? dir * va.localeCompare(vb) : dir * (va - vb); });
    const cols = [['name', 'Creative'], ['format', 'Format'], money ? ['spend', 'Spend'] : null, ['leads', 'Leads'], ['ql', 'Qualified leads'], ['sv', 'Site visits'], money ? ['cpql', 'Cost per qualified lead'] : null, ['vs', 'Compared with usual']].filter(Boolean);
    const shown = st.all || q ? list : list.slice(0, 15);
    const cell = (x, k) => k === 'name' ? `<td><button type="button" class="chm-link" data-chm="lrow" data-v="${esc(this._recKey(x.r))}" aria-expanded="${st.open === this._recKey(x.r)}">${esc(x.name)}</button>${x.r.source === 'studio' ? ' <span class="chm-chip">Studio</span>' : ''}<br><span class="chm-small">${esc([x.r.brand, x.proj].filter(Boolean).join(' · '))}</span></td>`
      : k === 'format' ? `<td>${esc(ELEMENT_SLOTS.format.values[x.format] || x.format || '—')}</td>`
      : k === 'vs' ? `<td>${!x.ok ? '<span class="chm-pill">Waiting for results</span>' : x.vs == null ? '<span class="chm-pill">Low volume</span>' : `<span class="chm-pill${x.vs >= 1.15 ? ' chm-ok' : x.vs <= 0.85 ? ' chm-bad' : ''}">${x.vs.toFixed(2)}×</span>`}</td>`
      : `<td>${x[k] == null ? '—' : k === 'spend' || k === 'cpql' ? inr(x[k]) : int(x[k])}</td>`;
    const detail = x => { const t = x.r.tags || {}, item = x.r.source === 'studio' && this.items.find(c => this._recKey(this._ownRecord(c)) === this._recKey(x.r));
      return `<tr class="chm-ldetail"><td colspan="${cols.length}">${x.r.headlineText ? `<p class="chm-small">Headline: “${esc(x.r.headlineText)}”</p>` : ''}<div class="chm-chips">${Object.entries(ELEMENT_SLOTS).map(([s0, d]) => [].concat(t[s0] || []).map(v => `<span class="chm-chip" title="${esc(d.label)}">${esc(d.values[v] || v)}</span>`).join('')).join('') || '<span class="chm-small">No elements tagged.</span>'}</div>
        ${item ? `<button type="button" class="chm-link" data-chm="pick" data-id="${item.id}">Open in the studio</button>` : ''}</td></tr>`; };
    const table = `<section><div class="chm-learn-h"><h3>Every creative and its results</h3><label>Search<input type="search" data-chm="lq" value="${esc(st.q)}" placeholder="Name, project or headline"></label></div>
      <p class="chm-small">"Compared with usual": what each creative got for its spend, against the usual for its project (1.00× = usual, 1.50× = 50% better). Select a name to see its elements.</p>
      <div class="chm-scroll"><table class="chm-table chm-ltable"><thead><tr>${cols.map(([k, l]) => `<th scope="col" aria-sort="${sk === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" class="chm-sort" data-chm="lsort" data-v="${k}">${l}${sk === k ? (dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}</tr></thead>
      <tbody>${shown.map(x => `<tr>${cols.map(([k]) => cell(x, k)).join('')}</tr>${st.open === this._recKey(x.r) ? detail(x) : ''}`).join('') || `<tr><td colspan="${cols.length}">No creatives match.</td></tr>`}</tbody></table></div>
      ${shown.length < list.length ? `<button type="button" class="chm-btn" data-chm="lall">Show all ${list.length} creatives</button>` : ''}</section>`;
    const cl = ideaClusters(inBrand, { goal: st.goal }).slice(0, 8);
    const ideasRun = cl.length ? `<section><h3>Ideas you've run most</h3><p class="chm-small">Creatives grouped by format, headline approach, main visual and tone, so repeated thinking shows up${st.brand ? '' : ' across brands'}.</p>
      <div class="chm-scroll"><table class="chm-table chm-list-t"><thead><tr><th>Idea</th><th>Creatives</th><th>Result</th></tr></thead><tbody>${cl.map(x => `<tr><td><strong>${esc(x.label || 'Untagged')}</strong><br><span class="chm-small">${esc(x.brands.join(', '))} · e.g. ${esc(x.examples.slice(0, 2).join(', '))}</span></td><td>${x.n}</td><td>${x.vs == null ? '<span class="chm-pill">No results</span>' : `<span class="chm-pill${x.vs >= 1.15 ? ' chm-ok' : x.vs <= 0.85 ? ' chm-bad' : ''}">${x.vs.toFixed(2)}× project</span><br><span class="chm-small">${x.withRes} with results</span>`}</td></tr>`).join('')}</tbody></table></div></section>` : '';
    const ideasRunD = ideasRun ? ideasRun.replace('<section><h3>Ideas you\'ve run most</h3>', '<details class="chm-ezmore"><summary>Ideas you\'ve run most</summary>').replace(/<\/section>$/, '</details>') : '';
    const tableD = table.replace('<section><div class="chm-learn-h"><h3>Every creative and its results</h3>', `<details class="chm-ezmore"${st.q || st.open || st.all || st.tblOpen ? ' open' : ''}><summary>Every creative and its results (${list.length})</summary><div class="chm-learn-h"><span></span>`).replace(/<\/section>$/, '</details>');
    return status + controls + tiles + els + fwd + `<section><h3>More detail</h3>${ideasRunD}${gapsHtml}${tableD}</section>`;
  }
  _drawIdea(c, it, label) {
    const base = defaults(this._ctx(c), this._ai(c, this.frame || 0));
    this.gen = Object.assign({}, base, { layout: it.g.layout, headline: it.g.headline, sub: it.g.sub || base.sub, price: it.g.price, offer: it.g.offer, cta: it.g.cta, eyebrow: it.g.eyebrow || base.eyebrow });
    this.genBase = Object.assign({}, this.gen); this.genIdea = { angle: label }; this.ideas = this.ideas || []; this.tab = 'versions'; this.view = 'creatives'; this.render();
  }
  _briefText(k) {
    const fig = (String(k.copy.price || '').match(/₹\s?[\d.,]+/) || [''])[0], lines = [k.copy.headline, k.copy.sub, k.copy.price && !(k.copy.sub || '').includes(k.copy.price) && !(fig && k.copy.headline.includes(fig)) ? k.copy.price : '', k.copy.offer, 'Call to action: ' + k.copy.cta, k.copy.visual ? 'Visual: ' + k.copy.visual : '', k.copy.proofLine ? 'Proof: ' + k.copy.proofLine : ''].filter(Boolean);
    const why = k.why.filter(w => w.evidence !== 'untested' && w.lift > 1.05 && !w.confounded).map(w => `${w.label} ${w.lift.toFixed(2)}× over ${w.n} creatives${w.from[0] ? ' (e.g. ' + w.from[0] + ')' : ''}`);
    return lines.concat(['', 'Elements: ' + k.why.map(w => `${w.slotLabel}: ${w.label}${w.evidence === 'untested' ? ' (test)' : ''}`).join('; ')], why.length ? ['Why: ' + why.join('; ')] : [], k.tests.length ? ['Tests: ' + k.tests.join(', ')] : [],
      [`Chance of beating the project average: ${Math.round(k.pBeat * 100)}%`]).join('\n');
  }
  // ---------- quality check (the auditor's checklist) ----------
  _qcParts(c) {
    const ps = c.kind === 'video' ? c.frames : c.kind === 'carousel' ? c.cards : [c];
    return ps.map((p, i) => { const a = this.cache.get(this._key(c, i)); if (!a) return null; const ai = this._ai(c, i);
      c._thumbs = c._thumbs || {}; const tk = this._pk(c, i); if (c.kind === 'video' && !c._thumbs[tk] && a.display && a.display.c) { try { c._thumbs[tk] = qcThumb(a.display.c); } catch (e) { /* tainted canvas */ } }
      return { label: c.kind === 'video' ? this._frameLabel(c, i) : c.kind === 'carousel' ? `Card ${i + 1}` : '', t: c.kind === 'video' ? p.t : 0, read: !!ai, elements: ai ? elementsInView(ai, a) : [], qc: ai && ai.qc || null, scores: a.scores, thumb: c._thumbs[tk] || null }; });
  }
  _qcRun(c) {
    const parts = this._qcParts(c); if (parts.some(p => !p)) return null;
    const last = c.kind === 'video' ? c.frames.length - 1 : 0, aEnd = this.cache.get(this._key(c, last));
    const ctx = Object.assign({}, this._ctx(c)); if (c.qcVisual) ctx.visualType = c.qcVisual;
    const media = c.kind === 'video' ? (c.qcScan ? { width: c.qcScan.width, height: c.qcScan.height, duration: c.duration } : {}) : c.kind === 'image' && aEnd ? { width: aEnd.crop ? Math.round(aEnd.crop.w) : (aEnd.img.naturalWidth || aEnd.img.width), height: aEnd.crop ? Math.round(aEnd.crop.h) : (aEnd.img.naturalHeight || aEnd.img.height) } : {};
    const lg = [], zoneIss = []; let zoneKey = null;
    parts.forEach((p, i) => { if (!p.read) return; const a = this.cache.get(this._key(c, i)), r = this._ratioOf(a);
      legibility(a.display, p.elements, r).forEach(x => lg.push(Object.assign(x, { part: p })));
      if (Math.abs(r - 9 / 16) < 0.02) { zoneKey = 'reels'; placementPlan(r, p.elements, 'reels').issues.forEach(x => zoneIss.push(Object.assign(x, { part: p }))); } });
    return checkQuality({ kind: c.kind, name: c.name, ctx, parts, rera: this._can('compliance') ? this._rera(c, last, aEnd) : null, sound: c.sound || null, transcript: c.transcript || null,
      media, scan: c.qcScan || null, manual: c.qcManual || {}, screenshot: !!c.screenshot, legibility: lg,
      safeZone: zoneKey ? { label: PLACEMENTS[zoneKey].label, note: PLACEMENTS[zoneKey].note, issues: zoneIss } : null,
      pacing: c.kind === 'video' && c.qcScan && !c.qcScan.error ? videoPacing(c.qcScan, parts, c.duration) : null });
  }
  async _qcScan(c) {
    if (c.qcScan || c._scanning || c.kind !== 'video') return; const src = c.file || c.videoSrc; if (!src) return;
    c._scanning = true; try { c.qcScan = await videoScan(src); } catch (e) { c.qcScan = { samples: [], error: true }; } c._scanning = false;
    if (this.cur === c.id && ['qc', 'attention', 'summary'].includes(this.tab)) this.render();
  }
  async _runAIFrames(c) {
    if (!c || c.kind !== 'video' || this.aiAll) return;
    const todo = c.frames.map((x, i) => i).filter(i => !this._ai(c, i));
    for (let j = 0; j < todo.length; j++) { this.aiAll = `Reading ${this._frameLabel(c, todo[j])} (${j + 1} of ${todo.length})…`; this.aiState = ''; this.render(); if (!(await this._runAI(todo[j], true))) break; }
    this.aiAll = ''; this.render();
  }
  _qcHtml(c, f) {
    if (c.kind === 'video' && !this._allFrames(c)) { this._readFrames(c); return '<p class="chm-muted">Reading every moment of the video…</p>'; }
    if (c.kind === 'carousel' && !this._allRead(c)) { this._readAll(c); return '<p class="chm-muted">Reading every card…</p>'; }
    if (c.kind === 'video') { this._qcScan(c); if (!c.sound && !c._listening && (c.file || c.videoSrc)) this._listen(c); }
    const r = this._qcRun(c); if (!r) return '<p class="chm-muted">Reading the creative…</p>';
    c._qc = r;
    const aiOn = !!this.o.ai && this._can('ai'), unread = c.kind === 'video' ? c.frames.filter((x, i) => !this._ai(c, i)).length : c.kind === 'carousel' ? c.cards.filter(k => !k.ai).length : this._ai(c, 0) ? 0 : 1;
    const tone = r.status === 'Approved' ? 'ok' : r.status === 'Approved with Minor Changes' ? 'warn' : r.status === 'Revisions Required' ? 'bad' : 'na';
    const pill = s => `<span class="chm-qc-p chm-qc-${s}">${{ pass: 'OK', fail: 'Fix', check: 'Check', na: 'N/A' }[s]}</span>`;
    const canEdit = this._can('edit'), groups = [...new Set(r.checks.map(x => x.group))];
    const ctx = this._ctx(c), vt = c.qcVisual || ctx.visualType || '';
    const VW = { 'Approved': 'Ready to go live', 'Approved with Minor Changes': 'Almost ready: small fixes', 'Revisions Required': 'Needs changes before it goes live', 'Unable to Complete Review': 'Not fully checked yet' };
    const done = r.checks.filter(x => x.status === 'pass' || x.status === 'fail' || x.status === 'na').length;
    const head = `<div class="chm-qc-head chm-qc-${tone}"><div><span class="chm-small">Auditor status: ${esc(r.status)}</span><strong class="chm-qc-status">${esc(VW[r.status] || r.status)}</strong>
        <span class="chm-small">${r.issues.length ? `${r.issues.length} thing${r.issues.length > 1 ? 's' : ''} to fix · ` : ''}${done} of ${r.checks.length} checks done${r.verdictPending ? ` · final once the ${r.verdictPending} item${r.verdictPending > 1 ? 's' : ''} below ${r.verdictPending > 1 ? 'are' : 'is'} checked by eye` : ''}</span></div>
      <div class="chm-actions">${aiOn && unread ? `<button type="button" class="chm-btn chm-primary" data-chm="qcai" ${this.aiAll || this.aiState === 'busy' ? 'disabled' : ''}>${this.aiAll ? esc(this.aiAll) : this.aiState === 'busy' ? 'Reading…' : c.kind === 'video' ? `Read all ${unread} moments with AI` : c.kind === 'carousel' ? `Read ${unread} card${unread > 1 ? 's' : ''} with AI` : 'Read with AI'}</button>` : ''}
        <button type="button" class="chm-btn" data-chm="qccopy">Copy report</button></div></div>
      ${this.aiState && this.aiState !== 'busy' ? `<p class="chm-err" role="alert">${esc(this.aiState)}</p>` : ''}
      ${!this.o.ai && unread ? '<p class="chm-small">The AI reading is switched off here, so text, logos and disclaimers are left to check by eye.</p>' : ''}`;
    const issues = `<section><h3>What to fix</h3>${r.issues.length ? `<div class="chm-scroll"><table class="chm-table chm-qc-t"><thead><tr><th>No.</th><th>Problem</th><th>Where</th><th>How to fix</th><th>Priority</th></tr></thead><tbody>
      ${r.issues.map(i => `<tr><td>${i.no}</td><td><strong>${esc(i.issue)}</strong>${i.kind !== 'mandatory' ? `<br><span class="chm-small">${i.kind === 'client' ? 'Client instruction' : i.kind === 'conditional' ? 'Applies here' : 'Recommendation'}</span>` : ''}</td><td>${esc(i.location || '—')}</td><td>${esc(i.fix)}</td><td><span class="chm-qc-pri chm-qc-pri-${i.priority.toLowerCase()}">${i.priority}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="chm-small">Nothing to fix in what could be checked.</p>'}</section>`;
    const pend = r.checks.filter(x => x.status === 'check' || x.confirmed), needAI = pend.filter(x => !x.confirmed && /with AI/.test(x.detail || '')), eyeOnly = pend.filter(x => !needAI.includes(x));
    const item = x => `<li><label class="chm-check"><input type="checkbox" data-chm="qcok" data-v="${esc(x.id)}" ${x.confirmed ? 'checked' : ''} ${canEdit ? '' : 'disabled'}><span><strong>${esc(x.label)}</strong>${x.detail && !/with AI/.test(x.detail) ? ` <span class="chm-small">${esc(x.detail)}</span>` : ''}</span></label></li>`;
    const eye = (needAI.length ? `<section><h3>Waiting for the AI reading</h3><p class="chm-small">${needAI.length} checks (logos, price, RERA text, disclaimers, spelling and more) run once the creative is read with AI${aiOn ? '' : ', which is switched off here'}.</p>
        <details class="chm-ezmore"><summary>Or check them by eye</summary><ul class="chm-qc-eye">${needAI.map(item).join('')}</ul></details></section>` : '')
      + (eyeOnly.length ? `<section><h3>Check by eye</h3><p class="chm-small">The tool cannot verify these from the file. Tick each one once you have checked it.</p><ul class="chm-qc-eye">${eyeOnly.map(item).join('')}</ul></section>` : '');
    const brief = `<section><h3>Compared against this brief</h3><div class="chm-form chm-learn-pick"><label>Visual source<select data-chm="qcvis"><option value="">From the AI reading</option>${Object.entries(QC_DISCLAIMERS).map(([k, d]) => `<option value="${k}" ${vt === k ? 'selected' : ''}>${esc(d.label)}</option>`).join('')}<option value="mixed" ${vt === 'mixed' ? 'selected' : ''}>Mixed sources</option></select></label></div>
      <p class="chm-small">${[['Project', ctx.project], ['Developer', ctx.developer || ctx.brand], ['Location', [ctx.micro, ctx.location].filter(Boolean).join(', ')], ['Price', (ctx.configs || []).map(x => `${x.type} ${x.price}`).join(', ') || ctx.priceRange], ['Offer', ctx.offer], ['RERA', ctx.rera], ['Disclaimer', ctx.disclaimer], ['Script', ctx.script ? 'provided' : '']].map(([k, v]) => `${k}: ${v ? esc(v) : '<em>not given</em>'}`).join(' · ')}</p>
      <p class="chm-small">Checks compare the creative with these details. Anything not given is flagged for confirmation, never assumed correct.</p></section>`;
    const missing = r.missing.length ? `<section><h3>Missing information</h3><ul class="chm-small">${r.missing.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : '';
    const correct = r.correct.length ? `<details class="chm-ezmore"><summary>What is correct (${r.correct.length})</summary><ul class="chm-small">${r.correct.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>` : '';
    const obs = r.observations.length ? `<section><h3>Worth improving</h3><p class="chm-small">Suggestions, not errors: they don't change the status.</p><ul class="chm-small">${r.observations.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : '';
    const full = `<details class="chm-ezmore"><summary>Full checklist (${r.checks.length} checks)</summary>${groups.map(g => `<h4>${esc(g)}</h4><table class="chm-table chm-qc-all"><tbody>${r.checks.filter(x => x.group === g).map(x => `<tr><td>${esc(x.label)}${x.detail && x.status !== 'fail' ? `<br><span class="chm-small">${esc(x.detail)}</span>` : x.status === 'fail' ? `<br><span class="chm-small">${esc(x.issue || '')}</span>` : ''}</td><td>${pill(x.status)}${x.confirmed ? '<br><span class="chm-small">by eye</span>' : ''}</td></tr>`).join('')}</tbody></table>`).join('')}</details>`;
    const limits = `<p class="chm-small"><strong>What this check cannot see:</strong> ${r.limits.map(esc).join(' ')}</p>`;
    return head + issues + missing + eye + obs + correct + `<details class="chm-ezmore"><summary>Brief, full checklist and limits</summary>${brief}${full}${limits}</details>`;
  }
  // ---------- phone & placements ----------
  _ratioOf(a) { return a && a.display ? a.display.w / a.display.h : 1; }
  _phoneHtml(c, f, a) {
    if (!a) return '<p class="chm-muted">Reading the creative…</p>';
    const ai = this._ai(c, f), els = ai ? elementsInView(ai, a) : [], r = this._ratioOf(a), where = c.kind === 'video' ? ` at ${esc(this._frameLabel(c, f))}` : c.kind === 'carousel' ? ` · card ${f + 1}` : '';
    const st = c.phone || (c.phone = { modes: {} }), plans = placementPlans(r, els, { map: a.map, modes: st.modes });
    const lg = ai ? legibility(a.display, els, r) : [];
    const pill = v => `<span class="chm-qc-p chm-qc-${v === 'ok' ? 'pass' : v === 'warn' ? 'check' : 'fail'}">${v === 'ok' ? 'OK' : v === 'warn' ? 'Borderline' : 'Fix'}</span>`;
    const read = !ai ? `<p class="chm-small">${this.o.ai && this._can('ai') ? 'Read with AI to measure each line of text.' : 'Text sizes and contrast are measured once the creative has an AI reading.'}</p>${this.o.ai && this._can('ai') ? `<button type="button" class="chm-btn" data-chm="ai" ${this.aiState === 'busy' ? 'disabled' : ''}>${this.aiState === 'busy' ? 'Reading…' : 'Read with AI'}</button>` : ''}`
      : `${(() => { const n = { ok: 0, warn: 0, fail: 0 }; lg.forEach(x => n[x.verdict]++); return `<p><strong>${n.fail ? `${n.fail} line${n.fail > 1 ? 's' : ''} hard to read` : n.warn ? `${n.warn} borderline line${n.warn > 1 ? 's' : ''}` : 'All text readable on a phone'}</strong> <span class="chm-small">· ${lg.length} measured</span></p>`; })()}<table class="chm-table chm-lg-t"><thead><tr><th>Text</th><th>Size</th><th>Contrast</th><th></th></tr></thead><tbody>${lg.map(x => `<tr><td>${esc(x.text.length > 60 ? x.text.slice(0, 58) + '…' : x.text)}<br><span class="chm-small">${esc(ELEMENT_LABELS[x.type] || x.type)}${x.why ? ' · ' + esc(x.why) : ''}</span></td><td>${x.px} px</td><td>${x.contrast == null ? '—' : x.contrast + ':1'}</td><td>${pill(x.verdict)}</td></tr>`).join('') || '<tr><td colspan="4">No text found.</td></tr>'}</tbody></table>
        <p class="chm-small">Measured as it appears in a phone feed (360 px wide). Main text needs about 13 px and 4.5:1 contrast (3:1 when large); small print about 7 px.</p>`;
    const cards = plans.map(p => `<article class="chm-pl"><div class="chm-pl-h"><strong>${esc(p.label)}</strong>${p.ok ? '<span class="chm-qc-p chm-qc-pass">OK</span>' : `<span class="chm-qc-p chm-qc-fail">${p.issues.length} issue${p.issues.length > 1 ? 's' : ''}</span>`}</div>
        <canvas class="chm-pl-cv" data-pl="${p.key}" role="img" aria-label="${esc(p.label)} preview"></canvas>
        ${p.same ? '<p class="chm-small">Native size.</p>' : `<div class="chm-tabs" role="group" aria-label="${esc(p.label)} fit"><button type="button" class="chm-tab" data-chm="plmode" data-k="${p.key}" data-v="crop" aria-pressed="${p.mode === 'crop'}">Crop</button><button type="button" class="chm-tab" data-chm="plmode" data-k="${p.key}" data-v="pad" aria-pressed="${p.mode === 'pad'}">Fit whole</button></div>`}
        ${p.issues.length ? `<ul class="chm-small chm-pl-i">${p.issues.map(i => `<li>${i.problem === 'cut' ? 'Cut off' : 'Under the ' + esc(i.zone)}: <strong>${esc(i.label)}</strong></li>`).join('')}</ul>` : ''}
        ${!p.same && p.mode === 'pad' && !(st.modes || {})[p.key] ? `<p class="chm-small">Fitted whole: ${p.cropCuts ? 'a crop would cut key details' : 'fewer details end up under the interface'}.</p>` : ''}
        <button type="button" class="chm-btn" data-chm="pldl" data-k="${p.key}">Download ${p.size[0]}×${p.size[1]}</button></article>`).join('');
    return `<section style="margin-top:0"><h3>Phone view${where}</h3><div class="chm-grid chm-phone-g"><div class="chm-phone"><canvas class="chm-phone-cv" role="img" aria-label="The creative at actual phone size"></canvas><p class="chm-small">Actual size on a typical phone.</p></div><div class="chm-side">${read}</div></div></section>
      <section><h3>Placements</h3><p class="chm-small">How this ${c.kind === 'video' ? 'moment' : 'creative'} lands in each placement. Shaded: where the app's own interface covers the screen. Red boxes: details cut off or covered.${c.kind === 'video' ? ' Downloads are stills; re-frame the video itself in the edit.' : ''}</p>
        ${els.length ? '' : '<p class="chm-small"><strong>Read with AI</strong> to see where the price, RERA and logo land in each placement.</p>'}<div class="chm-pls">${cards}</div></section>`;
  }
  _paintPhone(c, f, a) {
    if (!a) return; const src = a.display.c, ai = this._ai(c, f), els = ai ? elementsInView(ai, a) : [], r = this._ratioOf(a);
    const cv = this.el.querySelector('.chm-phone-cv'); if (cv) { const W = 360, dpr = Math.min(3, window.devicePixelRatio || 1); cv.width = Math.round(W * dpr); cv.height = Math.round(W / r * dpr); cv.style.width = W + 'px'; cv.style.maxWidth = '100%'; cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height); }
    const st = c.phone || { modes: {} }, plans = placementPlans(r, els, { map: a.map, modes: st.modes }), keyT = new Set(['price', 'rera', 'qr', 'website', 'cta', 'logo', 'project_name', 'offer', 'headline', 'location', 'contact']);
    plans.forEach(p => { const cv2 = this.el.querySelector(`.chm-pl-cv[data-pl="${p.key}"]`); if (!cv2) return; const W = 220, H = Math.round(W * p.size[1] / p.size[0]);
      const bad = new Set(p.issues.map(i => i.type));
      drawPlacement(cv2, src, p, W, H, { zones: true, boxes: els.filter(e => keyT.has(e.type)).map(e => ({ cbox: e.cbox, bad: bad.has(e.type) })) }); });
  }
  _plDownload(c, key) {
    const f = this.frame || 0, a = this.cache.get(this._key(c, f)); if (!a) return; const ai = this._ai(c, f), els = ai ? elementsInView(ai, a) : [];
    const p = placementPlan(this._ratioOf(a), els, key, { map: a.map, mode: ((c.phone || {}).modes || {})[key] });
    const full = a.crop ? (() => { const k = document.createElement('canvas'); k.width = Math.round(a.crop.w); k.height = Math.round(a.crop.h); k.getContext('2d').drawImage(a.img, a.crop.x, a.crop.y, a.crop.w, a.crop.h, 0, 0, k.width, k.height); return k; })() : a.img;
    const cv = drawPlacement(document.createElement('canvas'), full, p, p.size[0], p.size[1], {});
    cv.toBlob(b => this._save(b, `${c.name}${c.kind === 'video' ? ' ' + this._frameLabel(c, f).replace(/[^\w%. -]+/g, ' ') : ''} - ${PLACEMENTS[key].label.replace(':', 'x')}.png`), 'image/png');
  }
  _pacingHtml(c) {
    if (!c.file && !c.videoSrc) return '';
    if (!c.qcScan) { this._qcScan(c); return '<section><h3>Pacing</h3><p class="chm-muted">Scanning the video for cuts…</p></section>'; }
    if (c.qcScan.error) return '<section><h3>Pacing</h3><p class="chm-small">The video could not be scanned for cuts in this browser.</p></section>';
    const pc = videoPacing(c.qcScan, this._qcParts(c).filter(Boolean), c.duration); if (!pc) return '';
    const dur = c.duration || c.qcScan.duration || 1, s1 = v => v == null ? '—' : (Math.round(v * 10) / 10) + ' s';
    const strip = `<div class="chm-shots" role="img" aria-label="${pc.shots.length} shots across ${s1(dur)}">${pc.shots.map((s, i) => `<i style="left:${(s.t0 / dur * 100).toFixed(2)}%;width:${((s.t1 - s.t0) / dur * 100).toFixed(2)}%" class="${i % 2 ? 'chm-shot-b' : ''}" title="Shot ${i + 1}: ${s1(s.t0)}–${s1(s.t1)}"></i>`).join('')}</div>
      <div class="chm-shots-ax chm-small"><span>0 s</span><span>${s1(dur)}</span></div>`;
    const tile = (l, v, sub) => `<div class="chm-kpi"><span class="chm-kpi-l">${l}</span><span class="chm-kpi-v">${v}</span>${sub ? `<span class="chm-kpi-s">${sub}</span>` : ''}</div>`;
    const tiles = `<div class="chm-kpis">${tile('Shots', pc.shots.length, `${pc.cuts.length} cut${pc.cuts.length === 1 ? '' : 's'}`)}${tile('Average shot', s1(pc.avgShot))}${tile('First cut', s1(pc.firstCut), pc.firstCut == null ? 'one continuous shot' : '')}
      ${tile('Project name seen', pc.firstSeen.name == null ? '—' : 'by ' + s1(pc.firstSeen.name), pc.firstSeen.name == null ? 'read the moments with AI' : '')}${tile('Price seen', pc.firstSeen.price == null ? '—' : 'by ' + s1(pc.firstSeen.price))}</div>`;
    const sup = pc.supers.length ? `<details class="chm-ezmore"><summary>On-screen text and reading time (${pc.supers.length})</summary><div class="chm-scroll"><table class="chm-table chm-qc-t"><thead><tr><th>Moment</th><th>Text</th><th>Words</th><th>On screen</th><th>Needs</th></tr></thead><tbody>${pc.supers.map(x => `<tr><td>${esc(x.label)}</td><td>${esc(x.text.slice(0, 60))}</td><td>${x.words}</td><td>${x.shown == null ? '—' : '≤ ' + x.shown + ' s'}</td><td>${x.need} s ${x.short ? '<span class="chm-qc-p chm-qc-fail">Short</span>' : ''}</td></tr>`).join('')}</tbody></table></div><p class="chm-small">On screen = the length of the shot the super appears in (supers that carry across a cut may stay longer).</p></details>` : '';
    return `<section><h3>Pacing</h3>${strip}${tiles}${pc.notes.length ? `<ul class="chm-small">${pc.notes.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="chm-small">Pacing looks fine for a feed video.</p>'}${sup}</section>`;
  }
  _similarHtml(c, goal) {
    const me = this._ownRecord(c), sim = similarCreatives(me, this.libraryRecords(), { goal, limit: 5 });
    const pill = v => v == null ? '<span class="chm-pill">No results</span>' : `<span class="chm-pill${v >= 1.15 ? ' chm-ok' : v <= 0.85 ? ' chm-bad' : ''}">${v.toFixed(2)}× project</span>`;
    if (!sim.list.length) return '<section><h3>Has this been done before?</h3><p class="chm-small">No close match in the library: this is a new combination of elements.</p></section>';
    return `<section><h3>Has this been done before?</h3>
      <p class="chm-small">${sim.alike ? `${sim.alike} past creative${sim.alike > 1 ? 's' : ''} share most of this creative's elements${sim.alikeVs != null ? `; together they ran at <strong>${sim.alikeVs.toFixed(2)}×</strong> their project average (${sim.alikeN} with results)` : ''}. ` : ''}Closest matches by elements, headline words and look:</p>
      <div class="chm-scroll"><table class="chm-table chm-list-t"><thead><tr><th>Creative</th><th>Match</th><th>In common</th><th>Result</th></tr></thead><tbody>
      ${sim.list.map(x => `<tr><td><strong>${esc(x.record.name)}</strong><br><span class="chm-small">${esc([x.record.brand, x.record.project].filter(Boolean).join(' · '))}</span></td><td>${Math.round(x.score * 100)}%${x.look != null && x.look > 0.9 ? '<br><span class="chm-small">looks alike</span>' : ''}</td><td class="chm-small">${esc(x.shared.slice(0, 6).join(', ') || '—')}</td><td>${pill(x.vs)}</td></tr>`).join('')}</tbody></table></div>
      <p class="chm-small">A close match that did poorly is a reason to change the idea, not just the colours; one that did well is worth building on.</p></section>`;
  }
  // ---------- project brief, plain read, report, designer brief ----------
  _briefKey(c, base) { const b = base || this._baseCtx(c); return String(b.project || c.briefKey || '').trim(); }
  _baseCtx(c) { const x = this.o.context; return (typeof x === 'function' ? x(c) : x) || {}; }
  _briefOf(c) { const k = this._briefKey(c); return (k && this._briefs[k]) || c.brief || null; }
  _briefHtml(c) {
    const base = this._ctx(c), st = this._bd && this._bd.id === c.id ? this._bd : (this._bd = { id: c.id, data: Object.assign({}, base, this._briefOf(c) || {}, { configs: ((this._briefOf(c) || {}).configs || base.configs || []).map(x => Object.assign({}, x)) }) });
    if (!st.data.configs.length) st.data.configs.push({ type: '', price: '' });
    const d = st.data, canEdit = this._can('edit'), s0 = briefStatus(this._ctx(c), c.kind);
    const fld = f => { const v = d[f.k] == null ? '' : d[f.k], dis = canEdit ? '' : 'disabled', id = 'chm-bf-' + f.k;
      if (f.type === 'configs') return `<div class="chm-bf-wide"><span class="chm-bf-l">${esc(f.label)}${f.need ? ' <em>needed</em>' : ''}</span>${d.configs.map((x, i) => `<div class="chm-bf-row"><input aria-label="Configuration ${i + 1}" placeholder="e.g. 2 BHK" data-chm="bfc" data-i="${i}" data-k="type" value="${esc(x.type || '')}" ${dis}><input aria-label="Starting price ${i + 1}" placeholder="e.g. ₹94 lakh" data-chm="bfc" data-i="${i}" data-k="price" value="${esc(x.price || '')}" ${dis}>${canEdit && d.configs.length > 1 ? `<button type="button" class="chm-link" data-chm="bfdel" data-v="${i}">Remove</button>` : ''}</div>`).join('')}${canEdit ? '<button type="button" class="chm-link" data-chm="bfadd">Add a configuration</button>' : ''}</div>`;
      const lab = `<label for="${id}">${esc(f.label)}${f.need ? ' <em>needed</em>' : ''}</label>`, help = f.help ? `<span class="chm-small">${esc(f.help)}</span>` : '';
      if (f.type === 'select') return `<div>${lab}<select id="${id}" data-chm="bf" data-k="${f.k}" ${dis}>${f.options.map(([k, l]) => `<option value="${k}" ${String(v) === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${help}</div>`;
      if (f.type === 'textarea') return `<div class="chm-bf-wide">${lab}<textarea id="${id}" rows="${f.k === 'script' ? 4 : 2}" data-chm="bf" data-k="${f.k}" ${dis}>${esc(v)}</textarea>${help}</div>`;
      return `<div>${lab}<input id="${id}" data-chm="bf" data-k="${f.k}" value="${esc(v)}" ${dis}>${help}</div>`; };
    return `<section style="margin-top:0"><p><button type="button" class="chm-link" data-chm="tab" data-v="summary">← Back to the summary</button></p>
      <h3>Project brief${d.project ? ' · ' + esc(d.project) : ''}</h3>
      <p class="chm-small">The checks compare every creative with these details, and new ideas and designer briefs are written from them. ${s0.complete ? 'Everything the checks need is filled in.' : `Still needed: ${esc(s0.missing.join(', '))}.`} The brief is shared by every creative of this project.</p>
      ${[...new Set(BRIEF_FIELDS.map(f0 => f0.g))].map(g0 => `<h4 class="chm-bf-h">${esc(g0)}</h4><div class="chm-bf">${BRIEF_FIELDS.filter(f0 => f0.g === g0).map(fld).join('')}</div>`).join('')}
      ${canEdit ? `<div class="chm-actions"><button type="button" class="chm-btn chm-primary" data-chm="bfsave">Save the brief</button><button type="button" class="chm-btn" data-chm="bfcancel">Cancel</button></div>` : '<p class="chm-small">You can view the brief but not change it.</p>'}</section>`;
  }
  _saveBrief(c) {
    const d = this._bd && this._bd.data; if (!d) return;
    const clean = {}; BRIEF_FIELDS.forEach(f => { const v = d[f.k]; if (f.type === 'configs') { const cs = (v || []).filter(x => x && (String(x.type || '').trim() || String(x.price || '').trim())).map(x => ({ type: String(x.type || '').trim(), price: String(x.price || '').trim() })); clean.configs = cs; }
      else clean[f.k] = String(v == null ? '' : v).trim(); });
    const key = this._briefKey(c) || clean.project || c.name; c.briefKey = key; this._briefs[key] = clean; this._bd = null;
    if (this.o.onBrief) try { this.o.onBrief(key, clean); } catch (e) { console.error(e); }
    this._learnChanged(); this.tab = 'summary'; this.render(); this._note('Brief saved. The checks and ideas now use it.');
  }
  /** What the ad says, from the AI reading: the hook frame or first card that has one. */
  _readOf(c) { const n = c.kind === 'video' ? c.frames.length : c.kind === 'carousel' ? c.cards.length : 1; for (let i = 0; i < n; i++) { const ai = this._ai(c, i); if (ai && ai.read && ai.read.message) return ai.read; } return null; }
  _readHtml(c) {
    const r = this._readOf(c), aiRun = !!this.o.ai && this._can('ai');
    if (!r) return `<section class="chm-read"><h3>What this ad says</h3><p class="chm-small">${aiRun ? 'Read the creative with AI to see, in plain words, what it says, who it is for and what it asks people to do.' : 'Once the creative is read with AI, this shows in plain words what it says, who it is for and what it asks people to do.'}</p></section>`;
    const cl = { clear: ['ok', 'Clear: one message'], mixed: ['warn', 'Mixed: messages compete'], unclear: ['bad', 'Unclear'] }[r.clarity] || null;
    const noAsk = !r.ask || /^nothing/i.test(r.ask);
    return `<section class="chm-read"><h3>What this ad says</h3><p class="chm-read-m">“${esc(r.message)}”</p>
      <dl class="chm-read-d">${r.audience ? `<div><dt>Aimed at</dt><dd>${esc(r.audience)}</dd></div>` : ''}${r.promise ? `<div><dt>Promise</dt><dd>${esc(r.promise)}</dd></div>` : ''}<div><dt>Backed by</dt><dd>${r.proof ? esc(r.proof) : '<em>Nothing visible backs it up</em>'}</dd></div><div><dt>Asks people to</dt><dd>${noAsk ? '<em>Nothing: there is no clear call to action</em>' : esc(r.ask)}</dd></div></dl>
      ${cl ? `<p><span class="chm-fix-tag chm-fix-${cl[0] === 'ok' ? 'info' : cl[0]}">${cl[1]}</span>${r.clarityNote ? ` <span class="chm-small">${esc(r.clarityNote)}</span>` : ''}</p>` : ''}</section>`;
  }
  _fixList(c, f, a, sugs, qc) {
    const fixes = [];
    const short = t => { t = String(t || ''); return t.length <= 150 ? t : t.slice(0, 148).replace(/[,;]?\s+\S*$/, '') + '…'; };
    if (qc) qc.issues.slice(0, 4).forEach(i => fixes.push({ t: short(i.issue), how: i.fix, where: i.location, tag: i.priority === 'High' ? 'Must fix' : 'Fix', cls: i.priority === 'High' ? 'bad' : 'warn', go: /rera/i.test(i.id) ? 'rera' : /readable|small_print|safe_zone/.test(i.id) ? 'phone' : 'qc' }));
    const r = this._readOf(c); if (r && (!r.ask || /^nothing/i.test(r.ask))) fixes.push({ t: 'The ad does not ask people to do anything.', how: 'Add one clear call to action, such as "Book a site visit".', tag: 'Message', cls: 'warn', go: 'summary' });
    if (r && r.clarity === 'mixed') fixes.push({ t: 'Several messages compete for attention.', how: r.clarityNote || 'Keep one main message and move the rest to the caption.', tag: 'Message', cls: 'warn', go: 'summary' });
    const p = c.perf && c.perf.row ? c.perf : null, fn = p ? funnelNotes(p.row, p.avg) : null, weak = fn && fn.stage ? fn.steps.find(s => s.key === fn.stage) : null;
    if (weak && weak.note) fixes.push({ t: weak.note, tag: 'Results', cls: 'info', go: 'performance' });
    sugs.slice(0, Math.max(1, 5 - fixes.length)).forEach(t => { const res = /cost per|qualified lead|leads? |click/i.test(t) && /usual|average/i.test(t); fixes.push({ t, tag: res ? 'Results' : 'Design', cls: 'info', go: res ? 'performance' : 'attention' }); });
    return fixes.slice(0, 5);
  }
  _ideasFor(c, n = 3) {
    try { const recs = this.libraryRecords().filter(r => r.metrics && (+r.metrics.spend || 0) > 0); if (recs.length < 4) return [];
      const st = this._recSt || {}; if (st.res && st.res.concepts && st.key && String(st.key).endsWith(c.id)) return st.res.concepts.slice(0, n);
      return recommend(recs, { ctx: Object.assign({}, (this._libFacts || {})[this._ctx(c).project] || {}, this._ctx(c)) }, { goal: st.goal || 'ql', count: n }).concepts; } catch (e) { return []; }
  }
  async _report(c) {
    const f = this.frame || 0, a = this.cache.get(this._key(c, f)); if (!a) return;
    if (this._lib === undefined) await this._libRecords();
    const qc = this._can('qc') ? this._qcRun(c) : null, sugs = this._sugs(c, a, f), ctx = this._ctx(c);
    const V = { 'Approved': ['ok', 'Ready to go live', 'Every required detail checked out against the brief.'], 'Approved with Minor Changes': ['warn', 'Almost ready: small fixes', 'Nothing major is wrong, but fix the points below first.'],
      'Revisions Required': ['bad', 'Needs changes before it goes live', 'Something required is missing or wrong.'], 'Unable to Complete Review': ['na', 'Not fully checked yet', 'The text, logos and disclaimers were not read with AI, so they still need a check.'] };
    const v = qc ? V[qc.status] : ['na', 'Not checked', ''];
    const heat = document.createElement('canvas'); heat.width = a.display.w; heat.height = a.display.h; paintView(heat, a.display.c, a.map, 'heat', a.peaks, null);
    const fn = c.perf && c.perf.row ? funnelNotes(c.perf.row, c.perf.avg) : null, ctr = fn ? fn.steps.find(s => s.key === 'ctr') : null, weak = fn && fn.stage ? fn.steps.find(s => s.key === fn.stage) : null;
    const ai = this._ai(c, f), lg = ai ? legibility(a.display, elementsInView(ai, a), this._ratioOf(a)) : [];
    const pc = v0 => v0 == null ? '—' : (v0 * 100).toFixed(v0 < 0.1 ? 1 : 0) + '%';
    const data = { name: c.name, kind: this._kindLabel(c), project: ctx.project || '', date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      verdict: { tone: v[0], title: v[1], detail: v[2] }, read: this._readOf(c), fixes: this._fixList(c, f, a, sugs, qc).map(x => ({ tag: x.tag, text: x.t, how: x.how })),
      images: { original: a.display.c.toDataURL('image/jpeg', 0.85), heat: heat.toDataURL('image/jpeg', 0.85), caption: c.kind === 'video' ? `The creative at ${this._frameLabel(c, f)}` : c.kind === 'carousel' ? `Card ${f + 1}` : 'The creative' },
      areas: [{ label: 'Attention', value: `${a.scores.overall}/100`, note: scoreWord(a.scores.overall) }, qc ? { label: 'Checks', value: qc.issues.length ? `${qc.issues.length} to fix` : qc.status === 'Unable to Complete Review' ? 'Not checked' : 'All clear', note: `${qc.counts.pass} passed` } : null,
        { label: 'On a phone', value: ai ? (lg.filter(x => x.verdict === 'fail').length ? `${lg.filter(x => x.verdict === 'fail').length} hard to read` : 'Readable') : '—', note: ai ? `${lg.length} lines measured` : 'not measured' },
        fn ? { label: 'Results', value: `CTR ${pc(ctr && ctr.rate)}`, note: weak ? `Weakest: ${weak.label.toLowerCase()}` : 'On or above usual' } : null].filter(Boolean),
      issues: qc ? qc.issues : [], eye: qc ? qc.checks.filter(x => x.status === 'check').map(x => x.label) : [],
      ideas: this._ideasFor(c).map(k => ({ headline: k.copy.headline, sub: k.copy.sub, cta: k.copy.cta, why: k.why.filter(w => w.evidence !== 'untested' && w.lift > 1.05 && !w.confounded).slice(0, 2).map(w => `${w.label}: ${Math.round((w.lift - 1) * 100)}% better in ${w.n} past creatives`).join('; ') })),
      brief: briefStatus(ctx, c.kind) };
    const blob = new Blob([reportHtml(data)], { type: 'text/html' }), name = `${c.name} - creative report.html`;
    if (this.o.onReport) { try { await this.o.onReport(blob, { name, creative: c, report: data }); this._note('Report saved.'); } catch (e) { this._note('The report could not be saved: ' + (e && e.message || e)); } }
    else this._save(blob, name);
  }
  _docWrap(title, inner) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>body{margin:0;font:15px/1.5 "Segoe UI",system-ui,Arial,sans-serif;color:#18202b}.p{max-width:860px;margin:0 auto;padding:24px 18px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid #dfe3e8}th{color:#5d6877;font-weight:600}h3{font-size:22px;margin:0}h4{margin:20px 0 6px;font-size:15px}.chm-small{color:#5d6877;font-size:13px}.chm-chip{font-size:12px;border:1px solid #dfe3e8;border-radius:4px;padding:1px 6px}@media print{.np{display:none}tr{break-inside:avoid}}</style></head><body><div class="p"><p class="np" style="text-align:right"><button onclick="window.print()">Print or save as PDF</button></p>${inner}</div></body></html>`;
  }
  _dbriefHtml(db) {
    const b = designerBrief(db.idea, db.ctx, { goal: db.goal, effects: db.effects, video: db.video, seconds: db.seconds });
    db.built = b;
    return `<section style="margin-top:0"><p><button type="button" class="chm-link" data-chm="dbback">← Back to the ideas</button></p>
      <div class="chm-form chm-learn-pick"><label>Format<select data-chm="dbfmt"><option value="static" ${!db.video ? 'selected' : ''}>Static</option><option value="video" ${db.video ? 'selected' : ''}>Video</option></select></label>
        ${db.video ? `<label>Length<select data-chm="dblen"><option value="15" ${db.seconds !== 30 ? 'selected' : ''}>15 seconds</option><option value="30" ${db.seconds === 30 ? 'selected' : ''}>30 seconds</option></select></label>` : ''}
        <button type="button" class="chm-btn" data-chm="dbcopy">Copy brief</button><button type="button" class="chm-btn" data-chm="dbdl">Download brief</button>${db.draw && !db.video && this._can('versions') ? `<button type="button" class="chm-btn chm-primary" data-chm="${db.draw}" data-v="${db.i}">Make this version</button>` : ''}</div>
      <p class="chm-small">Hand this to the designer or editor. It has the copy, the visual, ${db.video ? 'a scene-by-scene storyboard, ' : ''}the sizes, and everything that must be on the creative for this project.</p>
      ${briefHtml(b)}</section>`;
  }
  _rcfg() { return this.o.compliance && typeof this.o.compliance === 'object' ? this.o.compliance : {}; }
  _rst(c) { return c.reraCheck || (c.reraCheck = { region: null, medium: null, manual: {}, qr: {}, tl: null, tlBusy: false }); }
  /** RERA result for one creative / card / frame (null until the image has been analysed). */
  _rera(c, f, a) {
    if (!a || !this._can('compliance')) return null; const st = this._rst(c), cfg = this._rcfg(), ctx = this._ctx(c), pk = this._pk(c, f);
    const res = checkRera({ region: st.region || cfg.region || null, medium: st.medium || cfg.medium || (c.kind === 'video' ? 'video' : 'social'), kind: c.kind,
      elements: elementsInView(this._ai(c, f), a), qr: c.kind === 'video' ? (st.qr[pk] || null) : (st.qr[pk] === undefined ? null : st.qr[pk] || []), timeline: c.kind === 'video' ? st.tl : null,
      caption: ctx.caption || (c.meta && c.meta.caption) || '', transcript: c.transcript && c.transcript.text, ctx, manual: st.manual, rules: cfg.rules, cardIndex: f });
    const key = JSON.stringify(res.items.map(i => i.status)) + res.code + res.medium;
    if (st.lastKey !== key) { st.lastKey = key; st.result = res; if (cfg.onResult) try { cfg.onResult(c, res); } catch (e) { console.error(e); } this._emit('compliance', c.id); }
    return res;
  }
  /** Find QR codes on the current static / card / frame, and along the whole video. */
  async _reraScan(c, f) {
    const st = this._rst(c), pk = this._pk(c, f);
    if (st.qr[pk] === undefined) {
      st.qr[pk] = null; let boxes = [];
      try { const a = await this._analyse(c, f), cr = a.crop, iw = a.img.naturalWidth || a.img.width, ih = a.img.naturalHeight || a.img.height;
        boxes = (await detectQR(a.img)).map(q => { let [x, y, w, h] = q.box; if (cr) { x = (x * iw - cr.x) / cr.w; y = (y * ih - cr.y) / cr.h; w = w * iw / cr.w; h = h * ih / cr.h; } return { box: [x, y, w, h], value: q.value }; })
          .filter(q => q.box[0] + q.box[2] > 0 && q.box[1] + q.box[3] > 0 && q.box[0] < 1 && q.box[1] < 1);
      } catch (e) { boxes = []; }
      st.qr[pk] = boxes; if (this.cur === c.id) this.render();
    }
    const src = c.kind === 'video' ? (c.file || c.videoSrc) : null;
    if (src && !st.tl && !st.tlBusy) {
      st.tlBusy = true; this.render();
      try { st.tl = await qrTimeline(src, { step: 0.5, onProgress: p => { st.tlPct = p; const m = this.el.querySelector('.chm-rera-prog'); if (m) m.textContent = `Looking for the QR code across the video… ${Math.round(p * 100)}%`; } }); }
      catch (e) { st.tl = null; st.tlErr = 'The video could not be scanned for a QR code.'; }
      st.tlBusy = false; if (this.cur === c.id) this.render();
    }
  }
  _reraHtml(c, f, a) {
    const st = this._rst(c), res = this._rera(c, f, a), cfg = this._rcfg();
    if (!a) return '<p class="chm-muted">Reading the creative…</p>';
    const pk = this._pk(c, f); if (st.qr[pk] === undefined || (c.kind === 'video' && (c.file || c.videoSrc) && !st.tl && !st.tlBusy && !st.tlErr)) setTimeout(() => this._reraScan(c, f), 0);
    const ctx = this._ctx(c), auto = reraRegion(ctx, Object.assign({}, RERA_RULES, cfg.rules || {})), r = res.rule;
    const pill = s => `<span class="chm-pill chm-pill-${s === 'pass' ? 'ok' : s === 'fail' ? 'bad' : s === 'check' ? 'warn' : 'na'}">${s === 'pass' ? 'OK' : s === 'fail' ? 'Fix' : s === 'check' ? 'Check' : 'Note'}</span>`;
    const basis = { order: 'Authority order', reported: 'Reported decision: confirm the wording', act: 'RERA Act baseline only' }[r.basis] || '';
    const states = Object.entries(Object.assign({}, RERA_RULES, cfg.rules || {})).map(([k, v]) => `<option value="${k}" ${res.code === k ? 'selected' : ''}>${esc(v.name)}${k === auto ? ' (from project location)' : ''}</option>`).join('');
    const media = Object.entries(RERA_MEDIA).map(([k, l]) => `<option value="${k}" ${res.medium === k ? 'selected' : ''}>${esc(l)}</option>`).join('');
    const ai = this._ai(c, f), aiRun = !!this.o.ai && this._can('ai');
    const n = res.counts, head = n.fail ? `${n.fail} to fix${n.check ? ` · ${n.check} to check by eye` : ''}` : n.check ? `${n.check} to check by eye` : 'Meets the listed rules';
    const rows = res.items.map(i => `<tr><td>${pill(i.status)}</td><td><strong>${esc(i.label)}</strong><br><span class="chm-small">${esc(i.detail)}${i.confirmed ? ' Confirmed by eye.' : ''}</span>${i.status !== 'pass' && i.fix ? `<br><span class="chm-small"><strong>Fix:</strong> ${esc(i.fix)}</span>` : ''}</td>
      <td>${(i.status === 'check' || i.confirmed) && this._can('edit') ? `<label class="chm-check"><input type="checkbox" data-chm="rera-ok" data-v="${esc(i.id)}" ${st.manual[i.id] ? 'checked' : ''}>Checked by eye</label>` : ''}</td></tr>`).join('');
    const tl = st.tl;
    return `<div class="chm-grid"><div class="chm-view"><canvas class="chm-rera-cv" role="img" aria-label="Where the RERA details and QR code are on the creative"></canvas>
        <p class="chm-small">${res.mediumRule.zone ? 'Shaded: the required top-right corner. ' : ''}Green: QR codes found. Blue: RERA text from the AI reading.</p>
        ${c.kind === 'video' ? `<p class="chm-small chm-rera-prog">${st.tlBusy ? 'Looking for the QR code across the video…' : tl ? `QR code on screen for about ${tl.seconds.toFixed(1)} s of ${Math.round(tl.duration)} s; in the top-right corner for ${tl.longestInZone.toFixed(1)} s at a stretch.` : st.tlErr ? esc(st.tlErr) : c.file || c.videoSrc ? '' : 'Add the video file to check the QR code across the whole video; only the sampled frames are checked now.'}</p>` : ''}</div>
      <div class="chm-side">
        <div class="chm-form chm-rera-pick"><label>State / region<select data-chm="rera-region">${states}</select></label><label>Where it runs<select data-chm="rera-medium">${media}</select></label></div>
        <section><h3>${esc(r.name)} · ${esc(r.authority)}</h3><p><strong>${esc(head)}</strong></p><p class="chm-small">${esc(r.summary || '')}</p>
</section>
        ${!ai && this.o.ai ? `<p class="chm-small">The registration number, website, size and banned claims are read from the AI reading.</p>${aiRun ? `<button type="button" class="chm-btn" data-chm="ai" ${this.aiState === 'busy' ? 'disabled' : ''}>${this.aiState === 'busy' ? 'Reading…' : 'Read with AI'}</button>` : ''}` : !ai ? '<p class="chm-small">Without an AI reading, the text items need a check by eye; the QR search still runs.</p>' : ''}
      </div></div>
      <table class="chm-table chm-rera-t"><thead><tr><th>Status</th><th>Rule</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <details class="chm-ezmore"><summary>The rule in detail, penalty and sources</summary><p class="chm-small"><span class="chm-chip">${esc(basis)}</span> Rules last checked ${esc(res.checked)}.${r.penalty ? ' Penalty: ' + esc(r.penalty) : ''}</p>
      ${(r.notes || []).length ? `<ul class="chm-small">${r.notes.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <p class="chm-small"><strong>Sources:</strong> ${(r.sources || []).map(s0 => `<a href="${esc(s0.url)}" target="_blank" rel="noopener">${esc(s0.title)}</a>${s0.date ? ` (${esc(s0.date)})` : ''}`).join(' · ')}</p>
</details>
      <p class="chm-small">An aid for checking, not legal advice. RERA orders change; confirm with the authority or your legal team before the ad goes live.</p>`;
  }
  _paintRera(c, f, a) {
    const cv = this.el.querySelector('.chm-rera-cv'); if (!cv || !a) return; const res = this._rst(c).result; if (!res) return;
    const box = cv.parentElement.clientWidth || 420, vw = Math.max(200, Math.min(460, box)), vh = Math.round(vw * a.display.h / a.display.w);
    if (cv.width !== vw) { cv.width = vw; cv.height = vh; }
    const x = cv.getContext('2d'); x.clearRect(0, 0, vw, vh); x.drawImage(a.display.c, 0, 0, vw, vh);
    if (res.mediumRule.zone === 'top-right') { x.fillStyle = 'rgba(37,99,235,.10)'; x.fillRect(vw / 2, 0, vw / 2, vh / 2); x.strokeStyle = 'rgba(37,99,235,.7)'; x.setLineDash([6, 4]); x.lineWidth = 1.5; x.strokeRect(vw / 2 + 1, 1, vw / 2 - 2, vh / 2 - 2); x.setLineDash([]); }
    const st = this._rst(c), pk = this._pk(c, f), draw = (b, col) => { x.strokeStyle = col; x.lineWidth = 2.5; x.strokeRect(b[0] * vw, b[1] * vh, b[2] * vw, b[3] * vh); };
    (st.qr[pk] || []).forEach(q => draw(q.box, '#16a34a'));
    elementsInView(this._ai(c, f), a).filter(e => e.type === 'rera' || e.type === 'website' || e.type === 'qr').forEach(e => draw(e.cbox, e.type === 'qr' ? '#16a34a' : '#2563eb'));
  }
  _kindLabel(x) { return x.kind === 'video' ? `Video${x.duration ? ' · ' + Math.round(x.duration) + ' s' : ''}` : x.kind === 'carousel' ? `Carousel · ${x.cards.length} cards` : 'Static'; }

  render() {
    const c = this._item(this.cur), f = this.frame || 0, up = this._can('upload');
    const list = this.items.map(x => { const a = this.cache.get(this._key(x, 0));
      return `<button type="button" class="chm-item" data-chm="pick" data-id="${x.id}" aria-current="${x.id === this.cur}">
        <img src="${esc(this._srcOf(x, 0))}" alt=""><span class="chm-item-t"><span class="chm-item-n">${esc(x.name)}</span>
        <span class="chm-item-m">${esc(this._kindLabel(x))}${a ? ` · <strong>${a.scores.overall}</strong>` : ''}</span></span></button>`; }).join('');
    const lOn = this._learnOn(), learn = lOn && this.view === 'learning';
    const views = lOn ? `<div class="chm-views" role="tablist" aria-label="Studio views">${[['creatives', 'Creatives' + (this.items.length ? ` · ${this.items.length}` : '')], ['learning', 'Learning']].map(([k, l]) => `<button type="button" role="tab" class="chm-tabbtn" data-chm="view" data-v="${k}" aria-selected="${(learn ? 'learning' : 'creatives') === k}">${l}</button>`).join('')}</div>` : '';
    this.el.innerHTML = `
      <div class="chm-head"><h2>${esc(this.o.title || 'Creative studio')}</h2>${views}
        ${up ? `<span class="chm-actions" style="margin:0"><label class="chm-btn chm-primary">Add creatives<input type="file" accept="image/*,video/*" multiple data-chm="file" hidden></label>
          <label class="chm-btn" title="Pick all the cards of one carousel at once">Add carousel<input type="file" accept="image/*" multiple data-chm="carousel" hidden></label></span>` : ''}</div>
      <div class="chm-note" role="status" hidden></div>
      ${this.busy ? '<p class="chm-muted">Reading files…</p>' : ''}
      ${learn ? `<div class="chm-learn">${this._learnHtml()}</div>` : this.items.length ? `<div class="chm-shell"><nav class="chm-rail chm-drop-zone" aria-label="Creatives">${list}</nav><div class="chm-main">${c ? this._studioHtml(c, f) : ''}</div></div>`
        : up ? `<div class="chm-drop chm-drop-zone" data-chm="drop"><strong>Drop creatives here</strong><span>JPG, PNG or WebP statics, or MP4, MOV or WebM videos. Feed screenshots work too. For a carousel, use Add carousel and pick all its cards together.</span>
          <label class="chm-btn">Choose files<input type="file" accept="image/*,video/*" multiple data-chm="file" hidden></label></div>` : '<p class="chm-muted">No creatives yet.</p>'}`;
    if (c && !learn) this._paint();
  }

  _summary(c, f, a, sugs) {
    const p = c.perf && c.perf.row ? c.perf : null, fn = p ? funnelNotes(p.row, p.avg) : null;
    const pc = v => v == null ? '—' : (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
    const ctr = fn ? fn.steps.find(s => s.key === 'ctr') : null, weak = fn && fn.stage ? fn.steps.find(s => s.key === fn.stage) : null;
    const fix = (weak && weak.note) || sugs[0] || '';
    const tile = (label, value, sub, cls) => `<div class="chm-kpi${cls ? ' ' + cls : ''}"><span class="chm-kpi-l">${label}</span><span class="chm-kpi-v">${value}</span>${sub ? `<span class="chm-kpi-s">${sub}</span>` : ''}</div>`;
    const tiles = [
      tile('Attention score', a ? `${a.scores.overall}<small>/100</small>` : '…', a ? scoreWord(a.scores.overall) + (c.kind === 'carousel' ? ` · card ${f + 1}` : c.kind === 'video' ? ` · ${esc(this._frameLabel(c, f))}` : '') : 'Reading…'),
      p ? tile('CTR', pc(ctr && ctr.rate), ctr && ctr.avgRate != null ? `average ${pc(ctr.avgRate)}` : '', ctr && ctr.status === 'below' ? 'chm-kpi-bad' : ctr && ctr.status === 'above' ? 'chm-kpi-ok' : '')
        : (this.o.performance || this.o.performanceFeed) && this._can('performance') ? tile('CTR', '—', c.perf ? 'No results matched' : 'Loading…') : '',
      p ? tile('Weakest step', weak ? esc(weak.label) : 'None', weak ? `${pc(weak.rate)} against ${pc(weak.avgRate)}` : 'Every step at or above average', weak ? 'chm-kpi-bad' : 'chm-kpi-ok') : '',
      (() => { const rr = a ? this._rera(c, f, a) : null; if (!rr) return ''; const n = rr.counts;
        return tile('RERA · ' + esc(rr.code), n.fail ? `${n.fail} to fix` : n.check ? 'Check' : 'OK', n.fail ? esc(rr.items.find(i => i.status === 'fail').label) : n.check ? `${n.check} item${n.check > 1 ? 's' : ''} to check by eye` : esc(rr.rule.authority) + ' rules', n.fail ? 'chm-kpi-bad' : n.check ? '' : 'chm-kpi-ok'); })(),
      fix ? `<div class="chm-kpi chm-kpi-fix"><span class="chm-kpi-l">Fix first</span><span class="chm-kpi-f">${esc(fix.length > 150 ? fix.slice(0, 148).replace(/\s+\S*$/, '') + '…' : fix)}</span></div>` : '',
    ].join('');
    const parts = c.kind === 'carousel' ? this._cardTabs(c, f) : c.kind === 'video' ? `<div class="chm-tabs" role="group" aria-label="Video frame"><span class="chm-small">Frame</span>${c.frames.map((fr, i) => { const x = this.cache.get(this._key(c, i)); return `<button type="button" class="chm-tab" data-chm="frame" data-v="${i}" aria-pressed="${f === i}">${esc(this._frameLabel(c, i))}${x ? ` · <strong>${x.scores.overall}</strong>` : ''}</button>`; }).join('')}</div>` : '';
    const bs = briefStatus(this._ctx(c), c.kind), pj = this._ctx(c).project;
    return `<header class="chm-sum"><div class="chm-title"><div><strong>${esc(c.name)}</strong> <span class="chm-chip">${esc(this._kindLabel(c))}</span>
          <button type="button" class="chm-briefchip${bs.complete ? '' : ' chm-briefchip-miss'}" data-chm="tab" data-v="brief" title="${bs.complete ? 'The project brief is complete' : 'Missing: ' + esc(bs.missing.join(', '))}">${pj ? esc(pj) + ' · ' : ''}Brief ${bs.filled}/${bs.total}${bs.complete ? '' : ' · fill in'}</button></div>
        ${this._can('remove') ? `<button type="button" class="chm-link" data-chm="remove" data-id="${c.id}">Remove</button>` : ''}</div>
      <div class="chm-kpis">${tiles}</div>${parts}</header>`;
  }

  _allSuggestions(c, f, a, sugs) {
    const groups = [], p = c.perf && c.perf.row ? c.perf : null;
    if (p) { const fn = funnelNotes(p.row, p.avg), ord = fn.steps.filter(s => s.status === 'below').sort((x, y) => x.ratio - y.ratio).map(s => s.note);
      const rest = fn.notes.filter(t => !ord.includes(t)); if (ord.length || rest.length) groups.push(['Funnel · CTR to site visits', ord.concat(rest)]); }
    if (sugs.length) groups.push([c.kind === 'carousel' ? `Creative · card ${f + 1}` : c.kind === 'video' ? `Creative · frame at ${this._frameLabel(c, f)}` : 'Creative', sugs]);
    if (c.kind === 'carousel' && this._allRead(c)) { const r = carouselNotes(c.cards.map((k, i) => ({ a: this.cache.get(this._key(c, i)), ai: k.ai, name: k.name }))); if (r.notes.length) groups.push(['Carousel sequence', r.notes]); }
    if (c.kind === 'video' && this._allFrames(c)) { const vn = videoNotes(this._frameSeries(c)); if (vn.length) groups.push(['Attention across the video', vn]); }
    if (c.kind === 'video' && c.sound && c.sound.notes && c.sound.notes.length) groups.push(['Sound', c.sound.notes]);
    if (c.kind === 'video' && c.qcScan && !c.qcScan.error) { const pc = videoPacing(c.qcScan, this._qcParts(c).filter(Boolean), c.duration); if (pc && pc.notes.length) groups.push(['Pacing', pc.notes]); }
    if (a && this._ai(c, f)) { const els = elementsInView(this._ai(c, f), a), r = this._ratioOf(a), ph = [];
      legibility(a.display, els, r).filter(x => x.verdict === 'fail').forEach(x => ph.push(`"${x.text.slice(0, 40)}" is hard to read on a phone (${x.why}). Enlarge it or put a solid band behind it.`));
      ['reels', 'stories'].forEach(k => { const pl = placementPlan(r, els, k, { map: a.map }); if (pl.issues.length && Math.abs(r - 9 / 16) < 0.02) ph.push(`In ${pl.label}: ${pl.issues.map(i => `${i.label} ${i.problem === 'cut' ? 'is cut off' : 'sits under the ' + i.zone}`).join('; ')}. ${PLACEMENTS[k].note}`); });
      if (ph.length) groups.push(['Phone & placements', ph]); }
    const rr = a ? this._rera(c, f, a) : null, rn = reraNotes(rr); if (rn.length) groups.push([`RERA · ${rr.rule.name}`, rn]);
    if (!groups.length) return '<p class="chm-muted">No suggestions yet.</p>';
    let n = 0;
    return groups.map(([h, list]) => `<section><h3>${esc(h)}</h3><ol class="chm-sugs" start="${n + 1}">${list.map(t => (n++, `<li>${esc(t)}</li>`)).join('')}</ol></section>`).join('');
  }

  // ---------- the creative view: Summary first, then four groups ----------
  _panels(c) {
    const perf = this._can('performance') && (this.o.performance || this.o.performanceFeed), lib = this.o.library || this.o.performanceFeed || this.o.performance;
    return [
      ['summary', 'Summary', ['summary']],
      ['attention', 'Attention', ['attention']],
      ['checks', 'Checks', [this._can('qc') ? 'qc' : null, this._can('compliance') ? 'rera' : null, 'phone', c.kind === 'video' ? 'sound' : null].filter(Boolean)],
      perf ? ['results', 'Results', ['performance']] : null,
      ['ideas', 'Ideas', [lib ? 'recommend' : null, this._can('versions') ? 'versions' : null, lib ? 'similar' : null].filter(Boolean)],
    ].filter(g => g && g[2].length);
  }
  _studioHtml(c, f) {
    const a = this.cache.get(this._key(c, f)), ai = this._ai(c, f), els = a ? elementsInView(ai, a) : [];
    if (!c.perf && (this.o.performance || this.o.performanceFeed) && this._can('performance')) this._loadPerf(c);
    const sugs = a ? this._sugs(c, a, f) : [];
    if (this.tab === 'suggestions') this.tab = 'summary';
    const groups = this._panels(c), all = groups.flatMap(g => g[2]), hidden = this.tab === 'brief' || (this.tab === 'dbrief' && this._db);
    if (!hidden && !all.includes(this.tab)) this.tab = 'summary';
    this._lastPanel = this._lastPanel || {};
    const g = hidden ? (this.tab === 'dbrief' ? groups.find(x => x[0] === 'ideas') || ['none', '', []] : ['none', '', []]) : groups.find(x => x[2].includes(this.tab)); if (!hidden) this._lastPanel[g[0]] = this.tab;
    const LABEL = { qc: 'Quality report', rera: 'RERA', phone: 'Phone & placements', sound: 'Sound', recommend: 'Recommended ideas', versions: 'Make a new version', similar: 'Done before?' };
    const INTRO = {
      attention: 'Where people are likely to look first, and how strongly the design holds the eye. It is a prediction, not eye-tracking.',
      qc: 'The auditor checklist: what is missing, wrong or hard to read before this goes live, compared with the project brief.',
      rera: 'Whether the RERA number, website and QR code meet the rules of the state where the ad runs.',
      phone: 'How the creative looks on a real phone, and in each placement (Feed, Reels, Stories) once the app covers parts of the screen.',
      sound: 'Whether the voice is clear, the music balanced and the volume right for Instagram and Facebook.',
      performance: 'How people responded to this ad, step by step from click to site visit, compared with your other ads.',
      recommend: 'Ideas for the next creative, built from what has worked in past results.',
      versions: 'Quick new versions of this creative with different layouts and copy, each scored the same way.',
      similar: 'Past creatives that are most like this one, and how they did.',
    };
    const body = this.tab === 'brief' ? this._briefHtml(c)
      : this.tab === 'dbrief' ? this._dbriefHtml(this._db)
      : this.tab === 'summary' ? this._overviewHtml(c, f, a, sugs)
      : this.tab === 'performance' ? (this._perfHtml(c) || '<p class="chm-muted">Loading results…</p>')
      : this.tab === 'sound' ? this._soundHtml(c)
      : this.tab === 'rera' ? this._reraHtml(c, f, a)
      : this.tab === 'qc' ? this._qcHtml(c, f)
      : this.tab === 'phone' ? this._phoneHtml(c, f, a)
      : this.tab === 'recommend' ? this._recHtml(c, f, a)
      : this.tab === 'similar' ? (this._lib === undefined ? (this._libRecords().then(() => { if (this.cur === c.id && this.tab === 'similar') this.render(); }), '<p class="chm-muted">Loading the creative library…</p>') : this._similarHtml(c, (this._recSt || {}).goal || 'ql', true))
      : this.tab === 'versions' ? `<section class="chm-gen">${this._ideasHtml(c, f)}</section>`
      : this._attentionHtml(c, f, a, ai, els);
    const sub = !hidden && g[2].length > 1 ? `<div class="chm-subnav" role="group" aria-label="${esc(g[1])}">${g[2].map(k => `<button type="button" class="chm-tab" data-chm="tab" data-v="${k}" aria-pressed="${this.tab === k}">${esc(LABEL[k] || k)}</button>`).join('')}</div>` : '';
    return `<div class="chm-studio">${this._headHtml(c, f, a)}
      <div class="chm-tabbar" role="tablist" aria-label="Creative views">${groups.map(([k, l, ps]) => `<button type="button" role="tab" class="chm-tabbtn" data-chm="tab" data-v="${ps.includes(this.tab) ? this.tab : (this._lastPanel[k] && ps.includes(this._lastPanel[k]) ? this._lastPanel[k] : ps[0])}" aria-selected="${g[0] === k}">${l}</button>`).join('')}</div>
      <div class="chm-panel" role="tabpanel">${sub}${INTRO[this.tab] ? `<p class="chm-intro">${INTRO[this.tab]}</p>` : ''}${body}</div></div>`;
  }
  _headHtml(c, f, a) {
    const parts = c.kind === 'carousel' ? this._cardTabs(c, f) : c.kind === 'video' ? `<div class="chm-tabs" role="group" aria-label="Moment of the video"><span class="chm-small">Moment</span>${c.frames.map((fr, i) => { const x = this.cache.get(this._key(c, i)); return `<button type="button" class="chm-tab" data-chm="frame" data-v="${i}" aria-pressed="${f === i}" title="Attention score ${x ? x.scores.overall : '…'}">${esc(this._frameLabel(c, i))}</button>`; }).join('')}</div>` : '';
    const bs = briefStatus(this._ctx(c), c.kind), pj = this._ctx(c).project;
    return `<header class="chm-sum"><div class="chm-title"><div><strong>${esc(c.name)}</strong> <span class="chm-chip">${esc(this._kindLabel(c))}</span>
          <button type="button" class="chm-briefchip${bs.complete ? '' : ' chm-briefchip-miss'}" data-chm="tab" data-v="brief" title="${bs.complete ? 'The project brief is complete' : 'Missing: ' + esc(bs.missing.join(', '))}">${pj ? esc(pj) + ' · ' : ''}Brief ${bs.filled}/${bs.total}${bs.complete ? '' : ' · fill in'}</button></div>
        ${this._can('remove') ? `<button type="button" class="chm-link" data-chm="remove" data-id="${c.id}">Remove</button>` : ''}</div>${parts}</header>`;
  }
  /** Summary: is it ready, what to fix first, and how each area looks. */
  _overviewHtml(c, f, a, sugs) {
    if (!a) return '<p class="chm-muted">Reading the creative…</p>';
    if (c.kind === 'video' && !this._allFrames(c)) this._readFrames(c);
    if (c.kind === 'carousel' && !this._allRead(c)) this._readAll(c);
    if (c.kind === 'video') this._qcScan(c);
    const qc = this._can('qc') ? this._qcRun(c) : null, ai = this._ai(c, f), aiRun = !!this.o.ai && this._can('ai');
    const unread = c.kind === 'video' ? c.frames.filter((x, i) => !this._ai(c, i)).length : c.kind === 'carousel' ? c.cards.filter(k => !k.ai).length : ai ? 0 : 1;
    // 1. the verdict, in plain words
    const V = { 'Approved': ['ok', 'Ready to go live', 'Every required detail checked out against the brief.'],
      'Approved with Minor Changes': ['warn', 'Almost ready: small fixes', 'Nothing major is wrong, but fix the points below first.'],
      'Revisions Required': ['bad', 'Needs changes before it goes live', 'Something required is missing or wrong: see the first points below.'],
      'Unable to Complete Review': ['na', 'Not fully checked yet', 'The text, logos and disclaimers can only be checked once the creative has been read with AI.'] };
    const v = qc ? V[qc.status] : null;
    const verdict = v ? `<div class="chm-verdict chm-qc-${v[0]}"><div><span class="chm-small">Ready to go live?</span><strong>${v[1]}</strong><span class="chm-small">${v[2]}${qc.verdictPending && v[0] !== 'bad' ? ` ${qc.verdictPending} item${qc.verdictPending > 1 ? 's' : ''} still need a quick check by eye.` : ''}</span></div>
      <div class="chm-actions">${aiRun && unread ? `<button type="button" class="chm-btn chm-primary" data-chm="qcai" ${this.aiAll || this.aiState === 'busy' ? 'disabled' : ''}>${this.aiAll ? esc(this.aiAll) : this.aiState === 'busy' ? 'Reading…' : 'Read with AI'}</button>` : ''}<button type="button" class="chm-btn" data-chm="tab" data-v="qc">See all checks</button><button type="button" class="chm-btn" data-chm="report">Download report</button></div></div>` : '';
    // 2. what to fix first: required issues, then the message, the weakest funnel step, then design advice
    const fixes = this._fixList(c, f, a, sugs, qc);
    const p = c.perf && c.perf.row ? c.perf : null, fn = p ? funnelNotes(p.row, p.avg) : null, weak = fn && fn.stage ? fn.steps.find(s => s.key === fn.stage) : null;
    const fixHtml = `<section><h3>What to fix first</h3>${fixes.length ? `<ol class="chm-fixes">${fixes.slice(0, 5).map(x => `<li><span class="chm-fix-tag chm-fix-${x.cls}">${x.tag}</span><div><strong>${esc(x.t)}</strong>${x.how ? `<br><span class="chm-small">${esc(x.how)}${x.where && x.where !== '—' && !String(x.t).includes(x.where) ? ` · Where: ${esc(x.where)}` : ''}</span>` : ''}</div><button type="button" class="chm-link" data-chm="tab" data-v="${x.go}">Details</button></li>`).join('')}</ol>` : '<p class="chm-small">Nothing to fix in what could be checked.</p>'}</section>`;
    // 3. one card per area
    const sc = a.scores, card = (go, label, value, note, cls) => `<button type="button" class="chm-area${cls ? ' chm-area-' + cls : ''}" data-chm="tab" data-v="${go}"><span class="chm-kpi-l">${label}</span><span class="chm-area-v">${value}</span><span class="chm-small">${note}</span></button>`;
    const els = ai ? elementsInView(ai, a) : [], lg = ai ? legibility(a.display, els, this._ratioOf(a)) : [], hard = lg.filter(x => x.verdict === 'fail').length;
    const pc = v0 => v0 == null ? '—' : (v0 * 100).toFixed(v0 < 0.1 ? 1 : 0) + '%', ctr = fn ? fn.steps.find(s => s.key === 'ctr') : null;
    const cards = [
      card('attention', 'Attention', `${sc.overall}<small>/100</small>`, `${scoreWord(sc.overall)}: ${sc.overall >= 60 ? 'the design holds the eye' : 'the eye is pulled in too many directions'}`, sc.overall >= 60 ? 'ok' : sc.overall >= 40 ? '' : 'bad'),
      qc ? (qc.status === 'Unable to Complete Review' ? card('qc', 'Checks', 'Not checked yet', 'Read with AI to check text, logos and disclaimers', '') : card('qc', 'Checks', qc.issues.length ? `${qc.issues.length} to fix` : 'All clear', qc.issues.length ? (qc.issues.some(i => i.priority === 'High') ? `${qc.issues.filter(i => i.priority === 'High').length} must be fixed before it goes live` : 'Small fixes only') : `${qc.counts.pass} checks passed`, qc.issues.some(i => i.priority === 'High') ? 'bad' : qc.issues.length ? 'warn' : 'ok')) : '',
      card('phone', 'On a phone', !ai ? '—' : hard ? `${hard} hard to read` : 'Readable', !ai ? 'Read with AI to measure the text' : `${lg.length} lines of text measured`, !ai ? '' : hard ? 'bad' : 'ok'),
      (this.o.performance || this.o.performanceFeed) && this._can('performance') ? card('performance', 'Results', p ? `CTR ${pc(ctr && ctr.rate)}` : '—', p ? (weak ? `Weakest step: ${esc(weak.label.toLowerCase())}` : 'Every step at or above your usual') : c.perf ? 'No results matched yet' : 'Loading…', p ? (weak ? 'warn' : 'ok') : '') : '',
    ].join('');
    const more = this._allSuggestions(c, f, a, sugs);
    const bs = briefStatus(this._ctx(c), c.kind);
    const briefNote = bs.complete ? '' : `<div class="chm-briefnote"><p><strong>The project brief is incomplete.</strong> Missing: ${esc(bs.missing.join(', '))}. Without these, the checks can't confirm them and new ideas have gaps.</p><button type="button" class="chm-btn" data-chm="tab" data-v="brief">Fill in the brief</button></div>`;
    return `${verdict}${briefNote}${this._readHtml(c)}${fixHtml}<section><h3>At a glance</h3><div class="chm-areas">${cards}</div></section>
      <details class="chm-ezmore"><summary>All suggestions</summary>${more}</details>
      <div class="chm-actions">${this._panels(c).some(g0 => g0[0] === 'ideas') ? '<button type="button" class="chm-btn chm-primary" data-chm="tab" data-v="' + this._panels(c).find(g0 => g0[0] === 'ideas')[2][0] + '">See ideas for the next version</button>' : ''}</div>`;
  }

  _attentionHtml(c, f, a, ai, els) {
    const modes = [['original', 'Original'], ['heat', 'Heatmap'], ['fog', 'Focus view']].map(([k, l]) => `<button type="button" class="chm-tab" data-chm="mode" data-v="${k}" aria-pressed="${this.mode === k}">${l}</button>`).join('');
    const bar = (l, v, inv) => { const g = inv ? 100 - v : v; return `<div class="chm-bar"><span>${l}</span><span class="chm-meter"><i style="width:${v}%;background:var(${g >= 60 ? '--chm-good' : g >= 40 ? '--chm-warn' : '--chm-bad'})"></i></span><strong>${v}</strong></div>`; };
    const sc = a && a.scores, order = a ? viewingOrder(a, els) : [], shares = a && els.length ? elementShares(a, els) : [];
    const aiOn = !!this.o.ai, aiRun = aiOn && this._can('ai'), w = a ? (a.crop ? a.crop.w : (a.img.naturalWidth || a.img.width)) : 1000;
    return `<div class="chm-grid">
        <div class="chm-view"><div class="chm-tabs">${modes}${ai ? `<label class="chm-check"><input type="checkbox" data-chm="boxes" ${this.boxes ? 'checked' : ''}>Show elements</label>` : ''}</div>
          <canvas class="chm-canvas" role="img" aria-label="${this.mode === 'original' ? 'The creative' : 'Predicted attention heatmap of the creative'}"></canvas>
          <p class="chm-small">Red and yellow show where people are likely to look in the first seconds; numbers show the order. This is a prediction, not eye-tracking.${a && a.crop ? ' The feed frame around the ad was cropped out.' : ''}${a && w < 500 ? ' This is a small image: use the full-size creative for a sharper reading.' : ''}</p></div>
        <div class="chm-side">
          ${sc ? `<section style="margin-top:0"><h3>Scores</h3>${bar('Overall attention', sc.overall)}${bar('One clear focus', sc.focus)}${bar('Busy-ness', sc.clutter, true)}${bar('Stands out', sc.contrast)}
              <p class="chm-small">Out of 100. <strong>One clear focus</strong>: whether the eye settles on a few things. <strong>Busy-ness</strong>: lower is better. <strong>Stands out</strong>: how much light, dark and colour contrast there is.</p></section>
            <section><h3>Where people look first</h3><ol class="chm-order">${order.map(o => `<li><strong>${esc(o.label)}</strong>${o.text ? ` · “${esc(o.text)}”` : ''}</li>`).join('')}</ol></section>` : '<p class="chm-muted">Reading the creative…</p>'}
          ${aiOn && (ai || aiRun) ? `<section><h3>What the AI sees</h3>${ai ? `<p>${esc(ai.hook || '')}</p>
              ${shares.length ? `<table class="chm-table"><thead><tr><th>Element</th><th>Share of the attention</th></tr></thead><tbody>${shares.map(([t, v]) => `<tr><td>${esc(ELEMENT_LABELS[t] || t)}</td><td>${Math.round(v * 100)}%</td></tr>`).join('')}</tbody></table>` : ''}
              ${(ai.strengths || []).length ? `<p><strong>Works:</strong> ${esc(ai.strengths.join(' · '))}</p>` : ''}`
            : '<p class="chm-small">Claude reads the text and elements (headline, price, call to action, logo, people), so the heatmap can say how much attention each one gets.</p>'}
              ${aiRun ? `<button type="button" class="chm-btn" data-chm="ai" ${this.aiState === 'busy' ? 'disabled' : ''}>${this.aiState === 'busy' ? 'Reading…' : ai ? 'Read again with AI' : 'Read with AI'}</button>` : ''}
              ${this.aiState && this.aiState !== 'busy' ? `<p class="chm-err" role="alert">${esc(this.aiState)}</p>` : ''}</section>` : ''}
        </div></div>
      ${c.kind === 'carousel' ? this._carouselHtml(c, f) : c.kind === 'video' ? this._videoHtml(c, f) : ''}`;
  }

  _soundSrc(c) { return c.file || c.videoSrc || null; }
  async _listen(c) {
    if (c.sound || c._listening) return;
    const src = this._soundSrc(c);
    if (!src) { c.sound = { profile: { hasAudio: null }, notes: [], checks: [], noSource: true }; if (this.cur === c.id) this.render(); return; }
    c._listening = true;
    let prof; try { prof = await audioProfile(src, f => { c._listenPct = f; const m = this.el.querySelector('.chm-panel .chm-muted'); if (m && this.cur === c.id && this.tab === 'sound') m.textContent = `Listening to the soundtrack… ${Math.round(f * 100)}%`; }); }
    catch (e) { prof = { hasAudio: false, reason: 'The soundtrack could not be read.' }; }
    c._listening = false; c.sound = Object.assign({ profile: prof }, soundNotes(prof, c.transcript, this._ctx(c)));
    this._emit('listened', c.id); if (this.cur === c.id) this.render();
  }
  _soundHtml(c) {
    if (!c.sound) { this._listen(c); return `<p class="chm-muted">Listening to the soundtrack…${c._listenPct ? ' ' + Math.round(c._listenPct * 100) + '%' : ''}</p>`; }
    if (c.sound.noSource) return '<p class="chm-muted">Only frames of this video were given, so the sound cannot be heard. Pass the video file, or videoSrc, to check the sound.</p>';
    const p = c.sound.profile, s1 = v => v == null ? '—' : (Math.round(v * 10) / 10) + ' s', pct = v => Math.round((v || 0) * 100) + '%';
    const tr = c.transcript, canT = !!this.o.transcribe && this._can('ai');
    const facts = p.hasAudio ? [['Sound', 'Yes'], ['Loudness', p.loudness != null && isFinite(p.loudness) ? `${p.loudness < -20 ? 'Too quiet' : p.loudness > -9 ? 'Too loud' : 'Good'} (${p.loudness} LUFS; Instagram and Facebook play at about -14)` : '—'], ['Distortion', p.clipped > 0.001 ? 'Yes: the sound clips at full volume' : 'None'], ['First sound', s1(p.firstSoundAt)],
      ['Voice', p.firstVoiceAt == null ? 'Not heard' : 'From ' + s1(p.firstVoiceAt)], ['Mix', `voice ${pct(p.voiceShare)} · music or other sound ${pct(p.musicShare)} · silence ${pct(p.silentShare)}`]]
      : [['Sound', p.reason || 'None']];
    return `<div class="chm-sound">
      <dl class="chm-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${p.hasAudio ? `<canvas class="chm-sound-cv" role="img" aria-label="Loudness over time, with voice, music and silent parts marked"></canvas>
        <p class="chm-legend"><span><i class="chm-l-voice"></i>Voice</span><span><i class="chm-l-music"></i>Music</span><span><i class="chm-l-sil"></i>Silence</span> <span class="chm-small">Voice is found by a speech-detection network (Silero VAD) run in your browser; it hears a voiceover over music too. "Music" here means any other sound.</span></p>` : ''}
      <section><h3>Voiceover</h3>
        ${tr && tr.text ? `${(c.sound.checks || []).length ? `<div class="chm-chips">${c.sound.checks.map(x => `<span class="chm-pill ${x.ok ? 'chm-ok' : 'chm-bad'}">${x.ok ? '✓' : '✗'} ${esc(x.label)}</span>`).join('')}</div>` : ''}
            <blockquote class="chm-transcript">${esc(tr.text)}</blockquote>${tr.language ? `<p class="chm-small">Language: ${esc(tr.language)}</p>` : ''}`
          : p.hasAudio && p.firstVoiceAt == null ? '<p class="chm-small">No voice was heard to transcribe.</p>'
          : canT ? '<p class="chm-small">Transcribe the voiceover to check that it names the project, location and price and asks for a site visit.</p>'
          : '<p class="chm-small">To check the script, connect a speech-to-text service (the transcribe option; see the README).</p>'}
        ${canT && p.hasAudio !== false ? `<button type="button" class="chm-btn" data-chm="transcribe" ${this.trState === 'busy' ? 'disabled' : ''}>${this.trState === 'busy' ? 'Transcribing…' : tr ? 'Transcribe again' : 'Transcribe voiceover'}</button>` : ''}
        ${this.trState && this.trState !== 'busy' ? `<p class="chm-err" role="alert">${esc(this.trState)}</p>` : ''}</section>
      ${c.sound.notes.length ? `<section><h3>Suggestions on the sound</h3><ol class="chm-sugs">${c.sound.notes.map(t => `<li>${esc(t)}</li>`).join('')}</ol></section>` : ''}
    </div>`;
  }
  _paintSound(c) {
    const cv = this.el.querySelector('.chm-sound-cv'); if (!cv || !c.sound || !c.sound.profile.hasAudio) return;
    const p = c.sound.profile, W = Math.max(280, Math.min(900, cv.parentElement.clientWidth || 600)), H = 90; cv.width = W; cv.height = H;
    const x = cv.getContext('2d'), cs = getComputedStyle(this.el), col = n => cs.getPropertyValue(n).trim();
    const fill = { voice: col('--chm-accent'), music: col('--chm-warn'), silence: col('--chm-line') };
    x.clearRect(0, 0, W, H);
    p.segments.forEach(sg => { x.globalAlpha = 0.18; x.fillStyle = fill[sg.type]; x.fillRect(sg.t0 / p.duration * W, 0, (sg.t1 - sg.t0) / p.duration * W, H - 14); });
    x.globalAlpha = 1; const n = p.envelope.length, y = v => (H - 16) - Math.max(0, Math.min(1, (v + 60) / 60)) * (H - 20);
    p.segments.forEach(sg => { x.strokeStyle = fill[sg.type]; x.lineWidth = 2; x.beginPath();
      for (let k = Math.floor(sg.t0 * 10); k < Math.min(n, Math.ceil(sg.t1 * 10)); k++) { const px = (k + 0.5) / n * W; if (k === Math.floor(sg.t0 * 10)) x.moveTo(px, y(p.envelope[k])); else x.lineTo(px, y(p.envelope[k])); } x.stroke(); });
    x.fillStyle = col('--chm-muted'); x.font = '11px system-ui,sans-serif';
    for (let t = 0; t <= p.duration; t += p.duration > 40 ? 10 : 5) x.fillText(t + ' s', Math.min(W - 24, t / p.duration * W + 2), H - 2);
    x.strokeStyle = col('--chm-bad'); x.setLineDash([4, 3]); x.beginPath(); x.moveTo(3 / p.duration * W, 0); x.lineTo(3 / p.duration * W, H - 14); x.stroke(); x.setLineDash([]);
  }
  async _transcribe() {
    const c = this._item(this.cur), t = this.o.transcribe; if (!c || !t || !this._can('ai') || this.trState === 'busy') return;
    const src = this._soundSrc(c); if (!src) return;
    this.trState = 'busy'; this.render(); let res = null, err = '';
    try {
      const wav = await audioWav(src);
      if (typeof t === 'function') res = await t(wav, c);
      else if (t.endpoint) {
        const r = await fetch(t.endpoint, { method: 'POST', credentials: 'same-origin', headers: Object.assign({ 'Content-Type': 'audio/wav' }, t.headers || {}), body: wav });
        const j = await r.json().catch(() => ({})); if (!r.ok) err = j.error || 'Transcription is not available right now.'; else res = j.result;
      }
    } catch (e) { err = 'The voiceover could not be transcribed. Try again.'; }
    if (res && typeof res.text === 'string') { c.transcript = res; this.trState = '';
      const seg = (res.segments || []).find(x => x && x.text && String(x.text).trim());   // the transcript's timings are exact: prefer them to the loudness estimate
      if (seg && c.sound && c.sound.profile && c.sound.profile.hasAudio && seg.start != null) c.sound.profile.firstVoiceAt = Math.round(seg.start * 10) / 10; if (c.sound) Object.assign(c.sound, soundNotes(c.sound.profile, res, this._ctx(c))); this._emit('transcribed', c.id); }
    else this.trState = err || 'The transcription came back empty.';
    this.render();
  }

  async _paint() {
    const c = this._item(this.cur); if (!c || (this.view === 'learning' && this._learnOn())) return; const f = this.frame || 0;
    const had = this.cache.has(this._key(c, f));
    let a; try { a = await this._analyse(c, f); } catch (e) { this._note('This image could not be read.'); return; }
    if (this.cur !== c.id || (this.frame || 0) !== f) return;
    if (!had) { this.render(); return; }    // first reading: redraw with scores
    const ai = this._ai(c, f);
    if (c.kind === 'carousel' && !this._allRead(c)) { this._readAll(c); }
    if (c.kind === 'video' && !this._allFrames(c)) { this._readFrames(c); }
    if (c.kind === 'video' && !c.sound && c.file) this._listen(c);
    const cv = this.el.querySelector('.chm-canvas');
    if (cv) {
      const box = cv.parentElement.clientWidth || 420, vw = Math.max(200, Math.min(460, box)), vh = Math.round(vw * a.display.h / a.display.w);
      if (cv.width !== vw) { cv.width = vw; cv.height = vh; }
      paintView(cv, a.display.c, a.map, this.mode, a.peaks, this.boxes ? elementsInView(ai, a) : null);
    }
    if (this.tab === 'sound') this._paintSound(c);
    if (this.tab === 'rera') this._paintRera(c, f, a);
    if (this.tab === 'phone') this._paintPhone(c, f, a);
    if (this.gen) await this._paintGen(c, a, ai); else if (this.ideas) await this._paintIdeas(c, a, ai);
  }

  async _paintGen(c, a, ai) {
    const gv = this.el.querySelector('.chm-gen-canvas'); if (!gv) return; const g = this.gen;
    let hero = a.img, hc = heroRect(a, ai);
    if (g.imgSrc) { try { hero = await loadImage(g.imgSrc); hc = null; } catch (e) { /* keep original */ } }
    await this._loadQr(g);
    const boxes = drawCreative(gv, hero, hc, g), r = scoreCanvas(gv, boxes);
    gv.style.aspectRatio = gv.width + ' / ' + gv.height;
    const gh = this.el.querySelector('.chm-gen-heat');
    if (gh) { gh.width = Math.round(gv.width / 4); gh.height = Math.round(gv.height / 4); gh.style.aspectRatio = gh.width + ' / ' + gh.height; paintView(gh, gv, r.map, 'heat', r.peaks, null); }
    const els = elementsInView(ai, a), before = t => { const e = els.filter(x => x.type === t); return e.length ? e.reduce((s, x) => s + shareIn(a.map, x.cbox), 0) : null; };
    const rows = [['Overall', a.scores.overall, r.scores.overall], ['Focus', a.scores.focus, r.scores.focus], ['Clutter (lower is better)', a.scores.clutter, r.scores.clutter], ['Contrast', a.scores.contrast, r.scores.contrast]]
      .map(([n, x, y]) => `<tr><td>${n}</td><td>${x}</td><td><strong>${y}</strong></td></tr>`).join('')
      + [['price', 'price'], ['headline', 'headline'], ['cta', 'call to action']].map(([k, n]) => { const x = before(k), y = r.share(k);
        return `<tr><td>Attention on ${n}</td><td>${x == null ? (els.length ? 'not shown' : '—') : Math.round(x * 100) + '%'}</td><td><strong>${y == null ? '—' : Math.round(y * 100) + '%'}</strong></td></tr>`; }).join('');
    const cmp = this.el.querySelector('.chm-cmp');
    if (cmp) cmp.style.minHeight = cmp.offsetHeight + 'px';
    if (cmp) cmp.innerHTML = `<table class="chm-table"><thead><tr><th>Predicted</th><th>Original</th><th>New version</th></tr></thead><tbody>${rows}</tbody></table>${this._genRera(c, g, boxes)}`;
  }

  async _runAI(fi, quiet) {
    const c = this._item(this.cur); if (!c || !this.o.ai) return false; const f = fi == null ? (this.frame || 0) : fi;
    const a = await this._analyse(c, f); const ctx = this._ctx(c);
    const pr = c.perf && c.perf.row ? (() => { const x = c.perf.row, r = funnelRates(x); return `spend ${Math.round(x.spend)}, leads ${Math.round(x.leads)}${x.ql != null ? `, qualified leads ${Math.round(x.ql)}` : ''}${x.sv != null ? `, site visits ${Math.round(x.sv)}` : ''}${r.ctr != null ? `, CTR ${(r.ctr * 100).toFixed(2)}%` : ''}`; })() : '';
    const prompt = aiPrompt(Object.assign({ title: c.kind === 'carousel' ? `${c.name} · ${c.cards[f].name}` : c.name, results: pr, transcript: c.transcript && c.transcript.text }, ctx,
      c.kind === 'video' ? { frame: { t: c.frames[f].t, duration: c.duration } } : c.kind === 'carousel' ? { card: { n: f + 1, of: c.cards.length } } : {}));
    const image = imageDataURL(a.img);
    if (!quiet) { this.aiState = 'busy'; this.render(); }
    let res = null, err = '';
    try {
      if (typeof this.o.ai.read === 'function') res = await this.o.ai.read({ prompt, image, creative: c, frame: f });
      else if (this.o.ai.endpoint) {
        const r = await fetch(this.o.ai.endpoint, { method: 'POST', credentials: 'same-origin', headers: Object.assign({ 'Content-Type': 'application/json' }, this.o.ai.headers || {}), body: JSON.stringify({ prompt, image }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) err = j.error || 'The AI reading is not available right now.'; else res = j.result;
      }
    } catch (e) { err = (e && e.userMessage) || 'The AI reading could not be completed. Try again.'; }
    if (res && typeof res === 'object' && Array.isArray(res.elements)) {
      this._setAi(c, f, Object.assign({ at: new Date().toISOString() }, res)); if (!quiet) this.aiState = ''; (this.gen = null, this.ideas = null);
      if (this.o.onAIResult) try { this.o.onAIResult(c, this._ai(c, f), f); } catch (e) { console.error(e); }
      if (f === 0 || c.kind !== 'carousel') this._learnChanged();
      if (!quiet) this.render(); return true;
    }
    this.aiState = err || 'The AI reply could not be read. Try again.'; this.render(); return false;
  }
  async _runAIAll() {
    const c = this._item(this.cur); if (!c || c.kind !== 'carousel' || this.aiAll) return;
    const todo = c.cards.map((k, i) => i).filter(i => !c.cards[i].ai);
    for (let j = 0; j < todo.length; j++) {
      this.aiAll = `Reading card ${todo[j] + 1} (${j + 1} of ${todo.length})…`; this.aiState = ''; this.render();
      if (!(await this._runAI(todo[j], true))) break;
    }
    this.aiAll = ''; this.render();
  }
  async _feed() {
    const pf = this.o.performanceFeed; if (!pf) return null;
    if (!this._feedP) this._feedP = (async () => {
      let j = pf.rows ? { rows: pf.rows, average: pf.average } : await (await fetch(pf.url, { credentials: pf.credentials || 'same-origin', headers: pf.headers || {} })).json();
      if (Array.isArray(j)) j = { rows: j };
      return { rows: (j.rows || []).map(r => Object.assign(toFunnel(r), { raw: r })), average: j.average ? toFunnel(j.average) : null };
    })().catch(e => { this._feedP = null; throw e; });
    return this._feedP;
  }
  async _loadPerf(c) {
    if (c.perf || c._perfLoading) return; c._perfLoading = true;
    try {
      if (this.o.performance) {
        const r = await this.o.performance(c);
        if (r && (r.leads != null || r.spend != null)) c.perf = { row: toFunnel(r), avg: r.average ? toFunnel(r.average) : null };
        else if (r && r.cost) c.perf = { legacy: r };
        else c.perf = { none: true };
      } else if (this.o.performanceFeed) {
        const fd = await this._feed(), row = c.perfName ? fd.rows.find(x => x.name === c.perfName) : (c.perfName === '' ? null : matchRow(fd.rows, c.name));
        c.perf = { row: row || null, avg: fd.average || sumFunnel(fd.rows.map(x => x.raw)), rows: fd.rows };
      } else c.perf = { none: true };
    } catch (e) { c.perf = { error: 'Performance could not be loaded from the dashboard.' }; }
    c._perfLoading = false; if (c.perf && c.perf.row) this._learnChanged(); if (this.cur === c.id && this.view !== 'learning') this.render();
  }
  _perfLegacy(c) {
    const p = c.perf; if (!p) return null; if (p.legacy) return p.legacy;
    if (!p.row || !p.avg) return null; const r = funnelRates(p.row), a = funnelRates(p.avg);
    return r.cpql && a.cpql ? { cost: r.cpql, avgCost: a.cpql, metric: 'CPQL' } : r.cpl && a.cpl ? { cost: r.cpl, avgCost: a.cpl, metric: 'CPL' } : null;
  }
  _perfHtml(c) {
    const p = c.perf; if (!p || p.none || p.legacy) return '';
    if (p.error) return `<section><h3>Performance</h3><p class="chm-err">${esc(p.error)}</p></section>`;
    const inr = n => n == null ? '—' : '₹' + Math.round(n).toLocaleString('en-IN'), int = n => n == null ? '—' : Math.round(n).toLocaleString('en-IN'), pc = v => v == null ? '—' : (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
    const pick = p.rows ? `<label class="chm-match">Ad in the dashboard <select data-chm="perfpick"><option value="">Not matched</option>${p.rows.map(r => `<option value="${esc(r.name)}" ${p.row && p.row.name === r.name ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>` : '';
    if (!p.row) return `<section><h3>Performance</h3>${pick}<p class="chm-small">No performance row matched this creative. Choose its ad above.</p></section>`;
    const fn = funnelNotes(p.row, p.avg), open = this.openStep === undefined ? fn.stage : this.openStep;
    const chip = st => st.status === 'missing' ? '<span class="chm-pill">No data</span>' : st.status === 'early' ? '<span class="chm-pill">Too early</span>' : st.status === 'na' ? '<span class="chm-pill">Not measurable</span>'
      : st.ratio == null ? '' : st.status === 'below' ? `<span class="chm-pill chm-bad">${Math.round((1 - st.ratio) * 100)}% below</span>` : st.status === 'above' ? `<span class="chm-pill chm-ok">${Math.round((st.ratio - 1) * 100)}% above</span>` : '<span class="chm-pill">On par</span>';
    const steps = fn.steps.map((st, i) => {
      const isOpen = open === st.key, bar = st.ratio == null ? '' : `<span class="chm-vs" aria-hidden="true"><i style="width:${Math.min(100, st.ratio * 50)}%"></i></span>`;
      return `<li class="chm-step chm-st-${st.status}${isOpen ? ' chm-open' : ''}">
        <button type="button" class="chm-step-h" data-chm="step" data-v="${st.key}" aria-expanded="${isOpen}">
          <span class="chm-step-n">${i + 1}</span><span class="chm-step-l">${esc(st.label)}</span>
          <span class="chm-step-v"><strong>${pc(st.rate)}</strong><small>${st.rate == null ? '' : `${int(st.to)} of ${int(st.from)}`}</small></span>
          <span class="chm-step-a">avg ${pc(st.avgRate)}</span>${bar}${chip(st)}</button>
        ${isOpen ? `<div class="chm-step-d">${st.note ? `<p>${esc(st.note)}</p>` : '<p class="chm-small">In line with the average.</p>'}
          <p class="chm-small">${esc(st.costLabel)}: <strong>${inr(st.cost)}</strong> (average ${inr(st.avgCost)})</p></div>` : ''}</li>`;
    }).join('');
    const other = fn.notes.filter(t => !fn.steps.some(st => st.note === t));
    return `<section class="chm-perf"><h3>From seeing the ad to visiting the site</h3>${pick}
      <ol class="chm-funnel">${steps}</ol>
      <p class="chm-small">Spend ${inr(p.row.spend)} · ${int(p.row.impressions)} impressions · ${int(p.row.clicks)} clicks · ${int(p.row.leads)} leads · ${int(p.row.ql)} qualified leads · ${int(p.row.sv)} site visits${p.avg ? ` · compared with all ads (${inr(p.avg.spend)} spend)` : ''}</p>
      ${fn.good.length ? `<ul class="chm-good">${fn.good.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${other.length ? `<ul class="chm-sugs">${other.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${fn.stage ? `<p class="chm-small">The weakest step is ${fn.steps.findIndex(s => s.key === fn.stage) + 1}: the ideas under Ideas are chosen to fix it.</p>` : ''}</section>`;
  }
  _ideaOpts(c, f, a) {
    const ai = this._ai(c, f), els = a ? elementsInView(ai, a) : [], p = c.perf;
    return { ai, size: this.ideaSize || 'port', offset: this.ideaOff || 0,
      stage: p && p.row ? funnelNotes(p.row, p.avg).stage : null,
      issues: { noPrice: !!ai && !els.some(e => e.type === 'price'), noCta: !!ai && !els.some(e => e.type === 'cta'), cluttered: !!a && a.scores.clutter > 65 } };
  }
  _ideasHtml(c, f) {
    const a0 = this.cache.get(this._key(c, f));
    if (!this.ideas && a0 && this._can('versions')) { try { const o = this._ideaOpts(c, f, a0); o.exclude = []; this.ideas = ideas(this._ctx(c), o); this.ideaSeen = this.ideas.map(it => it.id); this.gen = null; } catch (e) { /* the button below still works */ } }
    const g = this.gen, list = this.ideas;
    const head = `<div class="chm-gen-h"><div><h3>New versions${c.kind === 'carousel' ? ` · card ${f + 1}` : ''}</h3><p class="chm-small">${list ? 'Each takes a different angle, layout and colour, and gets the same attention score. Open one to change its text, colours and size, then download it.' : `Ideas built from ${c.kind === 'video' ? 'this frame, ' : c.kind === 'carousel' ? 'this card, ' : ''}the project details${this._ai(c, f) ? ', the AI reading' : ''}${c.perf && c.perf.row ? ' and where this creative leaks in the funnel' : ''}.`}</p></div>
      <div class="chm-actions" style="margin:0">${list && !g ? `<label class="chm-match">Size <select data-chm="ideasize">${Object.entries(SIZES).map(([k, v]) => `<option value="${k}" ${(this.ideaSize || 'port') === k ? 'selected' : ''}>${v[2]}</option>`).join('')}</select></label><button type="button" class="chm-btn" data-chm="moreideas">Show different versions</button>` : ''}
        ${list ? '' : '<button type="button" class="chm-btn chm-primary" data-chm="ideas">Show creative ideas</button>'}</div></div>`;
    if (!list) return head;
    if (g) return head + `<p><button type="button" class="chm-link" data-chm="backideas">← All ideas</button> · Editing <strong>${esc(this.genIdea ? this.genIdea.angle : 'new version')}</strong></p>` + this._editorHtml(g);
    return head + `<div class="chm-ideas">${list.map((it, i) => `<article class="chm-idea">
        <canvas class="chm-idea-cv" data-i="${i}" role="img" aria-label="Idea: ${esc(it.angle)}"></canvas>
        <div class="chm-idea-b"><strong>${esc(it.angle)}</strong>${it.source === 'ai' ? ' <span class="chm-chip">AI idea</span>' : ''}
          <div class="chm-chips"><span class="chm-chip">${esc(LAYOUTS[it.g.layout])}</span><span class="chm-chip"><i class="chm-sw" style="background:${(PALETTES[it.g.palette] || {}).accent || '#999'}"></i>${esc((PALETTES[it.g.palette] || {}).label || '')}</span></div>
          <p class="chm-small">${esc(it.why)}</p>${it.visual ? `<p class="chm-small"><strong>Photo:</strong> ${esc(it.visual)}</p>` : ''}${it.check ? `<p class="chm-small"><strong>Check:</strong> ${esc(it.check)}</p>` : ''}
          <div class="chm-idea-m" data-i="${i}"></div>
          <div class="chm-actions"><button type="button" class="chm-btn chm-primary" data-chm="editidea" data-v="${i}">Open and edit</button><button type="button" class="chm-btn" data-chm="ideadl" data-v="${i}">Download</button></div></div></article>`).join('')}</div>`;
  }
  _editorHtml(g) {
    return `<div class="chm-gen-grid"><div class="chm-form">
            ${[['eyebrow', 'Top line'], ['headline', 'Headline'], ['sub', 'Location line'], ['price', 'Price line (e.g. 2 BHK from ₹1.15 Cr*)'], ['chips', 'Configurations, comma-separated'], ['features', 'Feature points, comma-separated'], ['stops', 'Travel times (e.g. 5 min Metro, 20 min BKC)'], ['offer', 'Offer (only a real one)'], ['cta', 'Call to action'], ['dev', 'Developer / brand'], ['rera', 'RERA registration no.']]
              .map(([k, l]) => `<label>${l}<input data-chm-gen="${k}" value="${esc(Array.isArray(g[k]) ? g[k].join(', ') : (g[k] || ''))}"></label>`).join('')}
            <label>Design<select data-chm-gen="layout">${Object.entries(LAYOUTS).map(([k, l]) => `<option value="${k}" ${g.layout === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
            <label>Colours<select data-chm-gen="palette">${Object.entries(PALETTES).map(([k, v]) => `<option value="${k}" ${(g.palette || 'auto') === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
            <label>Accent colour (optional)<input type="color" data-chm-gen="accent" value="${/^#[0-9a-f]{6}$/i.test(g.accent || '') ? g.accent : '#c9a24b'}"></label>
            <label>Size<select data-chm-gen="size">${Object.entries(SIZES).map(([k, v]) => `<option value="${k}" ${g.size === k ? 'selected' : ''}>${v[2]} · ${v[0]}×${v[1]}</option>`).join('')}</select></label>
            <label>Use a different image (optional)<input type="file" accept="image/*" data-chm="genimg"></label>
            ${g.reraSpec && g.reraSpec.qr ? `<label>Project QR code from the ${esc(g.reraSpec.authority)} portal${g.reraQr ? ' (added)' : ''}<input type="file" accept="image/*" data-chm="genqr"></label>` : ''}</div>
          <div class="chm-gen-prev"><canvas class="chm-gen-canvas" role="img" aria-label="New creative preview"></canvas>
            <div><canvas class="chm-gen-heat" role="img" aria-label="Predicted attention on the new creative"></canvas><p class="chm-small">Predicted attention on the new version</p></div></div>
          <div class="chm-cmp"></div></div>
          <div class="chm-actions"><button type="button" class="chm-btn chm-primary" data-chm="download">Download PNG</button>${this.o.onSave && this._can('save') ? '<button type="button" class="chm-btn" data-chm="save">Save new version</button>' : ''}<button type="button" class="chm-btn" data-chm="reset">Reset text</button></div>
          <p class="chm-small">The hero image is cropped around the area that draws the most attention. Check the price, RERA number and offer text before the ad goes live.</p>`;
  }
  async _loadQr(g) {
    if (!g || !g.reraQr || g.reraQrImg) return; this._qrImgs = this._qrImgs || new Map();
    if (!this._qrImgs.has(g.reraQr)) this._qrImgs.set(g.reraQr, loadImage(g.reraQr).catch(() => null));
    g.reraQrImg = await this._qrImgs.get(g.reraQr);
  }
  /** RERA line for a drawn new version: what is in place, what still needs adding. */
  _genRera(c, g, boxes) {
    if (!this._can('compliance') || !g.reraSpec) return '';
    const sp = g.reraSpec, cfg = this._rcfg(), txt = (k, t) => boxes[k] ? [{ type: k === 'rera' ? 'rera' : 'other_text', text: t, cbox: boxes[k] }] : [];
    const els = [].concat(txt('rera', `${g.rera || ''} ${sp.website || ''} ${sp.permit ? 'Permit ' + sp.permit : ''}`), txt('headline', g.headline), txt('price', g.price), txt('offer', g.offer), txt('cta', g.cta),
      [{ type: 'other_text', text: [g.sub, g.eyebrow, [].concat(g.features || []).join(' '), [].concat(g.stops || []).join(' '), /\*/.test(String(g.price || '') + String(g.offer || '')) && !sp.bans.includes('tnc-disclaimer') ? '*T&C apply' : ''].join(' '), cbox: [0, 0.9, 0.5, 0.02] }],
      boxes.qr && !boxes.qrPlaceholder ? [{ type: 'qr', cbox: boxes.qr }] : []);
    const res = checkRera({ region: this._rst(c).region || cfg.region || null, medium: this._rst(c).medium || cfg.medium || 'social', kind: 'image', elements: els, qr: [], ctx: Object.assign({}, this._ctx(c), { rera: g.rera }), rules: cfg.rules });
    const bad = res.items.filter(i => i.status === 'fail' && i.id !== 'size').map(i => i.id === 'qr' && boxes.qrPlaceholder ? `Add the project's QR image from the ${sp.authority} portal (Project QR code below): a placeholder is drawn now.` : `${i.label}: ${i.fix || i.detail}`);
    return `<p class="chm-small"><strong>RERA (${esc(res.rule.authority)}):</strong> ${bad.length ? esc(bad.join(' ')) : `registration number, website${sp.qr ? ' and QR code' : ''} in the top-right block.`}</p>`;
  }
  async _paintIdeas(c, a, ai) {
    const cvs = [...this.el.querySelectorAll('.chm-idea-cv')]; if (!cvs.length || !this.ideas) return;
    let hero = a.img, hc = heroRect(a, ai); const res = [];
    for (const cv of cvs) {
      const i = +cv.dataset.i, it = this.ideas[i]; if (!it) continue;
      if (cv.dataset.done !== it.g.size) {
        await new Promise(r => setTimeout(r, 0));   // keep the page responsive between ideas
        if (!cv.isConnected) return;
        await this._loadQr(it.g); it.boxes = drawCreative(cv, hero, hc, it.g); it.r = scoreCanvas(cv, it.boxes); cv.dataset.done = it.g.size; cv.style.aspectRatio = cv.width + ' / ' + cv.height;
      }
      res.push([i, it]);
    }
    const ps = res.map(([, it]) => it.r.share('price') || 0), os = res.map(([, it]) => it.r.scores.overall);
    const top = (arr, gap) => { const m = Math.max(...arr), next = Math.max(...arr.filter(v => v !== m), -1); return arr.filter(v => v === m).length === 1 && m - next >= gap ? m : null; };
    const bestO = top(os, 2), bestP = top(ps, 0.03);
    res.forEach(([i, it]) => {
      const m = this.el.querySelector(`.chm-idea-m[data-i="${i}"]`); if (!m) return; const p = it.r.share('price');
      m.innerHTML = `<p class="chm-idea-s">Attention score <strong>${it.r.scores.overall}</strong>${it.r.scores.overall === bestO && res.length > 1 ? ' <span class="chm-best">Highest</span>' : ''} · the price gets ${p == null ? '—' : Math.round(p * 100) + '%'} of the attention${p != null && p === bestP && res.length > 1 ? ' <span class="chm-best">Best price focus</span>' : ''}</p>`
        + ideaNotes(it.r, it.g, a.scores).map(t => `<p class="chm-small">· ${esc(t)}</p>`).join('');
    });
  }
  _frameLabel(c, i) {
    const fr = c.frames[i]; if (!fr) return '';
    return fr.label || `${['Hook', 'Early', 'Middle'][i] || 'Frame ' + (i + 1)} · ${fr.t.toFixed(1)} s`;
  }
  _allFrames(c) { return c.frames.every((x, i) => this.cache.has(this._key(c, i))); }
  async _readFrames(c) {
    if (this._readingV === c.id) return; this._readingV = c.id;
    try { for (let i = 0; i < c.frames.length; i++) { if (!this.cache.has(this._key(c, i))) { await this._analyse(c, i); if (this.cur === c.id && this.tab === 'attention') this._paintFrameScores(c); } } } catch (e) { /* a frame that cannot be read shows its own error */ }
    this._readingV = null; if (this.cur === c.id) this.render();
  }
  _paintFrameScores(c) {   // fill in each moment's score as it is read, without redrawing the panel
    if (!this.el.querySelector('.chm-vline')) return;
    this.el.querySelectorAll('[data-chm=frame]').forEach(b => { const i = +b.dataset.v, x = this.cache.get(this._key(c, i)); if (x && !b.querySelector('strong')) b.insertAdjacentHTML('beforeend', ` · <strong>${x.scores.overall}</strong>`); });
  }
  _frameSeries(c) { return c.frames.map((fr, i) => ({ t: fr.t, label: this._frameLabel(c, i), scores: this.cache.get(this._key(c, i)).scores })); }
  _videoHtml(c, f) {
    if (!this._allFrames(c)) return `<section><h3>Attention across the video</h3><p class="chm-muted">Reading ${c.frames.length} moments of the video…</p></section>`;
    const ser = this._frameSeries(c), notes = videoNotes(ser), W = 640, H = 120, pad = 24, dur = c.duration || ser[ser.length - 1].t || 1;
    const x = t => pad + (W - 2 * pad) * (t / dur), y = v => H - 22 - (H - 40) * v / 100;
    const line = ser.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.scores.overall).toFixed(1)}`).join(' ');
    const best = Math.max(...ser.map(p => p.scores.overall)), worst = Math.min(...ser.map(p => p.scores.overall)), bestI = ser.findIndex(p => p.scores.overall === best);
    const svg = `<svg class="chm-vline" viewBox="0 0 ${W} ${H}" role="img" aria-label="Overall attention score at each moment of the video, from ${worst} to ${best}">
      <line x1="${pad}" x2="${W - pad}" y1="${y(50)}" y2="${y(50)}" class="chm-vgrid"/><text x="${pad}" y="${y(50) - 4}" class="chm-vt">50</text>
      <path d="${line}" class="chm-vpath"/>${ser.map((p, i) => `<g><circle cx="${x(p.t).toFixed(1)}" cy="${y(p.scores.overall).toFixed(1)}" r="${i === f ? 6 : 4}" class="chm-vdot${i === f ? ' chm-vcur' : ''}"><title>${esc(p.label)}: ${p.scores.overall}</title></circle>
        ${p.scores.overall === best || p.scores.overall === worst || i === f ? `<text x="${x(p.t).toFixed(1)}" y="${(y(p.scores.overall) - 9).toFixed(1)}" text-anchor="middle" class="chm-vt chm-vtb">${p.scores.overall}</text>` : ''}</g>`).join('')}
      <text x="${pad}" y="${H - 4}" class="chm-vt">0 s</text><text x="${W - pad}" y="${H - 4}" text-anchor="end" class="chm-vt">${dur.toFixed(1)} s</text></svg>`;
    return `<section class="chm-carousel"><h3>Attention through the video · ${ser.length} moments</h3>${svg}
      <div class="chm-scroll"><table class="chm-table"><thead><tr><th>Moment</th><th>Attention</th><th>Clear focus</th><th>Busy-ness</th><th>Stands out</th></tr></thead><tbody>
      ${ser.map((p, i) => `<tr${i === f ? ' class="chm-cur"' : ''}><td><button type="button" class="chm-link" data-chm="frame" data-v="${i}">${esc(p.label)}</button>${i === bestI && ser.length > 1 ? ' <span class="chm-best">Strongest</span>' : ''}</td><td><strong>${p.scores.overall}</strong></td><td>${p.scores.focus}</td><td>${p.scores.clutter}</td><td>${p.scores.contrast}</td></tr>`).join('')}
      </tbody></table></div>
      ${notes.length ? `<p class="chm-small">${notes.length} suggestion${notes.length > 1 ? 's' : ''} about the sequence in the Suggestions tab.</p>` : ''}</section>${this._pacingHtml(c)}`;
  }
  _allRead(c) { return c.cards.every((k, i) => this.cache.has(this._key(c, i))); }
  async _readAll(c) {
    if (this._reading === c.id) return; this._reading = c.id;
    try { for (let i = 0; i < c.cards.length; i++) await this._analyse(c, i); } catch (e) { /* a card that cannot be read shows its own error */ }
    this._reading = null; if (this.cur === c.id) this.render();
  }
  _cardTabs(c, f) {
    const n = c.cards.length;
    return `<div class="chm-cards" role="group" aria-label="Carousel cards">${c.cards.map((k, i) => `<button type="button" class="chm-card" data-chm="frame" data-v="${i}" aria-pressed="${f === i}" title="${esc(k.name)}"><img src="${esc(k.src)}" alt=""><span>Card ${i + 1}</span></button>`).join('')}</div>
      ${this._can('edit') ? `<div class="chm-tabs"><button type="button" class="chm-tab" data-chm="cardmove" data-v="-1" ${f === 0 ? 'disabled' : ''} aria-label="Move card ${f + 1} earlier">← Earlier</button>
        <button type="button" class="chm-tab" data-chm="cardmove" data-v="1" ${f === n - 1 ? 'disabled' : ''} aria-label="Move card ${f + 1} later">Later →</button>
        ${f > 0 ? `<button type="button" class="chm-tab" data-chm="cardfirst">Make first card</button>` : ''}
        ${n > 1 ? `<button type="button" class="chm-link" data-chm="carddrop">Remove card</button>` : ''}</div>` : ''}`;
  }
  _carouselHtml(c, f) {
    if (!this._allRead(c)) return '<section><h3>Carousel</h3><p class="chm-muted">Reading all cards…</p></section>';
    const cards = c.cards.map((k, i) => ({ a: this.cache.get(this._key(c, i)), ai: k.ai, name: k.name })), res = carouselNotes(cards);
    const anyAI = cards.some(x => x.ai), yes = (x, t) => x.ai ? ((x.ai.elements || []).some(e => e.type === t) ? 'Yes' : '—') : '';
    return `<section class="chm-carousel"><h3>Carousel · ${c.cards.length} card${c.cards.length > 1 ? 's' : ''}</h3>
      <table class="chm-table"><thead><tr><th>Card</th><th>Overall</th><th>Focus</th><th>Clutter</th><th>Contrast</th>${anyAI ? '<th>Price</th><th>Call to action</th>' : ''}</tr></thead><tbody>
      ${cards.map((x, i) => `<tr${i === f ? ' class="chm-cur"' : ''}><td><button type="button" class="chm-link" data-chm="frame" data-v="${i}">Card ${i + 1}</button>${i === res.best && cards.length > 1 ? ' <span class="chm-best">Strongest</span>' : ''}</td><td><strong>${x.a.scores.overall}</strong></td><td>${x.a.scores.focus}</td><td>${x.a.scores.clutter}</td><td>${x.a.scores.contrast}</td>${anyAI ? `<td>${yes(x, 'price')}</td><td>${yes(x, 'cta')}</td>` : ''}</tr>`).join('')}
      </tbody></table>
      ${res.notes.length ? `<p class="chm-small">${res.notes.length} sequence suggestion${res.notes.length > 1 ? 's' : ''} in the Suggestions tab.</p>` : ''}
      ${this.o.ai && this._can('ai') && cards.some(x => !x.ai) ? `<button type="button" class="chm-btn" data-chm="aiall" ${this.aiAll ? 'disabled' : ''}>${this.aiAll ? esc(this.aiAll) : 'Read all cards with AI'}</button>` : ''}
    </section>`;
  }

  _onClick(e) {
    const el = e.target.closest('[data-chm]'); if (!el || !this.el.contains(el)) return;
    const k = el.dataset.chm, c = this._item(this.cur);
    if (k === 'pick') { this.view = 'creatives'; this.select(el.dataset.id); }
    else if (k === 'remove' && this._can('remove')) this.remove(el.dataset.id);
    else if (k === 'mode') { this.mode = el.dataset.v; this.el.querySelectorAll('[data-chm=mode]').forEach(b => b.setAttribute('aria-pressed', String(b === el))); this._paint(); }
    else if (k === 'frame') { this.frame = +el.dataset.v; (this.gen = null, this.ideas = null); this.aiState = ''; this.render(); }
    else if (k === 'ai' && this._can('ai')) this._runAI();
    else if (k === 'aiall' && this._can('ai')) this._runAIAll();
    else if (k === 'tab') { this.tab = el.dataset.v; this.render(); }
    else if (k === 'recmore' && this._recSt) { this._recSt.res = null; this.render(); }
    else if (k === 'recdraw' && c && this._recSt && this._recSt.res && this._can('versions')) { const it = this._recSt.res.concepts[+el.dataset.v]; if (it) this._drawIdea(c, it, 'Recommended idea ' + (+el.dataset.v + 1)); }
    else if (k === 'view') { this.view = el.dataset.v; this.render(); }
    else if (k === 'report' && c) this._report(c);
    else if (k === 'dbrief') {
      const i = +el.dataset.v, recs = this.libraryRecords().filter(r => r.metrics && (+r.metrics.spend || 0) > 0);
      if (el.dataset.src === 'learn' && this._lst && this._lst.res) { const st = this._lst, idea = st.res.concepts[i]; if (!idea) return;
        const facts = Object.assign({}, this._libFacts || {}, this._studioFacts());
        this._db = { idea, ctx: Object.assign({ project: st.proj }, facts[st.proj] || {}, this._briefs[st.proj] ? briefToContext(facts[st.proj] || {}, this._briefs[st.proj]) : {}), video: idea.combo.format === 'video', seconds: 15, effects: elementEffects(recs, { goal: st.goal }), goal: GOALS[st.goal].label, draw: 'ldraw', i, from: 'learn' };
        st.dbOpen = true; this.render(); }
      else if (c && this._recSt && this._recSt.res) { const idea = this._recSt.res.concepts[i]; if (!idea) return; const goal = this._recSt.goal || 'ql';
        this._db = { idea, ctx: Object.assign({}, (this._libFacts || {})[this._ctx(c).project] || {}, this._ctx(c)), video: idea.combo.format === 'video', seconds: 15, effects: elementEffects(recs, { goal }), goal: GOALS[goal].label, draw: 'recdraw', i, from: 'rec' };
        this.tab = 'dbrief'; this.render(); }
    }
    else if (k === 'dbback') { if (this._db && this._db.from === 'learn' && this._lst) this._lst.dbOpen = false; else this.tab = 'recommend'; this.render(); }
    else if (k === 'dbcopy' && this._db && this._db.built) { const t = briefText(this._db.built); Promise.resolve().then(() => navigator.clipboard.writeText(t)).then(() => this._note('Brief copied.'), () => this._note('Copying is blocked here. Use Download brief instead.')); }
    else if (k === 'dbdl' && this._db && this._db.built) { const b = this._db.built; this._save(new Blob([this._docWrap(b.title, briefHtml(b))], { type: 'text/html' }), `${b.title.replace(/[\\/:*?"<>|]+/g, ' ')} - brief.html`); }
    else if (k === 'bfadd' && this._bd) { this._bd.data.configs.push({ type: '', price: '' }); this.render(); }
    else if (k === 'bfdel' && this._bd) { this._bd.data.configs.splice(+el.dataset.v, 1); this.render(); }
    else if (k === 'bfsave' && c && this._can('edit')) this._saveBrief(c);
    else if (k === 'bfcancel') { this._bd = null; this.tab = 'summary'; this.render(); }
    else if (k === 'plmode' && c) { c.phone = c.phone || { modes: {} }; c.phone.modes[el.dataset.k] = el.dataset.v; this.render(); }
    else if (k === 'pldl' && c) this._plDownload(c, el.dataset.k);
    else if (k === 'qcai' && c && this._can('ai')) { if (c.kind === 'video') this._runAIFrames(c); else if (c.kind === 'carousel') this._runAIAll(); else this._runAI(); }
    else if (k === 'qccopy' && c && c._qc) { const t = qcReportText(c._qc, c.name); Promise.resolve().then(() => navigator.clipboard.writeText(t)).then(() => this._note('Report copied.'), () => this._note('Copying is blocked here. Select the report text instead.')); }
    else if (k === 'ldet' && this._lst) { this._lst.det = !el.parentElement.open; }
    else if (this._lst && ['lmore', 'ldraw', 'lcopy', 'lsort', 'lrow', 'lall'].includes(k)) {
      const st = this._lst;
      if (k === 'lmore') { st.res = null; this.render(); }
      else if (k === 'lall') { st.all = true; this.render(); }
      else if (k === 'lrow') { st.open = st.open === el.dataset.v ? null : el.dataset.v; this.render(); }
      else if (k === 'lsort') { st.tblOpen = true; const v = el.dataset.v; if (st.sort === v) st.dir = -st.dir; else { st.sort = v; st.dir = ['name', 'format'].includes(v) ? 1 : -1; } this.render(); }
      else if (k === 'lcopy' && st.res) { const it = st.res.concepts[+el.dataset.v]; if (!it) return; const t = this._briefText(it);
        Promise.resolve().then(() => navigator.clipboard.writeText(t)).then(() => this._note('Brief copied.'), () => this._note('Copying is blocked here. Select the text on the card instead.')); }
      else if (k === 'ldraw' && st.res && this._can('versions')) { const it = st.res.concepts[+el.dataset.v], item = this.items.find(x => this._ctx(x).project === st.proj); if (it && item) { this.select(item.id); this._drawIdea(item, it, 'Recommended idea ' + (+el.dataset.v + 1)); } }
    }
    else if (k === 'transcribe' && this._can('ai')) this._transcribe();
    else if (k === 'step') { const cur = this.openStep === undefined ? (c && c.perf && c.perf.row ? funnelNotes(c.perf.row, c.perf.avg).stage : null) : this.openStep; this.openStep = cur === el.dataset.v ? null : el.dataset.v; this.render(); }
    else if (k === 'cardmove' && c) { const f = this.frame || 0; this.moveCard(c.id, f, f + (+el.dataset.v)); }
    else if (k === 'cardfirst' && c) this.moveCard(c.id, this.frame || 0, 0);
    else if (k === 'carddrop' && c && c.cards.length > 1) { const f = this.frame || 0, [x] = c.cards.splice(f, 1); if (x.file) URL.revokeObjectURL(x.src); this.frame = Math.max(0, f - 1); (this.gen = null, this.ideas = null); this.render(); this._emit('changed', c.id); }
    else if (['ideas', 'moreideas', 'editidea', 'save'].includes(k) && !this._can(k === 'save' ? 'save' : 'versions')) return;
    else if (['cardmove', 'cardfirst', 'carddrop'].includes(k) && !this._can('edit')) return;
    else if ((k === 'ideas' || k === 'moreideas') && c) {
      if (k === 'ideas') this.ideaSeen = [];
      const f = this.frame || 0, o = this._ideaOpts(c, f, this.cache.get(this._key(c, f)));
      o.exclude = this.ideaSeen || []; this.ideas = ideas(this._ctx(c), o);
      if (this.ideas.every(it => o.exclude.includes(it.id))) this.ideaSeen = [];   // every angle shown: start the round again
      this.ideaSeen = (this.ideaSeen || []).concat(this.ideas.map(it => it.id)); this.gen = null; this.render();
    }
    else if (k === 'editidea' && this.ideas) { const it = this.ideas[+el.dataset.v]; this.genIdea = it; this.genBase = Object.assign({}, it.g); this.gen = Object.assign({}, it.g); this.render(); }
    else if (k === 'backideas') { this.gen = null; this.render(); }
    else if (k === 'ideadl' && this.ideas) { const cv = this.el.querySelector(`.chm-idea-cv[data-i="${el.dataset.v}"]`), it = this.ideas[+el.dataset.v]; if (cv && c) cv.toBlob(b => this._save(b, `${c.name} - ${it.angle} ${SIZES[it.g.size][2].split(' ')[0]}.png`), 'image/png'); }
    else if ((k === 'gen' || k === 'reset') && c) { const keep = this.gen; this.gen = Object.assign({}, this.genBase || defaults(this._ctx(c), this._ai(c, this.frame || 0))); if (k === 'reset' && keep) Object.assign(this.gen, { layout: keep.layout, size: keep.size, palette: keep.palette, accent: keep.accent, imgSrc: keep.imgSrc }); this.render(); }
    else if (k === 'download' || k === 'save') {
      const cv = this.el.querySelector('.chm-gen-canvas'); if (!cv || !c) return;
      const name = `${c.name}${c.kind === 'carousel' ? ' card ' + ((this.frame || 0) + 1) : ''} - ${this.genIdea ? this.genIdea.angle : 'new ' + this.gen.layout} ${SIZES[this.gen.size][2].split(' ')[0]}`;
      cv.toBlob(async b => {
        if (k === 'download') this._save(b, name + '.png');
        else { try { await this.o.onSave(b, { name, source: c, settings: Object.assign({}, this.gen) }); this._note('Saved.'); } catch (err) { this._note('Could not save: ' + (err && err.message || err)); } }
      }, k === 'download' ? 'image/png' : 'image/jpeg', 0.92);
    }
  }
  _onChange(e) {
    const el = e.target;
    if ((el.dataset.chm === 'file' || el.dataset.chm === 'carousel') && !this._can('upload')) return;
    if (el.dataset.chm === 'file' && el.files && el.files.length) { this.add(el.files); el.value = ''; }
    else if (el.dataset.chm === 'carousel' && el.files && el.files.length) { this.addCarousel(el.files); el.value = ''; }
    else if (el.dataset.chm === 'perfpick') { const c = this._item(this.cur); if (c) { c.perfName = el.value; c.perf = null; (this.gen = null, this.ideas = null); this._emit('matched', c.id); this._learnChanged(); this.render(); } }
    else if (el.dataset.chm === 'ideasize' && this.ideas) { this.ideaSize = el.value; this.ideas.forEach(it => { it.g.size = el.value; }); this.render(); }
    else if (el.dataset.chm === 'boxes') { this.boxes = el.checked; this._paint(); }
    else if (el.dataset.chm === 'rera-region' || el.dataset.chm === 'rera-medium') { const c = this._item(this.cur); if (c) { const st = this._rst(c); st[el.dataset.chm === 'rera-region' ? 'region' : 'medium'] = el.value; this.render(); } }
    else if (el.dataset.chm === 'rera-ok' && this._can('edit')) { const c = this._item(this.cur); if (c) { const st = this._rst(c); if (el.checked) st.manual[el.dataset.v] = true; else delete st.manual[el.dataset.v]; this.render(); } }
    else if (el.dataset.chm === 'tag' || el.dataset.chm === 'tagm') { const c = this._item(this.cur); if (c && this._can('edit')) { const t = c.tags = Object.assign({}, this._tagsOf(c)), s0 = el.dataset.s;
        if (el.dataset.chm === 'tag') { if (el.value) t[s0] = el.value; else delete t[s0]; } else { const set = new Set([].concat(t[s0] || [])); if (el.checked) set.add(el.dataset.v); else set.delete(el.dataset.v); t[s0] = [...set]; }
        this._emit('tagged', c.id); this._learnChanged(); this.render(); } }
    else if (['lgoal', 'lbrand', 'lproj', 'lfmt', 'lslot'].includes(el.dataset.chm) && this._lst) { const m = { lgoal: 'goal', lbrand: 'brand', lproj: 'proj', lfmt: 'fmt', lslot: 'slot' }[el.dataset.chm]; this._lst[m] = el.value; if (m !== 'slot') this._lst.res = null; if (m === 'brand') this._lst.all = false; this.render(); }
    else if (el.dataset.chm === 'qcok' && this._can('edit')) { const c = this._item(this.cur); if (c) { c.qcManual = c.qcManual || {}; if (el.checked) c.qcManual[el.dataset.v] = true; else delete c.qcManual[el.dataset.v]; this._emit('qc', c.id); this.render(); } }
    else if (el.dataset.chm === 'qcvis') { const c = this._item(this.cur); if (c) { c.qcVisual = el.value || null; this.render(); } }
    else if (el.dataset.chm === 'bf' && this._bd) { this._bd.data[el.dataset.k] = el.value; }
    else if (el.dataset.chm === 'dbfmt' && this._db) { this._db.video = el.value === 'video'; this.render(); }
    else if (el.dataset.chm === 'dblen' && this._db) { this._db.seconds = +el.value; this.render(); }
    else if (el.dataset.chm === 'recgoal' || el.dataset.chm === 'recfmt') { const st = this._recSt || (this._recSt = { goal: 'ql', format: '' }); st[el.dataset.chm === 'recgoal' ? 'goal' : 'format'] = el.value; st.res = null; this.render(); }
    else if (el.dataset.chm === 'genqr' && el.files && el.files[0] && this.gen) { this.gen.reraQr = URL.createObjectURL(el.files[0]); this.gen.reraQrImg = null; this._paint(); }
    else if (el.dataset.chm === 'genimg' && el.files && el.files[0] && this.gen) { this.gen.imgSrc = URL.createObjectURL(el.files[0]); this._paint(); }
    else if (el.dataset.chmGen && this.gen) { if (this.gen[el.dataset.chmGen] === el.value) return; this.gen[el.dataset.chmGen] = el.value; this._paint(); }   // typing already redrew; leaving the box changes nothing
  }
  _onInput(e) {
    const el = e.target;
    if (el.dataset.chm === 'bf' && this._bd) { this._bd.data[el.dataset.k] = el.value; return; }
    if (el.dataset.chm === 'bfc' && this._bd) { const r0 = this._bd.data.configs[+el.dataset.i]; if (r0) r0[el.dataset.k] = el.value; return; }
    if (el.dataset.chm === 'lq' && this._lst) { this._lst.q = el.value; clearTimeout(this._qt); this._qt = setTimeout(() => { const pos = el.selectionStart; this.render(); const n = this.el.querySelector('[data-chm=lq]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (err) { /* type=search */ } } }, 220); return; }
    if (!el.dataset.chmGen || !this.gen || el.tagName === 'SELECT') return;
    this.gen[el.dataset.chmGen] = el.value; clearTimeout(this._gt); this._gt = setTimeout(() => this._paint(), 140);
  }
  _onDrag(e) {
    const d = e.target.closest && e.target.closest('.chm-drop-zone'); if (!d || !this._can('upload')) return;
    e.preventDefault();
    if (e.type === 'dragover') d.classList.add('chm-hot');
    else if (e.type === 'dragleave') d.classList.remove('chm-hot');
    else { d.classList.remove('chm-hot'); if (e.dataTransfer && e.dataTransfer.files.length) this.add(e.dataTransfer.files); }
  }
}


/** Shared start of the card names ("Lake View carousel 1", "Lake View carousel 2" → "Lake View carousel"). */
function saveBlob(b, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = String(name).replace(/[\\/:*?"<>|]+/g, ' ');
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function commonName(names) {
  if (!names.length) return '';
  let p = names[0]; names.forEach(n => { while (p && !n.startsWith(p)) p = p.slice(0, -1); });
  p = p.replace(/[\s_\-–·(]*(card|slide|c)?\s*\d*$/i, '').trim();
  return p.length >= 3 ? (/carousel/i.test(p) ? p : p + ' (carousel)') : '';
}

/** <creative-heatmap ai-endpoint="/api/creative-analyze" title="Creative studio"></creative-heatmap>
 *  Set .context, .can, .performanceFeed (or .performance), .transcribe, .onSave, .onAIResult as properties; .studio is the CreativeHeatmap. */
export function defineElement(name = 'creative-heatmap') {
  if (typeof customElements === 'undefined' || customElements.get(name)) return;
  customElements.define(name, class extends HTMLElement {
    connectedCallback() {
      if (this.studio) return;
      const ep = this.getAttribute('ai-endpoint');
      const host = this;   // properties can be set before or after the element is added to the page
      this.studio = new CreativeHeatmap(this, {
        title: this.getAttribute('title') || 'Creative studio', ai: ep ? { endpoint: ep } : (host.ai || null),
        context: c => (typeof host.context === 'function' ? host.context(c) : host.context) || {},
        get performance() { return host.performance; }, get performanceFeed() { return host.performanceFeed; }, get transcribe() { return host.transcribe; },
        get can() { return host.can; }, get onSave() { return host.onSave; }, get onAIResult() { return host.onAIResult; },
        onChange: (ev, c) => this.dispatchEvent(new CustomEvent('creative-' + ev, { detail: c, bubbles: true })),
      });
    }
    disconnectedCallback() { if (this.studio) { this.studio.destroy(); this.studio = null; } }
  });
}
