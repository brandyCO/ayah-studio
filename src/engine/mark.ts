// The user's own watermark: a short text (e.g. "@myname") or their logo, in a corner or at the bottom
// centre. Off by default; the layout keeps a strip for it, so it never covers the ayah, the
// translation or the reference (rule 6). User text is drawn in the UI font, never like the ayah.
// It can come in and go out with a calm effect, and move along its strip / shrink with keyframes;
// every effect is drawn clipped to the strip, so it never covers anything else.
import { addKey, keyIndex, MAX_KEYS, placed, poseAt, removeKey, type Pose, type Track } from './motion';

export type MarkKind = 'off' | 'text' | 'logo';
export type MarkPos = 'tl' | 'tr' | 'bl' | 'bc' | 'br';
export interface Mark {
  kind: MarkKind;
  text: string; // ≤ MARK_TEXT_MAX characters
  logo?: string; // id of a logo kept on this device (src/data/logos.ts)
  pos: MarkPos;
  size: number; // MARK_SIZE range (1 = 72 px logo / 34 px text on the 1080 px frame)
  opacity: number; // 0.2–1
  /** Dragged on the preview: the mark's centre across the title-safe width, 0 (left) … 1 (right).
   *  Top or bottom still comes from `pos` (the layout keeps that strip clear of the text). */
  x?: number;
  /** Remove black: a logo made on a black background shows without it (black → clear). */
  knock?: boolean;
  /** Shown from / until these reel seconds (missing: the whole reel), with a soft 0.3 s fade. */
  from?: number;
  to?: number;
  /** Entrance / exit effect and its length (missing: a 0.3 s fade, only when `from` / `to` is set). */
  fxIn?: MarkFx;
  fxOut?: MarkFx;
  lenIn?: number;
  lenOut?: number;
  /** Keyframes: x = centre across the safe width (0–1), s = size × this (MARK_KEY_S); y unused. */
  anim?: Track;
}

export type MarkFx = 'none' | 'fade' | 'scale' | 'zoom' | 'slide';
export const MARK_FX: MarkFx[] = ['none', 'fade', 'scale', 'zoom', 'slide'];
export const MARK_FX_LEN: [number, number] = [0.2, 3];
export const MARK_KEY_S: [number, number] = [0.3, 1];

export const MARK_TEXT_MAX = 40;
export const MARK_SIZE: [number, number] = [0.5, 2];
export const MARK_POS: MarkPos[] = ['tl', 'tr', 'bl', 'bc', 'br'];
export const LOGO_H = 72;
export const MARK_FONT = 34;
export const defaultMark = (): Mark => ({ kind: 'off', text: '', pos: 'br', size: 1, opacity: 0.8 });

export const cleanMarkText = (x: string) => x.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MARK_TEXT_MAX);

/** Decoded logos by id (registered by the editor before the preview or the export draws them). */
const logos = new Map<string, CanvasImageSource & { width: number; height: number }>();
export const registerLogo = (id: string, img: CanvasImageSource & { width: number; height: number }) => void logos.set(id, img);
export const logoImage = (id: string | undefined) => (id ? logos.get(id) ?? null : null);

/** A logo with its black taken out: alpha = the brightest channel, colours divided by it (the same
 *  look as laying the logo over the video with a "screen" blend). Made once per logo. */
const knocked = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
export function knockedLogo(id: string): (HTMLCanvasElement | OffscreenCanvas) | null {
  const img = logos.get(id);
  if (!img || !img.width || !img.height) return null;
  let c = knocked.get(id);
  if (c) return c;
  c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(img.width, img.height) : document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const m = Math.max(px[i], px[i + 1], px[i + 2]);
    const a = (m / 255) * (px[i + 3] / 255);
    if (m > 0) { px[i] = (px[i] * 255) / m; px[i + 1] = (px[i + 1] * 255) / m; px[i + 2] = (px[i + 2] * 255) / m; }
    px[i + 3] = Math.round(a * 255);
  }
  x.putImageData(d, 0, 0);
  knocked.set(id, c);
  return c;
}

/** The mark's look at t: alpha, scale about its centre and a sideways shift (frame units), from its
 *  entrance and exit effects. `end` = the reel's length (an exit with no `to` plays before it). */
export function markFx(m: Mark, t: number, end: number): { a: number; s: number; dx: number } {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const smooth = (x: number) => x * x * (3 - 2 * x);
  let a = 1, s = 1, dx = 0;
  const side = m.x !== undefined ? (m.x < 0.5 ? -1 : 1) : m.pos === 'tl' || m.pos === 'bl' ? -1 : 1;
  const apply = (fx: MarkFx, k: number) => {
    if (k >= 1 || fx === 'none') return;
    const e = smooth(k);
    if (fx === 'fade') a *= e;
    else if (fx === 'scale') { a *= Math.min(1, e * 2); s *= 0.4 + 0.6 * e; }
    else if (fx === 'zoom') { a *= e; s *= 1 + 0.7 * (1 - e); }
    else if (fx === 'slide') { a *= Math.min(1, e * 1.5); dx += side * 220 * (1 - e); }
  };
  // Entrance: from `from` (or the reel's start when an effect was chosen).
  if (m.fxIn) {
    const t0 = m.from ?? 0;
    apply(m.fxIn, t < t0 ? 0 : clamp((t - t0) / (m.lenIn ?? 0.6)));
  } else if (m.from !== undefined && m.from > 0) apply('fade', clamp((t - m.from) / 0.3 + 1));
  // Exit: before `to` (or the reel's end when an effect was chosen).
  if (m.fxOut) {
    const t1 = m.to ?? end;
    apply(m.fxOut, t > t1 ? 0 : clamp((t1 - t) / (m.lenOut ?? 0.6)));
  } else if (m.to !== undefined) apply('fade', clamp((m.to - t) / 0.3));
  return { a, s, dx };
}

/** The keyframed place and size at t (null: not animated — `x` and the size slider apply). */
export function markPose(m: Mark, t: number): Pose | null {
  return m.anim?.anim && m.anim.keys.length ? poseAt(m.anim, t) : null;
}
/** Keyframe helpers on the mark's own track (same rules as moving the text or background). */
export const markKeyAt = (m: Mark, t: number) => keyIndex(m.anim, t);
export function markAddKey(m: Mark, t: number) {
  if (m.anim?.anim) m.anim = addKey(m.anim, t);
  else m.anim = { anim: true, keys: [{ t: Math.round(t * 1000) / 1000, x: m.x ?? markDefaultX(m), y: 0, s: 1 }] };
}
export function markRemoveKey(m: Mark, t: number) {
  if (!m.anim) return;
  const next = removeKey(m.anim, t);
  if (next) m.anim = next; else delete m.anim;
}
/** The user placed the mark at x (0–1) / size k at t: an animated mark gets a keyframe there. */
export function markPlaced(m: Mark, t: number, p: { x?: number; s?: number }) {
  if (!m.anim?.anim) { if (p.x !== undefined) m.x = p.x; return; }
  const cur = poseAt(m.anim, t);
  m.anim = placed(m.anim, t, { x: p.x ?? cur.x, y: 0, s: p.s ?? cur.s });
  for (const k of m.anim.keys) k.x = Math.round(k.x * 1000) / 1000;
}
/** Where a mark sits across the safe width when it was never dragged. */
export const markDefaultX = (m: Mark) => (m.pos === 'tl' || m.pos === 'bl' ? 0.1 : m.pos === 'bc' ? 0.5 : 0.9);

/** Whether a mark is drawn at all. */
export const markShown = (m: Mark | undefined): m is Mark =>
  !!m && ((m.kind === 'text' && !!m.text) || (m.kind === 'logo' && !!m.logo));

/** The height the layout keeps for the mark (0: none), and whether it sits at the top. */
export function markStrip(m: Mark | undefined): { h: number; top: boolean } | null {
  if (!markShown(m)) return null;
  const h = Math.round((m.kind === 'logo' ? LOGO_H : MARK_FONT * 1.3) * m.size);
  return { h, top: m.pos === 'tl' || m.pos === 'tr' };
}

/** Stored mark (drafts and prefs may be old or damaged). */
export function validMark(v: unknown): Mark | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const m = v as Mark;
  if (!['off', 'text', 'logo'].includes(m.kind) || !MARK_POS.includes(m.pos)) return undefined;
  const num = (x: unknown, lo: number, hi: number, d: number) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d);
  return {
    kind: m.kind,
    text: typeof m.text === 'string' ? cleanMarkText(m.text) : '',
    logo: typeof m.logo === 'string' && /^[\w-]{1,40}$/.test(m.logo) ? m.logo : undefined,
    pos: m.pos,
    size: num(m.size, MARK_SIZE[0], MARK_SIZE[1], 1),
    opacity: num(m.opacity, 0.2, 1, 0.8),
    x: typeof m.x === 'number' && Number.isFinite(m.x) ? num(m.x, 0, 1, 0.5) : undefined,
    knock: m.knock === true || undefined,
    from: typeof m.from === 'number' && Number.isFinite(m.from) && m.from > 0 ? Math.min(m.from, 3600) : undefined,
    to: typeof m.to === 'number' && Number.isFinite(m.to) && m.to > 0 ? Math.min(m.to, 3600) : undefined,
    fxIn: MARK_FX.includes(m.fxIn as MarkFx) ? m.fxIn : undefined,
    fxOut: MARK_FX.includes(m.fxOut as MarkFx) ? m.fxOut : undefined,
    lenIn: typeof m.lenIn === 'number' && Number.isFinite(m.lenIn) ? num(m.lenIn, MARK_FX_LEN[0], MARK_FX_LEN[1], 0.6) : undefined,
    lenOut: typeof m.lenOut === 'number' && Number.isFinite(m.lenOut) ? num(m.lenOut, MARK_FX_LEN[0], MARK_FX_LEN[1], 0.6) : undefined,
    anim: validTrack(m.anim),
  };
}

function validTrack(v: unknown): Track | undefined {
  const tr = v as Track | undefined;
  if (!tr || typeof tr !== 'object' || tr.anim !== true || !Array.isArray(tr.keys)) return undefined;
  const ok = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
  const keys = tr.keys.filter((k) => k && ok(k.t) && ok(k.x) && ok(k.s) && k.t >= 0).slice(0, MAX_KEYS)
    .map((k) => ({ t: Math.min(k.t, 3600), x: Math.min(1, Math.max(0, k.x)), y: 0, s: Math.min(MARK_KEY_S[1], Math.max(MARK_KEY_S[0], k.s)) }))
    .sort((a, b) => a.t - b.t);
  return keys.length ? { anim: true, keys } : undefined;
}
