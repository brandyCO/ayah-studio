// Mushaf reading view: a full-screen Madinah mushaf page (King Fahd Complex QCF V2 fonts, 15 lines,
// exactly as printed). Swipe to turn pages. Tap the page to drop down the title bar with the menu;
// long-press / drag to select ayat for a reel.
import { loadMeta, reference, surahTranslation } from '../data/quran';
import { loadMushaf, loadPageFont, PAGE_COUNT, type MushafLine } from '../data/mushaf';
import { openDebugPanel } from './debug';
import { h, toast } from './dom';
import { setReaderMode } from './prefs';
import { selectionController, type Sel } from './selection';

type Seg = [number, number, string];

let bismillahSvg: Promise<string> | null = null;
const bismillah = () =>
  (bismillahSvg ??= fetch(`${import.meta.env.BASE_URL}fonts/bismillah.svg`).then((r) => r.text()));

function firstVisitHint() {
  try {
    if (localStorage.getItem('mushafHint')) return;
    localStorage.setItem('mushafHint', '1');
  } catch {
    /* ignore */
  }
  toast('Tap the page for the menu · long-press an ayah to make a reel');
}

export async function showMushaf(root: HTMLElement, n: number, focusAyah?: number): Promise<() => void> {
  const [meta, mushaf, svg] = await Promise.all([loadMeta(), loadMushaf(), bismillah()]);
  let page = focusAyah ? mushaf.pageOf(n, focusAyah) : mushaf.surahStartPage(n);
  root.classList.add('screen-mushaf');
  document.body.classList.add('mushaf-mode');

  // --- drop-down title bar + menu ---
  const title = h('h1', {});
  const sub = h('p', { class: 'muted' });
  const bar = h('header', { class: 'mushaf-bar' },
    h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'All surahs' }, '‹'),
    h('div', { class: 'brand' }, title, sub),
    h('button', { class: 'icon-btn', 'aria-label': 'Menu', onclick: () => openMenu() }, '☰'));
  const toggleBar = (show = !bar.classList.contains('show')) => bar.classList.toggle('show', show);

  const pageEl = h('div', { class: 'mushaf-page', dir: 'rtl', lang: 'ar' });
  const pageNum = h('div', { class: 'mp-num' });
  const area = h('main', { class: 'mushaf' }, pageEl, pageNum);

  const sel = selectionController({
    meta,
    area,
    paint: (s: Sel | null) => {
      for (const el of pageEl.querySelectorAll<HTMLElement>('.w')) {
        const a = Number(el.dataset.a);
        el.classList.toggle('sel', !!s && Number(el.dataset.s) === s.surah && a >= s.lo && a <= s.hi);
      }
    },
    onTap: () => toggleBar(),
    onTranslate: (s) => void showTranslation(s),
    onSwipe: (dir) => go(page + dir), // the next page of an Arabic mushaf lies to the left
  });

  root.append(bar, area, sel.bar);

  const line = (l: MushafLine) => {
    if (l[0] === 'h') {
      return h('div', { class: 'mp-line mp-surah' },
        h('div', { class: 'surah-frame' }, h('span', { class: 'surah-name' }, String(l[1]).padStart(3, '0'))));
    }
    if (l[0] === 'b') {
      const el = h('div', { class: 'mp-line mp-basmala' });
      el.innerHTML = svg; // bundled file (public/fonts/bismillah.svg)
      return el;
    }
    const words: HTMLElement[] = [];
    for (const [s, a, glyphs] of l as Seg[]) {
      for (const g of glyphs.split(' ')) words.push(h('span', { class: 'w', 'data-s': String(s), 'data-a': String(a) }, g));
    }
    return h('div', { class: 'mp-line text' }, ...words);
  };

  /** Font size so the widest line spans the page width; lines spread over the full height. */
  function fit() {
    const lines = pageEl.querySelectorAll<HTMLElement>('.mp-line');
    const lh = Math.floor(pageEl.clientHeight / 15);
    pageEl.style.setProperty('--lh', `${lh}px`);
    const base = 30;
    pageEl.style.setProperty('--f', `${base}px`);
    pageEl.classList.add('measuring');
    const widest = Math.max(1, ...[...lines].filter((l) => l.classList.contains('text')).map((l) => l.scrollWidth));
    pageEl.classList.remove('measuring');
    // Pages 1–2 sit in a narrower, centred block, as in the printed mushaf.
    const width = pageEl.clientWidth * (pageEl.classList.contains('opening') ? 0.8 : 1);
    const f = Math.min((base * width) / widest, lh * 0.72);
    pageEl.style.setProperty('--f', `${Math.floor(f * 4) / 4}px`);
  }

  let renderId = 0;
  async function render(dir: 0 | 1 | -1) {
    const id = ++renderId;
    const pg = mushaf.pages[page - 1];
    await loadPageFont(page).catch(() => toast('Could not load the page font — check your connection'));
    if (id !== renderId) return;
    pageEl.style.fontFamily = `qcf-p${page}`;
    pageEl.classList.toggle('opening', page <= 2);
    pageEl.replaceChildren(...pg.lines.map(line));
    fit();
    sel.repaint();
    const segs = pg.lines.filter((l) => l[0] !== 'h' && l[0] !== 'b').flat() as Seg[];
    const [s, a] = segs[0];
    title.textContent = `${s}. ${meta[s - 1].en}`;
    sub.textContent = `Juz ${pg.juz} · Page ${page}`;
    pageNum.textContent = String(page);
    history.replaceState(null, '', `#/s/${s}/${a}`);
    pageEl.classList.remove('turn-next', 'turn-prev');
    if (dir) {
      void pageEl.offsetWidth; // restart the animation
      pageEl.classList.add(dir > 0 ? 'turn-next' : 'turn-prev');
    }
    // Warm up the neighbouring pages' fonts.
    for (const p of [page + 1, page - 1]) if (p >= 1 && p <= PAGE_COUNT) void loadPageFont(p).catch(() => {});
  }

  function go(p: number) {
    if (p < 1 || p > PAGE_COUNT || p === page) return;
    const dir = p > page ? 1 : -1;
    page = p;
    void render(dir);
  }

  function sheet(...content: (Node | string | false)[]) {
    const dialog = h('dialog', { class: 'sheet bottom' }, ...content);
    dialog.addEventListener('close', () => dialog.remove());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }
  const sheetHead = (text: string, close: () => void) =>
    h('div', { class: 'sheet-head' }, h('h2', {}, text), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕'));

  async function showTranslation(s: Sel) {
    const tr = await surahTranslation(s.surah);
    const items = [];
    for (let a = s.lo; a <= s.hi; a++) items.push(h('p', { class: 'sheet-text' }, h('span', { class: 'ayah-num' }, `${s.surah}:${a}`), tr[a - 1]));
    const d: HTMLDialogElement = sheet(sheetHead(reference(meta[s.surah - 1], s.lo, s.hi), () => d.close()),
      h('div', { class: 'sheet-scroll' }, ...items), h('p', { class: 'muted small' }, 'Saheeh International'));
  }

  function openMenu() {
    const input = h('input', { type: 'number', class: 'search', min: '1', max: String(PAGE_COUNT), placeholder: `Page 1–${PAGE_COUNT}`, inputmode: 'numeric' });
    const d: HTMLDialogElement = sheet(sheetHead('Menu', () => d.close()),
      h('div', { class: 'menu' },
        h('a', { class: 'menu-item', href: '#/', onclick: () => d.close() }, '📖  All surahs'),
        h('button', { class: 'menu-item', onclick: () => { d.close(); setReaderMode('translation'); window.dispatchEvent(new HashChangeEvent('hashchange')); } }, '🔤  Translation view'),
        h('form', { class: 'menu-item go-page', onsubmit: (e: Event) => {
          e.preventDefault();
          const p = Math.round(Number(input.value));
          if (p >= 1 && p <= PAGE_COUNT) { d.close(); toggleBar(false); go(p); }
        } }, input, h('button', { class: 'chip', type: 'submit' }, 'Go to page')),
        h('button', { class: 'menu-item', onclick: () => { d.close(); openDebugPanel(); } }, '⚙  Device check')));
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
  firstVisitHint();

  return () => {
    renderId++;
    clearTimeout(resizeTimer);
    sel.destroy();
    document.body.classList.remove('mushaf-mode');
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
  };
}
