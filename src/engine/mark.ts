// The user's own watermark: a short text (e.g. "@myname") or their logo, in a corner or at the bottom
// centre. Off by default; the layout keeps a strip for it, so it never covers the ayah, the
// translation or the reference (rule 6). User text is drawn in the UI font, never like the ayah.

export type MarkKind = 'off' | 'text' | 'logo';
export type MarkPos = 'tl' | 'tr' | 'bl' | 'bc' | 'br';
export interface Mark {
  kind: MarkKind;
  text: string; // ≤ MARK_TEXT_MAX characters
  logo?: string; // id of a logo kept on this device (src/data/logos.ts)
  pos: MarkPos;
  size: number; // MARK_SIZE range (1 = 72 px logo / 34 px text on the 1080 px frame)
  opacity: number; // 0.2–1
}

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
  };
}
