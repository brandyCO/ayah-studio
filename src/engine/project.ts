// Project state: plain, serializable JSON. Everything the renderer needs besides decoded media.
import { TEXT_EFFECTS, type TextEffect } from './effects';
import type { EnFont, FrameStyle, TextSize, TitlePos, TitleSize } from './layout';
import { MAX_SCENES, TRANSITIONS, type Clip, type SceneMode, type Transition } from './scenes';

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
  textPos: TextPos;
  enFont: EnFont;
  pause: number; // extra seconds of silence between ayat
  gap: GapText;
  gaps: Record<number, number>; // per ayah number: seconds of silence added before it
  trims: Record<number, [number, number]>; // per ayah number: silence trimmed from its audio's start and end
  holds: Record<number, number>; // per ayah number: seconds its text stays after its last word
  intro: boolean; // title card before the recitation
  outro: boolean; // closing reference card
  credit: boolean; // "Recited by …" (optional, off by default: owner decision)
  /** Extra lines on the closing card (the Khatm reel: circle and member names). User text: drawn in
   *  the UI font below the reference, never like the ayah. Not part of the remembered look. */
  closing?: Closing;
  watermark: boolean;
}

export interface Closing {
  title: string; // ≤ 80 characters
  names: string[]; // ≤ 60 names, ≤ 40 characters each
}
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
  textSize: p.textSize,
  enFont: p.enFont,
});

export const MAX_AYAT = 10;
export const INTRO = 3; // seconds of the intro title card
export const OUTRO = 3; // seconds of the closing reference card
export const PAUSES = [0, 0.5, 1, 2];

/** Pacing of the reel: silence added between ayat (and per ayah), text holds, cards before/after. */
export const pacing = (p: Pick<Project, 'pause' | 'gap' | 'intro' | 'outro'> & Partial<Pick<Project, 'gaps' | 'trims' | 'holds' | 'from' | 'to'>>) => {
  const ayat = p.from && p.to ? Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from! + i) : [];
  return {
    pause: p.pause,
    hold: p.gap === 'hold',
    intro: p.intro ? INTRO : 0,
    outro: p.outro ? OUTRO : 0,
    gaps: ayat.map((a) => p.gaps?.[a] ?? 0),
    trims: ayat.map((a): [number, number] => p.trims?.[a] ?? [0, 0]),
    holds: ayat.map((a) => p.holds?.[a] ?? null),
  };
};

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
    colors: { ar: '#ffffff', en: '#f1ece2', title: '#f3e3bc' },
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
    watermark: true,
  };
}

/** The look of a reel (everything but the selection and reciter), remembered for the next reel. */
export const LOOK_KEYS = [
  'textMode', 'wordsPerStep', 'showTranslation', 'translationMode', 'titlePos', 'titleSize', 'surahName', 'scenes', 'clips',
  'sceneMode', 'sceneLengths', 'sceneSnap', 'transition', 'textEffect', 'colors', 'grade', 'scrim', 'textSize', 'textPos', 'enFont', 'pause', 'gap', 'intro', 'outro',
  'credit', 'watermark',
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
  enFont: ['serif', 'sans'],
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
      if (c && typeof c === 'object') for (const x of ['ar', 'en', 'title'] as const) if (typeof c[x] === 'string' && HEX.test(c[x]!)) p.colors[x] = c[x]!.toLowerCase();
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
  if (validClosing(d.closing)) p.closing = { title: d.closing.title, names: [...d.closing.names] };
}

/** JSON with object keys sorted (the database may store them in another order). */
const canon = (v: unknown): string => (Array.isArray(v) ? `[${v.map(canon).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`
    : JSON.stringify(v));

/** A look received from someone else (a gift) must be valid as a whole: known keys only, and every
 *  value one that applyLook() would keep unchanged (the database checks the same rules). */
export function strictLook(look: unknown, validBackground: (id: string) => boolean): boolean {
  if (!look || typeof look !== 'object' || Array.isArray(look)) return false;
  const l = look as Record<string, unknown>;
  if (!Object.keys(l).every((k) => (LOOK_KEYS as readonly string[]).includes(k))) return false;
  if ('scenes' in l && (!Array.isArray(l.scenes) || !l.scenes.length)) return false;
  if ('colors' in l && (!l.colors || typeof l.colors !== 'object' || !Object.keys(l.colors).every((k) => ['ar', 'en', 'title'].includes(k)))) return false;
  const p = newProject(1, 1, 1, 0);
  applyLook(p, l, validBackground);
  return Object.keys(l).every((k) => {
    const got = (p as unknown as Record<string, unknown>)[k];
    if (k === 'colors') return Object.entries(l.colors as object).every(([x, c]) => typeof c === 'string' && (got as Record<string, string>)[x] === c.toLowerCase());
    return canon(got) === canon(l[k]);
  });
}
