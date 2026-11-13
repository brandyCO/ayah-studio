// The opening (owner pick 2026-11-13, "the character arrives"): the app icon comes alive once per launch. This part
// is in the first load and only puts up the launcher icon's gradient (out of the splash colour) at once; the show
// itself — marker, character, the Light star, the name — is src/ui/openingShow.ts, its own chunk. It never delays
// the app; a tap ends it; skipped with reduced motion and in old-phone mode (main.ts). If the show is not there
// within 0.9 s the gradient just fades away.
import { h } from './dom';
import { themeId } from './theme';

/** Top, bottom, glow, marker edge, marker face: the launcher icon's colours per theme (make-character-icons.py). */
export const OP_COLOURS: Record<string, [string, string, string, string, string]> = {
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

/** The overlay in this theme's colours (also used by the preview renders). */
export function openingBox(theme = themeId()) {
  const [top, bottom, glow, edge, face] = OP_COLOURS[theme] ?? OP_COLOURS.emerald;
  const box = h('div', { class: 'app-opening', 'aria-hidden': 'true', style: `--op-top:${top};--op-bottom:${bottom};--op-glow:${glow}` });
  return { box, colours: { top, bottom, glow, edge, face } };
}

export function playOpening() {
  if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const { box, colours } = openingBox();
  let done = false;
  const end = () => {
    if (done) return;
    done = true;
    box.classList.add('gone');
    setTimeout(() => box.remove(), 300);
  };
  box.addEventListener('click', end);
  document.body.append(box);
  const t0 = performance.now(), late = window.setTimeout(end, 900);
  import('./openingShow').then((m) => {
    if (done || performance.now() - t0 > 900) return;
    clearTimeout(late);
    m.show(box, colours, end);
  }).catch(end);
}
