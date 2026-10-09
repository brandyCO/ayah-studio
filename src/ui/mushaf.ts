// Mushaf reading view: a full-screen Madinah mushaf page (King Fahd Complex QCF V2 fonts, 15 lines,
// exactly as printed). Swipe to turn pages. Tap the page to drop down the title bar with the menu;
// long-press / drag to select ayat for a reel.
import { bookmarks, removeBookmark, toggleBookmark } from '../data/bookmarks';
import { draftHash, listDrafts } from '../data/drafts';
import { loadMeta, reference, surahTranslation } from '../data/quran';
import { todaysAyah } from '../data/daily';
import { isNative } from '../native';
import { loadMushaf, loadPageFont, PAGE_COUNT, type MushafLine } from '../data/mushaf';
import { lastWritten, loadReflections, reflectionAt, reflections } from '../data/reflections';
import { accountLabel, openAccount } from './account';
import { openDebugPanel } from './debug';
import { h, toast } from './dom';
import { LANGS, lang, locale, setLang, surahName, t } from '../i18n';
import { currentTranslation, setTranslation, translationInfo } from '../data/translations';
import { translationList } from './translationPicker';
import { applyTimeTint, crescent, fillToday, paintMarks, ramadanDay, registerMarks, registerToday, setTimeTint, timeTintOn } from './living';
import { createPlayer } from './player';
import { setLastRead, setReaderMode } from './prefs';
import { openReflection, openReflections, writtenOn } from './reflections';
import { account } from '../cloud/auth';
import { lamps } from '../data/lamps';
import { markRamadanRead, noteAyah, ramadanData, ramadanNow } from '../data/ramadan';
import { cachedCircles, loadCircles, markPageRead, myParts, pagesRead } from '../together/circles';
import { openCircle, openCircles, type CircleContext } from './circles';
import { selectionController, type Sel } from './selection';

type Seg = [number, number, string];

let bismillahSvg: Promise<string> | null = null;
const bismillah = () =>
  (bismillahSvg ??= fetch(`${import.meta.env.BASE_URL}fonts/bismillah.svg`).then((r) => r.text()));

// The living mushaf's first sources: bookmarks in the margin, and Today lines for a recent bookmark
// and a reel draft still waiting.
registerMarks(() => bookmarks().map((b) => ({ s: b.s, a: b.a, kind: 'bookmark', title: t('mushaf.bookmarkMark', { ref: `${b.s}:${b.a}` }) })));
registerMarks(() => reflections().map((r) => ({ s: r.s, a: r.a, kind: 'reflection', title: `You wrote here ${writtenOn(lastWritten(r))}` })));
// Khatm circles: your juz on the Today card ("Juz 14 · 6 pages left"), a completed Khatm.
let circleCtx: CircleContext | null = null;
registerToday(async () => {
  if (!account() || !circleCtx) return [];
  const ctx = circleCtx;
  const items = myParts().filter(({ state, part }) => part.status === 'taken' && state.circle.status === 'open').map(({ state, part }) => {
    const pages = ctx.juzPages(part.juz);
    const left = pages.length - pages.filter((p) => pagesRead(part).has(p)).length;
    return { icon: '◯', text: left ? t(left === 1 ? 'today.juzLeft1' : 'today.juzLeft', { juz: part.juz, n: left, circle: state.circle.name }) : t('today.juzRead', { juz: part.juz }), onClick: () => void openCircle(ctx, state.circle.id) };
  });
  for (const st of cachedCircles()) {
    if (st.circle.status === 'complete' && st.circle.completed_at && Date.now() - Date.parse(st.circle.completed_at) < 7 * DAY) {
      items.push({ icon: '☾', text: t('today.khatm', { circle: st.circle.name }), onClick: () => void openCircle(ctx, st.circle.id) });
    }
  }
  return items;
});

// A note's mark pulses once per app session when its page is visited again (not for today's notes).
const pulsed = new Set<string>();
const DAY = 86_400_000;
// The ayah of the day (G2): its reference and translation; Listen plays it here, or a reel of it.
let listenHere: ((s: number, a: number) => void) | null = null;
registerToday(async () => {
  const [meta, d] = await Promise.all([loadMeta(), todaysAyah()]);
  const info = translationInfo(currentTranslation());
  const tr = await surahTranslation(d.s, info.id).catch(() => null);
  const text = tr ? tr.slice(d.from - 1, d.to).join(' ') : d.en;
  return [{
    icon: '✧', text: t('today.ayah', { ref: reference(meta[d.s - 1], d.from, d.to) }), href: `#/s/${d.s}/${d.from}`,
    sub: tr ? { text, lang: info.lang, dir: info.dir } : { text, lang: 'en', dir: 'ltr' },
    actions: [
      { label: t('today.listen'), onClick: () => listenHere?.(d.s, d.from) },
      { label: t('today.reel'), href: `#/reel/${d.s}/${d.from}-${d.to}` },
    ],
  }];
});
registerToday(async () => {
  const meta = await loadMeta();
  const b = bookmarks()[0];
  return b && Date.now() - b.at < 7 * DAY
    ? [{ icon: '🔖', text: t('today.bookmark', { ref: reference(meta[b.s - 1], b.a, b.a) }), href: `#/s/${b.s}/${b.a}` }]
    : [];
});
registerToday(async () => {
  const [meta, drafts] = await Promise.all([loadMeta(), listDrafts()]);
  const d = drafts[0];
  if (!d || Date.now() - d.updated > 3 * DAY) return [];
  const p = d.project;
  return [{ icon: '🎬', text: t('today.draft', { ref: reference(meta[p.surah - 1], p.from, p.to) }), href: draftHash(p, d.id) }];
});

// Ramadan (T7): today's portion, tonight's ayah, Eid.
let ramadanCtx: import('./ramadan').RamadanContext | null = null;
registerToday(async () => {
  const now = ramadanNow();
  if (!ramadanCtx || (!now.day && !now.eid)) return [];
  const ctx = ramadanCtx;
  return (await import('./ramadan')).ramadanToday(ctx);
});

// Revision lamps (T5a): lamps past their interval, gently.
let openLampsHere: (() => void) | null = null;
registerToday(async () => {
  if (!openLampsHere || !Object.keys(lamps()).length) return [];
  const { dimLamps } = await import('./lamps');
  const { count, surah } = await dimLamps();
  if (!count) return [];
  const open = openLampsHere;
  return [{ icon: '✦', text: count === 1 ? t('today.lamp', { surah: surahName(surah!) }) : surah ? t('today.lampsIn', { n: count, surah: surahName(surah) }) : t('today.lamps', { n: count }), onClick: () => open() }];
});

function firstVisitHint() {
  try {
    if (localStorage.getItem('mushafHint')) return;
    localStorage.setItem('mushafHint', '1');
  } catch {
    /* ignore */
  }
  toast(t('mushaf.hint'));
}

export async function showMushaf(root: HTMLElement, n: number, focusAyah?: number): Promise<() => void> {
  const [meta, mushaf, svg] = await Promise.all([loadMeta(), loadMushaf(), bismillah(), loadReflections()]);
  let page = focusAyah ? mushaf.pageOf(n, focusAyah) : mushaf.surahStartPage(n);
  root.classList.add('screen-mushaf');
  document.body.classList.add('mushaf-mode');

  // --- drop-down title bar + menu ---
  const title = h('h1', {});
  const sub = h('p', { class: 'muted' });
  const today = h('nav', { class: 'today', 'aria-label': t('mushaf.today'), hidden: true });
  const bar = h('header', { class: 'mushaf-bar' },
    h('a', { class: 'icon-btn back-btn', href: '#/', 'aria-label': t('mushaf.allSurahs') }, '‹'),
    h('div', { class: 'brand' }, title, sub),
    h('button', { class: 'icon-btn', 'aria-label': t('mushaf.menu'), onclick: () => openMenu() }, '☰'),
    today);
  const toggleBar = (show = !bar.classList.contains('show')) => {
    bar.classList.toggle('show', show);
    if (show) void fillToday(today, () => toggleBar(false));
  };
  let markTapped = false; // the current tap started on a margin mark

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

  listenHere = (s, a) => { noteAyah(s, a); void player.playFrom(s, a); };
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
    onTap: (hit) => {
      if (markTapped) return; // a margin mark opens its own sheet (click handler below)
      if (player.active() && hit) void player.playFrom(hit.s, hit.a);
      else toggleBar();
    },
    onTranslate: (s) => void showTranslation(s),
    onListen: (s) => { sel.clear(); noteAyah(s.surah, s.lo); void player.playFrom(s.surah, s.lo); },
    onBookmark: (s) => {
      noteAyah(s.surah, s.lo);
      sel.clear();
      const on = toggleBookmark(s.surah, s.lo);
      toast(on ? t('mushaf.bookmarked', { ref: reference(meta[s.surah - 1], s.lo, s.lo) }) : t('mushaf.bookmarkRemoved'));
    },
    onReflect: (s) => { sel.clear(); noteAyah(s.surah, s.lo); void openReflection(meta, s.surah, s.lo); },
    onGift: (s) => { sel.clear(); void import('./gift').then((m) => m.openGiftComposer(meta[s.surah - 1], s.lo, s.hi)); },
    onPan: (phase, dx, vx) => pan(phase, dx, vx),
  });

  root.append(bar, area, sel.bar, player.bar);

  // --- Khatm circles: a thin gold edge on the pages of your juz; a page open ≥ 20 s counts as read ---
  const juzPages = (j: number) => mushaf.pages.flatMap((pg, i) => (pg.juz === j ? [i + 1] : []));
  circleCtx = { juzPages, goToPage: (p) => { toggleBar(false); go(p); } };
  ramadanCtx = { goToPage: (p) => { toggleBar(false); go(p); }, openCircles: () => openCircles(circleCtx!) };
  openLampsHere = () => void import('./lamps').then((x) => x.openLamps(page, (p) => { toggleBar(false); go(p); }));
  const myPortion = () => new Set(myParts().filter(({ state, part }) => part.status === 'taken' && state.circle.status === 'open').flatMap(({ part }) => juzPages(part.juz)));
  let portion = myPortion();
  const decorate = () => {
    portion = myPortion();
    for (const [p, el] of built) el.classList.toggle('my-portion', portion.has(p));
    startReadTimer();
  };
  window.addEventListener('circles-changed', decorate);
  let readTimer = 0;
  const startReadTimer = () => {
    clearTimeout(readTimer);
    const p = page;
    const ramadan = !!ramadanNow().day && !!ramadanData().plan;
    if (portion.has(p) || ramadan) readTimer = window.setTimeout(() => { if (p !== page) return; markPageRead(p, juzPages); markRamadanRead(p); }, 20_000);
  };
  if (account() && navigator.onLine) void loadCircles().catch(() => {});
  try {
    const open = sessionStorage.getItem('openCircle');
    if (open) {
      sessionStorage.removeItem('openCircle');
      window.setTimeout(() => void openCircle(circleCtx!, open, true), 300);
    }
  } catch {
    /* ignore */
  }

  // --- the living mushaf: margin marks, the time-of-day tint ---
  const onDownCapture = (e: PointerEvent) => { markTapped = !!(e.target as Element).closest?.('.mp-mark'); };
  area.addEventListener('pointerdown', onDownCapture, true);
  area.addEventListener('click', (e) => {
    const mark = (e.target as Element).closest<HTMLElement>('.mp-mark');
    if (mark?.dataset.kind === 'bookmark') openBookmark(Number(mark.dataset.s), Number(mark.dataset.a));
    if (mark?.dataset.kind === 'reflection') void openReflection(meta, Number(mark.dataset.s), Number(mark.dataset.a));
  });
  const repaintMarks = () => { for (const el of built.values()) if (el.dataset.fit) paintMarks(el); };
  window.addEventListener('bookmarks-changed', repaintMarks);
  window.addEventListener('reflections-changed', repaintMarks);

  // Coming back to a page with an older note: its mark pulses once, with "You wrote here on …".
  const hint = h('button', { class: 'rf-hint', hidden: true });
  root.append(hint);
  let hintTimer = 0;
  function pulseNotes(force?: { s: number; a: number }) {
    const el = built.get(page);
    if (!el?.dataset.fit || panning || animating) return;
    let first: { s: number; a: number; at: number } | null = null;
    for (const mark of el.querySelectorAll<HTMLElement>('.mp-mark.reflection')) {
      const s = Number(mark.dataset.s);
      const a = Number(mark.dataset.a);
      const key = `${s}:${a}`;
      const r = reflectionAt(s, a);
      const forced = force?.s === s && force.a === a;
      if (!r || (!forced && (pulsed.has(key) || new Date(lastWritten(r)).toDateString() === new Date().toDateString()))) continue;
      pulsed.add(key);
      mark.classList.remove('pulse');
      void mark.offsetWidth; // restart the animation
      mark.classList.add('pulse');
      if (!first && !forced) first = { s, a, at: lastWritten(r) };
    }
    if (!first) return;
    const { s, a, at } = first;
    hint.textContent = `✎ You wrote here ${writtenOn(at)}`;
    hint.onclick = () => { hint.hidden = true; void openReflection(meta, s, a); };
    hint.hidden = false;
    hint.classList.remove('show');
    requestAnimationFrame(() => hint.classList.add('show'));
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      hint.classList.remove('show');
      hintTimer = window.setTimeout(() => { hint.hidden = true; }, 600);
    }, 4200);
  }
  window.addEventListener('prefs-synced', applyTimeTint); // settings arrived from another device
  applyTimeTint();
  const tintTimer = window.setInterval(applyTimeTint, 10 * 60_000);

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
    const lh = Math.floor((el.clientHeight - 10) / 15); // inside the page's 5 px top/bottom padding
    el.style.setProperty('--lh', `${lh}px`);
    const base = 30;
    el.style.setProperty('--f', `${base}px`);
    el.classList.add('measuring');
    const widest = Math.max(1, ...[...lines].filter((l) => l.classList.contains('text')).map((l) => l.scrollWidth));
    el.classList.remove('measuring');
    // Pages 1–2 sit in a narrower, centred block, as in the printed mushaf.
    const cs = getComputedStyle(el);
    const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); // margins hold the marks
    const width = inner * (el.classList.contains('opening') ? 0.8 : 1);
    const f = Math.min((base * width) / widest, lh * 0.72);
    el.style.setProperty('--f', `${Math.floor(f * 4) / 4}px`);
    el.dataset.fit = '1';
    el.classList.toggle('my-portion', portion.has(Number(el.dataset.page)));
    paintMarks(el); // positions depend on the line heights just set
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
        .catch(() => { fontOk = false; toast(t('mushaf.fontFailed')); })
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
    title.textContent = t('common.surahTitle', { n: s, name: surahName(meta[s - 1]) });
    sub.textContent = t('common.juzPage', { juz: pg.juz, page });
    pageNum.replaceChildren(...(ramadanDay() ? [crescent()] : []), String(page));
    history.replaceState(null, '', `#/s/${s}/${a}`);
    setLastRead(`#/s/${s}/${a}`); // reopen on this page next time
    startReadTimer();
  }

  // A page whose font is still downloading slides in as a placeholder, replaced when it is ready.
  const placeholders = new Map<number, HTMLElement>();
  const placeholder = (p: number) => {
    if (!placeholders.has(p)) {
      placeholders.set(p, h('div', { class: 'mushaf-page loading', 'data-page': String(p), 'aria-busy': 'true' },
        h('span', { class: 'spinner' }), h('span', { class: 'mp-loading' }, t('common.page', { n: p }))));
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
      pulseNotes();
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
    h('div', { class: 'sheet-head' }, h('h2', {}, text), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕'));

  async function showTranslation(s: Sel) {
    const info = translationInfo(currentTranslation());
    const tr = await surahTranslation(s.surah, info.id);
    const items = [];
    for (let a = s.lo; a <= s.hi; a++) {
      items.push(h('p', { class: 'sheet-text', lang: info.lang, dir: info.dir }, h('span', { class: 'ayah-num', dir: 'ltr' }, `${s.surah}:${a}`), tr[a - 1]));
    }
    const d: HTMLDialogElement = sheet(sheetHead(reference(meta[s.surah - 1], s.lo, s.hi), () => d.close()),
      h('div', { class: 'sheet-scroll' }, ...items), h('p', { class: 'muted small', dir: 'auto' }, info.translator));
  }

  function openTranslationPicker() {
    const d: HTMLDialogElement = sheet(sheetHead(t('tr.title'), () => d.close()),
      h('p', { class: 'muted small' }, t('tr.note')),
      h('div', { class: 'sheet-scroll' }, translationList(currentTranslation, (id) => { setTranslation(id); d.close(); })));
  }

  function openLanguage() {
    const d: HTMLDialogElement = sheet(sheetHead(t('lang.title'), () => d.close()),
      h('p', { class: 'muted small' }, t('lang.note')),
      h('div', { class: 'menu' }, ...LANGS.map((l) => h('button', {
        class: `menu-item tr-item${l.id === lang() ? ' on' : ''}`, lang: l.id, dir: l.dir,
        onclick: () => { if (l.id !== lang()) setLang(l.id); else d.close(); },
      }, h('span', { class: 'tr-name' }, l.name), h('span', { class: 'tr-tick', 'aria-hidden': 'true' }, l.id === lang() ? '✓' : '')))));
  }

  const morning = () => { try { return JSON.parse(localStorage.getItem('morningAyah') ?? 'null') as { on?: boolean; time?: string } | null; } catch { return null; } };
  const morningOn = () => !!morning()?.on;
  const morningTime = () => morning()?.time ?? '';

  /** The first ayah that begins on the current page (or the one continuing onto it). */
  function firstAyahOnPage(): { s: number; a: number } {
    const segs = mushaf.pages[page - 1].lines.filter((l) => l[0] !== 'h' && l[0] !== 'b').flat() as Seg[];
    const seg = segs.find((x) => mushaf.segStart.get(x) === 1) ?? segs[0];
    return seg ? { s: seg[0], a: seg[1] } : { s: n, a: 1 };
  }

  function openMenu() {
    const input = h('input', { type: 'number', class: 'search', min: '1', max: String(PAGE_COUNT), placeholder: t('menu.pagePlaceholder', { n: PAGE_COUNT }), inputmode: 'numeric' });
    const d: HTMLDialogElement = sheet(sheetHead(t('mushaf.menu'), () => d.close()),
      h('div', { class: 'menu' },
        h('button', { class: 'menu-item', onclick: () => { d.close(); toggleBar(false); const f = firstAyahOnPage(); void player.playFrom(f.s, f.a); } }, `🎧  ${t('menu.listen')}`),
        h('a', { class: 'menu-item', href: '#/', onclick: () => d.close() }, `📖  ${t('menu.allSurahs')}`),
        h('a', { class: 'menu-item', href: '#/drafts', onclick: () => d.close() }, `🎬  ${t('menu.drafts')}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); openBookmarks(); } }, `🔖  ${t('menu.bookmarks')}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); void openReflections(meta, (s, a) => {
          toggleBar(false);
          go(mushaf.pageOf(s, a));
          window.setTimeout(() => pulseNotes({ s, a }), 450); // after the page has slid in
        }); } }, `✎  ${t('menu.reflections')}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); openCircles(circleCtx!); } }, `◯  ${t('menu.circles')}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); openLampsHere?.(); } }, `✦  ${t('menu.lamps')}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); void import('./ramadan').then((x) => x.openRamadan(ramadanCtx!)); } }, `☾  ${t('menu.ramadan')}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); void import('./gift').then((m) => m.openGifts()); } }, `🎁  ${t('menu.gifts')}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); void import('./wall').then((m) => m.openWalls()); } }, `🏮  ${t('menu.wall')}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); void import('./kids').then((m) => m.openKidsSpace()); } }, `🌙  ${t('menu.kids')}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); openAccount(); } }, accountLabel()),
        h('button', { class: 'menu-item', onclick: () => { d.close(); setReaderMode('translation'); window.dispatchEvent(new HashChangeEvent('hashchange')); } }, `🔤  ${t('menu.translationView')}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); openTranslationPicker(); } }, `🌐  ${t('menu.translation', { name: translationInfo(currentTranslation()).translator })}`),
        isNative() && h('button', { class: 'menu-item', onclick: () => { d.close(); void import('./morning').then((m) => m.openMorning()); } },
          `✧  ${t('morning.menu', { state: morningOn() ? morningTime() : t('menu.off') })}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); openLanguage(); } }, `🗣  ${t('menu.language', { name: LANGS.find((l) => l.id === lang())!.name })}`),
        h('form', { class: 'menu-item go-page', onsubmit: (e: Event) => {
          e.preventDefault();
          const p = Math.round(Number(input.value));
          if (valid(p)) { d.close(); toggleBar(false); go(p); }
        } }, input, h('button', { class: 'chip', type: 'submit' }, t('menu.goToPage'))),
        h('button', { class: 'menu-item', 'aria-pressed': String(timeTintOn()), onclick: () => {
          setTimeTint(!timeTintOn());
          d.close();
          toast(timeTintOn() ? t('menu.timeTintOn') : t('menu.timeTintOff'));
        } }, `🕰  ${t('menu.timeTint', { state: t(timeTintOn() ? 'menu.on' : 'menu.off') })}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); openDebugPanel(); } }, `⚙  ${t('menu.deviceCheck')}`)));
  }

  const dateFmt = new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  function openBookmarks() {
    const list = bookmarks();
    const rows = list.map((b) => {
      const row = h('div', { class: 'bm-row' },
        h('button', { class: 'menu-item bm-go', onclick: () => { d.close(); toggleBar(false); go(mushaf.pageOf(b.s, b.a)); } },
          h('span', {}, reference(meta[b.s - 1], b.a, b.a)),
          h('span', { class: 'muted small' }, t('bm.pageDate', { page: mushaf.pageOf(b.s, b.a), date: dateFmt.format(b.at) }))),
        h('button', { class: 'icon-btn', 'aria-label': t('bm.remove'), onclick: () => { removeBookmark(b.s, b.a); row.remove(); } }, '✕'));
      return row;
    });
    const d: HTMLDialogElement = sheet(sheetHead(t('bm.title'), () => d.close()),
      rows.length ? h('div', { class: 'sheet-scroll' }, ...rows)
        : h('p', { class: 'muted' }, t('bm.empty')));
  }
  function openBookmark(s: number, a: number) {
    const b = bookmarks().find((x) => x.s === s && x.a === a);
    const d: HTMLDialogElement = sheet(sheetHead(`🔖 ${reference(meta[s - 1], a, a)}`, () => d.close()),
      b ? h('p', { class: 'muted small' }, t('bm.on', { date: dateFmt.format(b.at) })) : false,
      h('div', { class: 'menu' },
        h('button', { class: 'menu-item', onclick: () => { d.close(); void player.playFrom(s, a); } }, `🎧  ${t('bm.listenHere')}`),
        h('a', { class: 'menu-item', href: `#/reel/${s}/${a}-${a}`, onclick: () => d.close() }, `🎬  ${t('bm.reel')}`),
        h('button', { class: 'menu-item', onclick: () => { d.close(); removeBookmark(s, a); toast(t('mushaf.bookmarkRemoved')); } }, `✕  ${t('bm.remove')}`)));
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
  // Ramadan (T7): the first night's moment, Eid's recap, and today's reminders (Android app).
  {
    const rn = ramadanNow();
    const rd = ramadanData(rn);
    if ((rn.day && !rd.welcomed) || (rn.eid && !rd.recapSeen && (rd.days.length || rd.khatms))) {
      window.setTimeout(() => void import('./ramadan').then((x) => (rn.day ? x.ramadanWelcome(ramadanCtx!) : x.openRecap())), 700);
    }
    if (rd.plan) void import('./ramadan').then((x) => x.scheduleReminders());
  }

  return () => {
    renderId++;
    clearInterval(tintTimer);
    window.removeEventListener('bookmarks-changed', repaintMarks);
    window.removeEventListener('reflections-changed', repaintMarks);
    window.removeEventListener('circles-changed', decorate);
    clearTimeout(readTimer);
    circleCtx = null;
    openLampsHere = null;
    listenHere = null;
    ramadanCtx = null;
    window.removeEventListener('prefs-synced', applyTimeTint);
    clearTimeout(hintTimer);
    clearTimeout(resizeTimer);
    sel.destroy();
    player.destroy();
    document.body.classList.remove('mushaf-mode', 'listening');
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
  };
}
