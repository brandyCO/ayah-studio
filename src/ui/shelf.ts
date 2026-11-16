// The golden mushaf shelf (Me → Stats): the 30 juz as books on two shelves. Each book's spine fills with gold as its
// pages are counted (a page counts after its reading time, on any device: `pageLast`); a juz read through glows, and
// all 604 shine together. A tap opens the first page of that juz not read yet.
import { h, haptic } from './dom';
import { pageLast } from '../data/journey';
import { fe } from '../i18n/front';
import './shelf.css';

/** First page of each juz in the Madinah mushaf (604 pages): juz 1 page 1, then every 20 pages from page 22. */
const juzStart = (j: number) => (j === 1 ? 1 : 20 * (j - 1) + 2);
const juzEnd = (j: number) => (j === 30 ? 604 : juzStart(j + 1) - 1);

export function shelf(open: (page: number) => void): HTMLElement {
  const last = pageLast();
  let total = 0;
  const book = (j: number) => {
    const a = juzStart(j), b = juzEnd(j);
    let read = 0, first = 0;
    for (let p = a; p <= b; p++) { if (last[p]) read++; else if (!first) first = p; }
    total += read;
    const f = read / (b - a + 1);
    const full = read === b - a + 1;
    return h('button', {
      class: `sh-book${full ? ' full' : read ? ' some' : ' empty'}`, type: 'button', style: `--f:${f.toFixed(3)};--h:${(84 + ((j * 37) % 5) * 4)}%`,
      'aria-label': fe('gs.book', { j, n: read, of: b - a + 1 }),
      onclick: () => { haptic(6); open(first || a); },
    }, h('span', { class: 'sh-gold', 'aria-hidden': 'true' }), h('span', { class: 'sh-n' }, String(j)));
  };
  const row = (from: number) => h('div', { class: 'sh-row' }, ...Array.from({ length: 15 }, (_, i) => book(from + i)));
  const rows = [row(1), row(16)];
  const done = total >= 604;
  return h('section', { class: `me-card sh${done ? ' done' : ''}` },
    h('div', { class: 'me-row' }, h('h2', { class: 'me-h' }, fe('gs.title')), h('b', { class: 'sh-count' }, `${total} / 604`)),
    h('div', { class: 'sh-case' }, ...rows),
    h('p', { class: 'muted small' }, done ? fe('gs.done') : fe('gs.sub')));
}
