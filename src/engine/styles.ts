// Ready-made styles: one tap turns a new reel into a finished look (background, mood, text mode,
// word highlight, finishing touches). Built only from the calm pieces the editor already has, so
// every rule holds; everything stays adjustable afterwards.
import { MOODS, applyMood, currentMood } from './moods';
import type { Project, TextMode } from './project';

export interface Style {
  id: string;
  label: string;
  scene: string; // background id
  mood: string; // a mood id (src/engine/moods.ts)
  textMode: TextMode;
  highlight: boolean;
  hl: string; // highlight colour
  grain: boolean;
  vignette: boolean;
}

export const STYLES: Style[] = [
  { id: 'gold-words', label: 'Gold words', scene: 'night', mood: 'night', textMode: 'ayah', highlight: true, hl: '#f2c46b', grain: true, vignette: true },
  { id: 'dawn-clouds', label: 'Dawn clouds', scene: 'light:dawn', mood: 'dawn', textMode: 'ayah', highlight: true, hl: '#f2c98a', grain: false, vignette: true },
  { id: 'starfield', label: 'Starfield', scene: 'light:stars', mood: 'night', textMode: 'line', highlight: true, hl: '#f8e7b9', grain: false, vignette: true },
  { id: 'lanterns', label: 'Lanterns', scene: 'light:lanterns', mood: 'gold', textMode: 'ayah', highlight: true, hl: '#f8e7b9', grain: true, vignette: true },
  { id: 'desert-dusk', label: 'Desert dusk', scene: 'dunes', mood: 'dusk', textMode: 'ayah', highlight: true, hl: '#f2c98a', grain: true, vignette: true },
  { id: 'mist-film', label: 'Mist film', scene: 'mist', mood: 'serene', textMode: 'line', highlight: false, hl: '#f2c46b', grain: true, vignette: true },
  { id: 'minimal', label: 'Minimal', scene: 'charcoal', mood: 'minimal', textMode: 'words', highlight: false, hl: '#f2c46b', grain: false, vignette: false },
];

export function applyStyle(p: Project, s: Style) {
  const m = MOODS.find((x) => x.id === s.mood);
  if (m) applyMood(p, m);
  p.scenes = [s.scene];
  p.clips = [];
  p.sceneMode = 'single';
  p.sceneLengths = [];
  p.textMode = s.textMode;
  p.highlight = s.highlight;
  p.colors.hl = s.hl;
  p.grain = s.grain;
  p.vignette = s.vignette;
}

/** The style the project still has, if any. */
export function currentStyle(p: Project): string | null {
  return STYLES.find((s) => p.scenes.length === 1 && p.scenes[0] === s.scene && currentMood(p) === s.mood && p.textMode === s.textMode
    && p.highlight === s.highlight && p.grain === s.grain && p.vignette === s.vignette && (!s.highlight || p.colors.hl === s.hl))?.id ?? null;
}

/** Quick reel vibes: five calm looks, one recommended for the moment (footage, local time, the
 *  reciter's pace) and the others one tap away. Never chosen from what an ayah means (no
 *  interpretation of the Quran). Built only from the editor's own calm pieces. */
export interface Vibe extends Style {
  effect: Project['textEffect'];
  pause: number;
  gap: Project['gap'];
  grade?: Project['grade'];
  wordsPerStep?: 1 | 2 | 3;
}
export const VIBES: Vibe[] = [
  { id: 'tahajjud', label: 'Tahajjud', scene: 'light:stars', mood: 'night', textMode: 'ayah', highlight: true, hl: '#f2c46b', grain: false, vignette: true, effect: 'glow', pause: 1, gap: 'hold' },
  { id: 'fajr', label: 'Fajr', scene: 'light:dawn', mood: 'dawn', textMode: 'ayah', highlight: true, hl: '#f2c98a', grain: false, vignette: true, effect: 'blur-in', pause: 0.5, gap: 'hold' },
  { id: 'rain', label: 'After rain', scene: 'mist', mood: 'serene', textMode: 'ayah', highlight: true, hl: '#e4ecf7', grain: true, vignette: true, effect: 'mist', pause: 0.5, gap: 'hold', grade: 'cool' },
  { id: 'golden', label: 'Golden hour', scene: 'dunes', mood: 'gold', textMode: 'ayah', highlight: true, hl: '#f8e7b9', grain: true, vignette: true, effect: 'ink', pause: 0.5, gap: 'hold' },
  { id: 'stillness', label: 'Stillness', scene: 'charcoal', mood: 'minimal', textMode: 'words', highlight: false, hl: '#f2c46b', grain: false, vignette: false, effect: 'fade', pause: 0.5, gap: 'clear', wordsPerStep: 2 },
];

/** Apply a vibe; `keepScene` keeps the user's footage, `paced` is the text mode for this reciter's pace. */
export function applyVibe(p: Project, v: Vibe, keepScene?: string, paced?: Project['textMode']) {
  applyStyle(p, v);
  if (keepScene) p.scenes = [keepScene];
  p.textEffect = v.effect;
  p.pause = v.pause;
  p.gap = v.gap;
  if (v.grade) p.grade = v.grade;
  if (v.wordsPerStep) p.wordsPerStep = v.wordsPerStep;
  if (paced && v.textMode !== 'words') p.textMode = paced;
}

/** The vibe the project still has (on any single background), if any. */
export function currentVibe(p: Project): string | null {
  if (p.scenes.length !== 1) return null;
  const keys = ['textEffect', 'transition', 'colors', 'grade', 'scrim', 'enFont', 'pause', 'gap', 'highlight', 'grain', 'vignette', 'sceneMode'] as const;
  return VIBES.find((v) => {
    const q = structuredClone(p);
    applyVibe(q, v, p.scenes[0], p.textMode);
    return keys.every((k) => JSON.stringify(q[k]) === JSON.stringify(p[k])) && (v.textMode !== 'words' || p.textMode === 'words');
  })?.id ?? null;
}

export type VibeWhy = 'footage' | 'night' | 'dawn' | 'evening' | 'day';
/** The vibe for this moment: the footage picked (if any) first, then the local hour. */
export function recommendVibe(footage: string | null, hour: number): { vibe: Vibe; why: VibeWhy } {
  const by = (id: string) => VIBES.find((v) => v.id === id)!;
  const fromFootage: Record<string, string> = { night: 'tahajjud', sky: 'fajr', light: 'fajr', rain: 'rain', sea: 'rain', forest: 'rain', desert: 'golden', mountains: 'golden' };
  if (footage && fromFootage[footage]) return { vibe: by(fromFootage[footage]), why: 'footage' };
  if (hour >= 20 || hour < 4) return { vibe: by('tahajjud'), why: 'night' };
  if (hour < 8) return { vibe: by('fajr'), why: 'dawn' };
  if (hour >= 16) return { vibe: by('golden'), why: 'evening' };
  return { vibe: by('rain'), why: 'day' };
}

/** Text mode for the reciter's pace: whole ayat for a slow, drawn-out recitation, lines for a quicker one. */
export const pacedMode = (wordsPerSecond: number | null): Project['textMode'] => (wordsPerSecond !== null && wordsPerSecond > 1.7 ? 'line' : 'ayah');

/** Quick reel footage preferences → calm searches (rule 4: nature and light only, no people). */
export const FOOTAGE: { id: string; label: string; q: string }[] = [
  { id: 'sky', label: 'Sky', q: 'clouds sky' },
  { id: 'sea', label: 'Sea', q: 'ocean waves' },
  { id: 'rain', label: 'Rain', q: 'rain drops' },
  { id: 'mountains', label: 'Mountains', q: 'mountains mist' },
  { id: 'forest', label: 'Forest', q: 'forest trees' },
  { id: 'desert', label: 'Desert', q: 'desert dunes' },
  { id: 'night', label: 'Night', q: 'night sky stars' },
  { id: 'light', label: 'Light', q: 'sunlight rays' },
];

/** Text motions offered in the Quick reel (all from the calm set, rule 7). */
export const QUICK_MOTIONS = ['fade', 'rise', 'ink', 'glow'] as const;
