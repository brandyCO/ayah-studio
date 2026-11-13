// The opening (owner pick 2026-11-13, "the character arrives"): the app icon comes alive. Once per launch the
// theme's gradient fills the screen (out of the splash colour), the white end-of-ayah marker pops in, the user's
// character drops into it and waves, the gold Light star falls in beside them with a little burst and they cheer,
// "ayah studio" rises in, and everything glides into the app (≈ 2.6 s). The same picture as the launcher icon
// (scripts/make-character-icons.py: THEME_B, the marker, the star at 404,92). Every move is a transform / opacity
// CSS animation or the character's own compositor layers (actor.ts), so the app starting underneath cannot make it
// stutter. It never delays the app; a tap ends it; skipped with reduced motion and in old-phone mode (main.ts).
// The character loads as its own chunk; if it is not there in time the marker and the star play without it.
import { h } from './dom';
import { themeId } from './theme';

/** Top, bottom, glow, marker edge, marker face: the launcher icon's colours per theme (make-character-icons.py). */
const COLOURS: Record<string, [string, string, string, string, string]> = {
  emerald: ['#4b36b8', '#ff7f57', '#ffb38a', '#b54a3a', '#fff3ec'],
  aurora: ['#2fe0c0', '#4b3bb8', '#b8fff0', '#2b2a8e', '#effffb'],
  ultraviolet: ['#b06bff', '#5b0fc4', '#e6ccff', '#3e0a8a', '#f6efff'],
  synthwave: ['#ff4fa8', '#5a1fc2', '#ffc2e6', '#3e1590', '#fff0f8'],
  sunset: ['#ff3d77', '#ffb02e', '#ffd2a0', '#b3341f', '#fff4ea'],
  ocean: ['#3ec8ff', '#0b4dd6', '#c8f2ff', '#08389c', '#eefaff'],
  gold: ['#ffd45c', '#d9851a', '#fff2b0', '#8f5200', '#fffaf0'],
  rose: ['#ff8fd0', '#a63bc8', '#ffe0f2', '#7a1f8f', '#fff2fa'],
  cyber: ['#b6ff5c', '#00a67a', '#efffd0', '#06684c', '#f6fff0'],
  nebula: ['#3a1fb8', '#ff8a3d', '#ffb3d9', '#5a1a7a', '#fff3f6'],
  ice: ['#bff4ff', '#6a6cff', '#ffffff', '#3a3fae', '#f4f8ff'],
  ember: ['#ff6a3d', '#b80f2e', '#ffc0a0', '#7a0a1a', '#fff2ee'],
};

/** The 16-point end-of-ayah rosette (two squares, one turned 45°) of side `s` round (cx, cy). */
function rosette(s: number, cx = 256, cy = 244) {
  const half = s / 2, r1 = half * Math.SQRT2, r2 = half / Math.cos(Math.PI / 8);
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (-90 + i * 22.5) * Math.PI / 180, r = i % 2 ? r2 : r1;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}
const STAR = 'M12 1.5c.9 5 2.6 7.6 9.5 10.5-6.9 2.9-8.6 5.5-9.5 10.5-.9-5-2.6-7.6-9.5-10.5C9.4 9.1 11.1 6.5 12 1.5z';
const svg = (box: string, body: string, cls: string) => {
  const e = h('span', { class: cls, 'aria-hidden': 'true' });
  e.innerHTML = `<svg viewBox="${box}" width="100%" height="100%">${body}</svg>`;
  return e;
};

export function playOpening() {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const [top, bottom, glow, edge, face] = COLOURS[themeId()] ?? COLOURS.emerald;
  const char = import('./openingChar').catch(() => null);
  const outer = rosette(272), inner = rosette(222);
  const marker = svg('0 0 512 512',
    `<path d="${rosette(312)}" fill="${glow}" opacity=".55"/>`
    + `<path d="${outer}" fill="${edge}" stroke="${edge}" stroke-width="34" stroke-linejoin="round" transform="translate(0 14)"/>`
    + `<path d="${outer}" fill="#fff" stroke="#fff" stroke-width="34" stroke-linejoin="round"/>`
    + `<path d="${inner}" fill="${face}" stroke="${face}" stroke-width="26" stroke-linejoin="round"/>`, 'op-marker');
  const star = svg('0 0 24 24',
    '<defs><linearGradient id="op-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset=".55" stop-color="#ffc22e"/><stop offset="1" stop-color="#ff9f1a"/></linearGradient></defs>'
    + `<path d="${STAR}" fill="#e07a00" stroke="#e07a00" stroke-width="1.6" stroke-linejoin="round" transform="translate(0 1.9)"/>`
    + `<path d="${STAR}" fill="url(#op-gold)" stroke="url(#op-gold)" stroke-width="1.6" stroke-linejoin="round"/>`
    + '<ellipse cx="9.4" cy="6.6" rx="1.3" ry="2.4" fill="#fff" opacity=".9" transform="rotate(35 9.4 6.6)"/>', 'op-star');
  const twinkle = (cls: string) => svg('0 0 24 24', `<path d="${STAR}" fill="#fff"/>`, `op-tw ${cls}`);
  const who = h('span', { class: 'op-char' });
  const name = h('div', { class: 'op-name' }, ...[...'ayah studio'].map((c, i) => h('span', { style: `--i:${i}` }, c)));
  const stage = h('div', { class: 'op-stage' }, marker, who, h('span', { class: 'op-burst' }), star, twinkle('a'), twinkle('b'), name);
  const box = h('div', { class: 'app-opening', 'aria-hidden': 'true', style: `--op-top:${top};--op-bottom:${bottom};--op-glow:${glow}` }, stage);
  const timers: number[] = [];
  const at = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
  const end = () => { timers.forEach(clearTimeout); box.remove(); };
  box.addEventListener('click', end);
  box.addEventListener('animationend', (e) => { if (e.target === box && e.animationName === 'op-out') end(); }); // not the splash fade (::before)
  document.body.append(box);
  // The character drops in at 0.38 s; one that is not loaded by 0.9 s stays out (the marker and star still play).
  const t0 = performance.now();
  void char.then((m) => {
    if (!m || !box.isConnected || performance.now() - t0 > 900) return;
    const a = m.openingActor();
    if (!a) return;
    who.append(a.el);
    who.classList.add('in');
    at(Math.max(0, 860 - (performance.now() - t0)), () => a.wave(800));
    at(Math.max(0, 1520 - (performance.now() - t0)), () => { a.face('happy', 1200); a.cheer(1100); });
  });
  at(3200, end); // whatever happens, never longer
}
