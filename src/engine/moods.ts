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

/**
 * Text colours offered as a grid (no hue/saturation picker): rows of whites, creams and golds, roses,
 * greens, blues and greys, light to deep. The eyedropper can also take a colour from the video.
 */
export const COLOURS: string[] = [
  '#ffffff', '#fdf0f0', '#fff6e8', '#f3ebdd', '#f1ece2', '#eef3ff',
  '#f6e3cc', '#f8e7b9', '#f3e3bc', '#f2c98a', '#e8c77a', '#c9a24a',
  '#f6e3e6', '#ecd9de', '#e9c3c9', '#d9a0ab', '#c7a6d6', '#8f78b8',
  '#e3f1e6', '#cfe8d8', '#a9d6bd', '#7fbf9d', '#5aa281', '#3f7f63',
  '#e4ecf7', '#c8d2e6', '#c9d6ea', '#a7bde0', '#7f9fcf', '#4f6fa8',
  '#d9dee4', '#b5bcc6', '#8b939e', '#5f6670', '#3a3f46', '#1f2328',
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
