// Mushaf reading view: one Madinah-mushaf page at a time (15 lines, same line breaks as the
// printed copy), swipe or use the arrows to turn pages. Tap an ayah for its translation;
// long-press / drag to select ayat for a reel.
import { loadMeta, reference, surahText, surahTranslation } from '../data/quran';
import { loadMushaf, PAGE_COUNT, type MushafLine } from '../data/mushaf';
import { arabicWords } from '../engine/layout';
import { h } from './dom';
import { setReaderMode } from './prefs';
import { selectionController, type Sel } from './selection';

type Seg = [number, number, number, number];

export async function showMushaf(root: HTMLElement, n: number, focusAyah?: number): Promise<() => void> {
  const [meta, mushaf, fatiha] = await Promise.all([loadMeta(), loadMushaf(), surahText(1)]);
  let page = focusAyah ? mushaf.pageOf(n, focusAyah) : mushaf.surahStartPage(n);
  // The basmala heading is the words of 1:1 from the bundled text, without its ayah number.
  const basmala = arabicWords(fatiha[0]).join(' ').replace(/\s+[٠-٩]+$/, '');

  const title = h('h1', {});
  const sub = h('p', { class: 'muted' });
  const pageEl = h('div', { class: 'mushaf-page', dir: 'rtl', lang: 'ar' });
  const pageNum = h('span', { class: 'mp-num' });
  const nextBtn = h('button', { class: 'icon-btn', 'aria-label': 'Next page', onclick: () => go(page + 1) }, '‹');
  const prevBtn = h('button', { class: 'icon-btn', 'aria-label': 'Previous page', onclick: () => go(page - 1) }, '›');
  const area = h('main', { class: 'mushaf' }, pageEl,
    h('div', { class: 'mp-foot' }, nextBtn, pageNum, prevBtn),
    h('p', { class: 'hint muted' }, 'Tap an ayah for its translation · long-press to select · swipe to turn pages'));

  const sel = selectionController({
    meta,
    area,
    paint: (s: Sel | null) => {
      for (const el of pageEl.querySelectorAll<HTMLElement>('.w')) {
        const a = Number(el.dataset.a);
        el.classList.toggle('sel', !!s && Number(el.dataset.s) === s.surah && a >= s.lo && a <= s.hi);
      }
    },
    onTap: (s, a) => void showTranslation(s, a),
    onSwipe: (dir) => go(page + dir), // the next page of an Arabic mushaf lies to the left
  });

  root.append(
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'All surahs' }, '‹'),
      h('div', { class: 'brand' }, title, sub),
      h('button', { class: 'chip', onclick: () => { setReaderMode('translation'); window.dispatchEvent(new HashChangeEvent('hashchange')); } }, 'Translation')),
    area,
    sel.bar,
  );

  const line = (l: MushafLine, texts: Map<number, string[]>) => {
    if (l[0] === 'h') {
      const s = meta[(l[1] as number) - 1];
      return h('div', { class: 'mp-line mp-surah' }, h('div', { class: 'surah-frame' }, s.ar));
    }
    if (l[0] === 'b') return h('div', { class: 'mp-line mp-basmala' }, basmala);
    const words: HTMLElement[] = [];
    for (const [s, a, from, to] of l as Seg[]) {
      const tk = arabicWords(texts.get(s)![a - 1]);
      for (let i = from; i < to; i++) words.push(h('span', { class: 'w', 'data-s': String(s), 'data-a': String(a) }, tk[i]));
    }
    return h('div', { class: 'mp-line text' }, ...words);
  };

  /**
   * One font size for every page, like a printed mushaf: 90% of all lines fit the width at this
   * size (measured over the 604 pages with the bundled font). Wider lines shrink on their own, and
   * lines much shorter than the page are centred instead of stretched.
   */
  const LINE_EM = 472 / 24; // 90th-percentile natural line width, in font-size units
  function fit() {
    const avail = pageEl.clientWidth * 0.97;
    const f = Math.max(12, Math.min(40, (innerHeight - 170) / 15 / 1.75, avail / LINE_EM));
    pageEl.style.setProperty('--f', `${Math.floor(f * 4) / 4}px`);
    // Spread the 15 lines over the screen height, within comfortable line spacing.
    const lh = Math.min(f * 2.3, Math.max(f * 1.75, (innerHeight - 200) / 15));
    pageEl.style.setProperty('--lh', `${Math.floor(lh)}px`);
    const lines = [...pageEl.querySelectorAll<HTMLElement>('.mp-line.text')];
    lines.forEach((l) => { l.style.fontSize = ''; l.classList.remove('short'); });
    pageEl.classList.add('measuring');
    const natural = lines.map((l) => l.scrollWidth);
    pageEl.classList.remove('measuring');
    lines.forEach((l, i) => {
      if (natural[i] > avail) l.style.fontSize = `${(f * avail) / natural[i]}px`;
      else if (natural[i] < avail * 0.6) l.classList.add('short');
    });
  }

  let renderId = 0;
  async function render(dir: 0 | 1 | -1) {
    const id = ++renderId;
    const pg = mushaf.pages[page - 1];
    const segs = pg.lines.filter((l) => l[0] !== 'h' && l[0] !== 'b').flat() as Seg[];
    const surahs = [...new Set(segs.map((s) => s[0]))];
    const texts = new Map(await Promise.all(surahs.map(async (s) => [s, await surahText(s)] as const)));
    if (id !== renderId) return;
    pageEl.replaceChildren(...pg.lines.map((l) => line(l, texts)));
    pageEl.classList.toggle('opening', page <= 2);
    fit();
    sel.repaint();
    const [s, a] = segs[0];
    title.textContent = `${s}. ${meta[s - 1].en}`;
    sub.textContent = `Juz ${pg.juz} · Page ${page}`;
    pageNum.textContent = String(page);
    nextBtn.disabled = page >= PAGE_COUNT;
    prevBtn.disabled = page <= 1;
    history.replaceState(null, '', `#/s/${s}/${a}`);
    pageEl.classList.remove('turn-next', 'turn-prev');
    if (dir) {
      void pageEl.offsetWidth; // restart the animation
      pageEl.classList.add(dir > 0 ? 'turn-next' : 'turn-prev');
    }
  }

  function go(p: number) {
    if (p < 1 || p > PAGE_COUNT || p === page) return;
    const dir = p > page ? 1 : -1;
    page = p;
    window.scrollTo(0, 0);
    void render(dir);
  }

  async function showTranslation(s: number, a: number) {
    const tr = await surahTranslation(s);
    const dialog = h('dialog', { class: 'sheet bottom' },
      h('div', { class: 'sheet-head' },
        h('h2', {}, reference(meta[s - 1], a)),
        h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => dialog.close() }, '✕')),
      h('p', { class: 'sheet-text' }, tr[a - 1]),
      h('p', { class: 'muted small' }, 'Saheeh International'),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => { sel.select(s, a); dialog.close(); } }, 'Select for a reel')));
    dialog.addEventListener('close', () => dialog.remove());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
    dialog.showModal();
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowLeft') go(page + 1);
    else if (e.key === 'ArrowRight') go(page - 1);
  };
  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(fit, 120); };
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  await render(0);
  if (focusAyah) {
    const el = pageEl.querySelector<HTMLElement>(`.w[data-s="${n}"][data-a="${focusAyah}"]`);
    el?.scrollIntoView({ block: 'center' });
  }

  return () => {
    renderId++;
    clearTimeout(resizeTimer);
    sel.destroy();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
  };
}
