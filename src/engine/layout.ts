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

/** The canvas calls layout needs (a stub with the same shape is used by the node checks). */
export type TextCtx = Pick<CanvasRenderingContext2D, 'font' | 'direction' | 'measureText'>;

export interface Box {
  top: number;
  bottom: number;
}

export function boxes(showTranslation: boolean): { ar: Box; en: Box } {
  return showTranslation
    ? { ar: { top: 300, bottom: 1130 }, en: { top: 1160, bottom: 1650 } }
    : { ar: { top: 300, bottom: 1650 }, en: { top: 0, bottom: 0 } };
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

/**
 * Ayah mode: the whole ayah, or — when it cannot fit even at the minimum size — the fewest pages that
 * do (split at word boundaries). With a translation, it is split into the same number of pages.
 */
export function ayahPages(ctx: TextCtx, words: string[], english: string | null, showTranslation: boolean) {
  const b = boxes(showTranslation);
  const enWords = english ? english.split(/\s+/).filter(Boolean) : [];
  for (let n = 1; n <= words.length; n++) {
    const arChunks = chunk(words, n);
    ctx.direction = 'rtl';
    const ar = fitAll(ctx, arChunks, AR_SIZES.ayah, FONT_AR, AR_LINE, b.ar);
    if (!ar) continue;
    let en: Fit[] | null = null;
    if (showTranslation && english) {
      ctx.direction = 'ltr';
      en = fitAll(ctx, chunk(enWords, n), EN_SIZES, FONT_EN, EN_LINE, b.en);
      if (!en) continue;
    }
    if (ar.flatMap((p) => p.lines).join(' ') !== words.join(' ')) throw new Error('Pagination altered the ayah text');
    return { units: ranges(arChunks.map((c) => c.length)), ar, en };
  }
  throw new Error('Ayah could not be laid out');
}

/** Line mode: the ayah wrapped at the Ayah-mode size, one screen line per unit. */
export function lineUnits(ctx: TextCtx, words: string[]): Range[] {
  ctx.direction = 'rtl';
  ctx.font = `${AR_SIZES.line[0]}px ${FONT_AR}`;
  return ranges(wrapCounts(ctx, words, TEXT_W));
}

/** Half-line mode: each screen line split at the word boundary nearest its middle. */
export function halfUnits(ctx: TextCtx, words: string[]): Range[] {
  const out: Range[] = [];
  for (const [f, l] of lineUnits(ctx, words)) {
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
export function translationPages(ctx: TextCtx, english: string, box: Box): Fit[] {
  const words = english.split(/\s+/).filter(Boolean);
  ctx.direction = 'ltr';
  for (let n = 1; n <= Math.max(1, words.length); n++) {
    const f = fitAll(ctx, chunk(words, n), EN_SIZES, FONT_EN, EN_LINE, box);
    if (f) return f;
  }
  throw new Error('Translation could not be laid out');
}
