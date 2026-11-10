// Reward sounds (owner trial 2026-11-10): short, soft and optional, in the app only — never in an exported
// reel (rule 3), never music or instruments. Each one is made here from shaped noise and a soft low thud
// (Web Audio, no files): a tap on the chest, a whoosh as it opens, a pop as each prize lands, a shimmer of
// light, a tiny tick as a counter climbs. Silent while a recitation plays (the player marks the Media
// Session as playing), in the Kids space, when the page is hidden, and when switched off in Me → ⚙ → App.
// Feel pass (owner request 2026-11-10): every sound carries its own vibration, timed to land with the sound
// (the audio output's latency is waited out), so a tap is felt and heard as one thing; vibration still plays
// with sounds off (not with reduced motion). Each sound is a little different every time (pitch ±6 %), and
// prizes landing in a row climb a scale. `rare()` is the long rising swell before a rare prize.

const KEY = 'rewardSounds';
export const soundsOn = (): boolean => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
export const setSoundsOn = (on: boolean) => { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage blocked */ } };

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

function ready(): AudioContext | null {
  if (!soundsOn() || document.hidden) return null;
  if (navigator.mediaSession?.playbackState === 'playing') return null;
  try { if (localStorage.getItem('kidsOn') === 'true' || document.body.dataset.view === 'kids') return null; } catch { /* ignore */ }
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (!noise) {
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noise.getChannelData(0);
      let s = 12345;
      for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x3fffffff) - 1; }
    }
    return ctx;
  } catch { return null; }
}

/** Builds the sound engine ahead of time (when a chest comes on screen), so the first tap is heard at once. */
export function warmSounds() { ready(); }

const MASTER = 0.32;

/** A small random pitch change, so a sound heard many times never feels canned. */
const vary = () => 0.94 + Math.random() * 0.12;
/** Steps of a pentatonic scale, as frequency ratios (prizes landing in a row climb it). */
const SCALE = [1, 1.125, 1.25, 1.5, 1.6875, 2, 2.25, 2.5];

/** Vibrates with a sound: waits for the audio to actually come out of the speaker first. */
function buzz(p: number | number[]) {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !navigator.vibrate) return;
    const lag = ctx && soundsOn() && ctx.state === 'running' ? Math.min(0.12, (ctx.outputLatency || 0) + (ctx.baseLatency || 0)) : 0;
    if (lag > 0.01) setTimeout(() => navigator.vibrate(p), lag * 1000);
    else navigator.vibrate(p);
  } catch { /* ignore */ }
}

/** Shaped noise through a band-pass whose centre moves from f0 to f1. */
function breath(c: AudioContext, at: number, dur: number, f0: number, f1: number, q: number, vol: number, attack = 0.01) {
  const src = c.createBufferSource();
  src.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(f0, at);
  bp.frequency.exponentialRampToValueAtTime(f1, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol * MASTER, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(at, Math.random() * 0.5, dur + 0.05);
}

/** A soft low thud (felt more than heard). */
function thud(c: AudioContext, at: number, vol: number, from = 150, to = 55, dur = 0.14) {
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(from, at);
  o.frequency.exponentialRampToValueAtTime(to, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol * MASTER, at + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

export const sfx = {
  /** A tap on the chest: heavier with each tap (k of n). */
  tap(k: number, n: number) {
    buzz(10 + Math.round((k / n) * 22));
    const c = ready(); if (!c) return;
    const t = c.currentTime, p = k / n, v = vary();
    thud(c, t, 0.5 + 0.35 * p, (170 - 30 * p) * v, 60);
    breath(c, t, 0.07, 2200 * v, 900 * v, 1.2, 0.18 + 0.12 * p, 0.003);
  },
  /** The chest bursts open: a thud and a rising whoosh of light. */
  open(big = 0) {
    buzz(big >= 2 ? [40, 50, 26, 50, 18, 50, 10] : big ? [34, 60, 20, 60, 12] : [30, 70, 14]);
    const c = ready(); if (!c) return;
    const t = c.currentTime, v = vary();
    thud(c, t, 0.9, 120 * v, 40, 0.3 + big * 0.08);
    breath(c, t, 0.75 + big * 0.15, 300 * v, 4200 * v, 0.9, 0.55, 0.06);
    breath(c, t + 0.12, 0.9 + big * 0.3, 5000 * v, 9000, 2.5, 0.16 + big * 0.05, 0.2);
    if (big >= 2) for (let i = 0; i < 6; i++) breath(c, t + 0.3 + i * 0.07, 0.6, 5200 * SCALE[i], 9800, 7, 0.1, 0.04);
  },
  /** A prize lands on its card (i-th prize sits a little higher). */
  pop(i = 0, rare = false) {
    buzz(rare ? [22, 40, 14] : 14);
    const c = ready(); if (!c) return;
    const t = c.currentTime, k = SCALE[i % SCALE.length] * vary() ** 0.3;
    breath(c, t, 0.09, 900 * k, 2600 * k, 3, 0.4, 0.004);
    thud(c, t, 0.35, 240 * k, 120, 0.08);
    if (rare) for (let j = 0; j < 4; j++) breath(c, t + 0.06 + j * 0.06, 0.45, 6200 * SCALE[j + 2], 10000, 8, 0.11, 0.03);
  },
  /** A shimmer of light (the reveal, a combo, the flame catching). */
  shimmer() {
    buzz([6, 70, 6, 70, 6]);
    const c = ready(); if (!c) return;
    const t = c.currentTime, v = vary();
    for (let i = 0; i < 4; i++) breath(c, t + i * 0.09, 0.5, (6000 + i * 900) * v, 9500, 6, 0.12, 0.05);
  },
  /** A whoosh as light flies to the counter. */
  whoosh() {
    buzz(12);
    const c = ready(); if (!c) return;
    const v = vary();
    breath(c, c.currentTime, 0.5, 600 * v, 2800 * v, 1.4, 0.3, 0.12);
  },
  /** A tiny tick (counters, at most every 70 ms by the caller). */
  tick() {
    buzz(3);
    const c = ready(); if (!c) return;
    const v = vary();
    breath(c, c.currentTime, 0.03, 4200 * v, 3800 * v, 4, 0.12, 0.002);
  },
  /** Light gathering before a rare prize: a slow rising swell with a soft heartbeat under it (`ms` long). */
  rare(ms = 900) {
    const d = ms / 1000;
    buzz([10, 150, 14, 110, 20, 70, 28]);
    const c = ready(); if (!c) return;
    const t = c.currentTime;
    breath(c, t, d, 250, 5200, 1.1, 0.5, d * 0.85);
    breath(c, t + d * 0.35, d * 0.75, 3000, 11000, 4, 0.14, d * 0.6);
    for (let i = 0; i < 3; i++) thud(c, t + i * d * 0.3, 0.35 + i * 0.12, 110, 50, 0.16);
  },
  /** A soft landing (a character landing after a hop). */
  land() {
    buzz(9);
    const c = ready(); if (!c) return;
    thud(c, c.currentTime, 0.4, 180 * vary(), 70, 0.1);
  },
};
