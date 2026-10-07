// Frame geometry (logical 1080×1920 units) and text pagination.
// Quran text is only ever split at word boundaries; the pages joined back with single spaces are
// verified to equal the original string, so nothing can be dropped or altered.

export const W = 1080;
export const H = 1920;
export const SAFE = { x0: W * 0.05, x1: W * 0.95, y0: H * 0.05, y1: H * 0.95 };
export const TEXT_W = SAFE.x1 - SAFE.x0 - 40;

export const FONT_AR = '"UthmanicHafs", "AmiriQuran", serif';
// Surah names come from a different source/encoding than the Quran text, so use Amiri for them.
export const FONT_NAME = '"AmiriQuran", serif';
export const FONT_EN = '"Noto Serif", Georgia, "Times New Roman", serif';
export const FONT_UI = 'system-ui, "Segoe UI", Roboto, sans-serif';

const AR_SIZES = [80, 72, 64];
const EN_SIZES = [44, 40, 36];
export const AR_LINE = 1.8;
export const EN_LINE = 1.4;

export interface Box {
  top: number;
  bottom: number;
}

export function boxes(showTranslation: boolean): { ar: Box; en: Box } {
  return showTranslation
    ? { ar: { top: 300, bottom: 1130 }, en: { top: 1160, bottom: 1650 } }
    : { ar: { top: 300, bottom: 1650 }, en: { top: 0, bottom: 0 } };
}

export interface Page {
  words: number; // Arabic word count, used for timing
  ar: { size: number; lines: string[] };
  en: { size: number; lines: string[] } | null;
}

/** Split Arabic on regular spaces only (the ayah-number glyph is joined by a no-break space). */
export function arabicWords(text: string): string[] {
  const words = text.split(' ').filter((w) => w.length > 0);
  // Never leave a lone ayah-number glyph on its own page.
  for (let i = words.length - 1; i > 0; i--) {
    if (/^[٠-٩]+$/.test(words[i])) words.splice(i - 1, 2, `${words[i - 1]} ${words[i]}`);
  }
  return words;
}

function wrap(ctx: CanvasRenderingContext2D, words: string[], maxW: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function chunk<T>(items: T[], n: number): T[][] {
  return Array.from({ length: n }, (_, i) =>
    items.slice(Math.round((i * items.length) / n), Math.round(((i + 1) * items.length) / n)),
  );
}

function fit(ctx: CanvasRenderingContext2D, pages: string[][], sizes: number[], font: string, lh: number, box: Box) {
  for (const size of sizes) {
    ctx.font = `${size}px ${font}`;
    const wrapped = pages.map((p) => wrap(ctx, p, TEXT_W));
    const ok = wrapped.every((lines) => lines.every((l) => ctx.measureText(l).width <= TEXT_W + 1)
      && lines.length * size * lh <= box.bottom - box.top);
    if (ok) return wrapped.map((lines) => ({ size, lines }));
  }
  return null;
}

export function paginate(ctx: CanvasRenderingContext2D, arabic: string, english: string | null, showTranslation: boolean): Page[] {
  const b = boxes(showTranslation);
  const arWords = arabicWords(arabic);
  const enWords = english ? english.split(/\s+/).filter(Boolean) : [];
  ctx.direction = 'rtl';
  for (let n = 1; n <= arWords.length; n++) {
    const arChunks = chunk(arWords, n);
    const ar = fit(ctx, arChunks, AR_SIZES, FONT_AR, AR_LINE, b.ar);
    if (!ar) continue;
    let en: { size: number; lines: string[] }[] | null = null;
    if (showTranslation && english) {
      ctx.direction = 'ltr';
      en = fit(ctx, chunk(enWords, n), EN_SIZES, FONT_EN, EN_LINE, b.en);
      ctx.direction = 'rtl';
      if (!en) continue;
    }
    // Rule 1 guard: the pages must reproduce the ayah exactly.
    if (ar.flatMap((p) => p.lines).join(' ') !== arabic) throw new Error('Pagination altered the ayah text');
    return arChunks.map((c, i) => ({ words: c.length, ar: ar[i], en: en ? en[i] : null }));
  }
  throw new Error('Ayah could not be laid out');
}
