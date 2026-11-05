// Quality check: the real-estate creative & video auditor's checklist, run against the creative and the brief.
//
// checkQuality() takes what the studio already knows about a creative (the AI reading of each image or video moment,
// the RERA check, the soundtrack, the transcript, a technical scan of the video) plus the brief (context), and returns
// the auditor's report: what is correct, the issues (with location, correction, priority and whether it is mandatory,
// client-specific, conditional or a recommendation), missing information, observations, a verdict, and what the tool
// could not inspect. Anything it cannot verify is "check by eye", never passed silently.

export const QC_STATUSES = ['Approved', 'Approved with Minor Changes', 'Revisions Required', 'Unable to Complete Review'];
export const QC_DISCLAIMERS = {
  render: { label: 'Project render', expect: "Artist's Impression*", rx: /artist'?s\s+impression|artistic\s+impression/i },
  stock: { label: 'Stock image or footage', expect: 'Representative Image*', rx: /representative\s+(image|picture|visual)/i },
  ai: { label: 'AI-generated image', expect: 'AI Image*', rx: /\bai\s*(-|\s)?(generated\s+)?(image|visual|imagery)\b/i },
  actual: { label: 'Actual site photograph', expect: 'Actual Image* / Shot on Location', rx: /actual\s+(image|photo|site\s+photo)|shot\s+(on|at)\s+location/i },
};

const Q_GENERIC = /^(the|and|residences?|homes?|apartments?|towers?|heights|city|park|phase|project|estates?|villas?|enclave|gardens?|greens?|plaza|avenue|one|by|at|of|in|on|by|ltd|limited|pvt|private|realty|group|corp|homes)$/i;
const qWords = s => String(s || '').toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').split(' ').filter(w => w.length > 2 && !Q_GENERIC.test(w));
const qHas = (txt, s) => { const ws = qWords(s); return ws.length ? ws.some(w => txt.includes(w)) : null; };
const qNorm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ');

/** Prices in lakh from text: "₹1.15 Cr" → 115, "94 lakh" → 94, "₹ 2.1 Cr" → 210. */
export function qcPrices(s) {
  const out = []; const rx = /(?:₹|rs\.?|inr)?\s*(\d+(?:[.,]\d+)?)\s*(cr(?:ore)?s?|crores?|l(?:akh|ac|acs|akhs)?\b|lakh|lac)/gi; let m;
  while ((m = rx.exec(String(s || '')))) { const v = parseFloat(m[1].replace(',', '.')); if (isFinite(v)) out.push(/^c/i.test(m[2]) ? Math.round(v * 100 * 100) / 100 : v); }
  return out;
}
/** Configurations from text: "1, 2 & 3 BHK" → [1,2,3], "4-bed" → [4]. Studios, plots and villas as words. */
export function qcConfigs(s) {
  const t = String(s || '').toLowerCase(), out = new Set();
  const rx = /((?:\d(?:\.5)?\s*(?:,|&|and|\/|-|or)?\s*)+)\s*(?:bhk|b\.h\.k|bed(?:room)?s?\b|-bed)/g; let m;
  while ((m = rx.exec(t))) (m[1].match(/\d(?:\.5)?/g) || []).forEach(d => out.add(d));
  ['studio', 'plot', 'villa', 'penthouse', 'duplex', 'row house'].forEach(w => { if (t.includes(w)) out.add(w); });
  return [...out];
}
const qReraIds = s => (String(s || '').toUpperCase().match(/\b(P[R]?[A-Z]?\s?\d{8,16}|PRM\/[A-Z]+\/RERA\/[\w\/]+|[A-Z]{2,5}\/\d{2,}\/[\w\/-]{4,})\b/g) || []).map(x => x.replace(/\s/g, ''));

const qPct = v => Math.round(v * 100) + '%';
const qZone = b => { const cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2; return `${cy < 0.33 ? 'top' : cy > 0.67 ? 'bottom' : 'middle'}-${cx < 0.33 ? 'left' : cx > 0.67 ? 'right' : 'centre'}`; };
const qInZone = (b, z) => { const [v, hz] = z.split('-'); const cx = b[0] + b[2] / 2, cy = b[1] + b[3] / 2;
  return (v === 'top' ? cy < 0.33 : v === 'bottom' ? cy > 0.67 : true) && (hz === 'left' ? cx < 0.4 : hz === 'right' ? cx > 0.6 : true); };

/**
 * input: {
 *   kind: 'image' | 'carousel' | 'video', name,
 *   ctx: the brief: { project, brand, developer, location, micro, configs: [{type, price}], priceRange, offer, rera,
 *         visualType: 'render'|'stock'|'ai'|'actual'|'mixed', disclaimer (the client's own wording), logoZone ('top-left'),
 *         script (approved voiceover script), festival, qc: { mandatory: [...], skip: [...] } },
 *   parts: [{ label, t, read (has an AI reading), elements: [{ type, text, cbox }], qc: AI quality fields, scores, thumb: Uint8Array(256) }],
 *   rera: checkRera() result, sound: { profile, notes }, transcript: { text, segments }, media: { width, height, duration },
 *   scan: { samples: [{ t, mean, std }] } (video), manual: { [checkId]: true } (checked by eye)
 * }
 * Returns { assetType, project, status, verdictPending, counts, checks, correct, issues, missing, observations, limits }.
 */
export function checkQuality(input = {}) {
  const ctx = input.ctx || {}, kind = input.kind || 'image', video = kind === 'video', parts = input.parts || [], man = input.manual || {};
  const read = parts.filter(p => p.read), anyRead = read.length > 0;
  const checks = [], add = (o) => { const c = Object.assign({ kind: 'mandatory', priority: 'High', location: '' }, o);
    if (man[c.id] && (c.status === 'check' || c.status === 'fail')) { c.confirmed = true; c.status = 'pass'; }
    checks.push(c); return c; };
  const skip = new Set(((ctx.qc || {}).skip) || []);
  const end = video ? (parts.slice().sort((a, b) => b.t - a.t)[0] || null) : null, endRead = end && end.read;
  const at = p => p ? (video ? `${p.label}${p.label && /\d s\b/.test(p.label) ? '' : ` (${p.t.toFixed(1)} s)`}` : kind === 'carousel' ? p.label : '') : '';
  // where the mandatory details must be: the whole static, all carousel cards, the video's end frame
  const scope = video ? (endRead ? [end] : []) : read;
  const scopeName = video ? 'end frame' : kind === 'carousel' ? 'carousel' : 'creative';
  const els = scope.flatMap(p => (p.elements || []).map(e => Object.assign({ part: p }, e)));
  const allEls = read.flatMap(p => (p.elements || []).map(e => Object.assign({ part: p }, e)));
  const txt = qNorm(els.map(e => e.text).join(' \n ')), allTxt = qNorm(allEls.map(e => e.text).join(' \n '));
  const qcs = scope.map(p => p.qc || {}), allQc = read.map(p => Object.assign({ _p: p }, p.qc || {}));
  const ofType = (t, list = els) => list.filter(e => e.type === t);
  const noRead = { status: 'check', detail: video ? 'Read the end frame with AI to check this, or confirm it by eye.' : 'Read the creative with AI to check this, or confirm it by eye.' };
  const can = !!scope.length;

  // ---------- A. Branding & mandatory information ----------
  const G1 = 'Branding & mandatory information';
  const logoZone = ctx.logoZone || 'top-left', clientZone = !!ctx.logoZone;
  if (!skip.has('brand_logo')) {
    if (!can) add(Object.assign({ id: 'brand_logo', group: G1, label: 'Developer / brand logo' }, noRead));
    else {
      const q = qcs.find(x => x.brandLogo && x.brandLogo.present), logos = ofType('logo');
      const present = q ? true : qcs.some(x => x.brandLogo && x.brandLogo.present === false) ? false : logos.length ? true : false;
      const box = (q && Array.isArray(q.brandLogo.box) ? q.brandLogo.box : null) || (logos[0] && logos[0].cbox) || null;
      if (!present) add({ id: 'brand_logo', group: G1, label: 'Developer / brand logo', status: 'fail', issue: 'Developer / brand logo is missing', location: at(end) || scopeName, fix: `Add the ${ctx.developer || ctx.brand || 'developer'} logo${clientZone ? '' : ', top-left'}.` });
      else {
        add({ id: 'brand_logo', group: G1, label: 'Developer / brand logo', status: 'pass', detail: q && q.brandLogo.text ? `Reads "${q.brandLogo.text}".` : 'Present.' });
        add({ id: 'brand_logo_correct', group: G1, label: 'Correct brand logo (current version)', status: 'check', priority: 'Medium', detail: 'Compare with the brand guidelines: the tool cannot tell an old logo from the current one.' });
        if (box && !qInZone(box, logoZone)) add({ id: 'logo_zone', group: G1, label: `Brand logo ${logoZone.replace('-', ' ')}`, kind: clientZone ? 'client' : 'conditional', priority: 'Medium', status: 'fail',
          issue: `Brand logo is ${qZone(box).replace('-', ' ')}, not ${logoZone.replace('-', ' ')}`, location: qZone(box).replace('-', ' '), fix: `Move the brand logo to the ${logoZone.replace('-', ' ')} corner${clientZone ? ' (client instruction)' : ', unless the client asked for another place'}.` });
        else if (box) add({ id: 'logo_zone', group: G1, label: `Brand logo ${logoZone.replace('-', ' ')}`, kind: clientZone ? 'client' : 'conditional', priority: 'Medium', status: 'pass' });
      }
    }
  }
  if (!skip.has('project_logo')) {
    if (!can) add(Object.assign({ id: 'project_logo', group: G1, label: 'Project logo' }, noRead));
    else { const q = qcs.find(x => x.projectLogo && x.projectLogo.present), no = qcs.length && qcs.every(x => x.projectLogo && x.projectLogo.present === false);
      add(q ? { id: 'project_logo', group: G1, label: 'Project logo', status: 'pass', detail: q.projectLogo.text ? `Reads "${q.projectLogo.text}".` : 'Present.' }
        : no ? { id: 'project_logo', group: G1, label: 'Project logo', status: 'fail', issue: 'Project logo is missing', location: at(end) || scopeName, fix: `Add the ${ctx.project || 'project'} logo.` }
        : { id: 'project_logo', group: G1, label: 'Project logo', status: 'check', detail: 'Confirm the project logo is present and correct.' }); }
  }
  // project name
  if (!skip.has('project_name')) {
    const n = qHas(txt, ctx.project);
    add(!can ? Object.assign({ id: 'project_name', group: G1, label: 'Project name' }, noRead)
      : n === null ? { id: 'project_name', group: G1, label: 'Project name', status: 'check', detail: 'No project name in the brief to compare with.' }
      : n ? { id: 'project_name', group: G1, label: 'Project name', status: 'pass', detail: `Matches "${ctx.project}".` }
      : { id: 'project_name', group: G1, label: 'Project name', status: 'fail', issue: `Project name "${ctx.project}" not found`, location: at(end) || scopeName, fix: `Show the project name exactly as "${ctx.project}".` });
  }
  // price and configuration, against the brief
  const priceEls = ofType('price'), priceTxt = priceEls.map(e => e.text).join(' ') || (txt.match(/[^\n]*(₹|\bcr\b|lakh|lac)[^\n]*/g) || []).join(' ');
  const shown = qcPrices(priceTxt), brief = (ctx.configs || []).map(c => qcPrices(c.price)[0]).filter(v => v != null), range = qcPrices(ctx.priceRange);
  if (!skip.has('price')) {
    if (!can) add(Object.assign({ id: 'price', group: G1, label: 'Price' }, noRead));
    else if (!shown.length) add({ id: 'price', group: G1, label: 'Price', status: (ctx.qc && ctx.qc.noPrice) ? 'na' : 'fail', issue: 'Price is missing', location: at(end) || scopeName, fix: brief.length ? `Add the price from the brief, e.g. ${(ctx.configs[0].type || '')} from ${ctx.configs[0].price}*.` : 'Add the starting price.' });
    else if (!brief.length && !range.length) add({ id: 'price', group: G1, label: 'Price', status: 'check', detail: `Shows ${priceTxt.trim()}. No price in the brief to verify it against: confirm with the price sheet.` });
    else {
      const ok = v => brief.some(b => Math.abs(b - v) <= Math.max(0.5, b * 0.005)) || (range.length >= 2 ? v >= range[0] - 0.5 && v <= range[range.length - 1] + 0.5 : range.length === 1 && Math.abs(range[0] - v) <= 0.5);
      const isFrom = /\b(from|starting|starts?\s+at|onwards|upwards)\b/i.test(priceTxt), lowest = brief.length ? Math.min(...brief) : range.length ? range[0] : null;
      const bad = shown.filter(v => !ok(v) || (isFrom && lowest != null && shown.length === 1 && Math.abs(v - lowest) > Math.max(0.5, lowest * 0.005)));
      add(bad.length ? { id: 'price', group: G1, label: 'Price', status: 'fail', issue: `Price does not match the brief (${priceTxt.trim()})`, location: priceEls[0] ? `${at(priceEls[0].part) ? at(priceEls[0].part) + ', ' : ''}${qZone(priceEls[0].cbox).replace('-', ' ')}` : at(end) || scopeName,
        fix: `Use the price from the brief: ${(ctx.configs || []).map(c => `${c.type} ${c.price}`).join(', ') || ctx.priceRange}.` } : { id: 'price', group: G1, label: 'Price', status: 'pass', detail: `${priceTxt.trim()} matches the brief.` });
    }
  }
  if (!skip.has('configuration')) {
    const cs = qcConfigs(txt), bc = new Set((ctx.configs || []).flatMap(c => qcConfigs(c.type)).concat(qcConfigs(ctx.inventory)));
    if (!can) add(Object.assign({ id: 'configuration', group: G1, label: 'Configuration' }, noRead));
    else if (!cs.length) add({ id: 'configuration', group: G1, label: 'Configuration', status: 'fail', issue: 'Configuration (e.g. 2 BHK) is missing', location: at(end) || scopeName, fix: bc.size ? `Add the configuration: ${[...bc].map(x => /\d/.test(x) ? x + ' BHK' : x).join(', ')}.` : 'Add the configuration (e.g. 2 & 3 BHK).' });
    else if (!bc.size) add({ id: 'configuration', group: G1, label: 'Configuration', status: 'check', detail: `Shows ${cs.map(x => /\d/.test(x) ? x + ' BHK' : x).join(', ')}. No configuration in the brief to verify against.` });
    else { const extra = cs.filter(x => !bc.has(x));
      add(extra.length ? { id: 'configuration', group: G1, label: 'Configuration', status: 'fail', issue: `Configuration not in the brief: ${extra.map(x => /\d/.test(x) ? x + ' BHK' : x).join(', ')}`, location: at(end) || scopeName, fix: `Show only the configurations in the brief: ${[...bc].map(x => /\d/.test(x) ? x + ' BHK' : x).join(', ')}.` }
        : { id: 'configuration', group: G1, label: 'Configuration', status: 'pass', detail: `${cs.map(x => /\d/.test(x) ? x + ' BHK' : x).join(', ')} matches the brief.` }); }
  }
  if (!skip.has('location')) {
    const where = [ctx.micro, ctx.location].filter(Boolean).join(' '), n = qHas(txt, where), locEls = ofType('location');
    add(!can ? Object.assign({ id: 'location', group: G1, label: 'Project location' }, noRead)
      : n === null ? { id: 'location', group: G1, label: 'Project location', status: locEls.length ? 'check' : 'fail', issue: 'Project location is missing', location: at(end) || scopeName, fix: 'Add the project location.', detail: locEls.length ? `Shows "${locEls[0].text}". No location in the brief to compare with.` : '' }
      : n ? { id: 'location', group: G1, label: 'Project location', status: 'pass', detail: `Mentions ${where}.` }
      : { id: 'location', group: G1, label: 'Project location', status: 'fail', issue: locEls.length ? `Location "${locEls[0].text}" does not match the brief (${where})` : 'Project location is missing', location: at(end) || scopeName, fix: `Show the location from the brief: ${where}.` });
  }
  // offer (conditional): required when the brief has one; an offer not in the brief must be confirmed
  if (!skip.has('offer')) {
    const offEls = ofType('offer'), offTxt = offEls.map(e => e.text).join(' · ');
    if (!can) add(Object.assign({ id: 'offer', group: G1, label: 'Offer', kind: 'conditional' }, noRead, ctx.offer ? {} : { status: 'na' }));
    else if (ctx.offer && !offEls.length && !qHas(txt, ctx.offer)) add({ id: 'offer', group: G1, label: 'Offer', kind: 'conditional', status: 'fail', issue: 'Offer from the brief is missing', location: at(end) || scopeName, fix: `Add the offer: ${ctx.offer}.` });
    else if (ctx.offer && offEls.length && qHas(qNorm(offTxt), ctx.offer) === false) add({ id: 'offer', group: G1, label: 'Offer', kind: 'conditional', status: 'fail', issue: `Offer differs from the brief ("${offTxt}")`, location: at(offEls[0].part) || scopeName, fix: `Use the offer from the brief: ${ctx.offer}.` });
    else if (!ctx.offer && offEls.length) add({ id: 'offer', group: G1, label: 'Offer', kind: 'conditional', status: 'check', detail: `Shows an offer ("${offTxt}") that is not in the brief. Confirm it is approved before this goes live.`, issue: 'Offer not in the brief', fix: 'Confirm the offer with the client, or remove it.' });
    else add({ id: 'offer', group: G1, label: 'Offer', kind: 'conditional', status: ctx.offer ? 'pass' : 'na', detail: ctx.offer ? 'Matches the brief.' : 'No offer in the brief or on the creative.' });
  }
  // RERA (from the RERA check) and the number against the brief
  if (input.rera && !skip.has('rera')) {
    const r = input.rera, pick = id => r.items.find(i => i.id === id);
    [['reg', 'RERA registration number'], ['qr', 'RERA QR code'], ['zone', 'RERA details placement']].forEach(([id, label]) => { const it = pick(id); if (!it || it.status === 'na') return;
      add({ id: 'rera_' + id, group: G1, label, status: it.status === 'pass' ? 'pass' : it.status === 'fail' ? 'fail' : 'check', priority: 'High', kind: 'mandatory', detail: it.detail, issue: it.status === 'fail' ? `${label}: ${it.detail}` : '', fix: it.fix, location: id === 'zone' ? 'top right' : '', fromRera: true }); });
  }
  if (ctx.rera && anyRead && !skip.has('rera_match') && !checks.some(c => c.id === 'rera_reg' && c.status === 'fail')) {
    const want = qReraIds(ctx.rera), seen = qReraIds(allTxt.toUpperCase());
    if (want.length && seen.length) { const wrong = seen.filter(s => !want.includes(s));
      add(wrong.length ? { id: 'rera_match', group: G1, label: 'RERA number matches the brief', status: 'fail', issue: `RERA number ${wrong.join(', ')} differs from the brief (${want.join(', ')})`, location: 'RERA block / disclaimer', fix: `Use ${want.join(', ')} everywhere it appears.` }
        : { id: 'rera_match', group: G1, label: 'RERA number matches the brief', status: 'pass' }); }
  }
  // image disclaimer by visual type, bottom disclaimer, T&C
  const vt = ctx.visualType || (allQc.map(q => q.visualType).find(v => v && v !== 'unknown')) || null;
  const discTxt = allTxt + ' ' + allQc.map(q => [q.imageDisclaimer, q.bottomDisclaimer].join(' ')).join(' ');
  if (!skip.has('image_disclaimer')) {
    if (!anyRead) add(Object.assign({ id: 'image_disclaimer', group: G1, label: 'Image disclaimer' }, noRead));
    else if (ctx.disclaimer) { const ok = qHas(qNorm(discTxt), ctx.disclaimer) && qWords(ctx.disclaimer).filter(w => qNorm(discTxt).includes(w)).length >= Math.ceil(qWords(ctx.disclaimer).length * 0.7);
      add({ id: 'image_disclaimer', group: G1, label: 'Image disclaimer (client wording)', kind: 'client', status: ok ? 'pass' : 'fail', issue: 'Client disclaimer is missing or reworded', fix: `Use the client's disclaimer: "${ctx.disclaimer}".`, location: 'small print' }); }
    else {
      const types = vt === 'mixed' ? (allQc.flatMap(q => q.visualSources || []).filter(t => QC_DISCLAIMERS[t])) : vt && QC_DISCLAIMERS[vt] ? [vt] : [];
      if (!types.length) add({ id: 'image_disclaimer', group: G1, label: 'Image disclaimer', status: 'check', detail: 'The source of the visuals (render, stock, AI or actual photo) could not be confirmed. Confirm it, then check the matching disclaimer.', issue: 'Visual source unclear', fix: "Confirm the visual source; then use Artist's Impression*, Representative Image*, AI Image* or Actual Image* accordingly." });
      else types.forEach(t => { const d = QC_DISCLAIMERS[t], ok = d.rx.test(discTxt);
        add({ id: 'image_disclaimer_' + t, group: G1, label: `Image disclaimer: ${d.expect}`, status: ok ? 'pass' : 'fail', issue: `${d.label} without "${d.expect}"`, location: 'image area / small print', fix: `Add "${d.expect}" on or under the ${d.label.toLowerCase()}.`, detail: ctx.visualType ? '' : `Visual type from the AI reading: ${d.label.toLowerCase()}. Correct it in the brief if wrong.` }); });
    }
  }
  if (!skip.has('bottom_disclaimer')) {
    const q = allQc.find(x => x.bottomDisclaimer && String(x.bottomDisclaimer).trim().length > 15);
    const small = allEls.filter(e => e.cbox && e.cbox[1] > 0.78 && String(e.text || '').length > 40);
    add(!anyRead ? Object.assign({ id: 'bottom_disclaimer', group: G1, label: 'Bottom disclaimer' }, noRead)
      : q || small.length ? { id: 'bottom_disclaimer', group: G1, label: 'Bottom disclaimer', status: 'pass' }
      : { id: 'bottom_disclaimer', group: G1, label: 'Bottom disclaimer', status: 'fail', issue: 'Bottom disclaimer is missing', location: video ? 'end frame, bottom' : 'bottom', fix: 'Add the legal disclaimer line at the bottom (as approved by the client).' });
  }
  const starting = /\b(from|starting|onwards|upwards|start(s)? at)\b|\*/i.test(priceTxt) || shown.length > 0 && /\*/.test(priceTxt);
  const needTnc = starting || qcConfigs(txt).length > 1 || ofType('offer').length > 0 || !!ctx.offer;
  if (!skip.has('tnc')) {
    const ok = /t\s*&\s*c|t\s*and\s*c|terms\s*(and|&)\s*conditions/i.test(discTxt) || allQc.some(q => q.tnc === true);
    add(!anyRead ? Object.assign({ id: 'tnc', group: G1, label: 'T&C Apply*', kind: 'conditional', priority: 'Medium' }, noRead)
      : !needTnc ? { id: 'tnc', group: G1, label: 'T&C Apply*', kind: 'conditional', priority: 'Medium', status: ok ? 'pass' : 'na', detail: 'Not needed: no starting price, multiple configurations or offer.' }
      : { id: 'tnc', group: G1, label: 'T&C Apply*', kind: 'conditional', priority: 'Medium', status: ok ? 'pass' : 'fail', issue: `"T&C Apply*" missing${starting ? ' with a starting price' : ofType('offer').length ? ' with an offer' : ' with several configurations'}`, location: 'small print', fix: 'Add "*T&C Apply" near the price / offer or in the small print.' });
    if (starting && shown.length && !/\*/.test(priceTxt) && anyRead) add({ id: 'price_asterisk', group: G1, label: 'Starting price marked *', kind: 'conditional', priority: 'Medium', status: 'fail', issue: 'Starting price has no asterisk', location: 'price', fix: 'Mark the starting price with * and explain it in the disclaimer (e.g. "*Starting price, T&C apply").' });
  }

  // ---------- B. Visual quality (every part that was read) ----------
  const G2 = 'Visual quality';
  const art = allQc.flatMap(q => (q.artifacts || []).map(a => Object.assign({ _p: q._p }, typeof a === 'string' ? { what: a } : a)));
  add(!anyRead ? Object.assign({ id: 'ai_artifacts', group: G2, label: 'No AI distortions or anomalies' }, noRead, { priority: 'High' })
    : art.length ? { id: 'ai_artifacts', group: G2, label: 'No AI distortions or anomalies', priority: 'High', status: 'fail', issue: `Visual anomalies: ${art.map(a => a.what).join('; ')}`, location: art.map(a => [at(a._p), a.box ? qZone(a.box).replace('-', ' ') : ''].filter(Boolean).join(', ')).filter(Boolean).join(' · '), fix: 'Retouch or regenerate those areas, then check again at full size.' }
    : { id: 'ai_artifacts', group: G2, label: 'No AI distortions or anomalies', priority: 'High', status: 'pass', detail: 'None seen in the AI reading. Check fine detail (hands, text, edges) at full size.' });
  const hum = allQc.filter(q => q.humans === 'unnatural');
  if (allQc.some(q => q.humans && q.humans !== 'none')) add(hum.length ? { id: 'humans', group: G2, label: 'People look natural', priority: 'High', status: 'fail', issue: `People look unnatural${hum[0].humansNote ? ': ' + hum[0].humansNote : ''}`, location: hum.map(q => at(q._p)).filter(Boolean).join(', '), fix: 'Replace or retouch the people (hands, faces, proportions, lighting).' }
    : { id: 'humans', group: G2, label: 'People look natural', priority: 'High', status: 'pass' });
  const mism = allQc.filter(q => q.visualMatches === 'no');
  add(!anyRead ? Object.assign({ id: 'render', group: G2, label: 'Correct project render, matches the concept', priority: 'High' }, noRead)
    : mism.length ? { id: 'render', group: G2, label: 'Correct project render, matches the concept', priority: 'High', status: 'fail', issue: `Visual may not fit the concept${mism[0].visualNote ? ': ' + mism[0].visualNote : ''}`, location: mism.map(q => at(q._p)).filter(Boolean).join(', '), fix: 'Use the approved project render for this concept.' }
    : { id: 'render', group: G2, label: 'Correct project render, matches the concept', priority: 'High', status: 'check', detail: 'Compare with the approved renders: the tool cannot tell whether a render belongs to this project.' });
  add({ id: 'architecture', group: G2, label: 'Original architecture and interiors retained', priority: 'High', status: 'check', detail: 'Compare with the original renders (no added floors, changed façades or invented interiors).' });
  if (ctx.festival || allQc.some(q => q.festive && q.festive !== 'none')) { const irr = allQc.filter(q => q.festive === 'irrelevant');
    add(irr.length ? { id: 'festive', group: G2, label: 'Festive elements fit the occasion', kind: 'conditional', priority: 'Medium', status: 'fail', issue: `Festive elements may not fit ${ctx.festival || 'the occasion'}${irr[0].festiveNote ? ': ' + irr[0].festiveNote : ''}`, location: irr.map(q => at(q._p)).filter(Boolean).join(', '), fix: `Use motifs specific to ${ctx.festival || 'the festival'}.` }
      : { id: 'festive', group: G2, label: 'Festive elements fit the occasion', kind: 'conditional', priority: 'Medium', status: anyRead ? 'pass' : 'check' }); }
  // cropping: text or logos touching the edge
  const cut = allEls.filter(e => ['headline', 'subhead', 'price', 'offer', 'cta', 'logo', 'project_name', 'location', 'contact', 'website', 'rera', 'qr'].includes(e.type) && e.cbox && (e.cbox[0] < 0.006 || e.cbox[1] < 0.006 || e.cbox[0] + e.cbox[2] > 0.994 || e.cbox[1] + e.cbox[3] > 0.994));
  const cutQ = allQc.flatMap(q => (q.cropped || []).map(w => ({ what: w, _p: q._p })));
  add(!anyRead ? Object.assign({ id: 'cropping', group: G2, label: 'Nothing important cropped', priority: 'Medium' }, noRead)
    : cut.length || cutQ.length ? { id: 'cropping', group: G2, label: 'Nothing important cropped', priority: 'Medium', status: 'fail', issue: `May be cut off at the edge: ${cut.map(e => `${e.type.replace('_', ' ')}${e.text ? ' "' + String(e.text).slice(0, 30) + '"' : ''}`).concat(cutQ.map(x => x.what)).join('; ')}`, location: cut.map(e => [at(e.part), qZone(e.cbox).replace('-', ' ')].filter(Boolean).join(', ')).concat(cutQ.map(x => at(x._p))).filter(Boolean).join(' · '), fix: 'Keep text and logos at least 5% in from every edge (the safe area).' }
    : { id: 'cropping', group: G2, label: 'Nothing important cropped', priority: 'Medium', status: 'pass' });
  // readability: measured on the pixels when available (size on a phone + contrast), else estimated from the boxes
  const LG = input.legibility || null;
  if (LG && LG.length) {
    const bad = LG.filter(x => !x.small && x.verdict === 'fail'), warn = LG.filter(x => !x.small && x.verdict === 'warn'), sBad = LG.filter(x => x.small && x.verdict === 'fail');
    const desc = list => list.slice(0, 4).map(x => `"${x.text.slice(0, 28)}${x.text.length > 28 ? '…' : ''}" (${x.px} px${x.contrastOk !== 'ok' && x.contrast != null ? `, contrast ${x.contrast}:1` : ''})`).join(', ') + (list.length > 4 ? ` and ${list.length - 4} more` : '');
    const where = list => list.map(x => [at(x.part), qZone(x.cbox).replace('-', ' ')].filter(Boolean).join(', ')).filter((v, k, a) => a.indexOf(v) === k).slice(0, 4).join(' · ');
    add(bad.length ? { id: 'readable', group: G2, label: 'All information readable', priority: 'Medium', status: 'fail', issue: `Hard to read on a phone: ${desc(bad)}`, location: where(bad), fix: 'Make it bigger (main text at least 13 px on a phone) or raise its contrast (at least 4.5:1, e.g. a solid or darkened band behind it).' }
      : { id: 'readable', group: G2, label: 'All information readable', priority: 'Medium', status: 'pass', detail: `Measured ${LG.filter(x => !x.small).length} text lines at phone size.` });
    if (warn.length) add({ id: 'readable_warn', group: G2, label: 'Text comfortable to read', kind: 'recommendation', priority: 'Low', status: 'fail', issue: `Borderline legibility: ${desc(warn)}`, location: where(warn), fix: 'A little larger or more contrast would make these easier to read in the feed.' });
    if (sBad.length) add({ id: 'small_print', group: G2, label: 'Small print legible', priority: 'Medium', kind: 'conditional', status: 'fail', issue: `Small print too small or faint: ${desc(sBad)}`, location: where(sBad), fix: 'Make the RERA line and disclaimers legible at feed size; several state rules ask for them as large as the contact details.' });
  } else {
    const tiny = allEls.filter(e => e.cbox && e.text && ['headline', 'subhead', 'price', 'offer', 'cta', 'location', 'project_name'].includes(e.type) && e.cbox[3] / Math.max(1, String(e.text).split('\n').length) < 0.022);
    const unr = allQc.flatMap(q => (q.unreadable || []).map(w => ({ what: w, _p: q._p })));
    add(!anyRead ? Object.assign({ id: 'readable', group: G2, label: 'All information readable', priority: 'Medium' }, noRead)
      : tiny.length || unr.length ? { id: 'readable', group: G2, label: 'All information readable', priority: 'Medium', status: 'fail', issue: `Hard to read on a phone: ${tiny.map(e => `"${String(e.text).slice(0, 28)}"`).concat(unr.map(x => x.what)).join('; ')}`, location: tiny.map(e => [at(e.part), qZone(e.cbox).replace('-', ' ')].filter(Boolean).join(', ')).concat(unr.map(x => at(x._p))).filter(Boolean).join(' · '), fix: 'Enlarge the text (main lines at least 3% of the height) or raise its contrast with the background.' }
      : { id: 'readable', group: G2, label: 'All information readable', priority: 'Medium', status: 'pass' });
  }
  if (input.safeZone && input.safeZone.issues) { const z = input.safeZone, iss = z.issues;
    add(iss.length ? { id: 'safe_zone', group: G2, label: `Key details clear of the ${z.label} interface`, priority: 'Medium', status: 'fail', issue: `Under the ${z.label} interface: ${iss.map(x => `${x.label}${x.zone ? ' (' + x.zone + ')' : ''}`).join(', ')}`, location: iss.map(x => at(x.part)).filter(Boolean).filter((v, k, a) => a.indexOf(v) === k).join(', ') || z.label, fix: z.note || 'Move these into the safe area.' }
      : { id: 'safe_zone', group: G2, label: `Key details clear of the ${z.label} interface`, priority: 'Medium', status: 'pass' }); }
  const sp = allQc.flatMap(q => (q.spelling || []).map(s => Object.assign({ _p: q._p }, typeof s === 'string' ? { text: s } : s)));
  add(!anyRead ? Object.assign({ id: 'spelling', group: G2, label: 'No spelling or grammar errors', priority: 'Medium' }, noRead)
    : sp.length ? { id: 'spelling', group: G2, label: 'No spelling or grammar errors', priority: 'Medium', status: 'fail', issue: `Spelling / grammar: ${sp.map(s => `"${s.text}"${s.fix ? ' → "' + s.fix + '"' : ''}`).join('; ')}`, location: sp.map(s => at(s._p)).filter(Boolean).join(', '), fix: 'Correct the text as shown.' }
    : { id: 'spelling', group: G2, label: 'No spelling or grammar errors', priority: 'Medium', status: 'pass', detail: 'None found in the text the AI read. Proofread small print by eye.' });
  const busy = parts.filter(p => p.scores && p.scores.clutter >= 78);
  if (busy.length) add({ id: 'layout', group: G2, label: 'Balanced layout', kind: 'recommendation', priority: 'Low', status: 'fail', issue: 'Layout is busy', location: busy.map(at).filter(Boolean).join(', '), fix: 'Remove decorative elements and give the price and project name more space.' });

  // ---------- C. Video: flow, voiceover, branding, technical ----------
  if (video) {
    const G3 = 'Visual flow & storytelling', G4 = 'Voiceover, supers & audio', G5 = 'Branding & end frame', G6 = 'Technical quality';
    const sc = parts.filter(p => p.scores), avg = sc.length ? sc.reduce((s, p) => s + p.scores.overall, 0) / sc.length : null, hook = parts.find(p => /hook|1 s/i.test(p.label)) || parts[0];
    if (hook && hook.scores) add(hook.scores.overall >= Math.max(50, (avg || 0) - 5) ? { id: 'hook', group: G3, label: 'Opening hook engaging', kind: 'recommendation', priority: 'Medium', status: 'pass', detail: `Hook frame scores ${hook.scores.overall}.` }
      : { id: 'hook', group: G3, label: 'Opening hook engaging', kind: 'recommendation', priority: 'Medium', status: 'fail', issue: `Weak opening hook (attention ${hook.scores.overall}${avg ? ` against ${Math.round(avg)} for the video` : ''})`, location: at(hook), fix: 'Open on the strongest shot with one clear subject and a large line of text.' });
    const tr = input.transcript && input.transcript.text ? input.transcript : null;
    if (ctx.script && tr) { const sw = qWords(ctx.script), said = new Set(qWords(tr.text)), miss = sw.filter(w => !said.has(w)), share = sw.length ? 1 - miss.length / sw.length : 1;
      add(share >= 0.8 ? { id: 'script', group: G3, label: 'Follows the approved script', priority: 'High', status: 'pass', detail: `${qPct(share)} of the script's words are in the voiceover.` }
        : { id: 'script', group: G3, label: 'Follows the approved script', priority: 'High', status: 'fail', issue: `Voiceover departs from the approved script (${qPct(share)} of its words heard)`, location: 'voiceover', fix: `Re-record to the script. Missing words include: ${[...new Set(miss)].slice(0, 12).join(', ')}.` }); }
    else add({ id: 'script', group: G3, label: 'Follows the approved script', priority: 'High', status: 'check', detail: !ctx.script ? 'Add the approved script to the brief (context.script) to compare automatically.' : 'Transcribe the voiceover (Sound tab) to compare it with the script.' });
    // supers against the voiceover, moment by moment
    if (tr && (tr.segments || []).length && read.length) {
      const off = read.filter(p => { const sup = qWords((p.elements || []).filter(e => ['headline', 'subhead', 'price', 'offer', 'location', 'other_text'].includes(e.type)).map(e => e.text).join(' ')); if (sup.length < 2) return false;
        const near = qWords(tr.segments.filter(s => s.end >= p.t - 2.5 && s.start <= p.t + 2.5).map(s => s.text).join(' ')); if (!near.length) return false;
        return sup.filter(w => near.includes(w)).length / sup.length < 0.25; });
      add(off.length ? { id: 'supers_vo', group: G4, label: 'Supers match the voiceover', priority: 'Medium', status: 'fail', issue: 'On-screen text and voiceover say different things', location: off.map(at).join(', '), fix: 'Make each super a short version of the line being spoken at that moment.' }
        : { id: 'supers_vo', group: G4, label: 'Supers match the voiceover', priority: 'Medium', status: 'pass' });
    } else add({ id: 'supers_vo', group: G4, label: 'Supers match the voiceover', priority: 'Medium', status: 'check', detail: tr ? 'Read the video moments with AI to compare the supers with the voiceover.' : 'Transcribe the voiceover (Sound tab) and read the moments with AI to compare automatically.' });
    const pc = input.pacing;
    if (pc && pc.supers && pc.supers.length) { const sh = pc.supers.filter(x => x.short);
      add(sh.length ? { id: 'supers_time', group: G4, label: 'Supers on screen long enough', priority: 'Medium', status: 'fail', issue: `Supers too short to read: ${sh.slice(0, 4).map(x => `"${x.text.slice(0, 30)}" (${x.words} words, about ${x.shown} s, needs ${x.need} s)`).join('; ')}`, location: sh.map(x => x.label).filter((v, k, a) => a.indexOf(v) === k).join(', '), fix: 'Hold each super about 0.6 s plus 1 s for every 3 words, or cut its words.' }
        : { id: 'supers_time', group: G4, label: 'Supers on screen long enough', priority: 'Medium', status: 'pass', detail: `Each super read sits in a shot long enough to read it (${pc.supers.length} checked; supers that span cuts are not measured).` }); }
    else add({ id: 'supers_time', group: G4, label: 'Supers on screen long enough', priority: 'Medium', status: 'check', detail: 'Read the moments with AI (and add the video file for the shot scan) to measure this; otherwise play the video and check each super stays up long enough to read twice (about 1 s per 3 words).' });
    const p = input.sound && input.sound.profile;
    if (p && p.hasAudio === false) add({ id: 'vo_audible', group: G4, label: 'Voiceover clearly audible', kind: 'conditional', priority: 'Medium', status: 'check', detail: 'No soundtrack: confirm the video is meant to run silent.' });
    else if (p && p.hasAudio) {
      add(p.firstVoiceAt == null ? { id: 'vo_audible', group: G4, label: 'Voiceover clearly audible', kind: 'conditional', priority: 'Medium', status: 'check', detail: 'No voice was detected: confirm the video is music-only by design.' }
        : p.loudness != null && p.loudness < -20 ? { id: 'vo_audible', group: G4, label: 'Voiceover clearly audible', priority: 'Medium', status: 'fail', issue: `Soundtrack is quiet (${p.loudness} LUFS)`, location: 'whole video', fix: 'Master to between -16 and -12 LUFS.' }
        : { id: 'vo_audible', group: G4, label: 'Voiceover clearly audible', priority: 'Medium', status: 'pass' });
      const gap = p.voiceLevel != null && p.otherLevel != null && p.musicShare > 0.03 ? p.voiceLevel - p.otherLevel : null;
      if (p.firstVoiceAt != null) add(gap != null && gap < 6 ? { id: 'music_balance', group: G4, label: 'Music does not overpower the voice', priority: 'Medium', status: 'fail', issue: `Music is only about ${Math.max(0, Math.round(gap))} dB below the voice`, location: 'under the voiceover', fix: 'Duck the music by about 10 dB while someone speaks.' }
        : { id: 'music_balance', group: G4, label: 'Music does not overpower the voice', priority: 'Medium', status: 'pass' });
      add(p.clipped > 0.001 ? { id: 'audio_clean', group: G6, label: 'No audio distortion', priority: 'Medium', status: 'fail', issue: 'Soundtrack clips (distorts at full volume)', location: 'soundtrack', fix: 'Lower the master level slightly before export.' }
        : { id: 'audio_clean', group: G6, label: 'No audio distortion', priority: 'Medium', status: 'pass', detail: 'No clipping found. Listen for clicks and abrupt audio cuts.' });
    } else add({ id: 'vo_audible', group: G4, label: 'Voiceover clearly audible', priority: 'Medium', status: 'check', detail: 'Open the Sound tab to check the soundtrack.' });
    // project logo throughout, in a consistent place
    if (read.length >= 3) { const withLogo = read.filter(p => (p.qc && p.qc.projectLogo && p.qc.projectLogo.present) || (p.elements || []).some(e => e.type === 'logo')), miss = read.filter(p => !withLogo.includes(p));
      add(miss.length ? { id: 'logo_throughout', group: G5, label: 'Project logo visible throughout', priority: 'Medium', status: 'fail', issue: `Project logo missing at ${miss.map(at).join(', ')}`, location: miss.map(at).join(', '), fix: 'Keep the project logo on screen for the whole video, in the same corner.' }
        : { id: 'logo_throughout', group: G5, label: 'Project logo visible throughout', priority: 'Medium', status: 'pass', detail: `On all ${read.length} moments read.` });
      const boxes = withLogo.map(p => ((p.qc && p.qc.projectLogo && p.qc.projectLogo.box) || ((p.elements || []).find(e => e.type === 'logo') || {}).cbox)).filter(Boolean);
      if (boxes.length >= 2) { const zs = [...new Set(boxes.map(qZone))];
        if (zs.length > 1) add({ id: 'logo_consistent', group: G5, label: 'Logo placement consistent', priority: 'Low', status: 'fail', issue: `Logo moves between ${zs.map(z => z.replace('-', ' ')).join(', ')}`, location: 'across the video', fix: 'Keep the logo in one corner throughout.' }); }
    } else add({ id: 'logo_throughout', group: G5, label: 'Project logo visible throughout', priority: 'Medium', status: 'check', detail: 'Read all moments with AI to check the logo across the video.' });
    // end frame
    if (!endRead) add({ id: 'end_frame', group: G5, label: 'End frame complete', priority: 'High', status: 'check', detail: 'Read the end frame with AI to check it has the logos, price, configuration, location, offer, RERA and disclaimers.' });
    else { const need = ['brand_logo', 'project_logo', 'price', 'configuration', 'location', 'offer', 'rera_reg', 'rera_qr'].map(id => checks.find(c => c.id === id)).filter(c => c && c.status === 'fail');
      add(need.length ? { id: 'end_frame', group: G5, label: 'End frame complete', priority: 'High', status: 'fail', issue: `End frame is missing: ${need.map(c => c.label.toLowerCase()).join(', ')}`, location: at(end), fix: 'Complete the end frame (see the items above).' } : { id: 'end_frame', group: G5, label: 'End frame complete', priority: 'High', status: 'pass' }); }
    // repetition: near-identical moments that are not next to each other
    const th = parts.filter(p => p.thumb), rep = [];
    for (let i = 0; i < th.length; i++) for (let j = i + 2; j < th.length; j++) { let d = 0; for (let k = 0; k < 256; k++) d += Math.abs(th[i].thumb[k] - th[j].thumb[k]); if (d / 256 < 5) rep.push([th[i], th[j]]); }
    if (rep.length) add({ id: 'repetition', group: G3, label: 'No unnecessary repetition', kind: 'recommendation', priority: 'Low', status: 'fail', issue: 'The same shot appears more than once', location: rep.slice(0, 3).map(([a, b]) => `${at(a)} and ${at(b)}`).join('; '), fix: 'Replace the repeat with a new angle or information.' });
    add({ id: 'transitions', group: G3, label: 'Logical sequence, no abrupt cuts; visuals match the voiceover', priority: 'Medium', status: 'check', detail: 'Watch the full video: only sampled moments are read.' });
    add({ id: 'represented', group: G3, label: 'Project represented accurately', priority: 'High', status: 'check', detail: 'Compare scenes with the approved renders and the brief.' });
    // technical
    const m = input.media || {};
    if (m.width && m.height) { const ar = m.width / m.height, std = [[9, 16], [4, 5], [1, 1], [16, 9], [4, 3], [2, 3]].find(([a, b]) => Math.abs(ar - a / b) < 0.015), short = Math.min(m.width, m.height);
      add({ id: 'dimensions', group: G6, label: 'Resolution and aspect ratio', priority: 'Medium', status: std && short >= 1080 ? 'pass' : 'fail', detail: `${m.width}×${m.height}${std ? ` (${std[0]}:${std[1]})` : ''}.`,
        issue: !std ? `Unusual aspect ratio (${m.width}×${m.height})` : `Below 1080p (${m.width}×${m.height})`, location: 'file', fix: !std ? 'Export at 9:16 (1080×1920), 4:5 (1080×1350), 1:1 or 16:9.' : 'Export at least 1080 px on the short side.' }); }
    const sm = (input.scan && input.scan.samples) || [];
    if (sm.length) { const black = sm.filter(s => s.mean < 12 && s.std < 8), blank = sm.filter(s => s.mean >= 12 && s.std < 2.5), stp = (input.scan.step || 0.5) * 1.6;
      const ts = list => { const rs = []; list.forEach(s => { const r = rs[rs.length - 1]; if (r && s.t - r[1] <= stp) r[1] = s.t; else rs.push([s.t, s.t]); });
        return rs.slice(0, 5).map(r => r[1] - r[0] < 0.05 ? `${r[0].toFixed(1)} s` : `${r[0].toFixed(1)}–${r[1].toFixed(1)} s`).join(', ') + (rs.length > 5 ? '…' : ''); };
      add(black.length || blank.length ? { id: 'black_frames', group: G6, label: 'No black frames or blank screens', priority: 'High', status: 'fail', issue: [black.length ? `Black frames at ${ts(black)}` : '', blank.length ? `Blank screens at ${ts(blank)}` : ''].filter(Boolean).join('; '), location: ts(black.concat(blank)), fix: 'Trim or replace those frames (check the very start and end of the edit).' }
        : { id: 'black_frames', group: G6, label: 'No black frames or blank screens', priority: 'High', status: 'pass', detail: `Checked ${sm.length} points across the video.` }); }
    else add({ id: 'black_frames', group: G6, label: 'No black frames or blank screens', priority: 'High', status: 'check', detail: 'Add the video file to scan it, or check by eye.' });
    add({ id: 'stretch', group: G6, label: 'No stretched visuals; smooth playback; clean text rendering', priority: 'Medium', status: 'check', detail: 'Watch at full size on a phone.' });
  } else {
    const m = input.media || {};
    if (m.width && m.height) { const ar = m.width / m.height, std = [[4, 5], [1, 1], [9, 16], [16, 9], [1.91, 1], [4, 3], [2, 3]].find(([a, b]) => Math.abs(ar - a / b) < 0.02), short = Math.min(m.width, m.height);
      add({ id: 'dimensions', group: 'Technical quality', label: 'Resolution and aspect ratio', priority: 'Medium', status: std && short >= 1000 ? 'pass' : input.screenshot ? 'check' : 'fail', detail: `${m.width}×${m.height}${std ? ` (${std[0]}:${std[1]})` : ''}.${input.screenshot ? ' This is a feed screenshot: check the original file.' : ''}`,
        issue: !std ? `Unusual aspect ratio (${m.width}×${m.height})` : `Low resolution (${m.width}×${m.height})`, location: 'file', fix: !std ? 'Export at 4:5 (1080×1350), 1:1 (1080×1080) or 9:16 (1080×1920).' : 'Export at least 1080 px wide.' }); }
  }

  // ---------- client-specific rules added later (ctx.qc.rules) ----------
  ((ctx.qc || {}).rules || []).forEach((r0, i) => {
    const rx = r0.mustInclude instanceof RegExp ? r0.mustInclude : new RegExp(String(r0.mustInclude || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), list = r0.where === 'any' || !video ? allTxt : txt;
    const notRx = r0.mustNotInclude ? (r0.mustNotInclude instanceof RegExp ? r0.mustNotInclude : new RegExp(String(r0.mustNotInclude).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) : null;
    const id = r0.id || 'client_' + i, label = r0.label || 'Client rule ' + (i + 1);
    if (!anyRead) return add(Object.assign({ id, group: 'Client-specific', label, kind: 'client', priority: r0.priority || 'High' }, noRead));
    const bad = (r0.mustInclude && !rx.test(list)) || (notRx && notRx.test(allTxt));
    add({ id, group: 'Client-specific', label, kind: 'client', priority: r0.priority || 'High', status: bad ? 'fail' : 'pass', issue: r0.issue || `${label}: not met`, fix: r0.fix || label, location: r0.where === 'end' ? 'end frame' : '' });
  });

  // ---------- the report ----------
  const counts = { pass: 0, fail: 0, check: 0, na: 0 }; checks.forEach(c => { counts[c.status] = (counts[c.status] || 0) + 1; });
  const fails = checks.filter(c => c.status === 'fail'), real = fails.filter(c => c.kind !== 'recommendation'), recs = fails.filter(c => c.kind === 'recommendation');
  const pending = checks.filter(c => c.status === 'check' && c.kind !== 'recommendation');
  const P = { High: 0, Medium: 1, Low: 2 };
  const issues = real.sort((a, b) => P[a.priority] - P[b.priority]).map((c, i) => ({ no: i + 1, id: c.id, issue: c.issue || c.label, location: c.location || '', fix: c.fix || '', priority: c.priority, kind: c.kind }));
  const missing = real.filter(c => /missing/i.test(c.issue || '')).map(c => c.label);
  const correct = checks.filter(c => c.status === 'pass' && !c.confirmed).map(c => c.label + (c.detail ? ` (${c.detail.replace(/\.$/, '')})` : ''));
  const observations = recs.map(c => `${c.issue}${c.location ? ` (${c.location})` : ''}: ${c.fix}`).concat(((input.pacing && input.pacing.notes) || []).filter(t => !/supers cannot be read/.test(t)), (input.notes || []));
  const limits = [];
  if (!anyRead) limits.push('The creative has not been read with AI, so text, logos and disclaimers could not be checked automatically.');
  if (video) limits.push(`Only ${parts.length} moments of the video are read, not every frame; ${read.length} of them with AI.`);
  if (video && !(input.transcript && input.transcript.text)) limits.push('The voiceover has not been transcribed, so the script and supers were not compared with it.');
  limits.push('Logo correctness, render authenticity and architecture need the brand guidelines and approved renders: confirm them by eye.');
  const highReal = real.some(c => c.priority === 'High');
  const status = !anyRead && kind !== 'video' ? QC_STATUSES[3] : video && !anyRead && !endRead ? QC_STATUSES[3] : highReal ? QC_STATUSES[2] : real.length ? QC_STATUSES[1] : QC_STATUSES[0];
  return { assetType: video ? 'Video' : kind === 'carousel' ? 'Carousel' : 'Static Creative', project: ctx.project || '', status, verdictPending: status !== QC_STATUSES[2] && status !== QC_STATUSES[3] ? pending.length : 0,
    counts, checks, correct, issues, missing, observations, limits };
}

/** The report as plain text, in the auditor's format (for copying into a review thread). */
export function qcReportText(r, name) {
  const L = [];
  L.push('ASSET REVIEW', `• Asset Type: ${r.assetType}`, `• Project: ${r.project || 'Not identified'}`, name ? `• Asset: ${name}` : '', `• Review Status: ${r.status}${r.verdictPending ? ` (provisional: ${r.verdictPending} item${r.verdictPending > 1 ? 's' : ''} still to check by eye)` : ''}`, '');
  L.push('A. What is correct'); (r.correct.length ? r.correct : ['Nothing confirmed yet.']).forEach(t => L.push('• ' + t)); L.push('');
  L.push('B. Issues identified'); if (!r.issues.length) L.push('None.'); r.issues.forEach(i => L.push(`${i.no}. ${i.issue} | ${i.location || '—'} | ${i.fix} | ${i.priority}${i.kind !== 'mandatory' ? ' (' + i.kind + ')' : ''}`)); L.push('');
  L.push('C. Missing information'); (r.missing.length ? r.missing : ['None.']).forEach(t => L.push('• ' + t)); L.push('');
  const pend = r.checks.filter(c => c.status === 'check' && c.kind !== 'recommendation');
  if (pend.length) { L.push('To check by eye'); pend.forEach(c => L.push(`• ${c.label}${c.detail ? ': ' + c.detail : ''}`)); L.push(''); }
  L.push('D. Final verdict', r.status, '');
  L.push('E. Additional observations'); (r.observations.length ? r.observations : ['None.']).forEach(t => L.push('• ' + t));
  if (r.limits.length) { L.push('', 'Limits of this review'); r.limits.forEach(t => L.push('• ' + t)); }
  return L.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
}

/** The extra fields the AI reading returns for the quality check (part of the JSON reply). */
export function qcPromptPart() {
  return `"qc":{"brandLogo":{"present":true,"text":"developer name as written, or empty","box":[x,y,w,h]},"projectLogo":{"present":true,"text":"","box":[x,y,w,h]},"visualType":"render|stock|ai|actual|mixed|unknown","visualSources":["render|stock|ai|actual"],"imageDisclaimer":"exact text such as Artist's impression, or empty","bottomDisclaimer":"exact bottom legal text, or empty","tnc":true,"artifacts":[{"what":"visible AI or editing distortion (warped hands, melted text, broken lines)","box":[x,y,w,h]}],"humans":"none|natural|unnatural","humansNote":"","festive":"none|relevant|irrelevant","festiveNote":"","cropped":["important text or logo cut off at the edge"],"unreadable":["text too small or too low in contrast to read on a phone"],"spelling":[{"text":"as written","fix":"corrected"}],"visualMatches":"yes|no|unclear","visualNote":"one short sentence"}`;
}

/**
 * Scan a whole video: black or blank frames, and every cut (shot change). Samples about 4–8 times a second
 * (at most about 300 points) on a tiny canvas. src: a video URL or File.
 * Returns { samples: [{ t, mean, std, diff }], cuts: [t], width, height, duration }.
 */
export async function videoScan(src, onProgress) {
  const url = typeof src === 'string' ? src : URL.createObjectURL(src), v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = url;
  try {
    await new Promise((ok, bad) => { v.onloadeddata = ok; v.onerror = () => bad(new Error('video')); setTimeout(() => bad(new Error('timeout')), 20000); });
    const dur = isFinite(v.duration) ? v.duration : 0, step = Math.min(0.5, Math.max(0.2, dur / 240)), c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d', { willReadFrequently: true }), samples = []; let prev = null;
    const grab = async t => {
      await new Promise(ok => { v.onseeked = ok; v.currentTime = Math.min(t, Math.max(0, dur - 0.05)); setTimeout(ok, 3000); });
      x.drawImage(v, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data, g = new Float32Array(1024); let s = 0, s2 = 0;
      for (let i = 0; i < 1024; i++) { const l = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; g[i] = l; s += l; s2 += l * l; }
      let diff = null; if (prev) { diff = 0; for (let i = 0; i < 1024; i++) diff += Math.abs(g[i] - prev[i]); diff /= 1024; }
      prev = g; const mean = s / 1024; samples.push({ t, mean, std: Math.sqrt(Math.max(0, s2 / 1024 - mean * mean)), diff });
    };
    for (let t = 0.04; t < dur - 0.05; t += step) { await grab(t); if (onProgress) onProgress(Math.min(1, t / dur)); }
    await grab(Math.max(0, dur - 0.08));
    return { samples, cuts: qcCuts(samples), width: v.videoWidth, height: v.videoHeight, duration: dur, step };
  } finally { if (typeof src !== 'string') URL.revokeObjectURL(url); }
}
/** Shot changes from frame-to-frame differences: a jump well above the usual motion, at a local peak. */
export function qcCuts(samples) {
  const ds = samples.map(s => s.diff).filter(v => v != null).sort((a, b) => a - b); if (ds.length < 4) return [];
  const med = ds[Math.floor(ds.length / 2)], thr = Math.max(16, med * 3.5), cuts = [];
  for (let i = 1; i < samples.length; i++) { const d = samples[i].diff; if (d == null || d < thr) continue;
    if ((samples[i - 1].diff || 0) > d || (samples[i + 1] && (samples[i + 1].diff || 0) > d)) continue;
    const t = (samples[i - 1].t + samples[i].t) / 2; if (!cuts.length || t - cuts[cuts.length - 1] > 0.3) cuts.push(t); }
  return cuts;
}

/**
 * Pacing of a video: shots, how soon the first cut comes, movement in the opening, whether each super stays up long
 * enough to read, and when the project name and price first appear. scan: videoScan(); parts: the video moments
 * ({ t, label, read, elements }). Returns { shots, avgShot, firstCut, openingMotion, firstSeen: { name, price }, supers: [...], notes: [...] }.
 */
export function videoPacing(scan, parts = [], duration) {
  if (!scan || !scan.samples || !scan.samples.length) return null;
  const dur = duration || scan.duration, cuts = scan.cuts || [], edges = [0].concat(cuts, [dur]), shots = [];
  for (let i = 0; i < edges.length - 1; i++) if (edges[i + 1] - edges[i] > 0.05) shots.push({ t0: edges[i], t1: edges[i + 1], len: edges[i + 1] - edges[i] });
  const avgShot = shots.length ? dur / shots.length : dur, firstCut = cuts[0] != null ? cuts[0] : null;
  const open = scan.samples.filter(s => s.t <= 2 && s.diff != null), openingMotion = open.length ? open.reduce((p, s) => p + s.diff, 0) / open.length : null;
  const shotAt = t => shots.find(s => t >= s.t0 && t < s.t1) || shots[shots.length - 1];
  const SUP = ['headline', 'subhead', 'price', 'offer', 'location', 'project_name', 'cta'];
  const supers = parts.filter(p => p.read).flatMap(p => (p.elements || []).filter(e => SUP.includes(e.type) && e.text).map(e => {
    const w = String(e.text).trim().split(/\s+/).length, sh = shotAt(p.t), need = Math.round((0.6 + w / 3) * 10) / 10;
    return { t: p.t, label: p.label, text: String(e.text).trim(), words: w, shown: sh ? Math.round(sh.len * 10) / 10 : null, need, short: sh ? sh.len + 0.05 < need : false };
  }));
  const first = re => { const p = parts.filter(x => x.read).sort((a, b) => a.t - b.t).find(x => (x.elements || []).some(e => re.test(e.type))); return p ? p.t : null; };
  const firstSeen = { name: first(/^(project_name|logo)$/), price: first(/^price$/) };
  const notes = [], s1 = v => (Math.round(v * 10) / 10) + ' s';
  if (firstCut == null && dur > 4 && (openingMotion == null || openingMotion < 4)) notes.push(`One continuous shot with little movement for ${s1(dur)}. In the feed, cut or move the camera within the first 2 seconds.`);
  else if (firstCut != null && firstCut > 3 && (openingMotion == null || openingMotion < 4)) notes.push(`The opening shot holds for ${s1(firstCut)} with little movement. Cut or move the camera by 2 seconds to stop the scroll.`);
  if (shots.length > 2 && avgShot < 0.8) notes.push(`Shots average ${s1(avgShot)}: too fast to take in the project or read the supers. Hold key shots for at least 1.5 s.`);
  if (shots.length > 1 && avgShot > 4.5) notes.push(`Shots average ${s1(avgShot)}: slow for a feed ad. Trim each shot to 2–3 s.`);
  const shortS = supers.filter(x => x.short);
  if (shortS.length) notes.push(`Some supers cannot be read in the time they are on screen: ${shortS.slice(0, 3).map(x => `"${x.text.slice(0, 40)}" (${x.words} words, about ${s1(x.shown)} on screen, needs ${s1(x.need)})`).join('; ')}.`);
  if (firstSeen.name != null && firstSeen.name > 3) notes.push(`The project name or logo is first seen at about ${s1(firstSeen.name)}. Show it in the first 3 seconds.`);
  if (firstSeen.price != null && firstSeen.price > dur * 0.6) notes.push(`The price first appears at about ${s1(firstSeen.price)}, late in the video. Show it earlier for people who drop off.`);
  return { shots, cuts, avgShot, firstCut, openingMotion, firstSeen, supers, notes };
}

/** 16×16 grey thumbnail of a canvas or image (to spot repeated shots). */
export function qcThumb(img) {
  const c = document.createElement('canvas'); c.width = c.height = 16; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 16, 16);
  const d = x.getImageData(0, 0, 16, 16).data, out = new Uint8Array(256); for (let i = 0; i < 256; i++) out[i] = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]); return out;
}

/** A 64-bit look-alike hash (dHash) of an image or canvas, as 16 hex characters: near-identical images differ in few bits. */
export function visualHash(img) {
  const c = document.createElement('canvas'); c.width = 9; c.height = 8; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 9, 8);
  const d = x.getImageData(0, 0, 9, 8).data, g = i => 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; let hex = '';
  for (let r = 0; r < 8; r++) { let byte = 0; for (let k = 0; k < 8; k++) byte = (byte << 1) | (g(r * 9 + k) > g(r * 9 + k + 1) ? 1 : 0); hex += byte.toString(16).padStart(2, '0'); }
  return hex;
}
