# Creative heatmap

The Creative studio from Realty Funnel Desk as a standalone module for any dashboard. Add a static, carousel or video ad creative and it shows:

- **Predicted attention:** a heatmap, a focus view and the likely viewing order (1, 2, 3).
- **Scores:** Overall, Focus, Clutter and Contrast, each 0–100.
- **AI reading (optional):** Claude finds the headline, price, call to action, logo, people and other elements, and the panel shows how much attention each one gets.
- **Suggestions:** practical changes to the creative.
- **Performance from CTR down to site visits (optional):** the funnel in the order people move through it, each step against the average: click-through (CTR), click → lead, lead → qualified lead, and qualified lead → site visit. Each step has its cost (per click, lead, QL and site visit). The weakest step opens by default with what to change, and any step can be opened for its detail. Results come from Realty Funnel Desk or any other dashboard.
- **Carousels:** a score for each card, the strongest card, and checks on the sequence (first card, where the price and call to action sit, card shapes, number of cards). You can move cards and make any card the first.
- **Videos:** a heatmap at 1 s (the hook), 3 s, 5%, 10%, 15%, 25%, 50% (the middle), 75% and the end frame. Moments that fall within a quarter of a second of each other are read once. *Attention across the video* charts the score at each moment and flags a weak hook, dips and a fading end. Change the moments with `VIDEO_MARKS` / `videoMarks(duration, marks)`.
- **Sound (videos):** the panel listens to the soundtrack in the browser. It reports:
  - whether there is sound, its average loudness and peak, and any clipping;
  - how long the opening is silent and when the voice starts;
  - the share of voice, music (or other sound) and silence, on a timeline.

  Voice is found by the Silero VAD speech-detection network (MIT licence), run in plain JavaScript in the browser. It hears a voiceover over a music bed, and tells speech from instruments and beats. It matches the official model to within 0.02 in probability. On a 40-second voiceover reel with a music bed, it measured 85% voice against 84% from the official model. On instrumental, orchestral, drum-and-bass and trumpet music, it measured 0%. Loudness is integrated LUFS (ITU-R BS.1770 / EBU R128), the measure Instagram, Facebook and YouTube normalise to; it matched ffmpeg's meter to 0.1 LU. A 40-second video takes about 1–2 seconds to analyse.

  It then suggests changes: start the sound on the first frame, add a voice line, captions for muted viewers, duck the music under the voice, and loudness targets. With a speech-to-text service connected, it also transcribes the voiceover. It checks that the script names the project, location, price and configuration and asks for a site visit, and judges its speed and opening line. The AI reading of the frames then judges the script too. Claude reads images, not audio, so transcription needs a speech-to-text service (see section 6).
- **New versions (creative ideas):** four distinct ideas at a time, and "More ideas" brings new angles. Each idea has:
  - an angle (price first, location and connectivity, view and lifestyle, site-visit invitation, launch offer, amenities, developer and delivery, or space and layout);
  - its own design (editorial, price card, framed photo, photo with a feature list, photo with travel times, or full photo with a price badge) and colour palette (charcoal and gold, white and teal, navy and coral, forest and sand, cream and terracotta, clean white, or colours taken from the photo);
  - copy written from the project details;
  - the photo to use;
  - a note on why it fits.

  Ideas are chosen for the creative's funnel problem and the gaps the AI reading finds (no price, no call to action, too busy). With the AI reading, Claude adds its own ideas for the project. Each idea is scored and gets notes on its own predicted attention. Open one to edit the top line, headline, location line, price, configurations, feature points, travel times, offer, call to action, design, colours, accent or size (feed 1:1, feed 4:5, story/reel 9:16), then compare it with the original, download it as a PNG, or save it through your own storage.

Everything except the AI reading and transcription runs in the viewer's browser. Images and sound are not uploaded anywhere unless you use those, or your own `onSave`.

**Logins:** the panel has no sign-in of its own. Your dashboard's login and roles decide who sees and does what: pass `can` (see below) for the signed-in person. Your server routes for the AI reading, transcription and performance sit behind your own login check.

> The heatmap is a visual-saliency model (contrast, colour, edges and text density, centre bias), calibrated on real-estate feed creatives. It predicts where eyes go in the first seconds; it is not eye-tracking.

## What's in the folder

| Path | What it is |
|---|---|
| `dist/creative-heatmap.js` | Script-tag build: `window.CreativeHeatmap` and the `<creative-heatmap>` element |
| `dist/creative-heatmap.esm.js` | ES module: `import { CreativeHeatmap } from …` |
| `dist/creative-heatmap.css` | Styles, all scoped under `.chm` |
| `src/` | Source: `core.js` (engine), `generator.js` (new version), `widget.js` (panel), `creative-heatmap.css` |
| `server/analyze.cjs` | Server route for the AI reading (Node 18+, works with Express, Next.js or plain `http`) |
| `server/performance-proxy.cjs` | Server route that relays creative performance from Realty Funnel Desk, so the API token stays on the server |
| `server/transcribe.cjs` | Server route that sends a video's voiceover to a speech-to-text service (optional) |
| `src/phone.js` | Phone & placements: safe zones, smart crops and fits, readability and contrast |
| `src/brief.js` | Project brief, plain-language read, designer brief and storyboard, one-page report |
| `src/qc.js` | Quality check: the auditor's checklist against the brief, and the report |
| `server/library-store.cjs` | Server route that keeps the creative library (GET to load, POST to add), so the studio learns across brands and sessions |
| `server/demo-server.cjs` | Demo server |
| `demo/index.html` | Demo with a sample static and a sample carousel (a made-up project) |
| `examples/` | Plain HTML, React and Express examples |
| `build.mjs` | Rebuilds `dist/` from `src/` with `node build.mjs`; nothing to install |
| `src/voice.js`, `src/voice-model.js` | Speech detection (Silero VAD v5 network and its weights) |
| `src/rera-rules.js` | RERA advertising rules by state, each with its basis, sources and the date it was checked |
| `src/rera.js` | The RERA check: QR-code finder, placement, size and banned-claim checks |
| `src/intel.js` | Creative intelligence: element taxonomy, element-level results, combination recommendations, auto-tagging |
| `examples/creative-library.sample.json` | A made-up library (past creatives, their elements and results) for the demo |

There are no dependencies. The speech detector's weights are built into the bundle (about 650 KB of the 790 KB). `NOTICE.md` has the Silero VAD licence.

## Try it

```bash
node server/demo-server.cjs            # http://localhost:8080/demo/
ANTHROPIC_API_KEY=sk-ant-... node server/demo-server.cjs   # with the AI reading
# with real results from Realty Funnel Desk:
PERF_SOURCE_URL=https://your-rfd/api/creative-performance PERF_API_TOKEN=... node server/demo-server.cjs
```

The demo uses made-up performance rows, so the Performance section and the funnel-based ideas show straight away.

**Deploying on Vercel:** see [DEPLOY-VERCEL.md](DEPLOY-VERCEL.md).

## How the studio is laid out

Each creative opens on a **Summary** with five tabs, named by what people want to know:

| Tab | What it answers | Inside |
|---|---|---|
| **Summary** | Is it ready to go live, and what should I fix first? | The verdict in plain words, the top five fixes (required issues first, then results, then design advice), one card per area, all suggestions |
| **Attention** | Where do people look? | Heatmap, scores (overall attention, one clear focus, busy-ness, stands out), where people look first; for videos, attention through the video and pacing |
| **Checks** | Is anything missing, wrong or hard to read? | Quality report · RERA · Phone & placements · Sound (videos) |
| **Results** | How did people respond? | From seeing the ad to visiting the site, against your other ads |
| **Ideas** | What should we make next? | Recommended ideas · Make a new version · Done before? |

The **Learning** view (next to Creatives) shows what has worked across brands: what's working, what to make next, then more detail on request. Long reference material (legal sources, full checklists, tags) sits in fold-outs so the first screen stays short. Open any view from your dashboard with `studio.open('qc')` (or `'rera'`, `'phone'`, `'recommend'`, `'learning'` and so on).

## Add it to your dashboard

### 1. Plain HTML or any framework

```html
<link rel="stylesheet" href="/vendor/creative-heatmap/creative-heatmap.css">
<script src="/vendor/creative-heatmap/creative-heatmap.js"></script>
<div id="creative-studio"></div>
<script>
  const studio = new CreativeHeatmap(document.getElementById('creative-studio'), {
    context: { project: 'Harbourline Residences', brand: 'Harbourline Homes', location: 'Thane', priceRange: '₹1.2 Cr – ₹2.1 Cr' },
    ai: { endpoint: '/api/creative-analyze' },     // leave out to hide the AI reading
  });
</script>
```

### 2. ES module or bundler (Vite, webpack, Next.js)

Copy the folder into your project, or run `npm install ./creative-heatmap`. Then:

```js
import { CreativeHeatmap } from 'creative-heatmap';
import 'creative-heatmap/style.css';
const studio = new CreativeHeatmap(el, { context, ai: { endpoint: '/api/creative-analyze' } });
```

For React, `examples/react.jsx` has a ready wrapper.

### 3. Web component (Angular, Vue, plain pages)

```html
<creative-heatmap ai-endpoint="/api/creative-analyze" title="Creative studio"></creative-heatmap>
<script>
  const el = document.querySelector('creative-heatmap');
  el.context = { project: 'Harbourline Residences', brand: 'Harbourline Homes' };
  el.onSave = async (blob, info) => { /* upload */ };
  el.addEventListener('creative-added', e => console.log(e.detail));
  // el.studio is the CreativeHeatmap instance: el.studio.add([...])
</script>
```

### 4. The AI reading on your server

The API key stays on the server. Add one route and put your own login check in front of it:

```js
const { createAnalyzeHandler } = require('./creative-heatmap/server/analyze.cjs');
app.use(express.json({ limit: '12mb' }));
app.post('/api/creative-analyze', requireLogin, createAnalyzeHandler());
```

Set `ANTHROPIC_API_KEY`. You can also set `ANTHROPIC_MODEL`; the default is `claude-sonnet-5-5`. Without a key the route returns a clear message, and the heatmap, scores, suggestions and new version still work.

To call the AI some other way, pass `ai: { read: async ({ prompt, image, creative, frame }) => resultJson }` instead of `endpoint`.

### 5. Creative performance down to site visits

**From Realty Funnel Desk.** Its server answers `GET /api/creative-performance?project=<id or name>&from=YYYY-MM-DD&to=YYYY-MM-DD` with one row per ad (spend, impressions, clicks, leads, QL, SV) and the project total. The numbers come from the uploaded platform exports and CRM data, using the same rules as its dashboard. Signed-in users only get their own projects. Other systems use a read-only token.

1. On Realty Funnel Desk, set `PERF_API_TOKEN` to a long random value.
2. On your dashboard's server, add the relay:
   ```js
   const { createPerformanceProxy } = require('./creative-heatmap/server/performance-proxy.cjs');
   app.get('/api/creative-performance', requireLogin, createPerformanceProxy({
     source: 'https://your-rfd/api/creative-performance', token: process.env.PERF_API_TOKEN,
     allowProject: (req, project) => userCanSee(req.user, project),   // optional
   }));
   ```
3. In the panel:
   ```js
   performanceFeed: { url: '/api/creative-performance?project=Harbourline Residences&from=2026-09-01&to=2026-09-30' }
   ```

Each creative is matched to its ad by name. The matching copes with capitals, underscores, run-together words and file extensions, so "Static12 Connectivity.jpg" finds "Static12-Connectivity". When the names are too different, pick the ad from the list in the Performance section. The `onChange` event `matched` tells you, so you can store the pairing (`creative.perfName`).

QL and SV appear when the uploaded exports or CRM data carry them by ad name, or by UTM content naming the ad. Otherwise the panel says that they are missing.

**From any other dashboard.** Pass the rows directly, `performanceFeed: { rows: [...], average }`. Or pass a function, `performance: async (creative) => ({ spend, impressions, clicks, leads, ql, sv, average: {…} })`. Common field names are recognised: `amount_spent`, `link_clicks`, `qualified_leads`, `site_visits` and so on.

### 6. Voiceover transcription (optional)

The panel sends a 16 kHz mono WAV of the soundtrack (about 32 KB a second) to your server. `server/transcribe.cjs` forwards it to a speech-to-text service with the common `audio/transcriptions` API.

```js
const { createTranscribeHandler } = require('./creative-heatmap/server/transcribe.cjs');
app.post('/api/creative-transcribe', requireLogin, express.raw({ type: 'audio/wav', limit: '25mb' }), createTranscribeHandler());
// panel: transcribe: { endpoint: '/api/creative-transcribe' }
```

Set `TRANSCRIBE_API_KEY`. Optionally also set:
- `TRANSCRIBE_URL` (the default is OpenAI's endpoint; any compatible service works);
- `TRANSCRIBE_MODEL`;
- `TRANSCRIBE_LANGUAGE` (for example `hi`, `mr` or `en`; leave it empty to detect).

For Hindi and Marathi voiceovers, choose a service that handles Indian languages well. For a service with a different API, pass your own function: `createTranscribeHandler({ transcribe: async wav => ({ text, segments, language }) })`. The sound checks (silence, loudness, voice or music) work without any service.

### 7. Logins and roles: your dashboard decides

The module never asks anyone to sign in. Set `can` from your dashboard's own session and role. Anything not listed is allowed:

```js
const studio = new CreativeHeatmap(el, { ..., can: canFor(currentUser) });
// e.g. an executive: { versions: true, save: false, remove: false }; a viewer: { upload: false, ai: false, versions: false, remove: false, edit: false }
studio.setPermissions(canFor(newUser));   // when someone else signs in, or their role changes
```

| Permission | Controls |
|---|---|
| `upload` | Add creatives and carousels, drag and drop |
| `ai` | Read with AI, read all cards, transcribe the voiceover (readings already stored are still shown) |
| `versions` | The New versions tab (ideas and the editor) |
| `save` | Save new version (needs `onSave`) |
| `remove` | Remove a creative |
| `edit` | Move, reorder and remove carousel cards |
| `performance` | The Performance tab and the CTR tile |
| `compliance` | The RERA tab, the RERA tile and the RERA suggestions (ticking "Checked by eye" also needs `edit`) |
| `qc` | The Quality check tab (ticking "checked by eye" also needs `edit`) |
| `learning` | The Learning view (it also needs `performance`) |
| `budget` | Spend and cost per qualified lead in the Learning view; set `false` for clients whose budget is hidden |

Server routes check your login too, not just the panel. With `createPerformanceProxy`, pass `allowProject: (req, project) => …` so each person only gets the projects their role allows. Realty Funnel Desk's own sign-in is not involved: it only sees your server's read-only token.

### 8. RERA check by state

Every real-estate creative must carry its RERA details, and each state sets its own rules. Maharashtra (MahaRERA) wants the registration number, the MahaRERA website and the project QR code together in the top-right corner, with the number and website at least as large as the largest contact or address text. Other states differ: Gujarat wants the block on screen top-right for at least 3 seconds in video, Tamil Nadu and Goa ban travel times, and so on. The **RERA tab** checks each creative against the rules for its state and medium:

- **State** comes from `context.reraState` (a code such as `MH` or a name), else from the project location (Thane, Pune, Noida, Gurugram, Chennai…), else from the shape of `context.rera`. It can be changed in the tab. The state is the **project's** state, not the audience's: a Mumbai project advertised to Delhi still follows MahaRERA.
- **Where it runs**: social feed ad, video, print, hoarding, brochure, portal or radio. The rules differ by medium. In Tamil Nadu, for example, the number and website link may sit in a social post's text, but print needs the QR code top-right at 12 pt or more.
- **What it checks**:
  - registration number (and that it matches `context.rera`)
  - authority website (and flags MahaRERA's older `maharera.mahaonline.gov.in`)
  - QR code (found in the image; when the browser can decode it, it also checks that it opens the authority's site)
  - placement in the required corner
  - text size against the contact / address or project-name text
  - Telangana's permit number
  - Tamil Nadu's promoter details
  - banned claims: travel times, "T&C apply", vague amenity counts
  - spoken details on radio and TV
- **How**: QR codes are found in the browser (BarcodeDetector where available, otherwise a built-in finder-pattern search), and along the whole video for video ads. The text is read from the AI reading, which now also tags `website` and `contact` elements. Without an AI reading, the text items are marked **Check** for a person to confirm with "Checked by eye"; nothing is guessed as passed.
- **New versions** draw the RERA block in the top-right corner for the project's state. Pass `context.reraQr` with the project's QR image from the RERA portal; until then a dashed "QR" placeholder is drawn and flagged. They also drop travel times where they are banned and the "T&C apply" line in Goa.

```js
new CreativeHeatmap(el, {
  context: { project: 'Codename LIT', location: 'Teen Hath Naka, Thane', rera: 'P51700079896', reraQr: '/assets/lit-maharera-qr.png',
             caption: 'the ad\'s post text, optional' },
  compliance: { medium: 'social', onResult: (creative, result) => saveCompliance(creative.name, result) },   // or false to hide
});
```

`onResult` receives `{ code, rule, medium, items: [{ id, label, status: 'pass'|'fail'|'check'|'na', detail, fix }], counts, checked, sources }`. Store it beside the creative for an approval trail.

**Keeping the rules current.** `src/rera-rules.js` lists every state with its basis:

- `order`: the authority's own order;
- `reported`: a decision known from legal or news reports, so confirm the wording;
- `act`: only the RERA Act's Section 11(2) baseline is known.

Each state also has its sources and `RERA_CHECKED` (the date the table was last checked: 31 Oct 2026). When a state issues a new order, edit the table and rebuild, or override a state without rebuilding:

```js
compliance: { rules: { KA: { basis: 'order', summary: '…', media: { default: { requires: ['reg', 'website', 'qr'], zone: 'top-right', size: { ref: 'contact', ratio: 1 } } }, sources: [{ title: '…', url: '…', date: '2026-11-15' }] } } }
```

States with their own advertising orders in the table: Maharashtra, Gujarat, Tamil Nadu, Kerala, Uttar Pradesh, Rajasthan, West Bengal, Goa, Telangana. Act baseline only: Karnataka, Haryana, Andhra Pradesh, Delhi, Punjab, Madhya Pradesh and others. The check is an aid, not legal advice; confirm with the authority or your legal team before an ad goes live.

Engine only: `checkRera({ region, medium, kind, elements, qr, timeline, caption, ctx, manual })`, `detectQR(imageOrCanvas)`, `qrTimeline(videoFileOrUrl)`, `reraRegion(ctx)`, `reraBlockSpec(ctx, medium)`.

### 9. Creative intelligence: recommendations from what worked

The **Recommend** tab turns past creatives into a memory. It works in four steps.

**1. Break every creative into elements.** Each creative is described in the same slots:

| Slot | Values |
|---|---|
| Format | static, carousel, video |
| Headline approach | USP, location, price, reason-why, urgency, scarcity, claim, benefit, mood, metaphor, offer, festive, question |
| USP shown | size, deck, view, location, connectivity, amenities, Vastu, higher floors, developer trust, family, luxury, investment, possession |
| Offer | none, discount, payment plan, book-small-pay-later, prize, deadline, booking amount, spot offer |
| Price | shown, all-inclusive, absent |
| Main visual | building, interior or amenity render, actual photo, people, presenter, AI film, graphic, map |
| Proof signal | "Actual image", "Shot at location", construction progress, reason-why line, hard numbers, track record |
| Call to action | none, learn more, book now, site visit, price sheet, WhatsApp, private viewing, register, call |
| Voice / talent | none, voiceover, presenter |
| Tone | aspirational, rational, urgent, festive, emotional |
| Audience | local, other city, NRI (targeting, used for learning only) |

Tags come from three places:

- the AI reading, which now returns them;
- `autoTag()` on the creative's text and file name;
- a person, editing the tags in the tab.

**2. Link elements to results.** Each creative is compared with its own project's average, so a ₹6 Cr project is never compared with a ₹90 lakh one. An element's lift is the outcome of the creatives that use it, divided by what their spend would have bought at their project's rate. When evidence is thin, the lift is pulled towards 1. It comes with an 80% range.

- **Goals:** qualified leads per ₹, site visits per ₹, leads per ₹, or the qualified share of leads.
- **Shared credit:** a joint (ridge Poisson) model flags elements that may only be riding along with a stronger one.

**3. Recommend combinations.** Each idea combines elements that have done better.

- Elements that have clearly underperformed are never re-used.
- Where no value in a slot has proven itself, the idea leaves that slot open to test, and the card says so.
- USPs and proof points are limited to what the project's own facts support, and offers to a real `context.offer`. The engine never invents a fact.
- Every pick cites the creatives it came from, with their headline where known.
- The copy is written from the project details, with "__" where a number is needed.
- "Draw this idea" opens it in the new-version editor.

**4. Keep learning, across brands.** The studio has two views: **Creatives** (one creative at a time) and **Learning** (everything it knows, across brands).

- **Every creative added joins the library by itself.** Its elements come from the AI reading (or the name and text), and a person's corrections win over later guesses. It counts towards the results once its performance row is matched, either straight away or on a later visit, when the Learning view matches creatives saved earlier to the performance feed.
- **The library is saved on your server.** With `library: { url, save: true }`, the studio POSTs its creatives (elements, headline, results) and its project details whenever something changes. `server/library-store.cjs` keeps them in one JSON file and merges by brand, project and creative name, so creatives from every brand and every person build one memory. A record without results never wipes one that has them.
- **The Learning view** shows, for all brands or one brand:
  - how much it has learned (Early, Growing or Established) and whether the last save worked;
  - totals: spend, leads, qualified leads, cost per qualified lead and site visits;
  - **what to make next** for any project: ideas built from every brand's results, with *Copy brief*, or *Draw this idea* when a creative from that project is open in the studio;
  - which elements go with better results, with ranges, and a † where the joint model disagrees;
  - which elements have not been tried enough yet: the ideas take turns testing them;
  - every creative with its results and its result against its own project, sortable and searchable.

```js
new CreativeHeatmap(el, {
  context: c => projectDetails(c),                       // brand and project for each creative, so the library knows where it belongs
  library: { url: '/api/creative-library', save: true }, // GET loads the library; POST saves what the studio learns
  performanceFeed: { url: '/api/creative-performance' },
  can: { learning: true, budget: !hideBudgetFor(client) },
  startView: 'learning',                                 // optional: open on the Learning view
  onLibrary: (records, { studio, facts }) => {},         // optional: also called on every change
});
```

On the server, behind your login:

```js
const { createLibraryStore } = require('./creative-heatmap/server/library-store.cjs');
const library = createLibraryStore({
  file: '/var/data/creative-library.json',      // outside any static folder
  seed: './creative-library.json',              // optional starting library, used on first run
  canRead: (req, record) => isAssigned(req.session.user, record.project),   // juniors see only their projects
  canWrite: req => req.session.user.role !== 'viewer',
});
app.get('/api/creative-library', requireLogin, library);
app.post('/api/creative-library', requireLogin, library);
```

Engine only:

- `elementEffects(records, { goal })`
- `fitModel(records, { goal })`
- `recommend(records, { ctx, fixed: { format: 'static' } }, { goal, count, explore })`
- `autoTag({ text, name, kind })`
- `supported(ctx)`

**Read the results as directional.** Each estimate is only as good as the number of creatives behind it. Use the recommendations to decide what to test next, not as a forecast.

### 10. Quality check: the auditor's checklist

The **Quality check** tab reviews a static, carousel or video against the brief (`context`) and the *Real Estate Creative & Video Quality Auditor* master instructions, and writes the auditor's report: review status, what is correct, issues (with location or timestamp, the correction, priority, and whether it is mandatory, a client instruction, conditional or only a recommendation), missing information and additional observations. *Copy report* gives it as text in the same format.

| Area | Checked automatically | Left to check by eye |
|---|---|---|
| Branding & mandatory details | Brand logo (and top-left), project logo, project name, price and configuration against the brief, starting price = lowest price in the brief, location, offer (missing, different, or not in the brief), RERA number, QR code and top-right placement (from the RERA check), RERA number against the brief, image disclaimer for the visual type, bottom disclaimer, T&C Apply* and the * on a starting price | That the logo is the current version |
| Visual quality | AI distortions, unnatural people, festive elements, text or logos cut off at the edge, text too small to read, spelling, busy layout | Correct render, original architecture and interiors |
| Video flow | Hook strength (attention at 1 s), voiceover against the approved script (`context.script`, with a transcript), repeated shots | Logical sequence, abrupt cuts, accurate representation |
| Voiceover, supers & audio | Voice level, music under the voice, clipping, supers against the voiceover at each moment | Supers on screen long enough |
| Branding & end frame | Project logo at every moment read and in one place, the end frame has the logos, price, configuration, location, offer, RERA and disclaimers | |
| Technical | Resolution and aspect ratio, black or blank frames (the whole video is scanned about every second) | Stretched visuals, playback |

How it decides:

- **Nothing is assumed correct.** A price, offer or RERA number with nothing in the brief to compare is "check", never "OK"; an offer on the creative that is not in the brief is flagged for confirmation.
- **Status** follows the instructions: *Revisions Required* for any High-priority issue, *Approved with Minor Changes* for Medium or Low ones, *Approved* when every mandatory check passes, and *Unable to Complete Review* when the creative has not been read (with AI) well enough to check the text. While items still need a check by eye, the status says it is provisional; tick them off in the tab.
- **Recommendations** (a weak hook, a busy layout, a repeated shot) are listed under Additional observations and do not change the status.
- **Videos** are read at 1 s, 3 s, 5%, 10%, 15%, 25%, 50%, 75% and the end frame. *Read all moments with AI* reads them all; the end frame carries the mandatory details.

The brief it compares with (all optional; anything missing becomes "check"):

```js
context: {
  project: 'Harbourline Residences', developer: 'Harbourline Homes', location: 'West Pune', micro: 'Baner Annex',
  configs: [{ type: '2 BHK', price: '₹94 lakh' }, { type: '3 BHK', price: '₹1.63 Cr' }], offer: '', rera: 'P51700000000',
  visualType: 'render',               // render | stock | ai | actual | mixed: picks Artist's Impression*, Representative Image*, AI Image* or Actual Image*
  disclaimer: '',                     // the client's own disclaimer wording, which takes priority
  logoZone: 'top-left',               // where this client wants the brand logo
  script: '',                         // the approved voiceover script
  festival: 'Diwali',                 // for festive creatives
  qc: {                               // client-specific additions, kept alongside the baseline
    skip: ['offer'],                  // checks that do not apply to this client
    rules: [{ label: 'Mentions Vastu', mustInclude: 'vastu', priority: 'Medium' },
            { label: 'No assured returns', mustNotInclude: /assured|guaranteed returns/i, fix: 'Remove the returns claim.' },
            { label: 'Site visit line on the end frame', mustInclude: /site visit/i, where: 'end' }],
  },
}
```

Engine only: `checkQuality({ kind, ctx, parts, rera, sound, transcript, media, scan, manual })`, `qcReportText(report, name)`, `videoScan(fileOrUrl)`.

### 11. Phone & placements, pacing and similarity

**Phone & placements tab**

- **Phone view:** the creative at actual size on a typical phone (360 px wide), with every line of text measured: its height on screen and its contrast with what is behind it (WCAG ratio, from the creative's own pixels). Main text needs about 13 px and 4.5:1 (3:1 when large); small print about 7 px. A busy background behind text is flagged too.
- **Placements:** Feed 4:5, Feed 1:1, Reels 9:16, Stories 9:16 and Landscape 1.91:1. Each preview shades where the app's own interface sits (Reels: top 14%, bottom 35% and the buttons on the right; Stories: top 14%, bottom 20%) and outlines the key details in red when they are cut off or covered. The crop follows the creative's details and attention; when a crop would cut something important, the creative is fitted whole on a blurred background instead. Switch between *Crop* and *Fit whole*, and download each version at full size (1080×1350, 1080×1080, 1080×1920, 1200×628). For videos the download is a still of that moment.
- The Quality check uses the same measurements: text readability, small print, and (for 9:16 creatives) details under the Reels interface.

**Pacing (videos, in the Attention tab)**

The whole video is scanned for cuts: shots and their lengths, the first cut, movement in the opening, and, from the AI-read moments, when the project name and price first appear. Each super is compared with the length of the shot it sits in (it needs about 0.6 s plus 1 s for every 3 words), which the Quality check uses for *Supers on screen long enough*. Pacing notes also appear in Suggestions.

**Similarity**

- *Has this been done before?* (Recommend tab): the closest past creatives by elements, headline words and look (a visual hash saved with each creative), with their results against their own project, and how the close ones did together.
- *Ideas you've run most* (Learning view): creatives grouped by format, headline approach, main visual and tone across brands, with how often each idea ran and its result.

Engine only: `placementPlan(ratio, elements, key)`, `placementPlans()`, `drawPlacement()`, `legibility(pixels, elements, ratio)`, `textContrast()`, `videoScan()`, `videoPacing(scan, parts)`, `similarity(a, b)`, `similarCreatives(record, records)`, `ideaClusters(records)`, `visualHash(image)`.

Not yet: fatigue over time needs daily results per creative rather than totals; it can be added once the performance feed sends them.

### 12. Project brief, plain read, shareable report and designer briefs

**Project brief.** The chip next to a creative's name ("Brief 5/6 · fill in") opens a form for the project: name, developer, location, configurations and prices, offer, RERA number and state, USPs, target buyer, which visuals are used, the client's disclaimer wording, logo position, approved voiceover script, and lines the creative must include or must never say. Every creative of that project shares it. The checks compare against it (a "must never say" line becomes a required check), new ideas and designer briefs are written from it, and the Summary says what is still missing. Briefs are saved with the library (`server/library-store.cjs` keeps them per project); pass `briefs: { [project]: brief }` to start with your own and `onBrief(project, brief)` to store edits elsewhere.

**What this ad says.** The AI reading now describes the ad in plain words: the message in one line, who it is aimed at, the promise, what backs it up, what it asks people to do, and whether it has one clear message or several competing ones. It sits at the top of the Summary, and a missing call to action or competing messages become fixes.

**Download report.** One self-contained page per creative (it opens in any browser and prints to PDF): the verdict, what the ad says, the creative next to its heatmap, what to fix first, the areas at a glance, every quality-check issue, items still to check by eye, and ideas for the next version. Pass `onReport(blob, { name, creative, report })` to save it to your dashboard's storage for a shareable link instead of downloading it.

**Designer brief.** Every recommended idea (in Ideas and in Learning) has a *Designer brief*: headline options, line 2, price, offer and call to action; the visual; what must be on every version for this project (logos and position, price exactly as briefed, the state's RERA block, the disclaimer for the visuals used, T&C, client must-haves and must-nots, state bans); sizes with safe areas; what past results say to use and avoid. Switch it to video for a 15 or 30 second storyboard, scene by scene with timings, shots, on-screen text (kept short enough to read) and voiceover, ending on a complete end frame. *Copy brief* and *Download brief* hand it to the designer or editor.

Engine only: `briefStatus(ctx, kind)`, `briefToContext(base, brief)`, `designerBrief(idea, ctx, opts)`, `storyboard(idea, ctx, { seconds })`, `mandatoryElements(ctx)`, `briefText()`, `briefHtml()`, `reportHtml()`.

## Options

| Option | What it does |
|---|---|
| `context` | Project details, as an object or `(creative) => object`. It feeds the AI prompt and pre-fills the new version. Fields: `project, brand, location, micro, inventory, priceRange, configs: [{type, price}], usps, developer, rera, connectivity` |
| `ai` | `{ endpoint, headers }`, `{ read }`, or `null` to hide the AI reading |
| `creatives` | Creatives to show at the start (see `add`) |
| `performanceFeed` | `{ url, headers, credentials }` or `{ rows, average }`: ad-level results matched to creatives by name (see section 5) |
| `performance` | `async (creative) => ({ spend, impressions, clicks, leads, ql, sv, bookings, average })` for one creative. The older `{ cost, avgCost, metric }` still works |
| `onSave` | `async (blob, { name, source, settings })`. Shows a "Save new version" button |
| `onAIResult` | `(creative, result, partIndex)`. Store the reading so it is not paid for twice; pass it back in through `add` |
| `onChange` | `(event, creative)`. Events: `added`, `selected`, `analysed`, `changed` (cards moved or removed), `matched` (ad picked by hand), `listened` (sound checked), `transcribed`, `compliance` (RERA result changed), `tagged` (elements edited), `removed`. Store `creative.transcript` and pass it back as `transcript` in `add` |
| `can` | What the signed-in person may do, from your dashboard's login and roles (see section 7). Everything is allowed by default |
| `transcribe` | `{ endpoint, headers }` or `async (wavBlob, creative) => ({ text, segments: [{ start, end, text }], language })` for the voiceover (see section 6) |
| `title` | Heading. The default is "Creative studio" |
| `allowRemove` | `false` hides "Remove" |
| `library` | Creative intelligence (section 9): `{ records }` or `{ url, headers, save }`, with optional `facts: { [project]: context }`. `save: true` POSTs what the studio learns to `url` (or `save: { url, headers }`) |
| `onLibrary` | `(records, { studio, facts }) => void`, called when the library changes (a creative is added, read, matched or its elements edited) |
| `briefs` | Starting project briefs, `{ [project]: { configs, offer, rera, visualType, disclaimer, script, mustInclude, mustNot, … } }` (section 12) |
| `onBrief` | `(project, brief) => void`, called when someone saves a project brief |
| `onReport` | `async (blob, { name, creative, report }) => void`: save the one-page report yourself (e.g. upload it for a link) instead of downloading it |
| `startView` | `'learning'` to open on the Learning view instead of the creatives |
| `compliance` | RERA check (section 8): `{ region, medium, rules, onResult }`, or `false` to hide it. Context fields used: `rera`, `reraQr`, `reraState`, `caption`, `developer` |

## Methods

- `open(view)`: show a view of the current creative (`'summary'`, `'attention'`, `'qc'`, `'rera'`, `'phone'`, `'sound'`, `'performance'`, `'recommend'`, `'versions'`, `'similar'`) or `'learning'`.

```js
await studio.add(fileList)                                    // images and videos from an <input> or drag-and-drop
await studio.add([{ name, src, screenshot: false, ai }])      // statics from URLs or data URLs
await studio.add([{ name, cards: [{ src, name, ai }, …] }])   // a carousel, in swipe order
await studio.add([{ name, frames: [{ t, src }], duration, videoSrc, transcript }])  // video frames you already extracted (videoSrc lets it hear the sound)
await studio.addCarousel(fileList, 'Optional name')           // the cards of one carousel (sorted by file name: card-1, card-2…)
studio.moveCard(id, from, to)                                  // reorder carousel cards
studio.select(id); studio.remove(id)
studio.list()               // [{ id, name, kind: 'image'|'carousel'|'video', scores, peaks, ai, cards? }]
await studio.result(id)     // { scores, peaks, ai, suggestions, cards?, carousel?: { best, notes } }
studio.setContext(details)  // when the user switches project
studio.setPermissions(can)  // when the signed-in person or their role changes
studio.destroy()
```

Images from another domain need CORS headers (`Access-Control-Allow-Origin`). Otherwise the browser does not let the page read their pixels. Serve them from your own domain, or pass data URLs.

Uploaded videos are read in the browser. MP4 (H.264) works in Chrome, Edge and Safari; WebM works in Chrome, Edge and Firefox.

## Engine only (no panel)

For a score column, a batch job or your own UI:

```js
import { analyse, carouselNotes, suggestions, paintView, funnelSteps, funnelNotes, toFunnel, ideas, drawCreative, audioProfile, soundNotes } from 'creative-heatmap';
const a = await analyse('/media/creative.jpg');          // { scores, peaks, map, display, img, crop }
console.log(a.scores);                                     // { overall, focus, clutter, contrast }
paintView(canvas, a.display.c, a.map, 'heat', a.peaks);    // draw the heatmap on your own canvas
const cards = await Promise.all(urls.map(analyse));
carouselNotes(cards.map(a => ({ a, ai: null })));          // { best, notes }
funnelSteps(toFunnel(adRow), toFunnel(projectTotal));     // CTR → click to lead → lead to QL → QL to SV, each with rate, average, status and note
funnelNotes(toFunnel(adRow), toFunnel(projectTotal));     // { stage: 'ctr'|'form'|'lead'|'sv'|null (weakest step), steps, notes, good }
const sound = await audioProfile(videoFile);               // { hasAudio, loudness, peak, firstSoundAt, firstVoiceAt, segments, … }
soundNotes(sound, transcript, projectDetails);             // { notes, checks }
ideas(projectDetails, { stage: 'sv', count: 4 });          // creative ideas with layout, palette and copy
```

`script-tag` users get the same functions on `window.CreativeHeatmap` (for example `CreativeHeatmap.analyse(url)`).

## Theming

Override the tokens on `.chm` (or on a parent) to match your dashboard:

```css
.chm { --chm-accent: #0b6e4f; --chm-radius: 6px; --chm-font: 'Inter', sans-serif; }
```

The panel follows the system's dark mode. Add the class `chm-light` or `chm-dark` to the element to force one. It adapts to its own width, so it also fits a narrow side panel or a phone.

## What to store in your dashboard

The panel keeps nothing between page loads; your dashboard owns the data. Store:

- The creative files or their URLs, and the carousel card order.
- The AI readings from `onAIResult`. Pass them back as `ai` on statics and on each carousel card, or keyed by frame id on videos: `ai: { f0, f1, f2, p5, p10, p15, p25, p75, end }` (f0 = 1 s, f1 = 3 s, f2 = middle).
- New versions from `onSave`.
- The creative library, if you do not use `server/library-store.cjs`: store what `onLibrary` hands you and pass it back as `library.records`.

Scores are recalculated in the browser each time, which takes under a second per creative, so they do not need storing. Store them if you want to sort or filter by score: `studio.list()` or `analyse()` gives them.

## Notes

- New versions are starting points for the designer, built from the original's photo. Each idea also says which photo would suit it best. Check the price, RERA number, offers and travel times before an ad goes live. Ideas never invent numbers: where the project details lack one, they write `__` or use wording without a number.
- For feed screenshots, pass `screenshot: true`, or include "screenshot" in the file name, so the white app frame around the ad is cropped out.
- `build.mjs` produces `dist/` from `src/`. Edit `src/`, then run `node build.mjs`.
