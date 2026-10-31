// Mushaf reading view: a full-screen Madinah mushaf page (King Fahd Complex QCF V2 fonts, 15 lines,
// exactly as printed). Swipe to turn pages. Tap the page to drop down the title bar with the menu;
// long-press / drag to select ayat for a reel.
import { bookmarks, removeBookmark, toggleBookmark } from '../data/bookmarks';
import { draftHash, listDrafts } from '../data/drafts';
import { addRecentPage } from '../data/history';
import { loadMeta, reference, surahTranslation } from '../data/quran';
import { todaysAyah } from '../data/daily';
import { loadPopular } from '../data/popular';
import { loadMushaf, loadPageFont, PAGE_COUNT, releasePageFonts, type MushafLine } from '../data/mushaf';
import { keepWholeMushaf } from '../data/mushafDownload';
import { lastWritten, loadReflections, reflectionAt, reflections } from '../data/reflections';
import { icon } from './icons';
import { h, toast } from './dom';
import { locale, surahName, t } from '../i18n';
import { currentTranslation, translationInfo } from '../data/translations';
import { markTourSeen, tourSeen } from './prefs';
const showTour = (done?: () => void) => void import('./tour').then((m) => m.showTour(done));
import { tafsirToggle } from './tafsir';
import { applyTimeTint, crescent, fillToday, paintMarks, ramadanDay, registerMarks, registerToday } from './living';
import { createPlayer } from './player';
import { setLastRead, setReaderMode } from './prefs';
import { perfLaunch } from '../perf';
import { openReflection, openReflections, wroteHere } from './reflections';
import { account } from '../cloud/auth';
import { logPageRead } from '../data/readLog';
import { countPage, pageSeconds, todayRec } from '../data/journey';
import { markRamadanRead, noteAyah, ramadanData, ramadanNow } from '../data/ramadan';
// The family circles screens load on first use.
const openCircle = (id: string) => import('./circles').then((m) => m.openCircle(id));
import { selectionController, type Sel } from './selection';
import { pickHint, tabBar, takeTabIntent } from './tabs';

type Seg = [number, number, string];

let bismillahSvg: Promise<string> | null = null;
const bismillah = () =>
  (bismillahSvg ??= fetch(`${import.meta.env.BASE_URL}fonts/bismillah.svg`).then((r) => r.text()));

// The living mushaf's first sources: bookmarks in the margin, and Today lines for a recent bookmark
// and a reel draft still waiting.
registerMarks(() => bookmarks().map((b) => ({ s: b.s, a: b.a, kind: 'bookmark', title: t('mushaf.bookmarkMark', { ref: `${b.s}:${b.a}` }) })));
registerMarks(() => reflections().map((r) => ({ s: r.s, a: r.a, kind: 'reflection', title: wroteHere(lastWritten(r)) })));
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
// Popular this week: the ayat people made reels of most (or the owner's weekly pick), one tap to a reel.
registerToday(async () => {
  const [meta, p] = await Promise.all([loadMeta(), loadPopular()]);
  const a = p.ayat[0];
  if (!a) return [];
  return [{
    icon: '✦', text: t(a.trending ? 'today.trending' : 'today.popular', { ref: reference(meta[a.surah - 1], a.from, a.to) }), href: `#/s/${a.surah}/${a.from}`,
    actions: [{ label: t('today.popularReel'), href: `#/reel/${a.surah}/${a.from}-${a.to}` }],
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

function firstVisitHint() {
  try {
    if (localStorage.getItem('mushafHint')) return;
    localStorage.setItem('mushafHint', '1');
  } catch {
    /* ignore */
  }
  toast(t('mushaf.hint'));
}

/** The page last shown for an address, so a reopen can fetch its font before the layout is in. */
function rememberPage(hash: string, page: number) {
  try { localStorage.setItem('lastPage', JSON.stringify([hash, page])); } catch { /* storage blocked */ }
}
function knownPage(hash: string): number | null {
  try {
    const v: unknown = JSON.parse(localStorage.getItem('lastPage') ?? 'null');
    if (Array.isArray(v) && v[0] === hash && Number.isInteger(v[1]) && v[1] >= 1 && v[1] <= PAGE_COUNT) return v[1] as number;
  } catch { /* ignore */ }
  return null;
}

export async function showMushaf(root: HTMLElement, n: number, focusAyah?: number): Promise<() => void> {
  // Reopening where the user left off: start that page's font right away, while the layout loads.
  const known = knownPage(location.hash);
  if (known) void loadPageFont(known).catch(() => {});
  const [meta, mushaf, svg] = await Promise.all([loadMeta(), loadMushaf(), bismillah()]);
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
    h('a', { class: 'icon-btn', href: '#/search', 'aria-label': t('mushaf.search'), title: t('mushaf.search') }, icon('search', 20)),
    today);
  const toggleBar = (show = !bar.classList.contains('show')) => {
    bar.classList.toggle('show', show);
    document.body.classList.toggle('tabs-up', show); // the tab bar comes up with the title bar
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
    onPan: (phase, dx, vx) => pan(phase, dx, vx),
  });

  const listenNow = () => {
    toggleBar(false);
    if (player.active()) player.toggle();
    else { const f = firstAyahOnPage(); void player.playFrom(f.s, f.a); }
  };
  const tabs = tabBar('read', { read: () => toggleBar(false), listen: listenNow }, true);
  root.append(bar, area, sel.bar, player.bar, tabs);

  ramadanCtx = { goToPage: (p) => { toggleBar(false); go(p); } };
  let readTimer = 0;
  const startReadTimer = () => {
    clearInterval(readTimer);
    const p = page;
    const ramadan = !!ramadanNow().day && !!ramadanData().plan;
    // Honest counting (Me tab): a page counts as read only after it has been on screen for the
    // reading time the user picked (default 1½ min); the clock stops while the app is hidden, so
    // swiping past or leaving the phone does not count. Ramadan's portion keeps its 20 s.
    const need = pageSeconds();
    let seen = 0;
    readTimer = window.setInterval(() => {
      if (p !== page) { clearInterval(readTimer); return; }
      if (document.hidden) return;
      seen++;
      if (seen === 20 && ramadan) markRamadanRead(p);
      if (seen >= need) {
        clearInterval(readTimer);
        if (logPageRead(p)) {
          const was = todayRec();
          const [s0, j0] = [was.s?.length ?? 0, was.j?.length ?? 0];
          countPage(mushaf, p);
          const now = todayRec();
          const surahs = (now.s ?? []).slice(s0).map((n) => meta[n - 1]).filter(Boolean);
          const juz = (now.j ?? []).slice(j0);
          void import('./pageMoments').then((m) => {
            m.pageCounted(area);
            m.finished(surahs, juz);
          });
        }
      }
    }, 1000);
  };
  try {
    const open = sessionStorage.getItem('openCircle');
    if (open) {
      sessionStorage.removeItem('openCircle');
      window.setTimeout(() => void openCircle(open), 300);
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
  // Notes are read from the device after the first page shows (they only add margin marks).
  void loadReflections().then(() => { repaintMarks(); pulseNotes(); });

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
    hint.textContent = `✎ ${wroteHere(at)}`;
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

  let recentTimer = 0;
  function header() {
    const pg = mushaf.pages[page - 1];
    const segs = pg.lines.filter((l) => l[0] !== 'h' && l[0] !== 'b').flat() as Seg[];
    const [s, a] = segs[0];
    title.textContent = t('common.surahTitle', { n: s, name: surahName(meta[s - 1]) });
    sub.textContent = t('common.juzPage', { juz: pg.juz, page });
    pageNum.replaceChildren(...(ramadanDay() ? [crescent()] : []), String(page));
    history.replaceState(null, '', `#/s/${s}/${a}`);
    setLastRead(`#/s/${s}/${a}`); // reopen on this page next time
    rememberPage(`#/s/${s}/${a}`, page);
    startReadTimer();
    // "Recently read" on the search screen: pages stayed on for a few seconds, not ones swiped past.
    clearTimeout(recentTimer);
    const p = page;
    recentTimer = window.setTimeout(() => addRecentPage(p, s, a), 3000);
  }

  // A page whose font is still downloading slides in as a placeholder, replaced when it is ready.
  const placeholders = new Map<number, HTMLElement>();
  const placeholder = (p: number) => {
    if (!placeholders.has(p)) {
      // A skeleton of the page: 15 soft lines where the text will be, a light sweeping across them.
      const lines = Array.from({ length: 15 }, (_, i) => h('span', { class: 'skel-line', style: i === 14 ? 'width:58%' : '' }));
      placeholders.set(p, h('div', { class: 'mushaf-page loading', 'data-page': String(p), 'aria-busy': 'true', 'aria-label': t('common.page', { n: p }) },
        ...lines));
    }
    return placeholders.get(p)!;
  };

  let renderId = 0;
  // After a slide lands, the rest of the work (attaching the new neighbour, fitting it, the header,
  // marks) waits a frame, so the landing frame itself stays light. A new swipe runs it at once.
  let pendingLayout = 0;
  function layoutSoon() {
    cancelAnimationFrame(pendingLayout);
    pendingLayout = requestAnimationFrame(() => { pendingLayout = 0; layout(); });
  }
  function flushLayout() {
    if (!pendingLayout) return;
    cancelAnimationFrame(pendingLayout);
    pendingLayout = 0;
    layout();
  }
  const idle = (f: () => void) => { if (typeof requestIdleCallback === 'function') requestIdleCallback(f, { timeout: 600 }); else setTimeout(f, 120); };
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
    for (const p of [page + 2, page + 3, page - 2, page - 3, page + 4, page + 5, page + 6, page - 4, page - 5, page - 6, page + 7, page + 8, page + 9, page + 10])
      if (valid(p)) void loadPageFont(p).catch(() => {});
    // Build the pages two away while idle (their words, not yet fitted), so the next flip only fits.
    idle(() => { if (id === renderId) for (const p of [page + 2, page - 2]) if (valid(p)) void buildPage(p); });
    for (const p of built.keys()) if (Math.abs(p - page) > 3) { built.delete(p); building.delete(p); }
    releasePageFonts((p) => Math.abs(p - page) <= 12); // pages far away give their font's memory back
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
  let panRaf = 0;
  let panX = 0;
  function pan(phase: 'move' | 'end' | 'cancel', dx: number, vx: number) {
    // Swiping again while a page is still sliding: let it land at once and follow the new swipe.
    if (animating) finishNow?.();
    flushLayout();
    const dir = dx > 0 ? 1 : -1; // finger moving right brings in the next page (on the left)
    const target = page + dir;
    if (phase === 'move') {
      panning = true;
      strip.classList.add('moving');
      panX = valid(target) ? dx : dx * 0.25; // resistance at the first and last page
      // One transform per frame, however often the finger reports.
      panRaf ||= requestAnimationFrame(() => { panRaf = 0; if (panning) setStrip(panX); });
      return;
    }
    cancelAnimationFrame(panRaf);
    panRaf = 0;
    panning = false;
    const fling = Math.abs(vx) > 0.35 && Math.sign(vx) === dir;
    if (phase === 'end' && valid(target) && (Math.abs(dx) > W() * 0.22 || fling)) slideTo(target, Math.abs(dx), Math.abs(vx));
    else {
      setStrip(0, 220);
      window.setTimeout(() => { if (!panning && !animating) strip.classList.remove('moving'); }, 260);
    }
  }
  /** Slide to a neighbouring page (from where the finger left it). */
  function slideTo(target: number, from = 0, speed = 0) {
    if (animating) finishNow?.();
    flushLayout();
    const dir = target > page ? 1 : -1;
    if (!strip.querySelector(`[data-page="${target}"]`)) {
      page = target;
      setStrip(0);
      layout();
      return;
    }
    animating = true;
    strip.classList.add('moving');
    // Carry the finger's speed: the rest of the way at that speed (px/ms), between 140 and 300 ms.
    const rest = Math.max(0, W() - from);
    const ms = Math.round(Math.min(300, Math.max(140, speed > 0.3 ? (rest / speed) * 1.6 : 160 + 140 * (rest / W()))));
    setStrip(dir * W(), ms);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      finishNow = null;
      page = target;
      place(); // the pages already in the strip move into their new places in the same frame
      setStrip(0);
      strip.classList.remove('moving');
      animating = false;
      layoutSoon();
    };
    finishNow = finish;
    strip.addEventListener('transitionend', finish, { once: true });
    window.setTimeout(finish, ms + 80);
  }

  function go(p: number) {
    if (animating) finishNow?.();
    flushLayout();
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
      const tf = tafsirToggle(s.surah, a);
      if (tf) items.push(tf);
    }
    const d: HTMLDialogElement = sheet(sheetHead(reference(meta[s.surah - 1], s.lo, s.hi), () => d.close()),
      h('div', { class: 'sheet-scroll' }, ...items), h('p', { class: 'muted small', dir: 'auto' }, info.translator));
  }

  /** The first ayah that begins on the current page (or the one continuing onto it). */
  function firstAyahOnPage(): { s: number; a: number } {
    const segs = mushaf.pages[page - 1].lines.filter((l) => l[0] !== 'h' && l[0] !== 'b').flat() as Seg[];
    const seg = segs.find((x) => mushaf.segStart.get(x) === 1) ?? segs[0];
    return seg ? { s: seg[0], a: seg[1] } : { s: n, a: 1 };
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
  void loadPageFont(page).then(() => requestAnimationFrame(() => perfLaunch('mushaf page')), () => {});
  keepWholeMushaf(() => page);
  // First run (G3): the tour, then the hint; people who used the app before the tour skip it.
  let touring = false;
  if (!tourSeen()) {
    let returning = false;
    try { returning = !!localStorage.getItem('mushafHint'); } catch { /* ignore */ }
    if (returning) markTourSeen();
    else { touring = true; void import('./welcome').then((m) => m.showWelcome(firstVisitHint)); } // language, reciter, theme
  } else firstVisitHint();
  // A tab tapped on another screen (Listen, Me, Create → Choose ayat) lands here.
  const intent = takeTabIntent();
  if (intent === 'listen') listenNow();
  else if (intent === 'pick') pickHint();
  // From Settings (the old ☰ menu's reading items live there now).
  else if (intent === 'bookmarks') openBookmarks();
  else if (intent === 'tour') showTour();
  else if (intent === 'ramadan') void import('./ramadan').then((x) => x.openRamadan(ramadanCtx!));
  else if (intent === 'reflections') void openReflections(meta, (s, a) => {
    go(mushaf.pageOf(s, a));
    window.setTimeout(() => pulseNotes({ s, a }), 450); // after the page has slid in
  });
  else if (intent?.startsWith('page:')) { const p = Number(intent.slice(5)); if (valid(p)) go(p); }
  // Ramadan (T7): the first night's moment, Eid's recap, and today's reminders (Android app).
  // Never over the tour: the moment waits for the next start.
  {
    const rn = ramadanNow();
    const rd = ramadanData(rn);
    if (touring) { /* next start */ } else if ((rn.day && !rd.welcomed) || (rn.eid && !rd.recapSeen && (rd.days.length || rd.khatms))) {
      window.setTimeout(() => void import('./ramadan').then((x) => (rn.day ? x.ramadanWelcome(ramadanCtx!) : x.openRecap())), 700);
    }
    if (rd.plan) void import('./ramadan').then((x) => x.scheduleReminders());
  }

  return () => {
    renderId++;
    cancelAnimationFrame(pendingLayout);
    cancelAnimationFrame(panRaf);
    clearInterval(tintTimer);
    window.removeEventListener('bookmarks-changed', repaintMarks);
    window.removeEventListener('reflections-changed', repaintMarks);
    clearInterval(readTimer);
    clearTimeout(recentTimer);
    listenHere = null;
    ramadanCtx = null;
    window.removeEventListener('prefs-synced', applyTimeTint);
    clearTimeout(hintTimer);
    clearTimeout(resizeTimer);
    sel.destroy();
    player.destroy();
    document.body.classList.remove('mushaf-mode', 'listening', 'tabs-up');
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', onResize);
  };
}
