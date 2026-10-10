// Night listening (docs/light.md, L1): a full-screen night sky over a cloud sea while the recitation
// plays. The 3D scene (three.js, loaded only here) is a background; the ayah sits flat and still on
// top in the Quran font with its translation and reference (Light rule 1), crossfading per ayah.
// Motes and Noor breathe with the word timings (never with guessed audio levels). Sleep timer fades
// to dark and pauses the recitation. Flat 2D version for reduced motion / battery saver / no WebGL.
import { loadWordMap, reference, surahText, surahTranslation, type SurahMeta } from '../data/quran';
import { currentTranslation, translationInfo } from '../data/translations';
import { displayWords, parseSpans } from '../engine/words';
import { t } from '../i18n';
import { paintNightFlat } from '../light/flat';
import { lightQuality, type Quality } from '../light/support';
import { h } from './dom';
import { icon } from './icons';

type Pos = { s: number; a: number; w: number | null };

export interface NightSource {
  meta: SurahMeta[];
  position(): Pos | null;
  /** Recitation time in ms (the full-surah recording). */
  ms(): number;
  playing(): boolean;
  /** Valid word segments [QDC position, start ms, end ms] of an ayah of the loaded surah. */
  words(s: number, a: number): [number, number, number][] | null;
  toggle(): void;
  subscribe(f: (pos: Pos | null) => void): () => void;
}

/** A soft swell at each word start (rises in ~80 ms, settles over ~0.7 s), so pauses go quiet. */
export function breathAt(starts: number[], ms: number): number {
  let b = 0;
  for (const s of starts) {
    const x = (ms - s) / 1000;
    if (x < 0 || x > 4) continue;
    b += (1 - Math.exp(-x / 0.08)) * Math.exp(-x / 0.7);
  }
  return Math.min(1, b);
}

const SIZES = [38, 34, 30, 27]; // px; 27 is the legible minimum on a phone (never smaller)
const SLEEP = [0, 15, 30, 60];

let open: (() => void) | null = null;

export async function openNight(src: NightSource) {
  if (open) return;
  open = () => {}; // opening (guards a second tap while three.js loads)
  const quality: Quality = await lightQuality();
  let canvas = h('canvas', { class: 'night-canvas', 'aria-hidden': 'true' });
  const dark = h('div', { class: 'night-dark' });
  const textLayer = h('div', { class: 'night-text-layer', 'aria-live': 'polite' });
  const measure = h('div', { class: 'night-ar night-measure', 'aria-hidden': 'true' });
  const playBtn = h('button', { class: 'icon-btn night-btn', 'aria-label': 'Play', onclick: (e: Event) => { e.stopPropagation(); src.toggle(); } });
  const sleepRow = h('div', { class: 'night-sleep' });
  const controls = h('div', { class: 'night-controls' },
    h('button', { class: 'icon-btn night-btn', 'aria-label': t('night.close'), onclick: (e: Event) => { e.stopPropagation(); close(); } }, icon('close', 22)),
    h('div', { class: 'night-spacer' }),
    playBtn,
    sleepRow);
  const asleepNote = h('div', { class: 'night-asleep' }, t('night.asleep'));
  const root = h('div', { class: 'night', role: 'dialog', 'aria-label': t('night.open') }, canvas, textLayer, dark, asleepNote, controls, measure);
  document.body.append(root);
  document.body.classList.add('night-open');

  // --- the scene: 3D, or the flat picture ---
  let stage: import('../light/engine').LightStage | null = null;
  let input: { breath: number; glow: number } | null = null;
  let glowFrom = -1e9; // when Noor last brightened (a surah completed)
  const flat = () => {
    stage?.dispose();
    stage = null;
    input = null;
    root.classList.add('is-flat');
    // A canvas that held a WebGL context cannot give a 2D one: swap in a fresh canvas.
    const c2 = h('canvas', { class: 'night-canvas', 'aria-hidden': 'true' });
    canvas.replaceWith(c2);
    canvas = c2;
    paintNightFlat(canvas);
  };
  const t0 = performance.now();
  if (quality === 'flat') flat();
  else {
    try {
      const [{ LightStage }, { nightScene }] = await Promise.all([import('../light/engine'), import('../light/scenes/night')]);
      if (!root.isConnected) return;
      const sc = nightScene(1);
      input = sc.input;
      stage = new LightStage(canvas, sc, {
        quality,
        clock: () => (performance.now() - t0) / 1000 + 40, // start a little into the drift
        beforeFrame: () => feed(),
        onFallback: () => { console.warn('Night listening: too slow for 3D, flat version'); flat(); },
      });
      stage.start();
    } catch (e) {
      console.warn('Night listening: flat version', e);
      flat();
    }
  }
  const onResize = () => { if (!stage) paintNightFlat(canvas); };
  addEventListener('resize', onResize);

  // --- breath from the word timings ---
  function feed() {
    if (!input) return;
    const p = src.position();
    let starts: number[] = [];
    if (p && src.playing()) {
      const now = src.ms();
      for (const a of [p.a - 1, p.a]) starts = starts.concat((src.words(p.s, a) ?? []).map((w) => w[1]).filter((s) => s <= now && now - s < 4000));
      input.breath = breathAt(starts, now);
    } else input.breath *= 0.95;
    input.glow = Math.max(0, 1 - (performance.now() - glowFrom) / 2500);
  }

  // --- text: one block per ayah, crossfading; long ayat turn pages at word boundaries ---
  const wordMap = await loadWordMap().catch(() => ({} as Record<string, string>));
  const trId = currentTranslation();
  const trDir = translationInfo(trId).dir;
  interface Block { el: HTMLElement; ar: HTMLElement; en: HTMLElement; s: number; a: number; words: string[]; pages: [number, number][]; page: number; spans: [number, number][] | null }
  let block: Block | null = null;
  let req = 0;

  /** Pages of whole words that fit the text area at the largest size that fits (≥ the minimum). */
  function paginate(words: string[]): { size: number; pages: [number, number][] } {
    const maxH = Math.max(160, innerHeight * 0.42);
    measure.style.width = `${Math.min(innerWidth - 40, 640)}px`;
    measure.replaceChildren(...words.flatMap((w, i) => (i ? [' ', h('span', {}, w)] : [h('span', {}, w)])));
    let tops: number[] = [];
    for (const size of SIZES) {
      measure.style.fontSize = `${size}px`;
      const spans = [...measure.children] as HTMLElement[];
      tops = spans.map((s) => s.offsetTop);
      if (measure.scrollHeight <= maxH || size === SIZES[SIZES.length - 1]) {
        if (measure.scrollHeight <= maxH) return { size, pages: [[0, words.length - 1]] };
        // Split into pages of whole lines.
        const lineH = size * 2.05;
        const perPage = Math.max(2, Math.floor(maxH / lineH));
        const lineStarts: number[] = [];
        tops.forEach((tp, i) => { if (i === 0 || tp !== tops[i - 1]) lineStarts.push(i); });
        const pages: [number, number][] = [];
        for (let l = 0; l < lineStarts.length; l += perPage) {
          const end = l + perPage < lineStarts.length ? lineStarts[l + perPage] - 1 : words.length - 1;
          pages.push([lineStarts[l], end]);
        }
        return { size, pages };
      }
    }
    return { size: SIZES[0], pages: [[0, words.length - 1]] };
  }

  const pageText = (b: Block) => b.words.slice(b.pages[b.page][0], b.pages[b.page][1] + 1).join(' ');

  async function showAyah(s: number, a: number) {
    const id = ++req;
    const [ar, en] = await Promise.all([surahText(s), surahTranslation(s, trId).catch(() => null)]);
    if (id !== req || !root.isConnected) return;
    const text = ar[a - 1];
    const words = displayWords(text);
    const { size, pages } = paginate(words);
    const arEl = h('p', { class: 'night-ar', lang: 'ar', dir: 'rtl' });
    arEl.style.fontSize = `${size}px`;
    const enEl = h('p', { class: 'night-en', dir: trDir }, en?.[a - 1] ?? '');
    const more = pages.length > 1 ? h('div', { class: 'night-more' }, `${t('night.swipe')}`) : null;
    const el = h('div', { class: 'night-block' },
      arEl, enEl,
      h('p', { class: 'night-ref' }, reference(src.meta[s - 1], a)),
      ...(more ? [more] : []));
    const b: Block = { el, ar: arEl, en: enEl, s, a, words, pages, page: 0, spans: parseSpans(wordMap[`${s}:${a}`]) };
    arEl.textContent = pageText(b);
    const old = block;
    block = b;
    textLayer.append(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('in');
      enEl.classList.toggle('scrolls', enEl.scrollHeight > enEl.clientHeight + 2);
    }));
    if (old) {
      old.el.classList.remove('in');
      setTimeout(() => old.el.remove(), 1400);
    }
  }

  function setPage(b: Block, page: number) {
    page = Math.max(0, Math.min(b.pages.length - 1, page));
    if (page === b.page) return;
    b.page = page;
    b.ar.classList.add('turn');
    setTimeout(() => {
      b.ar.textContent = pageText(b);
      b.ar.classList.remove('turn');
      // The translation (shown whole) scrolls along with the pages.
      b.en.scrollTop = (b.en.scrollHeight - b.en.clientHeight) * (page / Math.max(1, b.pages.length - 1));
    }, 450);
  }

  /** The recited word (QDC position) → our word → the page that holds it (rule 8: from timings only). */
  function follow(p: Pos) {
    const b = block;
    if (!b || b.s !== p.s || b.a !== p.a || p.w === null || b.pages.length < 2) return;
    const i = b.spans ? b.spans[p.w - 1]?.[0] : p.w - 1;
    if (i === undefined) return;
    const pg = b.pages.findIndex(([x, y]) => i >= x && i <= y);
    if (pg >= 0) setPage(b, pg);
  }

  let lastS = 0;
  const onPos = (p: Pos | null) => {
    if (!p) { close(); return; }
    if (lastS && p.s !== lastS) glowFrom = performance.now(); // a surah completed: Noor brightens
    lastS = p.s;
    if (!block || block.s !== p.s || block.a !== p.a) void showAyah(p.s, p.a).then(() => follow(p));
    else follow(p);
    paintPlay();
  };
  const unsub = src.subscribe(onPos);
  const start = src.position();
  if (start) onPos(start);

  // Swipe turns pages of a long ayah by hand (when its timings are missing, or to look ahead).
  let sx = 0, sy = 0;
  root.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  root.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5 && block && block.pages.length > 1) {
      setPage(block, block.page + (dx < 0 ? 1 : -1)); // swipe left = onwards
      return;
    }
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) onTap();
  });

  // --- controls: shown on tap, hidden after 4 s ---
  let hideT = 0;
  function showControls() {
    root.classList.add('show-ctl');
    clearTimeout(hideT);
    hideT = window.setTimeout(() => root.classList.remove('show-ctl'), 4000);
  }
  function paintPlay() {
    const on = src.playing();
    playBtn.replaceChildren(icon(on ? 'pause' : 'play', 22));
    playBtn.setAttribute('aria-label', on ? 'Pause' : 'Play');
  }
  const playTimer = setInterval(paintPlay, 800);

  // --- sleep timer: fades to dark over the last minute, then pauses the recitation ---
  let sleepMin = 0, sleepAt = 0, asleep = false, sleepRaf = 0;
  function paintSleep() {
    const left = sleepAt ? Math.max(0, Math.ceil((sleepAt - Date.now()) / 60000)) : 0;
    sleepRow.replaceChildren(
      h('span', { class: 'night-sleep-label' }, icon('moon', 16), sleepAt ? t('night.left', { n: left }) : t('night.sleep')),
      ...SLEEP.map((m) => h('button', {
        class: `chip${m === sleepMin ? ' on' : ''}`,
        onclick: (e: Event) => { e.stopPropagation(); setSleep(m); showControls(); },
      }, m ? t('night.min', { n: m }) : t('night.off'))));
  }
  function setSleep(m: number) {
    sleepMin = m;
    sleepAt = m ? Date.now() + m * 60000 : 0;
    paintSleep();
  }
  function sleepTick() {
    sleepRaf = requestAnimationFrame(sleepTick);
    if (!sleepAt || asleep) return;
    const left = (sleepAt - Date.now()) / 1000;
    dark.style.opacity = String(Math.min(1, Math.max(0, 1 - left / 60)));
    if (left <= 0) {
      asleep = true;
      if (src.playing()) src.toggle();
      stage?.pause();
      root.classList.add('is-asleep');
      void lock?.release().catch(() => {});
      lock = null;
      setSleep(0);
    }
  }
  sleepRaf = requestAnimationFrame(sleepTick);
  const sleepPaint = setInterval(() => { if (sleepAt) paintSleep(); }, 20000);
  paintSleep();

  function onTap() {
    if (asleep) {
      asleep = false;
      root.classList.remove('is-asleep');
      dark.style.opacity = '0';
      stage?.start();
      wake();
    }
    showControls();
  }

  // Keep the screen on while the scene is shown (released when the sleep timer ends or on leave).
  let lock: WakeLockSentinel | null = null;
  const wake = () => {
    if (document.visibilityState === 'visible' && !asleep) navigator.wakeLock?.request('screen').then((l) => (lock = l), () => {});
  };
  const onVis = () => { if (document.visibilityState === 'visible') wake(); };
  document.addEventListener('visibilitychange', onVis);
  wake();

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === ' ') { e.preventDefault(); src.toggle(); }
  };
  addEventListener('keydown', onKey);
  addEventListener('hashchange', close);

  function close() {
    if (!open) return;
    open = null;
    req++;
    unsub();
    stage?.dispose();
    stage = null;
    clearInterval(playTimer);
    clearInterval(sleepPaint);
    clearTimeout(hideT);
    cancelAnimationFrame(sleepRaf);
    removeEventListener('resize', onResize);
    removeEventListener('keydown', onKey);
    removeEventListener('hashchange', close);
    document.removeEventListener('visibilitychange', onVis);
    void lock?.release().catch(() => {});
    root.classList.add('out');
    document.body.classList.remove('night-open');
    setTimeout(() => root.remove(), 600);
  }
  open = close;
  paintPlay();
  showControls();
}
