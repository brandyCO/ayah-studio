// Project state: plain, serializable JSON. Everything the renderer needs besides decoded media.
import { TEXT_EFFECTS, type TextEffect } from './effects';
import { clampArSize, isFormat, type EnFont, type Format, type FrameStyle, type TextSize, type TitlePos, type TitleSize } from './layout';
import { validTranslation } from '../data/translations';
import { markStrip, validMark, type Mark } from './mark';
import { validMotion, type Motion } from './motion';
import { MAX_SCENES, SLOWMO, TRANSITIONS, type Clip, type SceneMode, type Transition } from './scenes';

export type { SceneMode, TextEffect, Transition };
/** Ayah: whole ayah · Line: one screen line · Half: half a line · Words: 1–3 words per step. */
export type TextMode = 'ayah' | 'line' | 'half' | 'words';
/** words: English meanings of exactly the Arabic words on screen · ayah: the whole ayah (Sahih International). */
export type TranslationMode = 'words' | 'ayah';
/** Colour grade laid over the background (never over the text). */
export type Grade = 'none' | 'warm' | 'golden' | 'cool' | 'dusk' | 'mono';
/** Strength of the legibility scrim (always on: rule 6). */
export type Scrim = 'light' | 'normal' | 'strong';
/** Where the text block sits in its area. */
export type TextPos = 'upper' | 'center' | 'lower';
/** Between ayat: keep the last ayah on screen until the next starts, or clear it shortly after. */
export type GapText = 'hold' | 'clear';

export interface TextColors {
  ar: string; // #rrggbb
  en: string;
  title: string; // surah name + reference
  hl: string; // the word being recited (word highlight)
}

export interface Project {
  version: 1;
  surah: number;
  from: number; // first ayah (inclusive)
  to: number; // last ayah (inclusive)
  reciterId: number; // QDC recitation id (src/data/reciters.ts)
  textMode: TextMode;
  wordsPerStep: 1 | 2 | 3;
  showTranslation: boolean;
  translationMode: TranslationMode;
  titlePos: TitlePos;
  titleSize: TitleSize;
  surahName: boolean; // Arabic surah name shown above the reference (the reference always shows: rule 2)
  scenes: string[]; // background ids (1…MAX_SCENES); Single uses the first
  clips: (Clip | null)[]; // per scene entry (same index as scenes): a video's in-point and fit; null = start, loop
  sceneMode: SceneMode;
  sceneLengths: number[]; // Custom: share of the reel per scene (any scale)
  sceneSnap: boolean; // Custom: scene changes snap to the reciter's pauses
  transition: Transition; // between scenes
  textEffect: TextEffect;
  colors: TextColors;
  grade: Grade;
  scrim: Scrim;
  textSize: TextSize;
  /** The Arabic size slider in px (layout AR_SIZE_MIN–MAX); wins over textSize. Per device, not in the
   *  look (gifts keep S / M / L: textSize follows the nearest). */
  arSize?: number;
  textPos: TextPos;
  enFont: EnFont;
  pause: number; // extra seconds of silence between ayat
  gap: GapText;
  gaps: Record<number, number>; // per ayah number: seconds of silence added before it
  trims: Record<number, [number, number]>; // per ayah number: silence trimmed from its audio's start and end
  holds: Record<number, number>; // per ayah number: seconds its text stays after its last word
  /** No longer used (the cards were removed, owner 2026-10-29): stored reels and looks with them turned on
   *  are moved to `lead` / `tail` by dropCards(). Kept so old drafts and gifts still read. */
  intro: boolean;
  outro: boolean;
  credit: boolean; // "Recited by …" (optional, off by default: owner decision)
  /** Extra lines on the closing card (the Khatm reel: circle and member names). User text: drawn in
   *  the UI font below the reference, never like the ayah. Not part of the remembered look. */
  closing?: Closing;
  /** A dedication in the user's own words ("For my mother"), on the closing card in the UI font, never
   *  near the ayah. Not in the look (each reel its own). */
  dedication?: string;
  /** The small "Ayah Studio" mark (off by default). */
  watermark: boolean;
  /** The user's own watermark: their text or logo (src/engine/mark.ts). Per device like cinema (not in
   *  the look, so gifts never carry it). */
  mark?: Mark;
  /** Moved / scaled by touch on the preview, optionally keyframed (src/engine/motion.ts). Per reel. */
  motion?: Motion;
  /** Word highlight: the word being recited turns `colors.hl` (only with word timings: rule 8). */
  highlight: boolean;
  /** Finishing touches over the background (never over the text). */
  grain: boolean;
  vignette: boolean;
  /** The whole-ayah translation (an id from src/data/translationList.ts); missing = the reader's choice.
   *  Kept with the draft, not with the remembered look (gifts carry looks only). */
  translation?: string;
  /** The reel opens on the voice: the silence before the first word is trimmed to the safe minimum
   *  (MIN_LEAD before the sound found in the audio). Only the start; the pauses between ayat stay. */
  tightStart?: boolean;
  /** Cinematic touches (src/engine/cinema.ts): breathing glow, open/close from black, slow drift,
   *  depth. Per device like tightStart (not part of the look, so gifts are unchanged). */
  cinema?: boolean;
  /** Slow motion for the background videos (`SLOWMO`; 1 = as filmed). Per device like cinema; never the recitation. */
  slowmo?: number;
  /** Tajweed colours on the Arabic (src/engine/tajweed.ts). Per device like cinema (not in the look). */
  tajweed?: boolean;
  /** Series mode: this reel is part `part` of `of` (shown on the closing card and in the caption). */
  series?: { part: number; of: number };
  /** Learning reel: the synced word meanings drawn large under the words (Words mode, word timings only). */
  learn?: boolean;
  /** Seconds the video keeps going after the recitation ends (0–TAIL_MAX; silent: no sound is added,
   *  rule 3). The background, the reference and the marks continue. Per reel. */
  tail?: number;
  /** Seconds of quiet before the first word (0–TAIL_MAX; silent, rule 3): dragged on the timeline. Per reel. */
  lead?: number;
  /** Video format (default 9:16). Per device like cinema (not in the look, so gifts stay 9:16). */
  format?: Format;
}

export interface Closing {
  title: string; // ≤ 80 characters
  names: string[]; // ≤ 60 names, ≤ 40 characters each
}
/** A dedication as the user typed it, without control characters, at most DEDICATION_MAX characters. */
export const DEDICATION_MAX = 60;
export const cleanDedication = (x: string) => x.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, DEDICATION_MAX);

const validClosing = (c: unknown): c is Closing => {
  const x = c as Closing;
  return !!x && typeof x.title === 'string' && x.title.length <= 80 && Array.isArray(x.names) && x.names.length <= 60
    && x.names.every((n) => typeof n === 'string' && n.length <= 40);
};

export const frameStyle = (p: Project): FrameStyle => ({
  translation: p.showTranslation,
  titlePos: p.titlePos,
  titleSize: p.titleSize,
  surahName: p.surahName,
  credit: p.credit,
  watermark: p.watermark,
  mark: markStrip(p.mark),
  textSize: p.textSize,
  arSize: p.arSize,
  format: p.format,
  learn: !!p.learn && p.textMode === 'words' && p.showTranslation && p.translationMode === 'words',
  enFont: p.enFont,
});

export const MAX_AYAT = 10;
export const INTRO = 3; // seconds an old intro card becomes (dropCards)
export const OUTRO = 3; // seconds an old closing card becomes; the least an ending with lines gets
export const PAUSES = [0, 0.5, 1, 2];
export const TAIL_MAX = 10;

/** The reel ends on lines of its own (a dedication, a Khatm / keepsake title, "Part k of N"): they show
 *  over the background during the quiet time after the last word, once the ayah has left. */
export const hasEnding = (p: Partial<Pick<Project, 'closing' | 'dedication' | 'series'>>) => !!(p.closing || p.dedication || p.series);
const secs = (x: number | undefined) => Math.min(TAIL_MAX, Math.max(0, x ?? 0));

/** Pacing of the reel: quiet before the first word and after the last, silence between ayat (and per
 *  ayah), text holds. No title or closing cards: the reel's own start and end are dragged instead. */
export const pacing = (p: Pick<Project, 'pause' | 'gap'> & Partial<Pick<Project, 'gaps' | 'trims' | 'holds' | 'from' | 'to' | 'tightStart' | 'tail' | 'lead' | 'closing' | 'dedication' | 'series'>>) => {
  const ayat = p.from && p.to ? Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from! + i) : [];
  const end = secs(p.tail);
  const ending = hasEnding(p) && end > 0;
  return {
    pause: p.pause,
    hold: p.gap === 'hold',
    intro: secs(p.lead),
    // With ending lines the quiet end is the ending (the ayah leaves before it), else just more background.
    outro: ending ? end : 0,
    tail: ending ? 0 : end,
    gaps: ayat.map((a) => p.gaps?.[a] ?? 0),
    // Start on the first word: as much of the opening silence as is safe (arrangeReel clamps it).
    trims: ayat.map((a, i): [number, number] => (i === 0 && p.tightStart ? [Infinity, p.trims?.[a]?.[1] ?? 0] : p.trims?.[a] ?? [0, 0])),
    holds: ayat.map((a) => p.holds?.[a] ?? null),
  };
};

/** Old reels and looks with the intro / closing card on: the card's time becomes quiet start / end. */
export function dropCards(p: Project) {
  if (p.intro) p.lead = Math.max(p.lead ?? 0, INTRO);
  if (p.outro) p.tail = Math.max(p.tail ?? 0, OUTRO);
  p.intro = p.outro = false;
}
/** A reel given ending lines gets time to show them. */
export function giveEnding(p: Project) {
  if ((p.tail ?? 0) < OUTRO) p.tail = OUTRO;
}

export function newProject(surah: number, from: number, to: number, reciterId: number): Project {
  return {
    version: 1,
    surah,
    from,
    to,
    reciterId,
    textMode: 'line',
    wordsPerStep: 2,
    showTranslation: true,
    translationMode: 'words',
    titlePos: 'top',
    titleSize: 'm',
    surahName: true,
    scenes: ['mist'],
    clips: [],
    sceneMode: 'single',
    sceneLengths: [],
    sceneSnap: true,
    gaps: {},
    trims: {},
    holds: {},
    transition: 'crossfade',
    textEffect: 'rise',
    colors: { ar: '#ffffff', en: '#f1ece2', title: '#f3e3bc', hl: '#f2c46b' },
    grade: 'none',
    scrim: 'normal',
    textSize: 'm',
    textPos: 'center',
    enFont: 'serif',
    pause: 0,
    gap: 'clear',
    intro: false,
    outro: false,
    credit: false,
    watermark: false,
    highlight: false,
    grain: false,
    vignette: false,
    tightStart: true,
    cinema: true,
  };
}

/** The look of a reel (everything but the selection and reciter), remembered for the next reel. */
export const LOOK_KEYS = [
  'textMode', 'wordsPerStep', 'showTranslation', 'translationMode', 'titlePos', 'titleSize', 'surahName', 'scenes', 'clips',
  'sceneMode', 'sceneLengths', 'sceneSnap', 'transition', 'textEffect', 'colors', 'grade', 'scrim', 'textSize', 'textPos', 'enFont', 'pause', 'gap', 'intro', 'outro',
  'credit', 'watermark', 'highlight', 'grain', 'vignette',
] as const;
export type Look = Pick<Project, (typeof LOOK_KEYS)[number]>;

const ALLOWED: Partial<Record<keyof Look, readonly unknown[]>> = {
  textMode: ['ayah', 'line', 'half', 'words'],
  wordsPerStep: [1, 2, 3],
  translationMode: ['words', 'ayah'],
  titlePos: ['top', 'below', 'bottom'],
  titleSize: ['s', 'm', 'l'],
  textEffect: TEXT_EFFECTS.map((e) => e.value),
  sceneMode: ['single', 'ayah', 'even', 'custom'],
  transition: TRANSITIONS.map((e) => e.value),
  grade: ['none', 'warm', 'golden', 'cool', 'dusk', 'mono'],
  scrim: ['light', 'normal', 'strong'],
  textSize: ['s', 'm', 'l'],
  textPos: ['upper', 'center', 'lower'],
  enFont: ['serif', 'sans', 'round'],
  pause: PAUSES,
  gap: ['hold', 'clear'],
};
const HEX = /^#[0-9a-f]{6}$/i;

/** Copy the valid parts of a stored look onto the project (stored data may be old or damaged). */
export function applyLook(p: Project, look: unknown, validBackground: (id: string) => boolean) {
  if (!look || typeof look !== 'object') return;
  const l = { ...(look as Record<string, unknown>) };
  const out = p as unknown as Record<string, unknown>;
  if (!('scenes' in l) && typeof l.backgroundId === 'string') l.scenes = [l.backgroundId]; // looks saved before scenes
  let kept: number[] | null = null; // stored scene indices still valid (a library item may have been deleted)
  for (const k of LOOK_KEYS) {
    const v = l[k];
    if (k === 'colors') {
      const c = v as Partial<TextColors> | undefined;
      if (c && typeof c === 'object') for (const x of ['ar', 'en', 'title', 'hl'] as const) if (typeof c[x] === 'string' && HEX.test(c[x]!)) p.colors[x] = c[x]!.toLowerCase();
    } else if (k === 'scenes') {
      const idx = Array.isArray(v) ? v.map((x, i) => (typeof x === 'string' && validBackground(x) ? i : -1)).filter((i) => i >= 0).slice(0, MAX_SCENES) : [];
      if (idx.length) {
        p.scenes = idx.map((i) => (v as string[])[i]);
        kept = idx;
      }
    } else if (k === 'clips') {
      const ok = (c: unknown) => c === null || (!!c && typeof c === 'object' && Number.isFinite((c as Clip).in) && (c as Clip).in >= 0 && ['loop', 'slow', 'hold'].includes((c as Clip).fit));
      if (Array.isArray(v) && v.every(ok)) {
        const list = v as (Clip | null)[];
        p.clips = (kept ?? list.map((_, i) => i)).slice(0, MAX_SCENES).map((i) => (list[i] ? { in: list[i]!.in, fit: list[i]!.fit } : null));
      }
    } else if (k === 'sceneLengths') {
      if (Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)) p.sceneLengths = v.slice(0, MAX_SCENES);
    } else if (ALLOWED[k] ? ALLOWED[k]!.includes(v) : typeof v === typeof out[k]) {
      out[k] = v;
    }
  }
  dropCards(p);
}

export const lookOf = (p: Project): Look =>
  Object.fromEntries(LOOK_KEYS.map((k) => [k, structuredClone(p[k])])) as unknown as Look;

const isNumRecord = (v: unknown, ok: (x: unknown) => boolean) =>
  !!v && typeof v === 'object' && !Array.isArray(v) && Object.entries(v as object).every(([k, x]) => /^\d+$/.test(k) && ok(x));
const finite = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

/** Copy a saved draft onto a new project: its look, reciter and per-ayah audio edits (stored data may be old or damaged). */
export function restoreProject(p: Project, saved: unknown, validBackground: (id: string) => boolean, validReciter: (id: number) => boolean) {
  if (!saved || typeof saved !== 'object') return;
  const d = saved as Partial<Project>;
  applyLook(p, d, validBackground);
  if (typeof d.reciterId === 'number' && validReciter(d.reciterId)) p.reciterId = d.reciterId;
  if (isNumRecord(d.gaps, finite)) p.gaps = { ...d.gaps! };
  if (isNumRecord(d.holds, finite)) p.holds = { ...d.holds! };
  if (isNumRecord(d.trims, (x) => Array.isArray(x) && x.length === 2 && x.every(finite))) p.trims = structuredClone(d.trims!);
  if (typeof d.translation === 'string' && validTranslation(d.translation)) p.translation = d.translation;
  p.tightStart = d.tightStart === true;
  p.cinema = d.cinema === true; // drafts from before the setting keep their own start
  if (typeof d.arSize === 'number' && Number.isFinite(d.arSize)) p.arSize = clampArSize(d.arSize);
  p.tajweed = d.tajweed === true;
  p.learn = d.learn === true;
  if (isFormat(d.format)) p.format = d.format;
  const sr = d.series;
  if (sr && Number.isInteger(sr.part) && Number.isInteger(sr.of) && sr.part >= 1 && sr.part <= sr.of && sr.of <= 200) p.series = { part: sr.part, of: sr.of };
  p.slowmo = (SLOWMO as readonly number[]).includes(d.slowmo as number) ? (d.slowmo as number) : 1;
  if (validClosing(d.closing)) p.closing = { title: d.closing.title, names: [...d.closing.names] };
  if (typeof d.dedication === 'string') p.dedication = cleanDedication(d.dedication);
  const mk = validMark(d.mark);
  if (mk) p.mark = mk;
  p.motion = validMotion(d.motion);
  if (typeof d.tail === 'number' && Number.isFinite(d.tail) && d.tail > 0) p.tail = Math.min(TAIL_MAX, Math.round(d.tail * 10) / 10);
  else delete p.tail;
  if (typeof d.lead === 'number' && Number.isFinite(d.lead) && d.lead > 0) p.lead = Math.min(TAIL_MAX, Math.round(d.lead * 1000) / 1000);
  else delete p.lead;
  if (d.intro === true) p.intro = true; // (applyLook already moved the look's cards; the draft's own come last)
  if (d.outro === true) p.outro = true;
  dropCards(p);
}

/** JSON with object keys sorted (the database may store them in another order). */
