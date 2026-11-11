// The character's level shows on the character itself (owner decision 2026-11-11): as it grows it gathers light — a
// glow on the ground (level 5), a soft halo (10), two lights circling it (20), a rim of light (30), slow rays behind it
// (40) and at level 50 everything turns to gold: radiant. Layers behind the drawing, moved by the compositor only.
import { lookBand } from '../data/xp';
import { h } from './dom';
import './levelLook.css';

/** Dresses a character element (an actor's `el`, or any box holding the drawing) for `level`. */
export function withLevel(el: HTMLElement, level: number): HTMLElement {
  const band = lookBand(level);
  el.querySelectorAll(':scope > .lv-deco').forEach((d) => d.remove());
  for (const c of [...el.classList]) if (c.startsWith('lv-b')) el.classList.remove(c);
  if (!band) return el;
  el.classList.add('lv', `lv-b${band}`);
  const deco = h('span', { class: 'lv-deco', 'aria-hidden': 'true' },
    h('i', { class: 'lv-ground' }),
    band >= 2 ? h('i', { class: 'lv-halo' }) : '',
    band >= 5 ? h('i', { class: 'lv-rays' }) : '',
    band >= 3 ? h('i', { class: 'lv-orbit' }, h('b', {}), h('b', {})) : '');
  el.prepend(deco);
  return el;
}
