// Speech-to-text for video voiceovers. The browser sends a 16 kHz mono WAV of the soundtrack;
// this route forwards it to a transcription service and returns { result: { text, segments, language } }.
// Claude reads images, not audio, so the voiceover needs a speech-to-text service.
//
// Works with any service that offers the common "audio/transcriptions" API (multipart: file, model):
//   TRANSCRIBE_URL      default https://api.openai.com/v1/audio/transcriptions
//   TRANSCRIBE_API_KEY  the service's key (required)
//   TRANSCRIBE_MODEL    default whisper-1
//   TRANSCRIBE_LANGUAGE optional, e.g. hi, mr, en (leave empty to detect)
// For a service with a different API, pass your own function: createTranscribeHandler({ transcribe: async (wavBuffer) => ({ text, segments, language }) })
//
//   app.post('/api/creative-transcribe', requireLogin, createTranscribeHandler());

const MAX = 25 * 1024 * 1024;
function readRaw(req) {
  if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  return new Promise((ok, bad) => { let n = 0; const parts = [];
    req.on('data', c => { n += c.length; if (n > MAX) { bad(Object.assign(new Error('The audio is too long.'), { status: 413 })); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts))); req.on('error', bad); });
}
async function transcribeWav(buf, opts = {}) {
  const key = opts.apiKey || process.env.TRANSCRIBE_API_KEY;
  if (!key) throw Object.assign(new Error('Transcription needs TRANSCRIBE_API_KEY on the server. The sound checks work without it.'), { status: 501 });
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'audio/wav' }), 'voiceover.wav');
  fd.append('model', opts.model || process.env.TRANSCRIBE_MODEL || 'whisper-1');
  fd.append('response_format', 'verbose_json');
  const lang = opts.language || process.env.TRANSCRIBE_LANGUAGE; if (lang) fd.append('language', lang);
  const r = await fetch(opts.url || process.env.TRANSCRIBE_URL || 'https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error('The transcription service returned an error: ' + ((j.error && j.error.message) || r.status)), { status: 502 });
  return { text: j.text || '', language: j.language || lang || '', segments: (j.segments || []).map(s => ({ start: s.start, end: s.end, text: s.text })) };
}
function createTranscribeHandler(opts = {}) {
  return async function transcribeHandler(req, res) {
    const send = (code, obj) => {
      if (typeof res.status === 'function' && typeof res.json === 'function') return res.status(code).json(obj);
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj));
    };
    if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
    try {
      const buf = await readRaw(req);
      if (buf.length < 44 || buf.slice(0, 4).toString() !== 'RIFF') return send(400, { error: 'Send the soundtrack as a WAV file.' });
      const result = opts.transcribe ? await opts.transcribe(buf) : await transcribeWav(buf, opts);
      return send(200, { result });
    } catch (e) { return send(e.status || 500, { error: e.message || 'Transcription failed.' }); }
  };
}
module.exports = { createTranscribeHandler, transcribeWav };
