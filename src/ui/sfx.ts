// Reward sounds (owner trial 2026-11-10): short, soft and optional, in the app only — never in an exported
// reel (rule 3), never music or instruments. Each one is made here from shaped noise and a soft low thud
// (Web Audio, no files): a tap on the chest, a whoosh as it opens, a pop as each prize lands, a shimmer of
// light, a tiny tick as a counter climbs. Silent while a recitation plays (the player marks the Media
// Session as playing), in the Kids space, when the page is hidden, and when switched off in Me → ⚙ → App.

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
    const c = ready(); if (!c) return;
    const t = c.currentTime, p = k / n;
    thud(c, t, 0.5 + 0.35 * p, 170 - 30 * p, 60);
    breath(c, t, 0.07, 2200, 900, 1.2, 0.18 + 0.12 * p, 0.003);
  },
  /** The chest bursts open: a thud and a rising whoosh of light. */
  open() {
    const c = ready(); if (!c) return;
    const t = c.currentTime;
    thud(c, t, 0.9, 120, 40, 0.3);
    breath(c, t, 0.75, 300, 4200, 0.9, 0.55, 0.06);
    breath(c, t + 0.12, 0.9, 5000, 9000, 2.5, 0.16, 0.2);
  },
  /** A prize lands on its card (i-th prize sits a little higher). */
  pop(i = 0) {
    const c = ready(); if (!c) return;
    const t = c.currentTime;
    breath(c, t, 0.09, 900 + i * 260, 2600 + i * 400, 3, 0.4, 0.004);
    thud(c, t, 0.35, 240 + i * 30, 120, 0.08);
  },
  /** A shimmer of light (the reveal, a combo, the flame catching). */
  shimmer() {
    const c = ready(); if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 4; i++) breath(c, t + i * 0.09, 0.5, 6000 + i * 900, 9500, 6, 0.12, 0.05);
  },
  /** A whoosh as light flies to the counter. */
  whoosh() {
    const c = ready(); if (!c) return;
    breath(c, c.currentTime, 0.5, 600, 2800, 1.4, 0.3, 0.12);
  },
  /** A tiny tick (counters, at most every 70 ms by the caller). */
  tick() {
    const c = ready(); if (!c) return;
    breath(c, c.currentTime, 0.03, 4200, 3800, 4, 0.12, 0.002);
  },
};
