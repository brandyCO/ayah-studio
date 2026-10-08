// Mushaf reading view: a full-screen Madinah mushaf page (King Fahd Complex QCF V2 fonts, 15 lines,
// exactly as printed). Swipe to turn pages. Tap the page to drop down the title bar with the menu;
// long-press / drag to select ayat for a reel.
import { loadMeta, reference, surahTranslation } from '../data/quran';
import { loadMushaf, loadPageFont, PAGE_COUNT, type MushafLine } from '../data/mushaf';
import { openDebugPanel } from './debug';
import { h, toast } from './dom';
import { createPlayer } from './player';
import { setLastRead, setReaderMode } from './prefs';
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

  // Pages sit side by side in a strip that follows the finger: the next page lies to the left,
  // as in a printed mushaf. Only the current page and its two neighbours are in the DOM.
  const strip = h('div', { class: 'mushaf-strip' });
  const view = h('div', { class: 'mushaf-view' }, strip); // fixed window onto the moving strip
  const pageNum = h('div', { class: 'mp-num' });
  const area = h('main', { class: 'mushaf' }, view, pageNum);

  // --- listening: the recited ayah is tinted, the recited word coloured; pages turn with it ---
  let playing: { s: number; a: number; w: number | null } | null = null;
  const player = createPlayer({
    meta,
    onPosition: (pos) => {
      playing = pos;
      if (pos && !panning && !animating) {
        const target = mushaf.wordPage(pos.s, pos.a, pos.w ?? 1);
        if (target !== page) go(target);
      }
      paintPlaying();
    },
    onShow: (on) => {
      document.body.classList.toggle('listening', on);
      requestAnimationFrame(refitAll); // the page makes room for the player bar
    },
  });
  function paintPlaying() {
    for (const el of strip.querySelectorAll('.play-ayah, .play-word')) el.classList.remove('play-ayah', 'play-word');
    if (!playing) return;
    for (const el of strip.querySelectorAll<HTMLElement>(`.w[data-s="${playing.s}"][data-a="${playing.a}"]`)) {
      el.classList.add('play-ayah');
      if (playing.w !== null && Number(el.dataset.p) === playing.w) el.classList.add('play-word');
    }
  }

  const sel = selectionController({
    meta,
    area,
    paint: (s: Sel | null) => {
      for (const el of strip.querySelectorAll<HTMLElement>('.w')) {
        const a = Number(el.dataset.a);
        el.classList.toggle('sel', !!s && Number(el.dataset.s) === s.surah && a >= s.lo && a <= s.hi);
      }
    },
    // While listening, tapping an ayah plays from it.
    onTap: (hit) => (player.active() && hit ? void player.playFrom(hit.s, hit.a) : toggleBar()),
    onTranslate: (s) => void showTranslation(s),
    onListen: (s) => { sel.clear(); void player.playFrom(s.surah, s.lo); },
    onPan: (phase, dx, vx) => pan(phase, dx, vx),
  });

  root.append(bar, area, sel.bar, player.bar);

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
    for (const seg of l as Seg[]) {
      let pos = mushaf.segStart.get(seg) ?? 1; // word position within the ayah (as in the recitation timings)
      for (const g of seg[2].split(' ')) words.push(h('span', { class: 'w', 'data-s': String(seg[0]), 'data-a': String(seg[1]), 'data-p': String(pos++) }, g));
    }
    return h('div', { class: 'mp-line text' }, ...words);
  };

  /** Font size so the widest line spans the page width; lines spread over the full height. */
  function fit(el: HTMLElement) {
    const lines = el.querySelectorAll<HTMLElement>('.mp-line');
    const lh = Math.floor(el.clientHeight / 15);
    el.style.setProperty('--lh', `${lh}px`);
    const base = 30;
    el.style.setProperty('--f', `${base}px`);
    el.classList.add('measuring');
    const widest = Math.max(1, ...[...lines].filter((l) => l.classList.contains('text')).map((l) => l.scrollWidth));
    el.classList.remove('measuring');
    // Pages 1–2 sit in a narrower, centred block, as in the printed mushaf.
    const width = el.clientWidth * (el.classList.contains('opening') ? 0.8 : 1);
    const f = Math.min((base * width) / widest, lh * 0.72);
    el.style.setProperty('--f', `${Math.floor(f * 4) / 4}px`);
    el.dataset.fit = '1';
  }
  const refitAll = () => strip.querySelectorAll<HTMLElement>('.mushaf-page').forEach(fit);

  // --- pages: built once (font loaded), kept while near the current page ---
  const built = new Map<number, HTMLElement>();
  const building = new Map<number, Promise<HTMLElement>>();
  const valid = (p: number) => p >= 1 && p <= PAGE_COUNT;
  function buildPage(p: number): Promise<HTMLElement> {
    if (!building.has(p)) {
      let fontOk = true;
      const pr = loadPageFont(p)
        .catch(() => { fontOk = false; toast('Could not load the page font — check your connection'); })
        .then(() => {
          const el = h('div', { class: `mushaf-page${p <= 2 ? ' opening' : ''}`, dir: 'rtl', lang: 'ar', 'data-page': String(p) });
          el.style.fontFamily = `qcf-p${p}`;
          el.replaceChildren(...mushaf.pages[p - 1].lines.map(line));
          built.set(p, el);
          if (!fontOk) building.delete(p); // try again next time
          return el;
        });
      building.set(p, pr);
    }
    return building.get(p)!;
  }

  const W = () => view.clientWidth + 16; // a page width plus a small gap between the sheets
  function place() {
    for (const el of strip.children as HTMLCollectionOf<HTMLElement>) el.style.transform = `translateX(${(page - Number(el.dataset.page)) * W()}px)`;
  }

  function header() {
    const pg = mushaf.pages[page - 1];
    const segs = pg.lines.filter((l) => l[0] !== 'h' && l[0] !== 'b').flat() as Seg[];
    const [s, a] = segs[0];
    title.textContent = `${s}. ${meta[s - 1].en}`;
    sub.textContent = `Juz ${pg.juz} · Page ${page}`;
    pageNum.textContent = String(page);
    history.replaceState(null, '', `#/s/${s}/${a}`);
    setLastRead(`#/s/${s}/${a}`); // reopen on this page next time
  }

  // A page whose font is still downloading slides in as a placeholder, replaced when it is ready.
  const placeholders = new Map<number, HTMLElement>();
  const placeholder = (p: number) => {
    if (!placeholders.has(p)) {
      placeholders.set(p, h('div', { class: 'mushaf-page loading', 'data-page': String(p), 'aria-busy': 'true' },
        h('span', { class: 'spinner' }), h('span', { class: 'mp-loading' }, `Page ${p}`)));
    }
    return placeholders.get(p)!;
  };

  let renderId = 0;
  /** Show `page` with its neighbours at once (placeholders for pages still loading). */
  function layout() {
    const id = ++renderId;
    const want = [page - 1, page, page + 1].filter(valid);
    const attach = () => {
      if (id !== renderId) return;
      const els = want.map((p) => built.get(p) ?? placeholder(p));
      if (els.length !== strip.childElementCount || els.some((el, i) => strip.children[i] !== el)) strip.replaceChildren(...els);
      for (const el of els) if (!el.dataset.fit && !el.classList.contains('loading')) fit(el);
      place();
      sel.repaint();
      paintPlaying();
    };
    attach();
    header();
    for (const p of want) if (!built.has(p)) void buildPage(p).then(attach);
    // Fetch fonts further ahead (mostly forwards), so a swipe rarely meets a page still loading.
    for (const p of [page + 2, page + 3, page - 2]) if (valid(p)) void loadPageFont(p).catch(() => {});
    for (const p of built.keys()) if (Math.abs(p - page) > 3) { built.delete(p); building.delete(p); }
    for (const p of placeholders.keys()) if (Math.abs(p - page) > 1) placeholders.delete(p);
  }

  // --- swiping: the page follows the finger, then settles on the next page or springs back ---
  let panning = false;
  let animating = false;
  let finishNow: (() => void) | null = null; // completes a slide at once (a new swipe or key press)
  function setStrip(x: number, ms = 0) {
    strip.style.transition = ms ? `transform ${ms}ms cubic-bezier(.22,.8,.24,1)` : 'none';
    strip.style.transform = x ? `translateX(${x}px)` : '';
  }
  function pan(phase: 'move' | 'end' | 'cancel', dx: number, vx: number) {
    // Swiping again while a page is still sliding: let it land at once and follow the new swipe.
    if (animating) finishNow?.();
    const dir = dx > 0 ? 1 : -1; // finger moving right brings in the next page (on the left)
    const target = page + dir;
    if (phase === 'move') {
      panning = true;
      strip.classList.add('moving');
      setStrip(valid(target) ? dx : dx * 0.25); // resistance at the first and last page
      return;
    }
    panning = false;
    const fling = Math.abs(vx) > 0.35 && Math.sign(vx) === dir;
    if (phase === 'end' && valid(target) && (Math.abs(dx) > W() * 0.22 || fling)) slideTo(target, Math.abs(dx));
    else {
      setStrip(0, 240);
      window.setTimeout(() => { if (!panning && !animating) strip.classList.remove('moving'); }, 260);
    }
  }
  /** Slide to a neighbouring page (from where the finger left it). */
  function slideTo(target: number, from = 0) {
    if (animating) finishNow?.();
    const dir = target > page ? 1 : -1;
    if (!strip.querySelector(`[data-page="${target}"]`)) {
      page = target;
      setStrip(0);
      layout();
      return;
    }
    animating = true;
    strip.classList.add('moving');
    const ms = Math.round(160 + 160 * (1 - Math.min(1, from / W())));
    setStrip(dir * W(), ms);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      finishNow = null;
      page = target;
      setStrip(0);
      strip.classList.remove('moving');
      animating = false;
      layout();
    };
    finishNow = finish;
    strip.addEventListener('transitionend', finish, { once: true });
    window.setTimeout(finish, ms + 80);
  }

  function go(p: number) {
    if (animating) finishNow?.();
    if (!valid(p) || p === page) return;
    if (Math.abs(p - page) === 1) slideTo(p);
    else {
      page = p;
      layout();
    }
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

  /** The first ayah that begins on the current page (or the one continuing onto it). */
  function firstAyahOnPage(): { s: number; a: number } {
    const segs = mushaf.pages[page - 1].lines.filter((l) => l[0] !== 'h' && l[0] !== 'b').flat() as Seg[];
    const seg = segs.find((x) => mushaf.segStart.get(x) === 1) ?? segs[0];
    return seg ? { s: seg[0], a: seg[1] } : { s: n, a: 1 };
  }

  function openMenu() {
    const input = h('input', { type: 'number', class: 'search', min: '1', max: String(PAGE_COUNT), placeholder: `Page 1–${PAGE_COUNT}`, inputmode: 'numeric' });
    const d: HTMLDialogElement = sheet(sheetHead('Menu', () => d.close()),
      h('div', { class: 'menu' },
        h('button', { class: 'menu-item', onclick: () => { d.close(); toggleBar(false); const f = firstAyahOnPage(); void player.playFrom(f.s, f.a); } }, '🎧  Listen from this page'),
        h('a', { class: 'menu-item', href: '#/', onclick: () => d.close() }, '📖  All surahs'),
        h('a', { class: 'menu-item', href: '#/drafts', onclick: () => d.close() }, '🎬  Drafts'),
        h('button', { class: 'menu-item', onclick: () => { d.close(); setReaderMode('translation'); window.dispatchEvent(new HashChangeEvent('hashchange')); } }, '🔤  Translation view'),
        h('form', { class: 'menu-item go-page', onsubmit: (e: Event) => {
          e.preventDefault();
          const p = Math.round(Number(input.value));
          if (valid(p)) { d.close(); toggleBar(false); go(p); }
        } }, input, h('button', { class: 'chip', type: 'submit' }, 'Go to page')),
        h('button', { class: 'menu-item', onclick: () => { d.close(); openDebugPanel(); } }, '⚙  Device check')));
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowLeft') go(page + 1);
    else if (e.key === 'ArrowRight') go(page - 1);
    else if (e.key === ' ' && player.active()) { e.preventDefault(); player.toggle(); }
  };
  let resizeTimer = 0;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = window.setTimeout(() => { refitAll(); place(); }, 120); };
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', onResize);

  await buildPage(page).catch(() => {}); // open on the real page, not its placeholder
  layout();
  firstVisitHint();

  return () => {
    renderId++;
    clearTimeout(resizeTimer);
    sel.destroy();
    player.destroy();
    document.body.classList.remove('mushaf-mode', 'listening');
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
  };
}
