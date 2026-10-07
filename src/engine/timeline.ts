// Timeline derived from the recitation: the reel plan says when each ayah and word is recited; the
// text mode turns that into text events — groups of whole words on screen, shown again when the
// reciter repeats them (pure apart from text measuring).
import type { SurahMeta } from '../data/quran';
import { reference } from '../data/quran';
import type { Reciter } from '../data/reciters';
import {
  ayahPages, fitArabic, fitEnglish, frameLayout, halfUnits, lineUnits, translationPages, wordUnits,
  type Fit, type FrameLayout, type FrameStyle, type Range, type TextCtx,
} from './layout';
import type { TextMode, TranslationMode } from './project';
import { planScenes, type Scene, type SceneMode } from './scenes';
import type { ReelPlan } from './recitation';
import { displayWords, timeEvents, type Recited } from './words';

export interface TimedText extends Fit {
  start: number;
  end: number;
}

/** Words first..last on screen from start to end, with their translation when it follows the words. */
export interface TimedEvent {
  start: number;
  end: number;
  first: number;
  last: number;
  ar: Fit;
  en: Fit | null;
}

export interface TimedAyah {
  ayah: number;
  ref: string; // e.g. "Al-Baqara · 2:255"
  start: number;
  end: number;
  events: TimedEvent[];
  /** Whole-ayah translation pages when it does not follow the words (Line/Half/Words + "whole ayah"). */
  enPages: TimedText[];
}

export interface Timeline {
  duration: number;
  surah: SurahMeta;
  reciter: Reciter;
  mode: TextMode;
  layout: FrameLayout;
  ayat: TimedAyah[];
  /** Backgrounds: they fill the reel exactly. */
  scenes: Scene[];
  /** Seconds of intro title card at the start / closing reference card at the end (0 = none). */
  intro: number;
  outro: number;
}

export interface TimelineInput {
  surah: SurahMeta;
  reciter: Reciter;
  plan: ReelPlan;
  arabic: string[];
  english: string[]; // Sahih International, per ayah
  meanings: string[][]; // English meaning per display word, per ayah (synced translation)
  mode: TextMode;
  wordsPerStep: number;
  translationMode: TranslationMode;
  style: FrameStyle;
  sceneMode?: SceneMode; // default single
  sceneCount?: number; // entries in the scene list
}

/** Without word timings (Ayah mode only): pages follow each other, proportional to word counts. */
function proportional(units: Range[], start: number, end: number): Recited[] {
  const total = units[units.length - 1][1] + 1;
  return units.map(([f]) => [f, start + ((end - start) * f) / total, 0]);
}

export function buildTimeline(ctx: TextCtx, o: TimelineInput): Timeline {
  const lay = frameLayout(o.style);
  const synced = o.style.translation && o.translationMode === 'words';
  const ayat = o.plan.ayat.map((p, i): TimedAyah => {
    const text = o.arabic[i];
    const words = displayWords(text);
    const meanings = synced ? o.meanings[i] : null;
    const english = o.style.translation && !synced ? o.english[i] : null;
    const mode: TextMode = p.seq ? o.mode : 'ayah';
    const enText = (f: number, l: number) => meanings!.slice(f, l + 1).filter(Boolean).join(' ');
    let events: TimedEvent[];
    let enPages: TimedText[] = [];
    if (mode === 'ayah') {
      const pages = ayahPages(ctx, words, lay, english, meanings);
      const seq = p.seq ?? proportional(pages.units, p.start, p.end);
      const at = new Map(pages.units.map(([f], k) => [f, k]));
      events = timeEvents(pages.units, seq, p.end, () => false).map((e) => {
        const k = at.get(e.first)!;
        return { ...e, ar: pages.ar[k], en: pages.en ? pages.en[k] : null };
      });
    } else {
      const sizes = lay.arSizes[mode];
      const lineSize = lay.arSizes.line[0];
      const units = mode === 'line' ? lineUnits(ctx, words, lineSize) : mode === 'half' ? halfUnits(ctx, words, lineSize) : wordUnits(words.length, o.wordsPerStep);
      const arFit = (f: number, l: number) => fitArabic(ctx, words.slice(f, l + 1), sizes, lay.ar);
      const enFit = (f: number, l: number) => (meanings ? fitEnglish(ctx, enText(f, l), lay.en, lay.enSizes, lay.enFont) : null);
      const fits = (f: number, l: number) => arFit(f, l) !== null && (!meanings || enFit(f, l) !== null);
      events = timeEvents(units, p.seq!, p.end, fits).map((e) => {
        const ar = arFit(e.first, e.last);
        const en = enFit(e.first, e.last);
        if (!ar || (meanings && !en)) throw new Error('Text group could not be laid out');
        return { ...e, ar, en };
      });
      if (english) {
        // Whole-ayah translation, calm; a long one turns pages as the recitation progresses.
        const pages = translationPages(ctx, english, lay.en, lay.enSizes, lay.enFont);
        const starts = pages.map((_, k) => (k === 0 ? p.start : p.wordStart![Math.floor((k * words.length) / pages.length)]));
        enPages = pages.map((f, k) => ({ ...f, start: starts[k], end: k + 1 < pages.length ? starts[k + 1] : p.end }));
      }
    }
    // Rule 1 guard: every event is an exact run of whole words of the ayah.
    for (const e of events) {
      if (e.ar.lines.join(' ') !== words.slice(e.first, e.last + 1).join(' ')) throw new Error('Text grouping altered the ayah text');
    }
    return { ayah: p.ayah, ref: reference(o.surah, p.ayah), start: p.start, end: p.end, events, enPages };
  });
  return {
    duration: o.plan.duration, surah: o.surah, reciter: o.reciter, mode: o.mode, layout: lay, ayat,
    intro: o.plan.intro ?? 0, outro: o.plan.outro ?? 0,
    scenes: planScenes(o.sceneMode ?? 'single', o.sceneCount ?? 1, o.plan.duration, o.plan.ayat),
  };
}
