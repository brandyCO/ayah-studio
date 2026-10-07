// Timeline derived from the recitation: the reel plan says when each ayah and word is recited; the
// text mode turns each ayah into timed groups of whole words (pure apart from text measuring).
import type { SurahMeta } from '../data/quran';
import { reference } from '../data/quran';
import type { Reciter } from '../data/reciters';
import { AR_SIZES, ayahPages, boxes, fitArabic, halfUnits, lineUnits, translationPages, wordUnits, type Fit, type Range, type TextCtx } from './layout';
import type { TextMode } from './project';
import type { ReelPlan } from './recitation';
import { displayWords, timeGroups } from './words';

export interface TimedText extends Fit {
  start: number;
  end: number;
}

export interface TimedAyah {
  ayah: number;
  ref: string; // e.g. "Al-Baqara · 2:255"
  start: number;
  end: number;
  ar: TimedText[]; // consecutive groups of whole words
  en: TimedText[]; // translation pages (empty when off)
  /** Ayah mode: ar[i] and en[i] are one page, centred together. */
  joint: boolean;
}

export interface Timeline {
  duration: number;
  surah: SurahMeta;
  reciter: Reciter;
  mode: TextMode;
  ayat: TimedAyah[];
}

export interface TimelineInput {
  surah: SurahMeta;
  reciter: Reciter;
  plan: ReelPlan;
  arabic: string[];
  english: string[];
  mode: TextMode;
  wordsPerStep: number;
  showTranslation: boolean;
}

/** Group starts proportional to word counts (no word timings: Ayah-mode pages only). */
function proportional(units: Range[], start: number, end: number): number[] {
  const total = units[units.length - 1][1] + 1;
  return units.map(([f]) => start + ((end - start) * f) / total);
}

export function buildTimeline(ctx: TextCtx, o: TimelineInput): Timeline {
  const b = boxes(o.showTranslation);
  const ayat = o.plan.ayat.map((p, i): TimedAyah => {
    const text = o.arabic[i];
    const english = o.english[i];
    const words = displayWords(text);
    const mode: TextMode = p.wordStart ? o.mode : 'ayah';
    let ar: TimedText[];
    let en: TimedText[] = [];
    const joint = mode === 'ayah';
    if (mode === 'ayah') {
      const pages = ayahPages(ctx, words, english, o.showTranslation);
      const starts = p.wordStart ? pages.units.map(([f]) => p.wordStart![f]) : proportional(pages.units, p.start, p.end);
      const span = (k: number) => ({ start: starts[k], end: k + 1 < starts.length ? starts[k + 1] : p.end });
      ar = pages.ar.map((f, k) => ({ ...f, ...span(k) }));
      if (pages.en) en = pages.en.map((f, k) => ({ ...f, ...span(k) }));
    } else {
      const sizes = AR_SIZES[mode];
      const units = mode === 'line' ? lineUnits(ctx, words) : mode === 'half' ? halfUnits(ctx, words) : wordUnits(words.length, o.wordsPerStep);
      const fit = (f: number, l: number) => fitArabic(ctx, words.slice(f, l + 1), sizes, b.ar);
      const groups = timeGroups(units, p.wordStart!, p.end, (f, l) => fit(f, l) !== null);
      ar = groups.map((g) => {
        const f = fit(g.first, g.last);
        if (!f) throw new Error('Text group could not be laid out');
        return { ...f, start: g.start, end: g.end };
      });
      if (o.showTranslation && english) {
        // Shown per ayah, calm; a long translation turns pages as the recitation progresses.
        const pages = translationPages(ctx, english, b.en);
        const starts = pages.map((_, k) => (k === 0 ? p.start : p.wordStart![Math.floor((k * words.length) / pages.length)]));
        en = pages.map((f, k) => ({ ...f, start: starts[k], end: k + 1 < pages.length ? starts[k + 1] : p.end }));
      }
    }
    // Rule 1 guard: the groups, in order, reproduce the ayah exactly.
    if (ar.flatMap((g) => g.lines).join(' ') !== text) throw new Error('Text grouping altered the ayah text');
    return { ayah: p.ayah, ref: reference(o.surah, p.ayah), start: p.start, end: p.end, ar, en, joint };
  });
  return { duration: o.plan.duration, surah: o.surah, reciter: o.reciter, mode: o.mode, ayat };
}
