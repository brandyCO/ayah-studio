// Move and scale by touch: the text block and the background can each be moved and scaled on the
// preview, either once for the whole reel or animated with keyframes (CapCut-style). Pure data and
// pure functions of t, so preview = export. The renderer keeps the text inside the title-safe text
// area and never below the legible minimum (rule 6); text is only moved and scaled, never rotated or
// distorted (rule 7). Between keyframes the pose eases softly.

/** A pose: offset in frame units from the default place, and a scale. */
export interface Pose {
  x: number;
  y: number;
  s: number;
}
export interface Key extends Pose {
  t: number; // reel seconds
}
/** One layer's motion. `anim` off: a single pose for the whole reel (keys[0], its t unused). */
export interface Track {
  anim: boolean;
  keys: Key[];
}
export type Layer = 'text' | 'bg';
export type Motion = Partial<Record<Layer, Track>>;

export const IDENTITY: Pose = { x: 0, y: 0, s: 1 };
/** Scale limits per layer (text is also kept legible and inside the frame by the renderer). */
export const SCALE: Record<Layer, [number, number]> = { text: [0.5, 2], bg: [1, 3] };
export const MAX_KEYS = 60;
/** Two keyframes closer than this are the same one. */
export const KEY_EPS = 0.05;

const smooth = (x: number) => x * x * (3 - 2 * x);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const pose = (k: Pose): Pose => ({ x: k.x, y: k.y, s: k.s });

/** The pose of a layer at time t. */
export function poseAt(tr: Track | undefined, t: number): Pose {
  if (!tr || !tr.keys.length) return IDENTITY;
  const ks = tr.keys;
  if (!tr.anim || ks.length === 1 || t <= ks[0].t) return pose(ks[0]);
  const last = ks[ks.length - 1];
  if (t >= last.t) return pose(last);
  let i = 1;
  while (ks[i].t < t) i++;
  const a = ks[i - 1], b = ks[i];
  const k = smooth((t - a.t) / Math.max(1e-6, b.t - a.t));
  return { x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), s: a.s * Math.pow(b.s / a.s, k) };
}

export const isIdentity = (p: Pose) => Math.abs(p.x) < 0.5 && Math.abs(p.y) < 0.5 && Math.abs(p.s - 1) < 1e-3;
/** The keyframe at t (within KEY_EPS), if any. */
export const keyIndex = (tr: Track | undefined, t: number) => (tr?.anim ? tr.keys.findIndex((k) => Math.abs(k.t - t) < KEY_EPS) : -1);

const round = (p: Pose): Pose => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, s: Math.round(p.s * 1000) / 1000 });
const sorted = (keys: Key[]) => keys.sort((a, b) => a.t - b.t);

/** A layer's track after the user placed it at `p` at time t: animated tracks get (or update) a
 *  keyframe there; otherwise the one pose for the whole reel changes. */
export function placed(tr: Track | undefined, t: number, p: Pose): Track {
  const q = round(p);
  if (!tr?.anim) return { anim: false, keys: [{ t: 0, ...q }] };
  const keys = tr.keys.map((k) => ({ ...k }));
  const i = keyIndex(tr, t);
  if (i >= 0) keys[i] = { t: keys[i].t, ...q };
  else if (keys.length < MAX_KEYS) keys.push({ t: Math.round(t * 1000) / 1000, ...q });
  return { anim: true, keys: sorted(keys) };
}

/** Add a keyframe at t holding the pose shown there (turns animation on). */
export function addKey(tr: Track | undefined, t: number): Track {
  const keys = tr?.anim ? tr.keys.map((k) => ({ ...k })) : [];
  if (keyIndex(tr, t) < 0 && keys.length < MAX_KEYS) keys.push({ t: Math.round(t * 1000) / 1000, ...round(poseAt(tr, t)) });
  return { anim: true, keys: sorted(keys) };
}

/** Remove the keyframe at t; the track stops animating when none are left. */
export function removeKey(tr: Track, t: number): Track | undefined {
  const i = keyIndex(tr, t);
  if (i < 0) return tr;
  const keys = tr.keys.filter((_, j) => j !== i);
  return keys.length ? { anim: true, keys } : undefined;
}

const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Stored motion (drafts may be old or damaged): only valid tracks, keys sorted, scales in range. */
export function validMotion(v: unknown): Motion | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const out: Motion = {};
  for (const layer of ['text', 'bg'] as Layer[]) {
    const tr = (v as Record<string, unknown>)[layer] as Track | undefined;
    if (!tr || typeof tr !== 'object' || !Array.isArray(tr.keys)) continue;
    const [lo, hi] = SCALE[layer];
    const keys = tr.keys.filter((k) => k && finite(k.t) && finite(k.x) && finite(k.y) && finite(k.s) && k.t >= 0)
      .slice(0, MAX_KEYS)
      .map((k) => ({ t: k.t, x: Math.max(-4000, Math.min(4000, k.x)), y: Math.max(-4000, Math.min(4000, k.y)), s: Math.max(lo, Math.min(hi, k.s)) }));
    if (keys.length) out[layer] = { anim: tr.anim === true, keys: sorted(keys) };
  }
  return out.text || out.bg ? out : undefined;
}

/** A box after a pose about its own centre. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The text pose actually drawn: scale kept between `minS` (legible minimum) and what fits the region,
 * then the offset limited so the scaled box stays inside the region (title-safe text area: rule 6).
 */
export function fitTextPose(p: Pose, box: Rect, region: Rect, minS: number): Pose {
  const bw = Math.max(1, box.x1 - box.x0), bh = Math.max(1, box.y1 - box.y0);
  const maxS = Math.max(minS, Math.min(SCALE.text[1], (region.x1 - region.x0) / bw, (region.y1 - region.y0) / bh));
  const s = Math.min(maxS, Math.max(Math.max(SCALE.text[0], minS), p.s));
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  const hw = (bw * s) / 2, hh = (bh * s) / 2;
  const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));
  const nx = clamp(cx + p.x, region.x0 + hw, region.x1 - hw);
  const ny = clamp(cy + p.y, region.y0 + hh, region.y1 - hh);
  return { x: nx - cx, y: ny - cy, s };
}

/** The background pose actually drawn: scale ≥ 1 and moved only as far as it still covers the frame. */
export function fitBgPose(p: Pose, w: number, h: number): Pose {
  const s = Math.min(SCALE.bg[1], Math.max(1, p.s));
  const mx = ((s - 1) * w) / 2, my = ((s - 1) * h) / 2;
  return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)), s };
}
