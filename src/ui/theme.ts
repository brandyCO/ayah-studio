// Brand themes: the user picks the gradient that carries the app's brand moments (the app name,
// Export / "Turn into reel", selected chips in the studio, progress bars, the empty-state glow) and
// the accent colour. Same rule as the original emerald: never on the mushaf page, the Arabic text,
// the reel itself or big backgrounds behind text. The Kids space keeps its own sky palette.
// Picked per device and synced with the account (pref `brandTheme`).
import { touchPref } from './prefs';

export interface BrandTheme {
  id: string;
  /** English name; the Arabic one is in the i18n tables (`theme.{id}`). */
  name: string;
  /** Hue of the night background tint (dark mode and the studio). */
  hue: number;
  /** Deep stops: white text on them stays ≥ 4.5:1 (buttons, chips). */
  fill: string[];
  /** Bright neon stops: bars, glows, the app name at night. */
  neon: string[];
  /** Accent on the light cream background (white text on it ≥ 4.5:1). */
  accentLight: string;
  /** Accent at night (dark text on it). */
  accentDark: string;
  accentInkDark: string;
}

export const THEMES: BrandTheme[] = [
  { id: 'emerald', name: 'Emerald', hue: 160, fill: ['#05573d', '#0f8273'], neon: ['#22b3a0', '#5eead4'],
    accentLight: '#0a6e55', accentDark: '#3dd1ad', accentInkDark: '#04201a' },
  { id: 'aurora', name: 'Aurora', hue: 175, fill: ['#006b54', '#00607a', '#4b3bb8'], neon: ['#00f5a0', '#00d9f5', '#8b7bff'],
    accentLight: '#00695c', accentDark: '#2ef0c4', accentInkDark: '#021c18' },
  { id: 'ultraviolet', name: 'Ultraviolet', hue: 275, fill: ['#5b0fc4', '#9b14c9'], neon: ['#9d4dff', '#e14dff'],
    accentLight: '#6a1bd1', accentDark: '#c49bff', accentInkDark: '#1a0633' },
  { id: 'synthwave', name: 'Synthwave', hue: 300, fill: ['#b0126a', '#6d1fc2'], neon: ['#ff2d95', '#b86bff', '#3dd8ff'],
    accentLight: '#b0126a', accentDark: '#ff7ac0', accentInkDark: '#2a0318' },
  { id: 'sunset', name: 'Neon Sunset', hue: 12, fill: ['#c2185b', '#c2410c'], neon: ['#ff3d77', '#ff8a3d', '#ffd23d'],
    accentLight: '#c0254f', accentDark: '#ff8f6b', accentInkDark: '#2b0a05' },
  { id: 'ocean', name: 'Deep Ocean', hue: 215, fill: ['#0b4dd6', '#0077a8'], neon: ['#2b6bff', '#2ee6ff'],
    accentLight: '#0b55c9', accentDark: '#5cc8ff', accentInkDark: '#03182b' },
  { id: 'gold', name: 'Royal Gold', hue: 42, fill: ['#7a4e00', '#8f6200'], neon: ['#e0a106', '#ffd76a', '#fff0b8'],
    accentLight: '#855400', accentDark: '#ffcc4d', accentInkDark: '#2a1c00' },
  { id: 'rose', name: 'Rose Quartz', hue: 330, fill: ['#b3155e', '#8a2bb8'], neon: ['#ff5fa2', '#ff8fd0', '#c86bff'],
    accentLight: '#b0195c', accentDark: '#ff8fc4', accentInkDark: '#2b0518' },
  { id: 'cyber', name: 'Cyber Lime', hue: 140, fill: ['#2c6e00', '#00745c'], neon: ['#a8ff3d', '#3dffb0'],
    accentLight: '#2f6b00', accentDark: '#a6f55a', accentInkDark: '#0d1f00' },
  { id: 'nebula', name: 'Nebula', hue: 260, fill: ['#3a1fb8', '#a3137a', '#b5420c'], neon: ['#6a5cff', '#f72585', '#ffb703'],
    accentLight: '#5a2ad1', accentDark: '#b39bff', accentInkDark: '#120a33' },
  { id: 'ice', name: 'Arctic Ice', hue: 200, fill: ['#1d5fa8', '#4a46b8'], neon: ['#7fe7ff', '#a5b4ff', '#e0c3fc'],
    accentLight: '#1b5e9e', accentDark: '#8fdcff', accentInkDark: '#041a2b' },
  { id: 'ember', name: 'Ember', hue: 0, fill: ['#b80f2e', '#a8320b'], neon: ['#ff1f4b', '#ff6a3d', '#ffb199'],
    accentLight: '#b5122f', accentDark: '#ff7a7a', accentInkDark: '#2b0507' },
];

export const DEFAULT_THEME = 'emerald';
const KEY = 'brandTheme';

export function themeId(): string {
  try {
    const v = localStorage.getItem(KEY);
    return v && THEMES.some((x) => x.id === v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export const themeById = (id: string) => THEMES.find((x) => x.id === id) ?? THEMES[0];

/** `#rrggbb` + alpha → `rgba(...)`. */
export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const grad = (deg: number, stops: string[]) => `linear-gradient(${deg}deg, ${stops.join(', ')})`;

/** Night colours tinted towards the theme's hue. */
export function night(x: BrandTheme) {
  const h = x.hue;
  return {
    // Near-neutral greys with only a hint of the hue: a calm place for the eye to rest; cards sit a
    // clear step above the page so structure comes from the surfaces, not from glow.
    bg: `hsl(${h} 10% 6%)`, card: `hsl(${h} 9% 10.5%)`, line: `hsl(${h} 8% 17%)`, sel: `hsl(${h} 24% 14%)`,
    muted: `hsl(${h} 6% 62%)`, studio: `hsl(${h} 8% 4.5%)`, studioCard: `hsl(${h} 7% 10%)`, studioLine: `hsl(${h} 7% 16%)`,
    meta: hslHex(h, 10, 6),
  };
}

function hslHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** The CSS that overrides the brand tokens for a theme (emerald: only the night surfaces). */
export function themeCss(x: BrandTheme): string {
  const n = night(x);
  // Emerald keeps its built-in colours (styles.css) and only takes the calmer night surfaces.
  if (x.id === DEFAULT_THEME) return `@media (prefers-color-scheme: dark) {
  :root { --bg: ${n.bg}; --card: ${n.card}; --line: ${n.line}; --muted: ${n.muted}; }
}
body[data-view="reel"] { --bg: ${n.studio}; --card: ${n.studioCard}; --line: ${n.studioLine}; }`;
  const shadow = (a: number) => `0 8px 22px -10px ${rgba(x.neon[x.neon.length - 1], a)}`; // a soft glow under the main action only
  return `:root {
  --accent: ${x.accentLight}; --sel-line: ${x.accentLight}; --sel: ${rgba(x.accentLight, 0.12)};
  --brand-fill: ${grad(45, x.fill)}; --brand-bar: ${grad(90, x.neon)}; --brand-text: ${grad(90, x.fill)};
  --brand-glow: ${rgba(x.neon[0], 0.18)}; --brand-shadow: ${shadow(0.28)};
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: ${n.bg}; --card: ${n.card}; --line: ${n.line}; --muted: ${n.muted}; --sel: ${n.sel};
    --accent: ${x.accentDark}; --accent-ink: ${x.accentInkDark}; --sel-line: ${x.accentDark};
    --brand-bar: ${grad(90, x.neon)}; --brand-text: ${grad(90, x.neon)};
    --brand-glow: ${rgba(x.neon[0], 0.2)}; --brand-shadow: ${shadow(0.6)};
  }
}
body[data-view="reel"] {
  --bg: ${n.studio}; --card: ${n.studioCard}; --line: ${n.studioLine};
  --accent: ${x.accentDark}; --accent-ink: ${x.accentInkDark};
  --brand-bar: ${grad(90, x.neon)}; --brand-shadow: ${shadow(0.6)};
}`;
}

/** Mixes two `#rrggbb` colours (t = share of b). */
function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `#${[16, 8, 0].map((sh) => ch(sh).toString(16).padStart(2, '0')).join('')}`;
}

/** The colours of the Me tab's streak flame and reward moments, taken from the theme's gradient:
 *  deep = its dark stops, n1–n3 = its neon stops, hi = the brightest stop lifted towards white,
 *  core = almost white with a hint of it, ink = dark text on the bright fills. */
export interface RewardPalette { deep: string; deep2: string; n1: string; n2: string; n3: string; hi: string; core: string; ink: string; hue: number }
export function rewardPalette(x = themeById(themeId())): RewardPalette {
  const n = x.neon;
  return {
    deep: x.fill[0], deep2: x.fill[x.fill.length - 1], n1: n[0], n2: n[Math.min(1, n.length - 1)], n3: n[n.length - 1],
    hi: mix(n[n.length - 1], '#ffffff', 0.55), core: mix(n[n.length - 1], '#ffffff', 0.85), ink: x.accentInkDark, hue: x.hue,
  };
}
/** The palette as CSS custom properties (set for every theme, emerald included). */
function rewardCss(x: BrandTheme): string {
  const p = rewardPalette(x);
  return `:root {
  --rw-deep: ${p.deep}; --rw-deep2: ${p.deep2}; --rw-n1: ${p.n1}; --rw-n2: ${p.n2}; --rw-n3: ${p.n3};
  --rw-hi: ${p.hi}; --rw-core: ${p.core}; --rw-ink: ${p.ink};
  --rw-hero: ${grad(100, x.fill)}; --rw-hero-glow: 0 8px 22px -10px ${rgba(p.n3, 0.6)};
  --rw-night: hsl(${p.hue} 55% 13%); --rw-night2: hsl(${p.hue} 40% 7%); --rw-night3: hsl(${p.hue} 35% 4%);
}`;
}

/** Applies the saved theme (call once at start, before the first screen). */
export function applyTheme(id = themeId()) {
  const x = themeById(id);
  let style = document.getElementById('brand-theme') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'brand-theme';
    document.head.append(style);
  }
  style.textContent = `${themeCss(x)}\n${rewardCss(x)}`;
  document.documentElement.dataset.theme = x.id;
  const dark = document.querySelector<HTMLMetaElement>('meta[name="theme-color"][media*="dark"]');
  if (dark) dark.content = night(x).meta;
  window.dispatchEvent(new Event('theme-changed')); // the Android widgets follow the colours
}

export function setTheme(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
  applyTheme(id);
  touchPref(KEY);
}
