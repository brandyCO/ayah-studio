// Moods: one-tap presets bundling text effect, scene transition, colours, colour grade, scrim, translation font and
// pacing. Everything stays adjustable afterwards; a mood shows as picked while its settings match.
import type { Project } from './project';

type MoodSettings = Pick<Project, 'textEffect' | 'transition' | 'colors' | 'grade' | 'scrim' | 'enFont' | 'pause' | 'gap'>;

export interface Mood {
  id: string;
  label: string;
  set: MoodSettings;
}

export const MOODS: Mood[] = [
  { id: 'serene', label: 'Serene', set: { textEffect: 'rise', transition: 'crossfade', colors: { ar: '#ffffff', en: '#f1ece2', title: '#f3e3bc' }, grade: 'none', scrim: 'normal', enFont: 'serif', pause: 0, gap: 'clear' } },
  { id: 'dawn', label: 'Dawn', set: { textEffect: 'blur-in', transition: 'white', colors: { ar: '#fff6e8', en: '#f6e3cc', title: '#f2c98a' }, grade: 'warm', scrim: 'normal', enFont: 'serif', pause: 0.5, gap: 'hold' } },
  { id: 'night', label: 'Night', set: { textEffect: 'glow', transition: 'blur', colors: { ar: '#eef3ff', en: '#c9d6ea', title: '#c8d2e6' }, grade: 'cool', scrim: 'strong', enFont: 'serif', pause: 1, gap: 'hold' } },
  { id: 'gold', label: 'Gold', set: { textEffect: 'ink', transition: 'leak', colors: { ar: '#f8e7b9', en: '#f3ebdd', title: '#e8c77a' }, grade: 'golden', scrim: 'normal', enFont: 'serif', pause: 0.5, gap: 'hold' } },
  { id: 'dusk', label: 'Dusk', set: { textEffect: 'mist', transition: 'mist', colors: { ar: '#fdf0f0', en: '#ecd9de', title: '#e9c3c9' }, grade: 'dusk', scrim: 'normal', enFont: 'serif', pause: 0.5, gap: 'hold' } },
  { id: 'minimal', label: 'Minimal', set: { textEffect: 'fade', transition: 'crossfade', colors: { ar: '#ffffff', en: '#ffffff', title: '#ffffff' }, grade: 'none', scrim: 'light', enFont: 'sans', pause: 0, gap: 'clear' } },
];

export function applyMood(p: Project, m: Mood) {
  Object.assign(p, structuredClone(m.set));
}

/** The mood whose settings the project still has, if any. */
export function currentMood(p: Project): string | null {
  const same = (m: Mood) => (Object.keys(m.set) as (keyof MoodSettings)[]).every((k) =>
    k === 'colors' ? (['ar', 'en', 'title'] as const).every((c) => p.colors[c] === m.set.colors[c]) : p[k] === m.set[k]);
  return MOODS.find(same)?.id ?? null;
}

/** Calm text colours offered as swatches (a custom colour can be picked too). */
export const PALETTE: { color: string; label: string }[] = [
  { color: '#ffffff', label: 'White' },
  { color: '#fff6e8', label: 'Warm white' },
  { color: '#f1ece2', label: 'Ivory' },
  { color: '#e9d8b4', label: 'Sand' },
  { color: '#f3e3bc', label: 'Pale gold' },
  { color: '#e8c77a', label: 'Gold' },
  { color: '#e9c3c9', label: 'Rose' },
  { color: '#cfe8d8', label: 'Mint' },
  { color: '#c9d6ea', label: 'Mist blue' },
  { color: '#d9dee4', label: 'Silver' },
];

/** Colour grades: [composite operation, fill] layers over the background, under the scrim. */
export const GRADES: Record<Project['grade'], { label: string; layers: [GlobalCompositeOperation, string][] }> = {
  none: { label: 'None', layers: [] },
  warm: { label: 'Warm', layers: [['soft-light', 'rgba(255,150,70,0.45)'], ['source-over', 'rgba(255,170,110,0.06)']] },
  golden: { label: 'Golden', layers: [['soft-light', 'rgba(255,190,80,0.55)'], ['source-over', 'rgba(120,80,20,0.08)']] },
  cool: { label: 'Cool', layers: [['soft-light', 'rgba(70,120,255,0.45)'], ['source-over', 'rgba(10,25,60,0.12)']] },
  dusk: { label: 'Dusk', layers: [['soft-light', 'rgba(220,110,160,0.4)'], ['source-over', 'rgba(60,20,60,0.08)']] },
  mono: { label: 'Mono', layers: [['saturation', 'rgba(128,128,128,0.9)']] },
};

export const SCRIM_STRENGTH: Record<Project['scrim'], number> = { light: 0.6, normal: 1, strong: 1.45 };
