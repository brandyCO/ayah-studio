// Nature sounds under the recitation (owner decision 2026-10-29: rule 3 now allows them quietly
// underneath; never music). Made here from seeded noise, so there are no files to download or license,
// and the same reel always gets the same sound (preview = export). The level is capped well under the
// reciter's voice.

export type AmbienceId = 'rain' | 'storm' | 'fire' | 'waves' | 'wind' | 'stream';
export const AMBIENCES: AmbienceId[] = ['rain', 'storm', 'fire', 'waves', 'wind', 'stream'];
export interface Ambience { id: AmbienceId; vol: number } // vol 0–1
export const validAmbience = (v: unknown): Ambience | undefined => {
  const o = v as Ambience | undefined;
  if (!o || typeof o !== 'object' || !AMBIENCES.includes(o.id)) return undefined;
  const vol = typeof o.vol === 'number' && Number.isFinite(o.vol) ? Math.min(1, Math.max(0, Math.round(o.vol * 100) / 100)) : 0.5;
  return vol > 0 ? { id: o.id, vol } : undefined;
};

function rng(seed: number) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

/** One-pole low-pass in place. */
function lowpass(a: Float32Array, hz: number, R: number) {
  const k = 1 - Math.exp((-2 * Math.PI * hz) / R);
  let y = 0;
  for (let i = 0; i < a.length; i++) a[i] = y += k * (a[i] - y);
}
function highpass(a: Float32Array, hz: number, R: number) {
  const k = 1 - Math.exp((-2 * Math.PI * hz) / R);
  let y = 0;
  for (let i = 0; i < a.length; i++) { y += k * (a[i] - y); a[i] -= y; }
}
const white = (n: number, r: () => number) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = r() * 2 - 1; return a; };
/** Soft random movement 0–1, changing over about `sec` seconds. */
function drift(n: number, R: number, sec: number, r: () => number) {
  const a = new Float32Array(n);
  const step = Math.max(1, Math.round(sec * R));
  let p0 = r(), p1 = r();
  for (let i = 0; i < n; i++) {
    const f = (i % step) / step;
    if (f === 0 && i) { p0 = p1; p1 = r(); }
    const s = f * f * (3 - 2 * f);
    a[i] = p0 + (p1 - p0) * s;
  }
  return a;
}
/** Short decaying ticks (drops, crackles) added at random. */
function ticks(out: Float32Array, R: number, perSec: number, decayMs: [number, number], gain: number, hz: number, r: () => number) {
  const n = out.length;
  const count = Math.round((n / R) * perSec);
  for (let k = 0; k < count; k++) {
    const at = Math.floor(r() * n);
    const d = (decayMs[0] + r() * (decayMs[1] - decayMs[0])) / 1000;
    const len = Math.min(n - at, Math.round(d * 5 * R));
    const g = gain * (0.3 + r() * 0.7);
    const w = (2 * Math.PI * hz * (0.6 + r() * 0.8)) / R;
    for (let i = 0; i < len; i++) out[at + i] += g * Math.exp(-i / (d * R)) * (Math.sin(w * i) * 0.6 + (r() * 2 - 1) * 0.4);
  }
}

function generate(id: AmbienceId, n: number, R: number): Float32Array {
  const r = rng(0x9e3779b9 ^ (AMBIENCES.indexOf(id) + 1) * 2654435761);
  let a: Float32Array;
  switch (id) {
    case 'rain':
    case 'storm': {
      a = white(n, r);
      highpass(a, 400, R);
      lowpass(a, 6000, R);
      const m = drift(n, R, 3, r);
      for (let i = 0; i < n; i++) a[i] *= 0.6 + 0.4 * m[i];
      ticks(a, R, 22, [3, 9], 0.9, 2500, r);
      if (id === 'storm') {
        // Distant thunder every 12–25 s: low rumble that swells and fades.
        const rumble = white(n, r);
        lowpass(rumble, 120, R); lowpass(rumble, 120, R);
        const env = new Float32Array(n);
        for (let t = 4 + r() * 6; t < n / R; t += 12 + r() * 13) {
          const at = Math.round(t * R), att = 0.4 + r() * 0.5, dec = 3 + r() * 3, g = 0.6 + r() * 0.4;
          for (let i = at; i < Math.min(n, at + (att + dec * 3) * R); i++) {
            const x = (i - at) / R;
            env[i] = Math.max(env[i], g * (x < att ? x / att : Math.exp(-(x - att) / dec)));
          }
        }
        for (let i = 0; i < n; i++) a[i] += rumble[i] * env[i] * 18;
      }
      break;
    }
    case 'fire': {
      a = white(n, r);
      lowpass(a, 250, R); lowpass(a, 250, R); // soft roar
      for (let i = 0; i < n; i++) a[i] *= 3;
      ticks(a, R, 9, [1, 4], 1.4, 3000, r); // crackles
      ticks(a, R, 2, [8, 25], 0.8, 900, r); // pops
      break;
    }
    case 'waves': {
      a = white(n, r);
      lowpass(a, 900, R);
      const period = 7.5;
      for (let i = 0; i < n; i++) {
        const ph = ((i / R) % period) / period;
        const swell = ph < 0.35 ? ph / 0.35 : Math.exp(-(ph - 0.35) * 4);
        a[i] *= 0.25 + 1.6 * swell * swell;
      }
      break;
    }
    case 'wind': {
      a = white(n, r);
      lowpass(a, 500, R);
      const m = drift(n, R, 4, r);
      for (let i = 0; i < n; i++) a[i] *= 0.3 + 1.4 * m[i] * m[i];
      lowpass(a, 1200, R);
      break;
    }
    case 'stream':
    default: {
      a = white(n, r);
      highpass(a, 700, R);
      lowpass(a, 4000, R);
      const m = drift(n, R, 0.15, r);
      for (let i = 0; i < n; i++) a[i] *= 0.55 + 0.45 * m[i];
      ticks(a, R, 30, [2, 6], 0.5, 1800, r);
      break;
    }
  }
  return a;
}

/** The recitation with the chosen nature sound mixed quietly underneath (fades in and out). */
export function addAmbience(src: AudioBuffer, amb: Ambience | undefined): AudioBuffer {
  if (!amb || amb.vol <= 0) return src;
  const R = src.sampleRate, n = src.length;
  const L = generate(amb.id, n, R);
  // A second, offset take for the other ear (a wider, more natural sound).
  const Rr = new Float32Array(n);
  const off = Math.round(1.7 * R) % Math.max(1, n);
  for (let i = 0; i < n; i++) Rr[i] = L[(i + off) % n];
  // Level: RMS of the sound brought to −44 … −28 dBFS (the voice is polished to about −18).
  let p = 0;
  for (let i = 0; i < n; i += 4) p += L[i] * L[i];
  const rms = Math.sqrt(p / Math.max(1, n / 4)) || 1;
  const target = Math.pow(10, (-44 + 16 * amb.vol) / 20);
  const g = target / rms;
  const fade = Math.min(n / 2, Math.round(1.5 * R));
  const out = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: R });
  for (let c = 0; c < 2; c++) {
    const voice = src.getChannelData(Math.min(c, src.numberOfChannels - 1));
    const s = c ? Rr : L;
    const res = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const f = i < fade ? i / fade : i > n - fade ? (n - i) / fade : 1;
      const v = voice[i] + s[i] * g * f;
      res[i] = v > 0.98 ? 0.98 : v < -0.98 ? -0.98 : v;
    }
    out.copyToChannel(res, c);
  }
  return out;
}
