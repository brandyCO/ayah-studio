// Project state: plain, serializable JSON. Everything the renderer needs besides decoded media.
import { TEXT_EFFECTS, type TextEffect } from './effects';
import type { EnFont, FrameStyle, TextSize, TitlePos, TitleSize } from './layout';
import { MAX_SCENES, TRANSITIONS, type SceneMode, type Transition } from './scenes';

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
  scenes: string[]; // background ids (1…MAX_SCENES); Single uses the first
  sceneMode: SceneMode;
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
  intro: boolean; // title card before the recitation
  outro: boolean; // closing reference card
  credit: boolean; // "Recited by …" (optional, off by default: owner decision)
  watermark: boolean;
}

export const frameStyle = (p: Project): FrameStyle => ({
  translation: p.showTranslation,
  titlePos: p.titlePos,
  titleSize: p.titleSize,
  credit: p.credit,
  watermark: p.watermark,
  textSize: p.textSize,
  enFont: p.enFont,
});

export const MAX_AYAT = 10;
export const INTRO = 3; // seconds of the intro title card
export const OUTRO = 3; // seconds of the closing reference card
export const PAUSES = [0, 0.5, 1, 2];

/** Pacing of the reel: silence added between ayat, cards before/after. */
export const pacing = (p: Pick<Project, 'pause' | 'gap' | 'intro' | 'outro'>) => ({
  pause: p.pause,
  hold: p.gap === 'hold',
  intro: p.intro ? INTRO : 0,
  outro: p.outro ? OUTRO : 0,
});

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
    scenes: ['mist'],
    sceneMode: 'single',
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
  'textMode', 'wordsPerStep', 'showTranslation', 'translationMode', 'titlePos', 'titleSize', 'scenes',
  'sceneMode', 'transition', 'textEffect', 'colors', 'grade', 'scrim', 'textSize', 'textPos', 'enFont', 'pause', 'gap', 'intro', 'outro',
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
  sceneMode: ['single', 'ayah', 'even'],
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
  for (const k of LOOK_KEYS) {
    const v = l[k];
    if (k === 'colors') {
      const c = v as Partial<TextColors> | undefined;
      if (c && typeof c === 'object') for (const x of ['ar', 'en', 'title'] as const) if (typeof c[x] === 'string' && HEX.test(c[x]!)) p.colors[x] = c[x]!.toLowerCase();
    } else if (k === 'scenes') {
      const ids = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && validBackground(x)).slice(0, MAX_SCENES) : [];
      if (ids.length) p.scenes = ids;
    } else if (ALLOWED[k] ? ALLOWED[k]!.includes(v) : typeof v === typeof out[k]) {
      out[k] = v;
    }
  }
}

export const lookOf = (p: Project): Look =>
  Object.fromEntries(LOOK_KEYS.map((k) => [k, structuredClone(p[k])])) as unknown as Look;
