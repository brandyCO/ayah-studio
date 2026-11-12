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

// Each chest tier has its own material (wood · brass · cedar · emerald · pearl): the pitch its knock rings at,
// how a tap feels in the hand, and how the opening feels.
const TIER_RING = [900, 2700, 620, 4600, 3400];
const TIER_BUZZ: ((p: number) => number | number[])[] = [
  (p) => 10 + Math.round(p * 18),                                   // wood: one dull knock
  (p) => [8 + Math.round(p * 8), 30, 6],                            // brass: a knock and its ring
  (p) => 16 + Math.round(p * 22),                                   // cedar: one heavy knock
  (p) => [6, 24, 6 + Math.round(p * 10)],                           // emerald: a crisp double tick
  (p) => [10 + Math.round(p * 10), 20, 6, 20, 4],                   // pearl: a soft rolling hum
];
const TIER_OPEN: number[][] = [[26, 70, 12], [24, 40, 10, 40, 8], [40, 80, 18], [14, 30, 14, 30, 20, 50, 10], [30, 40, 16, 40, 10, 40, 6]];

/** The knock of the chest's material on top of the thud. */
function knock(c: AudioContext, t: number, tier: number, p: number, v: number) {
  const f = TIER_RING[Math.min(4, tier)] * v * (1 + p * 0.08);
  if (tier === 0 || tier === 2) {
    // Wood and cedar: a hollow knock, no ring.
    breath(c, t, 0.06 + tier * 0.02, f * 1.6, f * 0.8, 1.6, 0.2 + 0.12 * p, 0.002);
    breath(c, t + 0.012, 0.09, f, f * 0.7, 5, 0.12, 0.003);
  } else {
    // Brass, emerald and pearl ring: a narrow band that lingers, brighter as the chest gives way.
    breath(c, t, 0.05, 2200 * v, 900 * v, 1.2, 0.12 + 0.1 * p, 0.003);
    breath(c, t, 0.25 + tier * 0.08, f, f * 1.01, 18 + tier * 4, 0.1 + 0.08 * p, 0.004);
    if (tier >= 3) breath(c, t + 0.02, 0.3, f * 1.5, f * 1.52, 22, 0.06 + 0.05 * p, 0.004);
  }
}

export const sfx = {
  /** A tap on the chest, `p` = how far it has given way (0–1). Each kind of chest sounds and feels like
   *  what it is made of: wood knocks, brass rings, cedar booms, emerald chimes like glass, pearl hums. */
  tap(p: number, tier = 0) {
    buzz(TIER_BUZZ[Math.min(4, tier)](p));
    const c = ready(); if (!c) return;
    const t = c.currentTime, v = vary();
    thud(c, t, 0.45 + 0.35 * p, (170 - 30 * p - tier * 12) * v, 55 - tier * 3);
    knock(c, t, tier, p, v);
  },
  /** The chest strains on its own between taps (a rattle that grows as it gives way). */
  strain(p: number, tier = 0) {
    buzz(p > 0.6 ? [6, 40, 6, 40, 6] : [5, 40, 5]);
    const c = ready(); if (!c) return;
    const t = c.currentTime, v = vary(), f = TIER_RING[Math.min(4, tier)];
    for (let i = 0; i < 3; i++) breath(c, t + i * 0.05, 0.05, f * 0.7 * v, f * 0.5 * v, 2, 0.05 + 0.08 * p, 0.003);
  },
  /** Almost open: the lid creaks up, light hisses out, then it slams shut again. */
  almost(tier = 0) {
    buzz([8, 30, 10, 30, 14, 260, 34]);
    const c = ready(); if (!c) return;
    const t = c.currentTime, v = vary(), f = TIER_RING[Math.min(4, tier)];
    breath(c, t, 0.32, 380 * v, 1300 * v, 6, 0.22, 0.12);
    breath(c, t + 0.1, 0.34, 2600 * v, 7800, 2.2, 0.18, 0.1);
    thud(c, t + 0.36, 0.85, 130 * v, 42, 0.22);
    knock(c, t + 0.36, tier, 0.6, v);
    breath(c, t + 0.37, 0.22, f * 1.2, f * 0.6, 3, 0.14, 0.004);
  },
  /** The chest bursts open: a thud and a rising whoosh of light, with the ring of what it is made of. */
  open(big = 0, tier = -1) {
    buzz(big >= 2 ? [40, 50, 26, 50, 18, 50, 10] : big ? [34, 60, 20, 60, 12] : tier >= 0 ? TIER_OPEN[Math.min(4, tier)] : [30, 70, 14]);
    const c = ready(); if (!c) return;
    const t = c.currentTime, v = vary();
    thud(c, t, 0.9, 120 * v, 40, 0.3 + big * 0.08);
    breath(c, t, 0.75 + big * 0.15, 300 * v, 4200 * v, 0.9, 0.55, 0.06);
    breath(c, t + 0.12, 0.9 + big * 0.3, 5000 * v, 9000, 2.5, 0.16 + big * 0.05, 0.2);
    if (tier >= 0) {
      const f = TIER_RING[Math.min(4, tier)];
      // The chest's own voice rings out as it opens: a few partials of its material, fading slowly.
      for (let i = 0; i < 2 + Math.min(3, tier); i++) breath(c, t + 0.05 + i * 0.08, 0.5 + tier * 0.15, f * SCALE[i * 2 % SCALE.length] * v, f * SCALE[i * 2 % SCALE.length] * 1.02 * v, 14 + tier * 6, 0.07 + tier * 0.012, 0.01);
    }
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
  /** A page turned in the mushaf: a soft paper swish, felt as one light tap (owner request 2026-11-12). */
  page() {
    buzz(5);
    const c = ready(); if (!c) return;
    const t = c.currentTime, v = vary();
    breath(c, t, 0.24, 3200 * v, 1100 * v, 0.9, 0.07, 0.07);
    breath(c, t + 0.05, 0.12, 1500 * v, 900 * v, 2.2, 0.035, 0.03);
  },
  /** A tasbih bead: a small wooden click; `full` = the round is complete (a deeper click and a soft shimmer). */
  bead(full = false) {
    buzz(full ? [16, 60, 26] : 7);
    const c = ready(); if (!c) return;
    const t = c.currentTime, v = vary();
    breath(c, t, 0.035, 2300 * v, 1500 * v, 5, 0.16, 0.002);
    thud(c, t, 0.18, 260 * v, 140, 0.05);
    if (full) for (let i = 0; i < 3; i++) breath(c, t + 0.08 + i * 0.08, 0.45, (5600 + i * 800) * v, 9200, 7, 0.08, 0.04);
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
  /** A crouch before a leap: a low rising rumble that tightens (`ms` long). */
  gather(ms = 500) {
    const d = ms / 1000;
    buzz([6, 60, 8, 50, 10, 40, 14]);
    const c = ready(); if (!c) return;
    const t = c.currentTime;
    breath(c, t, d, 120, 520, 1.2, 0.42, d * 0.8);
    for (let i = 0; i < 4; i++) breath(c, t + i * d * 0.22, 0.04, 2200 * vary(), 1800, 2, 0.08 + i * 0.03, 0.003);
  },
  /** A leap: a short rushing whoosh upwards. */
  leap() {
    buzz(16);
    const c = ready(); if (!c) return;
    const v = vary();
    breath(c, c.currentTime, 0.34, 500 * v, 3200 * v, 1.1, 0.4, 0.03);
  },
  /** Fire catching all at once: a deep whump, a roar that opens up, and crackles (`level` 1–5 bigger). */
  ignite(level = 1) {
    buzz([50, 40, 30, 40, 20, 40, 12]);
    const c = ready(); if (!c) return;
    const t = c.currentTime, v = vary(), k = 0.8 + level * 0.08;
    thud(c, t, 1, 110 * v, 34, 0.42);
    breath(c, t, 0.9, 160 * v, 900 * v, 0.7, 0.75 * k, 0.025);
    breath(c, t + 0.03, 0.7, 1800 * v, 5200, 0.9, 0.22 * k, 0.04);
    for (let i = 0; i < 10 + level * 3; i++) breath(c, t + 0.05 + Math.random() * 0.9, 0.012 + Math.random() * 0.02, 1500 + Math.random() * 3500, 1200, 1.5, 0.12 + Math.random() * 0.14, 0.002);
  },
  /** Fire burning steadily for `ms`: a soft low roar with crackles (quietly, under everything else). */
  burn(ms = 2000, level = 1) {
    const c = ready(); if (!c) return;
    const t = c.currentTime, d = ms / 1000;
    breath(c, t, d, 260, 380, 0.8, 0.22 + level * 0.02, 0.3);
    const n = Math.round(d * (7 + level));
    for (let i = 0; i < n; i++) breath(c, t + Math.random() * d, 0.01 + Math.random() * 0.02, 1400 + Math.random() * 3800, 1100, 1.5, 0.05 + Math.random() * 0.1, 0.002);
  },
  /** A heavy landing with a flare of fire round the feet. */
  slam() {
    buzz([38, 30, 14]);
    const c = ready(); if (!c) return;
    const t = c.currentTime, v = vary();
    thud(c, t, 1, 140 * v, 38, 0.3);
    breath(c, t, 0.45, 220 * v, 1400 * v, 0.9, 0.45, 0.01);
  },
  /** A soft landing (a character landing after a hop). */
  land() {
    buzz(9);
    const c = ready(); if (!c) return;
    thud(c, c.currentTime, 0.4, 180 * vary(), 70, 0.1);
  },
};
