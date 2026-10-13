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

/** Quick reel: the pick shown first — gold word highlight, a slow fade, the Night grade, a vignette
 *  and a half-second breath between ayat. A curated default, kept on the footage the user chose. */
export const RECOMMENDED: Style = STYLES[0];
export function applyRecommended(p: Project, keepScene?: string) {
  applyStyle(p, RECOMMENDED);
  p.textEffect = 'fade';
  p.pause = 0.5;
  if (keepScene) p.scenes = [keepScene];
}

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

/** Whether the project still has the Recommended look (on any single background). */
export function isRecommended(p: Project): boolean {
  if (p.scenes.length !== 1) return false;
  const q = structuredClone(p);
  applyRecommended(q, p.scenes[0]);
  const keys = ['textEffect', 'transition', 'colors', 'grade', 'scrim', 'enFont', 'pause', 'gap', 'textMode', 'highlight', 'grain', 'vignette', 'sceneMode'] as const;
  return keys.every((k) => JSON.stringify(q[k]) === JSON.stringify(p[k]));
}
