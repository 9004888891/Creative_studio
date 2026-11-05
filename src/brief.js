// Briefs: the project brief a planner fills in, the plain-language read of an ad, the designer brief and video
// storyboard made from an idea, and the one-page report to share. All pure functions that return data or HTML strings.

import { composeCopy } from './intel.js';
import { reraBlockSpec } from './rera.js';
import { QC_DISCLAIMERS } from './qc.js';

/** The project brief: what the checks compare against and what new creatives are written from. */
export const BRIEF_FIELDS = [
  { k: 'project', g: 'The project', label: 'Project name', need: true, help: 'Exactly as it must appear on the creative.' },
  { k: 'developer', g: 'The project', label: 'Developer / brand', need: true },
  { k: 'location', g: 'The project', label: 'City or area', need: true, help: 'e.g. West Pune' },
  { k: 'micro', g: 'The project', label: 'Micro-market or landmark', help: 'e.g. Baner Annex' },
  { k: 'configs', g: 'Price and offer', label: 'Configurations and starting prices', need: true, type: 'configs' },
  { k: 'priceRange', g: 'Price and offer', label: 'Price range', help: 'e.g. ₹94 lakh – ₹1.63 Cr' },
  { k: 'usps', g: 'What to sell', label: 'USPs', help: 'Comma-separated. Only real, approved ones.' },
  { k: 'offer', g: 'Price and offer', label: 'Current offer', help: 'Leave empty if there is none.' },
  { k: 'rera', g: 'Rules for every creative', label: 'RERA registration number', need: true },
  { k: 'reraState', g: 'The project', label: 'State', help: 'e.g. Maharashtra (decides the RERA rules)' },
  { k: 'website', g: 'The project', label: 'Project website' },
  { k: 'possession', g: 'The project', label: 'Possession date' },
  { k: 'audience', g: 'What to sell', label: 'Target buyer', help: 'e.g. IT professionals upgrading from a 2 BHK' },
  { k: 'visualType', g: 'Rules for every creative', label: 'Visuals used', type: 'select', options: [['', 'Not sure'], ['render', 'Project renders'], ['actual', 'Actual site photos'], ['stock', 'Stock images or footage'], ['ai', 'AI-generated images'], ['mixed', 'A mix']] },
  { k: 'disclaimer', g: 'Rules for every creative', label: "Client's disclaimer wording", type: 'textarea', help: 'Takes priority over the standard disclaimers.' },
  { k: 'logoZone', g: 'Rules for every creative', label: 'Brand logo position', type: 'select', options: [['', 'Top left (standard)'], ['top-right', 'Top right'], ['bottom-left', 'Bottom left'], ['bottom-right', 'Bottom right']] },
  { k: 'script', g: 'Videos and festive creatives', label: 'Approved voiceover script (videos)', type: 'textarea' },
  { k: 'festival', g: 'Videos and festive creatives', label: 'Festival (festive creatives)', help: 'e.g. Diwali' },
  { k: 'mustInclude', g: 'Rules for every creative', label: 'Must include', type: 'textarea', help: 'One per line, e.g. "Vastu-compliant homes".' },
  { k: 'mustNot', g: 'Rules for every creative', label: 'Must never say', type: 'textarea', help: 'One per line, e.g. "assured returns".' },
];

const bLines = s => String(s || '').split(/\n+/).map(x => x.trim()).filter(Boolean);

/** Turn the brief's "must include / must never say" lines into quality-check rules, kept alongside any existing ones. */
export function briefToContext(base = {}, brief = {}) {
  const out = Object.assign({}, base, ...Object.entries(brief).filter(([k, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)).map(([k, v]) => ({ [k]: v })));
  if (brief.logoZone === '') delete out.logoZone;
  const rules = ((base.qc || {}).rules || []).filter(r => !r.fromBrief);
  bLines(brief.mustInclude).forEach(l => rules.push({ fromBrief: true, label: `Includes "${l}"`, mustInclude: l, where: 'any', priority: 'High', fix: `Add "${l}" (client requirement).` }));
  bLines(brief.mustNot).forEach(l => rules.push({ fromBrief: true, label: `Does not say "${l}"`, mustNotInclude: l, priority: 'High', issue: `Says "${l}", which the client does not allow`, fix: `Remove "${l}".` }));
  if (rules.length) out.qc = Object.assign({}, base.qc || {}, { rules });
  return out;
}

/** How complete the brief is for checking and for writing new creatives. */
export function briefStatus(ctx = {}, kind = 'image') {
  const has = k => { const v = ctx[k]; return Array.isArray(v) ? v.some(x => x && (x.type || x.price)) : v != null && String(v).trim() !== ''; };
  const need = [['project', 'project name'], ['developer', 'developer'], ['location', 'location'], ['configs', 'configurations and prices'], ['rera', 'RERA number'], ['visualType', 'which visuals are used']];
  if (kind === 'video') need.push(['script', 'approved script']);
  const missing = need.filter(([k]) => !(k === 'developer' ? has('developer') || has('brand') : k === 'configs' ? (ctx.configs || []).some(x => x && x.price) || has('priceRange') : k === 'visualType' ? has('visualType') || has('disclaimer') : has(k))).map(x => x[1]);
  return { filled: need.length - missing.length, total: need.length, missing, complete: !missing.length };
}

/** The extra part of the AI reply: what the ad says, in words anyone understands. */
export function readPromptPart() {
  return `"read":{"message":"one plain sentence: what this ad says","audience":"who it seems aimed at","promise":"the main benefit it offers","proof":"what visibly backs the promise up, or empty","ask":"what it asks the viewer to do, or Nothing","clarity":"clear|mixed|unclear","clarityNote":"one short sentence: why"}`;
}

const bCap = s => String(s || '').replace(/^./, c => c.toUpperCase());
const bWords = (s, n) => { const w = String(s || '').trim().split(/\s+/).filter(Boolean); let k = 0, out = []; for (const x of w) { if (/\w/.test(x)) k++; if (k > n) return out.join(' ') + '…'; out.push(x); } return out.join(' '); };
const bPlace = ctx => [ctx.micro, ctx.location].filter(Boolean).join(', ');
const bPrice = ctx => (ctx.configs || []).filter(x => x && x.type).map(x => `${x.type}${x.price ? ' from ' + x.price + '*' : ''}`).join(' · ') || (ctx.priceRange ? ctx.priceRange + '*' : '');
const BAN_WORDS = { 'travel-time': 'Do not state travel times or distances (not allowed in this state).', 'tnc-disclaimer': 'Do not rely on "T&C apply" to qualify a claim: state the condition itself.', 'vague-amenities': 'Name real amenities; vague claims such as "world-class amenities" are not allowed here.' };

/**
 * The details a designer must put on every version: logos, price exactly as briefed, RERA block for the state,
 * disclaimers for the visuals used, T&C, client must-haves and must-nots.
 */
export function mandatoryElements(ctx = {}, opts = {}) {
  const out = [], spec = reraBlockSpec(ctx, opts.medium || (opts.video ? 'video' : 'social')), zone = (ctx.logoZone || 'top-left').replace('-', ' ');
  out.push(`${ctx.developer || ctx.brand || 'Developer'} logo, ${zone}${ctx.logoZone ? ' (client instruction)' : ''}.`);
  out.push(`${ctx.project || 'Project'} logo${opts.video ? ', on screen throughout in one corner' : ''}.`);
  if (bPrice(ctx)) out.push(`Price exactly as briefed: ${bPrice(ctx)}.`);
  out.push(`${spec.authority || 'RERA'} block in the ${String(spec.zone || 'top-right').replace('-', ' ')} corner: registration number ${spec.reg || '__'}${spec.website ? ', ' + spec.website : ''}${spec.qr ? ' and the project QR code from the RERA portal' : ''}, at least as large as the contact details.`);
  const vt = ctx.visualType;
  if (ctx.disclaimer) out.push(`Client disclaimer, word for word: "${ctx.disclaimer}".`);
  else if (vt && QC_DISCLAIMERS[vt]) out.push(`"${QC_DISCLAIMERS[vt].expect}" on the ${QC_DISCLAIMERS[vt].label.toLowerCase()}.`);
  else out.push("Image disclaimer matching each visual: Artist's Impression* (renders), Actual Image* (site photos), Representative Image* (stock), AI Image* (AI visuals).");
  out.push('Bottom legal disclaimer as approved by the client, and "*T&C Apply" next to any starting price or offer.');
  bLines(ctx.mustInclude).forEach(l => out.push(`Client must-have: "${l}".`));
  bLines(ctx.mustNot).forEach(l => out.push(`Never say: "${l}".`));
  (spec.bans || []).forEach(b => { if (BAN_WORDS[b]) out.push(BAN_WORDS[b]); });
  return out;
}

/** Sizes to deliver, with the safe area for each. */
export function deliverySizes(video) {
  return video ? [{ label: 'Reels and Stories', size: '1080×1920 (9:16)', note: 'Keep text out of the top 14% and bottom 35%, and away from the right edge.' }, { label: 'Feed', size: '1080×1350 (4:5)', note: 'A 4:5 cut of the same edit; keep text inside the middle 4:5 area of the 9:16 frame.' }]
    : [{ label: 'Feed', size: '1080×1350 (4:5)', note: 'Main version.' }, { label: 'Square', size: '1080×1080 (1:1)', note: 'Same layout, tightened.' }, { label: 'Stories', size: '1080×1920 (9:16)', note: 'Keep text out of the top 14% and bottom 20%.' }];
}

/**
 * Scene-by-scene storyboard for a video idea. idea: a recommend() concept (combo, copy) or a { headline, sub, cta, visual } object.
 * opts.seconds: 15 (default) or 30. Every super is short enough to read in the time it is on screen.
 */
export function storyboard(idea = {}, ctx = {}, opts = {}) {
  const T = opts.seconds || 15, copy = idea.copy || idea, combo = idea.combo || {}, place = bPlace(ctx), pr = bPrice(ctx);
  const usps = String(ctx.usps || '').split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).slice(0, T >= 30 ? 4 : 2);
  const presenter = combo.talent === 'presenter' || combo.visual === 'presenter', proof = [].concat(combo.proof || []);
  const tag = proof.includes('actual_image') ? 'Actual image' : proof.includes('shot_at_location') ? 'Shot at location' : '';
  const endLen = T >= 30 ? 4 : 3, hookLen = T >= 30 ? 2 : 1.5, whoLen = T >= 30 ? 3 : 2, priceLen = T >= 30 ? 4 : 2.5;
  const uspLen = Math.max(2, (T - endLen - hookLen - whoLen - priceLen) / Math.max(1, usps.length));
  const scenes = []; let t = 0;
  const add = (name, len, s) => { scenes.push(Object.assign({ name, t0: Math.round(t * 10) / 10, t1: Math.round((t + len) * 10) / 10 }, s)); t += len; };
  add('Hook', hookLen, { visual: presenter ? 'Presenter on site, already mid-sentence, looking into the camera; the camera moves.' : (copy.visual || 'The strongest shot of the project, with camera movement from the first frame.'),
    super: bWords(copy.headline, 6), hold: 3, vo: copy.headline ? bCap(copy.headline.replace(/\*$/, '')) + '.' : '', notes: 'Movement and the main line in the first second; keep the line on screen until about 3 s. No logo-only or black opening.' });
  add('Who and where', whoLen, { visual: `Wide shot of ${ctx.project || 'the project'}${place ? ' in ' + place : ''}${tag ? ' (' + tag + ')' : ''}.`, super: bWords(`${ctx.project || ''}${place ? ' · ' + (ctx.micro || ctx.location) : ''}`, 5), hold: 3.5,
    vo: `${ctx.project ? 'This is ' + ctx.project : 'This project'}${place ? ', in ' + place : ''}.`, notes: 'Project logo appears now and stays in the same corner to the end.' });
  (usps.length ? usps : ['__ (a real feature from the brief)']).forEach((u, i) => add(`Reason ${i + 1}`, uspLen, { visual: `Shot that shows: ${u}${tag ? ' (' + tag + ')' : ''}.`, super: bWords(u, 5), vo: bCap(u) + '.', notes: 'One idea per shot; hold it long enough to read the super.' }));
  add('Price and offer', priceLen, { visual: presenter ? 'Presenter in the sample flat or on a balcony.' : 'Interior or view shot.', super: bWords(pr || 'Price from the brief', 7) + (ctx.offer ? ' · ' + bWords(ctx.offer, 4) : ''),
    vo: pr ? `${pr.replace(/\*/g, '').replace(/ · /g, ', ')}.` + (ctx.offer ? ` ${ctx.offer}.` : '') : 'Say the starting price.', notes: '"*T&C Apply" on screen with the price.' });
  add('End frame', Math.max(2, T - t), { visual: 'Static end frame on a clean background.', super: `${copy.cta || 'Book a site visit'}`, vo: `${copy.cta || 'Book your site visit'} today.`,
    notes: 'Must show: brand logo, project logo, price and configuration, location, offer (if any), RERA block with QR code, disclaimers, call to action. Hold at least 3 seconds.' });
  scenes.forEach(s => { const w = String(s.super || '').split(/\s+/).filter(x => /\w/.test(x)).length, need = 0.6 + w / 3; s.readOk = (s.hold ? s.hold : s.t1 - s.t0) + 0.01 >= need; s.needs = Math.round(need * 10) / 10; });
  return { seconds: T, scenes };
}

/**
 * Designer brief for one idea. idea: a recommend() concept ({ combo, copy, why, tests, pBeat }) or a new-version idea
 * ({ angle, g, why, visual }). opts: { goal label, effects (elementEffects list, for do/avoid), video, seconds }.
 */
export function designerBrief(idea = {}, ctx = {}, opts = {}) {
  const combo = idea.combo || {}, copy = idea.copy || (idea.g ? { headline: idea.g.headline, sub: idea.g.sub, price: idea.g.price, offer: idea.g.offer, cta: idea.g.cta, visual: idea.visual || '' } : {});
  const video = opts.video != null ? opts.video : combo.format === 'video';
  const heads = [copy.headline]; ['location', 'price', 'reason', 'usp', 'question', 'urgency'].forEach(h => { if (combo.format && h !== combo.headline) { try { heads.push(composeCopy(Object.assign({}, combo, { headline: h }), ctx).headline); } catch (e) { /* skip */ } } });
  const options = [...new Set(heads.filter(h => h && !/__/.test(h)))].slice(0, 3);
  const seenE = new Set(), eff = (opts.effects || []).filter(e => e.n >= 3 && e.slot !== 'audience' && e.value !== 'none').filter(e => { const k = e.n + ':' + e.lift.toFixed(4); if (seenE.has(k)) return false; seenE.add(k); return true; });
  const doMore = eff.filter(e => e.lo > 1).sort((a, b) => b.lift - a.lift).slice(0, 3).map(e => `${e.label} (${Math.round((e.lift - 1) * 100)}% better in past results)`);
  const avoid = eff.filter(e => e.hi < 1).sort((a, b) => a.lift - b.lift).slice(0, 3).map(e => `${e.label} (${Math.round((1 - e.lift) * 100)}% worse)`);
  return {
    title: `${ctx.project || 'New creative'}: ${idea.angle || (combo.headline ? bCap(combo.headline) + '-led ' : '') + (video ? 'video' : combo.format || 'static')}`,
    format: video ? `Video, ${opts.seconds || 15} s` : bCap(combo.format || 'static'), goal: opts.goal || 'More qualified leads for the money',
    audience: ctx.audience || '', message: copy.headline || '', options, sub: copy.sub || '', price: copy.price || bPrice(ctx), offer: copy.offer || ctx.offer || '', cta: copy.cta || 'Book a site visit',
    visual: copy.visual || idea.visual || '', proof: copy.proofLine || '', why: (idea.why || []).filter ? (idea.why || []).filter(w => w.evidence !== 'untested' && w.lift > 1.05 && !w.confounded).slice(0, 3).map(w => `${w.label}: ${Math.round((w.lift - 1) * 100)}% better in ${w.n} past creatives`) : [String(idea.why || '')].filter(Boolean),
    tests: idea.tests || [], sizes: deliverySizes(video), mandatory: mandatoryElements(ctx, { video }), doMore, avoid, storyboard: video ? storyboard(idea, ctx, { seconds: opts.seconds || 15 }) : null,
  };
}

const bEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** The designer brief as plain text (for copying into a message or a task). */
export function briefText(b) {
  const L = [b.title.toUpperCase(), `Format: ${b.format} · Goal: ${b.goal}${b.audience ? ' · For: ' + b.audience : ''}`, '', 'MESSAGE', ...b.options.map((h, i) => `${i ? 'Or' : 'Headline'}: ${h}`)];
  if (b.sub) L.push(`Line 2: ${b.sub}`); if (b.price) L.push(`Price: ${b.price}`); if (b.offer) L.push(`Offer: ${b.offer}`); L.push(`Call to action: ${b.cta}`, '');
  if (b.visual) L.push('VISUAL', b.visual + (b.proof ? ` (${b.proof})` : ''), '');
  if (b.storyboard) { L.push(`STORYBOARD (${b.storyboard.seconds} s)`); b.storyboard.scenes.forEach(s => L.push(`${s.t0}–${s.t1} s · ${s.name}`, `  Shot: ${s.visual}`, `  On screen: ${s.super}`, `  Voiceover: ${s.vo}`, `  Note: ${s.notes}`)); L.push(''); }
  L.push('MUST BE ON EVERY VERSION', ...b.mandatory.map(m => '• ' + m), '', 'SIZES', ...b.sizes.map(s => `• ${s.label}: ${s.size}. ${s.note}`));
  if (b.doMore.length || b.avoid.length) L.push('', 'FROM PAST RESULTS', ...b.doMore.map(x => '• Use: ' + x), ...b.avoid.map(x => '• Avoid: ' + x));
  if (b.why.length) L.push('', 'WHY THIS IDEA', ...b.why.map(x => '• ' + x));
  return L.join('\n');
}

/** The designer brief as HTML (inside the studio, or saved as a file). */
export function briefHtml(b) {
  const li = a => `<ul>${a.map(x => `<li>${bEsc(x)}</li>`).join('')}</ul>`;
  return `<div class="chm-dbrief"><h3>${bEsc(b.title)}</h3><p class="chm-small">${bEsc(b.format)} · Goal: ${bEsc(b.goal)}${b.audience ? ' · For: ' + bEsc(b.audience) : ''}</p>
    <section><h4>Message</h4><table class="chm-table chm-list-t"><tbody>${b.options.map((h, i) => `<tr><th scope="row">${i ? 'Or' : 'Headline'}</th><td><strong>${bEsc(h)}</strong></td></tr>`).join('')}
      ${b.sub ? `<tr><th scope="row">Line 2</th><td>${bEsc(b.sub)}</td></tr>` : ''}${b.price ? `<tr><th scope="row">Price</th><td>${bEsc(b.price)}</td></tr>` : ''}${b.offer ? `<tr><th scope="row">Offer</th><td>${bEsc(b.offer)}</td></tr>` : ''}<tr><th scope="row">Call to action</th><td>${bEsc(b.cta)}</td></tr></tbody></table></section>
    ${b.visual ? `<section><h4>Visual</h4><p>${bEsc(b.visual)}${b.proof ? ` <span class="chm-chip">${bEsc(b.proof)}</span>` : ''}</p></section>` : ''}
    ${b.storyboard ? `<section><h4>Storyboard · ${b.storyboard.seconds} seconds</h4><div class="chm-scroll"><table class="chm-table chm-story"><thead><tr><th>Time</th><th>Shot</th><th>On screen</th><th>Voiceover</th></tr></thead><tbody>${b.storyboard.scenes.map(s => `<tr><td><strong>${s.t0}–${s.t1} s</strong><br><span class="chm-small">${bEsc(s.name)}</span></td><td>${bEsc(s.visual)}<br><span class="chm-small">${bEsc(s.notes)}</span></td><td>${bEsc(s.super)}${s.readOk ? '' : ` <span class="chm-small">(needs ${s.needs} s to read: shorten)</span>`}</td><td>${bEsc(s.vo)}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
    <section><h4>Must be on every version</h4>${li(b.mandatory)}</section>
    <section><h4>Sizes to deliver</h4>${li(b.sizes.map(s => `${s.label}: ${s.size}. ${s.note}`))}</section>
    ${b.doMore.length || b.avoid.length ? `<section><h4>From past results</h4>${li(b.doMore.map(x => 'Use: ' + x).concat(b.avoid.map(x => 'Avoid: ' + x)))}</section>` : ''}
    ${b.why.length ? `<section><h4>Why this idea</h4>${li(b.why)}</section>` : ''}</div>`;
}

/**
 * The one-page report, as a complete HTML document that opens anywhere and prints to PDF.
 * r: { name, kind, project, date, verdict: { title, detail, tone }, read, fixes: [{ tag, text, how }], images: { original, heat },
 *      areas: [{ label, value, note }], issues: [...], eye: [labels], ideas: [{ headline, sub, cta, why }], brief: briefStatus, notes: [...] }
 */
export function reportHtml(r) {
  const tone = { ok: '#1d7a4a', warn: '#b7791f', bad: '#b33b2e', na: '#5d6877' }[r.verdict.tone] || '#5d6877';
  const rd = r.read;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${bEsc(r.name)} · Creative report</title>
<style>:root{--ink:#18202b;--muted:#5d6877;--line:#dfe3e8;--soft:#f5f7f9}*{box-sizing:border-box}body{margin:0;font:15px/1.5 "Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif;color:var(--ink);background:#fff}
.page{max-width:900px;margin:0 auto;padding:28px 20px 48px}h1{font-size:24px;margin:0 0 2px}h2{font-size:16px;margin:26px 0 8px;padding-bottom:4px;border-bottom:1px solid var(--line)}p{margin:0 0 6px}.m{color:var(--muted);font-size:13px}
.verdict{border-left:5px solid ${tone};background:var(--soft);padding:12px 16px;border-radius:8px;margin-top:16px}.verdict b{font-size:19px;color:${tone};display:block}
.imgs{display:grid;grid-template-columns:1fr 1fr;gap:12px}.imgs figure{margin:0}.imgs img{width:100%;border-radius:8px;border:1px solid var(--line)}figcaption{font-size:12px;color:var(--muted)}
.read{display:grid;grid-template-columns:150px 1fr;gap:4px 14px}.read dt{color:var(--muted)}.read dd{margin:0}
ol.fix{padding-left:20px}ol.fix li{margin-bottom:8px}.tag{font-size:11px;font-weight:700;border:1px solid var(--line);border-radius:999px;padding:1px 8px;margin-right:6px;color:var(--muted)}.tag.must{background:#b33b2e;border-color:#b33b2e;color:#fff}
.areas{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.area{background:var(--soft);border-radius:8px;padding:8px 10px}.area b{display:block;font-size:17px}
table{border-collapse:collapse;width:100%;font-size:13.5px}th,td{text-align:left;vertical-align:top;padding:6px 8px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-weight:600;font-size:12px}
.idea{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:8px}.btn{font:inherit;padding:7px 14px;border:1px solid var(--line);border-radius:6px;background:#fff;cursor:pointer}
@media (max-width:640px){.imgs,.areas{grid-template-columns:1fr 1fr}.read{grid-template-columns:1fr}}@media print{.noprint{display:none}h2{break-after:avoid}.idea,tr{break-inside:avoid}}</style></head>
<body><div class="page"><p class="noprint" style="text-align:right"><button class="btn" onclick="window.print()">Print or save as PDF</button></p>
<h1>${bEsc(r.name)}</h1><p class="m">${bEsc([r.kind, r.project, r.date].filter(Boolean).join(' · '))}</p>
<div class="verdict"><span class="m">Ready to go live?</span><b>${bEsc(r.verdict.title)}</b><span>${bEsc(r.verdict.detail)}</span></div>
${rd ? `<h2>What this ad says</h2><dl class="read"><dt>In one line</dt><dd><strong>${bEsc(rd.message)}</strong></dd>${rd.audience ? `<dt>Aimed at</dt><dd>${bEsc(rd.audience)}</dd>` : ''}${rd.promise ? `<dt>Promise</dt><dd>${bEsc(rd.promise)}</dd>` : ''}${rd.proof ? `<dt>Backed by</dt><dd>${bEsc(rd.proof)}</dd>` : ''}${rd.ask ? `<dt>Asks people to</dt><dd>${bEsc(rd.ask)}</dd>` : ''}${rd.clarity ? `<dt>Clarity</dt><dd>${bEsc(rd.clarity === 'clear' ? 'Clear: one message' : rd.clarity === 'mixed' ? 'Mixed: messages compete' : 'Unclear')}${rd.clarityNote ? ' · ' + bEsc(rd.clarityNote) : ''}</dd>` : ''}</dl>` : ''}
${r.images && r.images.original ? `<h2>The creative and where people look</h2><div class="imgs"><figure><img src="${r.images.original}" alt="The creative"><figcaption>${bEsc(r.images.caption || 'The creative')}</figcaption></figure>${r.images.heat ? `<figure><img src="${r.images.heat}" alt="Predicted attention"><figcaption>Predicted attention: red and yellow are seen first. A prediction, not eye-tracking.</figcaption></figure>` : ''}</div>` : ''}
<h2>What to fix first</h2>${r.fixes.length ? `<ol class="fix">${r.fixes.map(f => `<li><span class="tag${/must/i.test(f.tag) ? ' must' : ''}">${bEsc(f.tag)}</span><strong>${bEsc(f.text)}</strong>${f.how ? `<br><span class="m">${bEsc(f.how)}</span>` : ''}</li>`).join('')}</ol>` : '<p>Nothing to fix in what could be checked.</p>'}
${r.areas && r.areas.length ? `<h2>At a glance</h2><div class="areas">${r.areas.map(a => `<div class="area"><span class="m">${bEsc(a.label)}</span><b>${bEsc(a.value)}</b><span class="m">${bEsc(a.note)}</span></div>`).join('')}</div>` : ''}
${r.issues && r.issues.length ? `<h2>Quality check: everything to fix</h2><table><thead><tr><th>#</th><th>Problem</th><th>Where</th><th>How to fix</th><th>Priority</th></tr></thead><tbody>${r.issues.map(i => `<tr><td>${i.no}</td><td>${bEsc(i.issue)}</td><td>${bEsc(i.location || '—')}</td><td>${bEsc(i.fix)}</td><td>${bEsc(i.priority)}</td></tr>`).join('')}</tbody></table>` : ''}
${r.eye && r.eye.length ? `<h2>Still to check by eye</h2><ul>${r.eye.map(x => `<li>${bEsc(x)}</li>`).join('')}</ul>` : ''}
${r.ideas && r.ideas.length ? `<h2>Ideas for the next version</h2>${r.ideas.map((x, i) => `<div class="idea"><strong>Idea ${i + 1}: ${bEsc(x.headline)}</strong>${x.sub ? `<br>${bEsc(x.sub)}` : ''}${x.cta ? `<br><em>${bEsc(x.cta)}</em>` : ''}${x.why ? `<p class="m">${bEsc(x.why)}</p>` : ''}</div>`).join('')}` : ''}
${r.brief && !r.brief.complete ? `<p class="m" style="margin-top:18px">Brief incomplete (missing: ${bEsc(r.brief.missing.join(', '))}), so some checks could not compare against it.</p>` : ''}
${(r.notes || []).map(n => `<p class="m">${bEsc(n)}</p>`).join('')}
<p class="m" style="margin-top:24px">Made with Creative Studio. Attention is predicted by a visual model; checks are an aid and do not replace legal review.</p></div></body></html>`;
}
