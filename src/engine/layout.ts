// Frame geometry (logical 1080×1920 units) and text layout for the four text modes.
// Quran text is only ever split at word boundaries; lines and pages joined back with single spaces
// are verified to equal the original words, so nothing can be dropped or altered.

export const W = 1080;
export const H = 1920;
export const SAFE = { x0: W * 0.05, x1: W * 0.95, y0: H * 0.05, y1: H * 0.95 };
export const TEXT_W = SAFE.x1 - SAFE.x0 - 40;

export const FONT_AR = '"UthmanicHafs", "AmiriQuran", serif';
// Surah names come from a different source/encoding than the Quran text, so use Amiri for them.
export const FONT_NAME = '"AmiriQuran", serif';
export const FONT_EN = '"Noto Serif", Georgia, "Times New Roman", serif';
export const FONT_EN_SANS = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const FONT_UI = 'system-ui, "Segoe UI", Roboto, sans-serif';

export const AR_LINE = 1.8;
export const EN_LINE = 1.4;
const EN_SIZES = [44, 40, 36];
/** Arabic sizes per text mode, largest first; 64 px is the legible minimum. */
export const AR_SIZES = {
  ayah: [80, 72, 64],
  line: [80, 72, 64],
  half: [88, 80, 72, 64],
  words: [96, 88, 80, 72, 64],
} as const;
const AR_MIN = 64;
const EN_MIN = 32;

export type TextSize = 's' | 'm' | 'l';
export type EnFont = 'serif' | 'sans';
const SIZE_SCALE: Record<TextSize, number> = { s: 0.88, m: 1, l: 1.14 };

/**
 * Sizes scaled for the chosen text size, largest first, never below the legible minimum (long text
 * wraps instead); the minimum stays the last resort so whatever fits at Medium still fits.
 */
function scaled(sizes: readonly number[], z: TextSize, min: number): number[] {
  const out = [...sizes.map((x) => Math.max(min, 2 * Math.round((x * SIZE_SCALE[z]) / 2))), min];
  return out.filter((x, i) => out.indexOf(x) === i);
}

/** The canvas calls layout needs (a stub with the same shape is used by the node checks). */
export type TextCtx = Pick<CanvasRenderingContext2D, 'font' | 'direction' | 'measureText'>;

export interface Box {
  top: number;
  bottom: number;
}

export type TitlePos = 'top' | 'below' | 'bottom';
export type TitleSize = 's' | 'm' | 'l';

/** The choices that move things on the frame. */
export interface FrameStyle {
  translation: boolean;
  titlePos: TitlePos; // surah name + reference: top, right below the ayah (and its translation), or bottom
  titleSize: TitleSize;
  surahName?: boolean; // the Arabic surah name above the reference (default on); the reference always shows (rule 2)
  credit: boolean; // "Recited by …" line (optional)
  watermark: boolean;
  textSize?: TextSize; // default 'm'
  enFont?: EnFont; // default 'serif'
}

export const TITLE_SIZES: Record<TitleSize, { name: number; ref: number }> = {
  s: { name: 44, ref: 30 },
  m: { name: 56, ref: 36 },
  l: { name: 72, ref: 46 },
};
/** Height of the surah name + reference block (only the reference when the name is hidden). */
export const titleBlock = (z: TitleSize, name = true) => Math.round(((name ? TITLE_SIZES[z].name : 0) + TITLE_SIZES[z].ref) * 1.4);

export interface FrameLayout {
  ar: Box; // Arabic fits here
  en: Box; // translation fits here (empty when off)
  text: Box; // the whole text area: Arabic + translation together are centred in it
  title: number; // top of the surah name + reference block ("below": its lowest place; it follows the text)
  credit: number | null; // centre line of the reciter credit
  watermark: number | null;
  arSizes: Record<keyof typeof AR_SIZES, number[]>;
  enSizes: number[];
  enFont: string;
}

/** Everything stays inside the 5% title-safe area and nothing overlaps (rule 6). */
export function frameLayout(st: FrameStyle): FrameLayout {
  let bottom = SAFE.y1;
  let watermark: number | null = null, credit: number | null = null;
  if (st.watermark) {
    watermark = bottom - 22;
    bottom -= 50;
  }
  if (st.credit) {
    credit = bottom - 22;
    bottom -= 52;
  }
  const T = titleBlock(st.titleSize, st.surahName ?? true);
  let top = SAFE.y0 + 24, title: number;
  if (st.titlePos === 'top') {
    title = top;
    top += T + 60;
  } else if (st.titlePos === 'bottom') {
    title = bottom - 20 - T;
    bottom = title - 50;
  } else {
    top += 40;
    bottom -= 30;
    title = 0;
  }
  const below = st.titlePos === 'below';
  // "Below": the title sits right under the text (Arabic, then translation), so the text area
  // ends above it. Arabic gets ~62% of the text area when a translation shares it.
  if (below) {
    title = bottom - T;
    bottom = title - 30;
  }
  const split = st.translation ? Math.round(top + 0.62 * (bottom - top - 30)) : bottom;
  const ar = { top, bottom: split };
  const en = st.translation ? { top: split + 30, bottom } : { top: bottom, bottom };
  const z = st.textSize ?? 'm';
  const arSizes = {
    ayah: scaled(AR_SIZES.ayah, z, AR_MIN),
    line: scaled(AR_SIZES.line, z, AR_MIN),
    half: scaled(AR_SIZES.half, z, AR_MIN),
    words: scaled(AR_SIZES.words, z, AR_MIN),
  };
  const enFont = st.enFont === 'sans' ? FONT_EN_SANS : FONT_EN;
  return { ar, en, text: { top, bottom }, title, credit, watermark, arSizes, enSizes: scaled(EN_SIZES, z, EN_MIN), enFont };
}

export interface Fit {
  size: number;
  lines: string[];
}

/** Greedy line wrap: the number of words on each line (a single over-long word gets its own line). */
function wrapCounts(ctx: TextCtx, words: string[], maxW: number): number[] {
  const counts: number[] = [];
  let line = '', n = 0;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxW) {
      counts.push(n);
      line = w;
      n = 1;
    } else {
      line = next;
      n++;
    }
  }
  if (n) counts.push(n);
  return counts;
}

function wrap(ctx: TextCtx, words: string[], maxW: number): string[] {
  let at = 0;
  return wrapCounts(ctx, words, maxW).map((c) => words.slice(at, (at += c)).join(' '));
}

function chunk<T>(items: T[], n: number): T[][] {
  return Array.from({ length: n }, (_, i) =>
    items.slice(Math.round((i * items.length) / n), Math.round(((i + 1) * items.length) / n)),
  );
}

/** Largest size at which every page wraps inside the box, or null. Long text wraps, never shrinks below the minimum. */
function fitAll(ctx: TextCtx, pages: string[][], sizes: readonly number[], font: string, lh: number, box: Box): Fit[] | null {
  for (const size of sizes) {
    ctx.font = `${size}px ${font}`;
    const wrapped = pages.map((p) => wrap(ctx, p, TEXT_W));
    const ok = wrapped.every((lines) => lines.every((l) => ctx.measureText(l).width <= TEXT_W + 1)
      && lines.length * size * lh <= box.bottom - box.top);
    if (ok) return wrapped.map((lines) => ({ size, lines }));
  }
  return null;
}

export function fitArabic(ctx: TextCtx, words: string[], sizes: readonly number[], box: Box): Fit | null {
  ctx.direction = 'rtl';
  const f = fitAll(ctx, [words], sizes, FONT_AR, AR_LINE, box);
  // Rule 1 guard: the lines must reproduce the words exactly.
  if (f && f[0].lines.join(' ') !== words.join(' ')) throw new Error('Line wrapping altered the ayah text');
  return f ? f[0] : null;
}

export type Range = [number, number]; // first..last word index, inclusive

const ranges = (counts: number[]): Range[] => {
  let at = 0;
  return counts.map((c) => [at, (at += c) - 1] as Range);
};

/** English text in its box at the largest size that fits, or null. */
export function fitEnglish(ctx: TextCtx, text: string, box: Box, sizes: readonly number[] = EN_SIZES, font = FONT_EN): Fit | null {
  ctx.direction = 'ltr';
  const f = fitAll(ctx, [text.split(/\s+/).filter(Boolean)], sizes, font, EN_LINE, box);
  return f ? f[0] : null;
}

/**
 * Ayah mode: the whole ayah, or — when it cannot fit even at the minimum size — the fewest pages that
 * do (split at word boundaries). The translation goes with each page: the word meanings of that
 * page's words (`meanings`, synced), or the ayah translation split into as many pages (`english`).
 */
export function ayahPages(ctx: TextCtx, words: string[], lay: FrameLayout, english: string | null, meanings: string[] | null) {
  const enWords = english ? english.split(/\s+/).filter(Boolean) : [];
  for (let n = 1; n <= words.length; n++) {
    const arChunks = chunk(words, n);
    ctx.direction = 'rtl';
    const ar = fitAll(ctx, arChunks, lay.arSizes.ayah, FONT_AR, AR_LINE, lay.ar);
    if (!ar) continue;
    let en: Fit[] | null = null;
    if (meanings || english) {
      const enPages = meanings
        ? ranges(arChunks.map((c) => c.length)).map(([f, l]) => meanings.slice(f, l + 1).join(' ').split(/\s+/).filter(Boolean))
        : chunk(enWords, n);
      ctx.direction = 'ltr';
      en = fitAll(ctx, enPages, lay.enSizes, lay.enFont, EN_LINE, lay.en);
      if (!en) continue;
    }
    if (ar.flatMap((p) => p.lines).join(' ') !== words.join(' ')) throw new Error('Pagination altered the ayah text');
    return { units: ranges(arChunks.map((c) => c.length)), ar, en };
  }
  throw new Error('Ayah could not be laid out');
}

/** Line mode: the ayah wrapped at the Ayah-mode size, one screen line per unit. */
export function lineUnits(ctx: TextCtx, words: string[], size: number = AR_SIZES.line[0]): Range[] {
  ctx.direction = 'rtl';
  ctx.font = `${size}px ${FONT_AR}`;
  return ranges(wrapCounts(ctx, words, TEXT_W));
}

/** Half-line mode: each screen line split at the word boundary nearest its middle. */
export function halfUnits(ctx: TextCtx, words: string[], size: number = AR_SIZES.line[0]): Range[] {
  const out: Range[] = [];
  for (const [f, l] of lineUnits(ctx, words, size)) {
    if (l === f) {
      out.push([f, l]);
      continue;
    }
    const total = ctx.measureText(words.slice(f, l + 1).join(' ')).width;
    let best = f, bestD = Infinity;
    for (let k = f; k < l; k++) {
      const d = Math.abs(ctx.measureText(words.slice(f, k + 1).join(' ')).width - total / 2);
      if (d < bestD) [best, bestD] = [k, d];
    }
    out.push([f, best], [best + 1, l]);
  }
  return out;
}

/** Words mode: n words per step. */
export function wordUnits(count: number, n: number): Range[] {
  const out: Range[] = [];
  for (let f = 0; f < count; f += n) out.push([f, Math.min(count, f + n) - 1]);
  return out;
}

/** Translation of one ayah in the fewest pages that fit its box. */
export function translationPages(ctx: TextCtx, english: string, box: Box, sizes: readonly number[] = EN_SIZES, font = FONT_EN): Fit[] {
  const words = english.split(/\s+/).filter(Boolean);
  ctx.direction = 'ltr';
  for (let n = 1; n <= Math.max(1, words.length); n++) {
    const f = fitAll(ctx, chunk(words, n), sizes, font, EN_LINE, box);
    if (f) return f;
  }
  throw new Error('Translation could not be laid out');
}
