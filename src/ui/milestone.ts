// Streak milestones (owner pick 2026-11-11): on the 7th, 30th, 100th and 365th day the streak moment plays over its
// own scene. 7: seven lanterns light up in an arc over the flame. 30: lanterns rise past it from below. 100: dawn —
// the sky warms and a sun rises behind the flame with slow rays. 365: the dawn, the rising lanterns and a crescent
// with stars. All HTML layers moved by the compositor (translate / scale / opacity); reduced motion → the end picture.
import { h } from './dom';
import './milestone.css';

export const MILESTONES = [7, 30, 100, 365] as const;
export const isMilestone = (n: number) => (MILESTONES as readonly number[]).includes(n);

const lantern = (hue: string, deep: string) => `<svg viewBox="0 0 20 30" aria-hidden="true">
  <path d="M7.5 1.5H12.5V5H7.5Z" fill="#5a3412"/><path d="M10 5C3 5 2.5 9 2.5 15S3 25 10 25S17.5 21 17.5 15S17 5 10 5Z" fill="#5a3412"/>
  <path d="M10 6.2C4.2 6.2 3.8 9.6 3.8 15S4.2 23.8 10 23.8S16.2 20.4 16.2 15S15.8 6.2 10 6.2Z" fill="${deep}"/>
  <path d="M10 6.2C6.5 6.2 5.6 9.6 5.6 15S6.5 23.8 10 23.8C9 21 8.6 18 8.6 15S9 9 10 6.2Z" fill="${hue}"/>
  <path d="M10 10.5C8.6 12 8.6 14 10 16C11.4 14 11.4 12 10 10.5Z" fill="#fff7d6"/>
  <path d="M7 25H13V28.5H7Z" fill="#5a3412"/></svg>`;
const HUES: [string, string][] = [['#ffd36b', '#ff9a3c'], ['#ffc2a8', '#ff7a6b'], ['#ffe6a0', '#f5b13a'], ['#fff0b8', '#ffc65a']];
// Each lantern is drawn once as a picture (a data URL) and reused: no SVG to parse per lantern, cheap to move.
const PICS = HUES.map(([a, b]) => `url("data:image/svg+xml,${encodeURIComponent(lantern(a, b).replace(' aria-hidden="true"', ' xmlns="http://www.w3.org/2000/svg"'))}")`);

/** The scene behind the streak moment for `days`, or null when it is not a milestone. */
export function milestoneScene(days: number, still: boolean): HTMLElement | null {
  if (!isMilestone(days)) return null;
  const el = h('div', { class: `ms ms-${days}${still ? ' still' : ''}`, 'aria-hidden': 'true' });
  const dawn = days >= 100;
  if (dawn) {
    el.append(h('span', { class: 'ms-sky' }), h('span', { class: 'ms-sun' }, h('span', { class: 'ms-rays' }), h('span', { class: 'ms-disc' })), h('span', { class: 'ms-hills' }));
  }
  if (days === 7) {
    const arc = h('span', { class: 'ms-arc' });
    for (let i = 0; i < 7; i++) {
      const a = (-150 + (i * 120) / 6) * (Math.PI / 180);
      const l = h('span', { class: 'ms-l' });
      l.style.cssText = `left:${50 + Math.cos(a) * 40}%;top:${54 + Math.sin(a) * 40}%;--i:${i};background-image:${PICS[i % PICS.length]}`;
      arc.append(l);
    }
    el.append(arc);
  }
  if (days === 30 || days === 365) {
    const n = days === 365 ? 26 : 20;
    let s = days * 7919;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const l = h('span', { class: 'ms-rise' });
      const size = 18 + rnd() * 26;
      // Up the sides only, so they never pass behind the count and the words.
      const side = i % 2 ? 78 + rnd() * 18 : 2 + rnd() * 16;
      l.style.cssText = `left:${side}%;width:${size}px;--d:${(rnd() * 3.2).toFixed(2)}s;--t:${(5 + rnd() * 3.5).toFixed(2)}s;--sw:${(rnd() * 24 - 12).toFixed(0)}px;--o:${(0.55 + (size - 18) / 60).toFixed(2)};background-image:${PICS[i % PICS.length]}`;
      el.append(l);
    }
  }
  if (days === 365) {
    const top = h('span', { class: 'ms-moon' });
    top.innerHTML = `<svg viewBox="0 0 60 60" aria-hidden="true"><path d="M38 6A24 24 0 1 0 54 44A20 20 0 1 1 38 6Z" fill="#fff1bf"/><path d="M38 6A24 24 0 0 0 30 52Q20 40 24 24Q28 12 38 6Z" fill="#ffe08a"/></svg>`;
    el.append(top);
    for (let i = 0; i < 9; i++) {
      const st = h('span', { class: 'ms-star' });
      st.style.cssText = `left:${8 + ((i * 37) % 84)}%;top:${4 + ((i * 23) % 30)}%;--i:${i}`;
      el.append(st);
    }
  }
  return el;
}
