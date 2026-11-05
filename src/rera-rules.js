// RERA advertising rules by state / region, used by checkRera() in rera.js.
// Every state's rule lists where it comes from (basis + sources) and the date it was last checked.
// Rules change: update this table, or pass your own with the `reraRules` option (same shape) to override a state.
//
// basis: 'order'    the authority's own order or regulation (as published or reported by a legal source)
//        'reported' a regulator decision or notice known from news or legal-update reports; confirm the wording
//        'act'      no state-specific advertising order found; only the RERA Act, 2016 baseline (Section 11(2)) applies
//
// media keys: social (feed post / static or carousel ad), video, print, hoarding, brochure, portal, audio.
// Each medium: { requires: ['reg','website','qr','permit','promoter'], zone: 'top-right'|null, size: {ref, ratio}|{pt}|null,
//                minSeconds (video, inside the zone), cards: 'first'|'every' (carousels / multi-page), spoken (audio) }
// size.ref: 'contact' = at least as large as the largest contact-details / address text; 'project' = a share of the project-name text.

export const RERA_CHECKED = '2026-10-31';

const ACT_SOURCE = { title: 'Real Estate (Regulation and Development) Act, 2016, Section 11(2)', url: 'https://www.indiacode.nic.in/handle/123456789/2158', date: '2016' };
const ACT_MEDIA = { default: { requires: ['reg', 'website'], zone: null, size: null }, audio: { requires: ['reg', 'website'], spoken: true } };

export const RERA_RULES = {
  MH: {
    name: 'Maharashtra', authority: 'MahaRERA', website: 'maharera.maharashtra.gov.in', oldWebsites: ['maharera.mahaonline.gov.in'],
    reg: /\bP[A-Z]?\s?\d{11,13}\b/, basis: 'order',
    summary: 'Registration number, MahaRERA website and the project QR code together in the top-right corner of every advertisement; the number and website at least as large as the largest contact-details or address text; the QR code scannable.',
    media: {
      default: { requires: ['reg', 'website', 'qr'], zone: 'top-right', size: { ref: 'contact', ratio: 1 }, cards: 'every' },
      video: { requires: ['reg', 'website', 'qr'], zone: 'top-right', size: { ref: 'contact', ratio: 1 }, minSeconds: 0 },
      audio: { requires: ['reg', 'website'], spoken: true },
    },
    penalty: '₹10,000 to ₹50,000 per violation (Section 63); not fixed within 10 days counts as a continuing violation.',
    notes: ['Orders 46/2023 (29 May 2023), 46A/2023 (QR code from 1 Aug 2023) and 46C/2025 (8 Apr 2025: top-right corner and font size).',
      'Use the QR code downloaded from the project page on the MahaRERA portal, not a home-made one.',
      'MahaRERA sets no on-screen duration for video; keep the block on screen long enough to scan (the whole video is safest).'],
    sources: [
      { title: 'MahaRERA Order 46C/2025: QR code, font size of registration number and website', url: 'https://complinity.com/legal-update/maharashtra-real-estate-regulatory-authority-maharera-issues-order-regarding-the-mandatory-display-of-qr-code-font-size-specifications-for-maharera-registration-number-and-website-address-in-advertisements-18613/', date: '2025-04-08' },
      { title: 'MahaRERA Order 46A/2023: QR code on every advertisement', url: 'https://taxguru.in/corporate-law/matter-non-display-quick-response-qr-code-promotions-advertisement-real-estate-projects-registered-maharera.html', date: '2023-07-25' },
      { title: 'The Realty Today: QR code and registration number mandatory, ₹50,000 penalty', url: 'https://www.therealtytoday.com/news/maharera-makes-qr-code-registration-number-mandatory-in-ads-50000-penalty-for-violations/', date: '2025-04-12' },
    ],
  },
  GJ: {
    name: 'Gujarat', authority: 'GujRERA', website: 'gujrera.gujarat.gov.in',
    reg: /\bPR\/GJ\/[A-Z0-9 .\/-]+?\/\d{6}\b/i, basis: 'reported',
    summary: 'Registration number, GujRERA website and the project QR code in one block: top-right in print and on the first page of multi-page material, top-right for at least 3 seconds in video, spoken in audio; at least as large as the builder\'s contact details.',
    media: {
      default: { requires: ['reg', 'website', 'qr'], zone: 'top-right', size: { ref: 'contact', ratio: 1 }, cards: 'first' },
      social: { requires: ['reg', 'website', 'qr'], zone: null, size: { ref: 'contact', ratio: 1 }, cards: 'first', note: 'Reported as "at the end of the post" for static social posts; GujRERA has published templates per medium.' },
      video: { requires: ['reg', 'website', 'qr'], zone: 'top-right', size: { ref: 'contact', ratio: 1 }, minSeconds: 3 },
      audio: { requires: ['reg'], spoken: true },
    },
    penalty: 'Legal action under the RERA Act (amount not stated in the reports).',
    notes: ['In force from 15 June 2025. Check the exact block format against GujRERA\'s published templates.'],
    sources: [
      { title: 'Real Estate Law Journal: Gujarat RERA makes QR code and registration display mandatory', url: 'https://realestatelawjournal.in/gujarat-rera-makes-qr-code-and-registration-display-mandatory-in-all-real-estate-ads/', date: '2025-05-29' },
    ],
  },
  TN: {
    name: 'Tamil Nadu', authority: 'TNRERA', website: 'rera.tn.gov.in',
    reg: /\bTN\/\d{1,3}\/(?:Building|Layout)\/\d+\/\d{4}\b/i, basis: 'order',
    summary: 'Print: registration number with the QR code and the TNRERA website, top-right, at least 12 pt, on every page. Hoardings: number and website top-right at at least half the project-name size. Social posts: number and a link to the TNRERA website. No travel times and no vague amenity counts.',
    media: {
      default: { requires: ['reg', 'website', 'qr', 'promoter'], zone: 'top-right', size: { pt: 12 }, cards: 'every' },
      social: { requires: ['reg', 'website', 'promoter'], zone: null, size: null, caption: true, note: 'The number and a link to the TNRERA website may sit in the post text.' },
      video: { requires: ['reg', 'website', 'promoter'], zone: null, size: null, spoken: true, note: 'TV and radio: say the number and website slowly and clearly.' },
      hoarding: { requires: ['reg', 'website', 'promoter'], zone: 'top-right', size: { ref: 'project', ratio: 0.5 } },
      brochure: { requires: ['reg', 'website', 'qr', 'promoter'], zone: null, size: { pt: 12 } },
      portal: { requires: ['reg', 'website', 'qr'], zone: null, size: null },
      audio: { requires: ['reg', 'website'], spoken: true },
    },
    bans: ['travel-time', 'vague-amenities'],
    penalty: 'Sections 61 and 63 of the RERA Act; violations by media houses are reported to the Ministry of Information and Broadcasting.',
    notes: ['TNRERA order of 1 July 2025 amending Regulation 6 of the TNRERA (General) Regulations, 2018.',
      'Every ad must give the promoter\'s name, office address and contact details, and the location as in the approved plan.'],
    sources: [
      { title: 'Mondaq: New guidelines for real estate advertisements in Tamil Nadu', url: 'https://www.mondaq.com/india/real-estate/1649286/new-guidelines-for-real-estate-advertisements-in-tamil-nadu-ensuring-transparency-and-compliance', date: '2025-07-11' },
    ],
  },
  KL: {
    name: 'Kerala', authority: 'K-RERA', website: 'rera.kerala.gov.in',
    reg: /\bK-?RERA\/PRJ\/[A-Z]{2,4}\/\d+\/\d{4}\b/i, basis: 'order',
    summary: 'The project QR code (downloaded from the promoter dashboard) next to the K-RERA registration number and website on all advertisements, legible and scannable.',
    media: { default: { requires: ['reg', 'website', 'qr'], zone: null, size: null, together: true, cards: 'first' }, audio: { requires: ['reg', 'website'], spoken: true } },
    penalty: 'Action under the RERA Act.',
    notes: ['In force from 1 September 2023.'],
    sources: [{ title: 'Housing.com: QR code mandatory for real estate projects from Sep 1, Kerala RERA', url: 'https://housing.com/news/qr-code-mandatory-for-real-estate-projects-from-sep-1-kerala-rera/', date: '2023-08-25' }],
  },
  UP: {
    name: 'Uttar Pradesh', authority: 'UP RERA', website: 'up-rera.in',
    reg: /\bUPRERA(?:PRJ|AGT)\d{3,}\b/i, basis: 'reported',
    summary: 'Registration number and the UP RERA website in bold, large type at a prominent place (highlighted on hoardings, announced clearly on radio and TV); the project QR code in brochures and advertisements.',
    media: { default: { requires: ['reg', 'website', 'qr'], zone: null, size: { ref: 'prominent' }, cards: 'first' }, audio: { requires: ['reg', 'website'], spoken: true } },
    penalty: 'Notices and penalties; media-house violations referred to the Ministry of Information and Broadcasting.',
    notes: ['Standard directions on advertisements (Dec 2023); QR codes for projects (July 2024).'],
    sources: [
      { title: 'Realty n More: UP RERA issues standard directions for advertisements', url: 'https://realtynmore.com/up-rera-issues-standard-directions-for-advertisements-of-projects', date: '2023-12-05' },
      { title: 'The Week (PTI): Promoters must publish project QR codes in brochures and ads', url: 'https://www.theweek.in/wire-updates/business/2024/07/18/nrg17-up-rera-qr-codes.html', date: '2024-07-18' },
    ],
  },
  RJ: {
    name: 'Rajasthan', authority: 'Rajasthan RERA', website: 'rera.rajasthan.gov.in',
    reg: /\bRAJ\/P\/\d{4}\/\d+\b/i, basis: 'reported',
    summary: 'A clearly displayed QR code, the registration number and the RERA website, with essential project information in large type.',
    media: { default: { requires: ['reg', 'website', 'qr'], zone: null, size: { ref: 'prominent' } }, audio: { requires: ['reg', 'website'], spoken: true } },
    penalty: 'Action under the RERA Act.',
    notes: ['Authority decision reported 28 May 2025; check the issued order for placement and size.'],
    sources: [{ title: 'Patrika: QR code mandatory in real estate advertisements (Rajasthan RERA)', url: 'https://www.patrika.com/jaipur-news/real-estate-news-rera-big-decision-the-game-of-tempting-promises-will-not-work-qr-code-will-be-mandatory-in-advertisements-19628612', date: '2025-05-28' }],
  },
  WB: {
    name: 'West Bengal', authority: 'WBRERA', website: 'rera.wb.gov.in',
    reg: /\bWBRERA\/P\/[A-Z]{3}\/\d{4}\/\d+\b/i, basis: 'reported',
    summary: 'Registration number and the WBRERA website in the top-right corner or quadrant, at least one-third of the project-name font size; mentioned on FM radio; ads uploaded to the WBRERA portal each quarter.',
    media: {
      default: { requires: ['reg', 'website'], zone: 'top-right', size: { ref: 'project', ratio: 1 / 3 }, cards: 'first' },
      print: { requires: ['reg', 'website'], zone: 'top-right', size: { ref: 'project', ratio: 1 / 3 }, note: 'Reported: the RERA details should take at least 20% of a print ad\'s space.' },
      audio: { requires: ['reg', 'website'], spoken: true },
    },
    penalty: 'Penalties of up to 5% of the estimated project cost.',
    notes: ['WBRERA order No. 492-RERA/L-01/2023 (reported March 2024). No QR requirement was reported.'],
    sources: [{ title: 'LiveLaw: West Bengal RERA mandates clear display of registration details', url: 'https://livelaw.in/consumer-cases/west-bengal-rera-registration-website-addresses-advertisements-252995', date: '2024-03-21' }],
  },
  GA: {
    name: 'Goa', authority: 'Goa RERA', website: 'rera.goa.gov.in',
    reg: /\bPRGO\d{6,}\b/i, basis: 'reported',
    summary: 'Registration number in the top-right corner of every ad (print, broadcast and portals); no "T&C apply"-style disclaimers, no travel times, and amenities named specifically.',
    media: { default: { requires: ['reg', 'website'], zone: 'top-right', size: null, cards: 'first' }, audio: { requires: ['reg', 'website'], spoken: true } },
    bans: ['tnc-disclaimer', 'travel-time', 'vague-amenities'],
    penalty: 'Action under the RERA Act.',
    notes: ['Goa RERA circular reported August 2025. The website requirement comes from Section 11(2) of the Act.'],
    sources: [{ title: 'Outlook Money: Goa RERA tightens rules on real estate ads, bans disclaimers', url: 'https://www.outlookmoney.com/invest/goa-rera-tightens-rules-on-real-estate-ads-bans-disclaimers-what-it-means-for-homebuyers', date: '2025-08-19' }, ACT_SOURCE],
  },
  TG: {
    name: 'Telangana', authority: 'TG RERA', website: 'rerait.telangana.gov.in',
    reg: /\bP0\d{10}\b/, basis: 'reported',
    summary: 'TG RERA registration number, the competent authority\'s permit number (HMDA, GHMC, DTCP or panchayat) and the TG RERA website in the top-right corner, at least as large as the contact details and address.',
    media: { default: { requires: ['reg', 'permit', 'website'], zone: 'top-right', size: { ref: 'contact', ratio: 1 }, cards: 'first' }, audio: { requires: ['reg', 'permit'], spoken: true } },
    penalty: 'Penalties under the RERA Act (TG RERA has fined developers for ad violations).',
    notes: ['TG RERA public notice under Section 37, as reported; confirm the notice text.'],
    sources: [{ title: 'PropNewz: TG RERA ad permit number and registration check', url: 'https://www.propnewz.com/blog/tg-rera-ad-permit-number-registration-check-hyderabad-buyer-2026-10-21', date: '2026-10-21' }],
  },
  KA: { name: 'Karnataka', authority: 'K-RERA (Karnataka)', website: 'rera.karnataka.gov.in', reg: /\bPRM\/KA\/RERA\/\d+\/\d+\/PR\/\d+\/\d+\b/i, basis: 'act',
    summary: 'RERA Act baseline: registration number and the authority website, prominently. Reported guidance also asks for the all-inclusive price where a price is shown.', media: ACT_MEDIA,
    notes: ['No Karnataka order on QR codes or placement found on ' + RERA_CHECKED + '.'], sources: [ACT_SOURCE] },
  HR: { name: 'Haryana', authority: 'HRERA (Gurugram / Panchkula)', website: 'haryanarera.gov.in', reg: /\b(?:RC\/REP\/HARERA\/GGM\/\d{4}\/\d+|HRERA-PKL-[A-Z]+-\d+-\d{4}|RERA-(?:GRG|PKL)-[A-Z]*-?\d+-\d{4})\b/i, basis: 'act',
    summary: 'RERA Act baseline: registration number and the authority website, prominently.', media: ACT_MEDIA,
    notes: ['No Haryana order on QR codes or placement found on ' + RERA_CHECKED + '; check HRERA Gurugram and Panchkula orders.'], sources: [ACT_SOURCE] },
  AP: { name: 'Andhra Pradesh', authority: 'AP RERA', website: 'rera.ap.gov.in', reg: /\bP\d{11}\b/, basis: 'act',
    summary: 'RERA Act baseline plus AP RERA\'s "RERA Registered" display guidelines (Annexure-A on the AP RERA site).', media: ACT_MEDIA,
    notes: ['Brochures and pamphlets must be filed with the authority before printing (Section 11(2)).'], sources: [{ title: 'AP RERA: Advertisement guidelines', url: 'https://rera.ap.gov.in/RERA/Views/AdvertisementGuidelines.aspx', date: RERA_CHECKED }, ACT_SOURCE] },
  DL: { name: 'Delhi', authority: 'RERA Delhi', website: 'rera.delhi.gov.in', basis: 'act', summary: 'RERA Act baseline: registration number and the authority website, prominently.', media: ACT_MEDIA, sources: [ACT_SOURCE] },
  PB: { name: 'Punjab', authority: 'Punjab RERA', website: 'rera.punjab.gov.in', basis: 'act', summary: 'RERA Act baseline: registration number and the authority website, prominently.', media: ACT_MEDIA, sources: [ACT_SOURCE] },
  MP: { name: 'Madhya Pradesh', authority: 'MP RERA', website: 'rera.mp.gov.in', basis: 'act', summary: 'RERA Act baseline: registration number and the authority website, prominently.', media: ACT_MEDIA, sources: [ACT_SOURCE] },
  IN: { name: 'Other state / UT', authority: 'the state RERA', website: '', basis: 'act', summary: 'RERA Act baseline: registration number and the authority website, prominently. Check the state authority\'s latest advertising orders.', media: ACT_MEDIA, sources: [ACT_SOURCE] },
};

// Places that tell us the state when the project details give a city or locality instead.
export const RERA_PLACES = {
  MH: ['maharashtra', 'mumbai', 'thane', 'navi mumbai', 'pune', 'nagpur', 'nashik', 'bandra', 'andheri', 'powai', 'worli', 'borivali', 'kalyan', 'panvel', 'mira road', 'vasai', 'virar', 'aurangabad', 'kolhapur', 'lonavala', 'bkc', 'pokhran', 'ghodbunder', 'teen hath naka', 'chembur', 'ghatkopar', 'goregaon', 'malad', 'kandivali', 'dombivli', 'kharghar', 'hinjewadi', 'wakad', 'baner', 'kharadi'],
  GJ: ['gujarat', 'ahmedabad', 'surat', 'vadodara', 'gandhinagar', 'rajkot', 'gift city'],
  TN: ['tamil nadu', 'chennai', 'coimbatore', 'madurai', 'trichy', 'tiruchirappalli', 'omr', 'ecr'],
  KL: ['kerala', 'kochi', 'cochin', 'thiruvananthapuram', 'trivandrum', 'kozhikode', 'calicut', 'thrissur'],
  UP: ['uttar pradesh', 'noida', 'greater noida', 'ghaziabad', 'lucknow', 'yamuna expressway', 'kanpur', 'agra', 'varanasi'],
  RJ: ['rajasthan', 'jaipur', 'udaipur', 'jodhpur', 'kota', 'ajmer'],
  WB: ['west bengal', 'kolkata', 'calcutta', 'howrah', 'new town', 'rajarhat', 'siliguri'],
  GA: ['goa', 'panaji', 'panjim', 'margao', 'vasco', 'mapusa', 'porvorim'],
  TG: ['telangana', 'hyderabad', 'secunderabad', 'gachibowli', 'kokapet', 'hitec city', 'warangal'],
  KA: ['karnataka', 'bengaluru', 'bangalore', 'mysuru', 'mysore', 'mangaluru', 'whitefield', 'sarjapur'],
  HR: ['haryana', 'gurugram', 'gurgaon', 'faridabad', 'panchkula', 'sonipat', 'dwarka expressway'],
  AP: ['andhra pradesh', 'visakhapatnam', 'vizag', 'vijayawada', 'amaravati', 'guntur', 'tirupati'],
  DL: ['delhi', 'new delhi'],
  PB: ['punjab', 'mohali', 'ludhiana', 'amritsar', 'jalandhar'],
  MP: ['madhya pradesh', 'indore', 'bhopal', 'jabalpur', 'gwalior'],
};
