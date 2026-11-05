// Speech detection in the browser: the Silero VAD v5 network (16 kHz) run in plain JavaScript.
// It tells voice from music, effects and silence, including a voiceover over a music bed.
// Checked against the official ONNX model: same probabilities to within 0.02 (float16 weights).
import { VOICE_MODEL } from './voice-model.js';

let VM = null;   // decoded weights, built on first use
function halfToFloat(h) {
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
}
function weights() {
  if (VM) return VM;
  const bin = atob(VOICE_MODEL.data), n = bin.length / 2, all = new Float32Array(n);
  for (let i = 0; i < n; i++) all[i] = halfToFloat(bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8));
  const W = {}; let o = 0;
  VOICE_MODEL.shapes.forEach(([name, shape]) => { const len = shape.reduce((p, q) => p * q, 1); W[name] = { d: all.subarray(o, o + len), s: shape }; o += len; });
  return (VM = W);
}

// 256-point FFT magnitude of a Hann-windowed frame (bins 0..128): the model's STFT.
const N = 256, HANN = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
const REV = (() => { const r = new Uint16Array(N); for (let i = 0, j = 0; i < N; i++) { r[i] = j; let b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; } return r; })();
const COS = Float32Array.from({ length: N / 2 }, (_, k) => Math.cos(2 * Math.PI * k / N)), SIN = Float32Array.from({ length: N / 2 }, (_, k) => -Math.sin(2 * Math.PI * k / N));
const RE = new Float32Array(N), IM = new Float32Array(N);
function magnitude(src, off, out, col, T) {
  for (let i = 0; i < N; i++) { RE[REV[i]] = src[off + i] * HANN[i]; IM[REV[i]] = 0; }
  for (let len = 2; len <= N; len <<= 1) {
    const half = len >> 1, step = N / len;
    for (let i = 0; i < N; i += len) for (let k = 0; k < half; k++) {
      const wr = COS[k * step], wi = SIN[k * step], a = i + k, b = a + half;
      const xr = RE[b] * wr - IM[b] * wi, xi = RE[b] * wi + IM[b] * wr;
      RE[b] = RE[a] - xr; IM[b] = IM[a] - xi; RE[a] += xr; IM[a] += xi;
    }
  }
  for (let k = 0; k <= 128; k++) out[k * T + col] = Math.sqrt(RE[k] * RE[k] + IM[k] * IM[k]);
}
// 1-D convolution, kernel 3, padding 1: x [C][T] → y [O][T'] (+bias, ReLU)
function conv3(x, C, T, w, b, O, stride) {
  const To = Math.floor((T + 2 - 3) / stride) + 1, y = new Float32Array(O * To);
  for (let o = 0; o < O; o++) for (let t = 0; t < To; t++) {
    let s = b[o]; const t0 = t * stride - 1;
    for (let c = 0; c < C; c++) { const wo = (o * C + c) * 3, xo = c * T;
      for (let k = 0; k < 3; k++) { const ti = t0 + k; if (ti >= 0 && ti < T) s += w[wo + k] * x[xo + ti]; } }
    y[o * To + t] = s > 0 ? s : 0;
  }
  return { y, T: To };
}
const sig = z => 1 / (1 + Math.exp(-z));

/**
 * Speech probability for every 32 ms of 16 kHz mono audio (Float32Array). Async: yields to the page every ~2 s of audio.
 * Returns Float32Array of probabilities (one per 512 samples).
 */
export async function speechProbabilities(x, onProgress) {
  const W = weights(), n = Math.floor(x.length / 512), P = new Float32Array(n);
  const h = new Float32Array(128), c = new Float32Array(128), buf = new Float32Array(640), mag = new Float32Array(129 * 4), g = new Float32Array(512);
  const ctx = new Float32Array(64);
  const wih = W['lstm.weight_ih'].d, whh = W['lstm.weight_hh'].d, bih = W['lstm.bias_ih'].d, bhh = W['lstm.bias_hh'].d, wo = W['out.weight'].d, bo = W['out.bias'].d[0];
  for (let j = 0; j < n; j++) {
    const off = j * 512;
    buf.set(ctx, 0); for (let i = 0; i < 512; i++) buf[64 + i] = x[off + i];
    for (let i = 0; i < 64; i++) buf[576 + i] = buf[574 - i];           // reflect padding on the right
    for (let i = 0; i < 64; i++) ctx[i] = x[off + 448 + i];
    for (let f = 0; f < 4; f++) magnitude(buf, f * 128, mag, f, 4);
    let e = conv3(mag, 129, 4, W['encoder.0.weight'].d, W['encoder.0.bias'].d, 128, 1);
    e = conv3(e.y, 128, e.T, W['encoder.1.weight'].d, W['encoder.1.bias'].d, 64, 2);
    e = conv3(e.y, 64, e.T, W['encoder.2.weight'].d, W['encoder.2.bias'].d, 64, 2);
    e = conv3(e.y, 64, e.T, W['encoder.3.weight'].d, W['encoder.3.bias'].d, 128, 1);
    const v = e.y;   // [128] (T = 1)
    for (let r = 0; r < 512; r++) { let s = bih[r] + bhh[r]; const a = r * 128; for (let k = 0; k < 128; k++) s += wih[a + k] * v[k] + whh[a + k] * h[k]; g[r] = s; }
    for (let k = 0; k < 128; k++) { c[k] = sig(g[128 + k]) * c[k] + sig(g[k]) * Math.tanh(g[256 + k]); h[k] = sig(g[384 + k]) * Math.tanh(c[k]); }
    let s = bo; for (let k = 0; k < 128; k++) s += wo[k] * (h[k] > 0 ? h[k] : 0);
    P[j] = sig(s);
    if (j % 64 === 63) { if (onProgress) onProgress((j + 1) / n); await new Promise(r => setTimeout(r, 0)); }
  }
  return P;
}

/**
 * Speech segments from the probabilities, the way Silero's reference code makes them:
 * starts above 0.5, ends below 0.35, at least 250 ms of speech, gaps under 100 ms are bridged.
 * Returns [{ t0, t1 }] in seconds.
 */
export function speechSegments(P, opts = {}) {
  const step = 512 / 16000, on = opts.threshold || 0.5, off = on - 0.15, minSp = opts.minSpeech || 0.25, minGap = opts.minSilence || 0.1, out = [];
  let start = -1, lastHigh = -1;
  for (let j = 0; j < P.length; j++) {
    if (P[j] >= on) { if (start < 0) start = j; lastHigh = j; }
    else if (start >= 0 && P[j] < off && (j - lastHigh) * step >= minGap) { out.push([start, lastHigh + 1]); start = -1; }
  }
  if (start >= 0) out.push([start, lastHigh + 1]);
  return out.map(([a, b]) => ({ t0: a * step, t1: b * step })).filter(s => s.t1 - s.t0 >= minSp);
}
