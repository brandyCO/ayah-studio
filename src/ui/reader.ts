// Reading view with ayah selection: long-press selects an ayah; keep the finger down and drag (or
// tap another ayah afterwards) to extend the selection across consecutive ayat.
import { reference, surahMeta, surahText, surahTranslation } from '../data/quran';
import { MAX_AYAT } from '../engine/project';
import { h, toast } from './dom';

const LONG_PRESS_MS = 420;
const MOVE_TOLERANCE = 10;

export async function showReader(root: HTMLElement, n: number, focusAyah?: number): Promise<() => void> {
  const [s, arabic, english] = await Promise.all([surahMeta(n), surahText(n), surahTranslation(n)]);

  const cards = arabic.map((text, i) =>
    h('article', { class: 'ayah', 'data-a': String(i + 1) },
      h('div', { class: 'ayah-ar', lang: 'ar', dir: 'rtl' }, text),
      h('p', { class: 'ayah-en' }, h('span', { class: 'ayah-num' }, `${n}:${i + 1}`), english[i])));
  const listEl = h('main', { class: 'ayat' }, ...cards);

  const selLabel = h('span', { class: 'sel-label' });
  const reelBtn = h('button', { class: 'primary', onclick: () => {
    if (anchor === null || focus === null) return;
    const [a, b] = range();
    location.hash = `#/reel/${n}/${a}-${b}`;
  } }, '🎬 Turn into reel');
  const selBar = h('div', { class: 'selbar', 'aria-live': 'polite' },
    h('button', { class: 'icon-btn', 'aria-label': 'Clear selection', onclick: () => setSel(null, null) }, '✕'),
    selLabel, reelBtn);

  root.append(
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'All surahs' }, '‹'),
      h('div', { class: 'brand' }, h('h1', {}, `${s.n}. ${s.en}`), h('p', { class: 'muted' }, `${s.tr} · ${s.ayahs} ayat`)),
      h('span', { class: 'surah-ar big', lang: 'ar', dir: 'rtl' }, s.ar)),
    h('p', { class: 'hint muted' }, 'Long-press an ayah to select it. Drag, or tap another ayah, to extend.'),
    listEl,
    selBar,
  );

  // --- selection state ---
  let anchor: number | null = null;
  let focus: number | null = null;
  const range = (): [number, number] => [Math.min(anchor!, focus!), Math.max(anchor!, focus!)];

  function setSel(a: number | null, f: number | null) {
    if (a !== null && f !== null && Math.abs(f - a) + 1 > MAX_AYAT) {
      f = a + Math.sign(f - a) * (MAX_AYAT - 1);
      toast(`Up to ${MAX_AYAT} ayat per reel for now`);
    }
    anchor = a;
    focus = f;
    const [lo, hi] = a === null ? [0, -1] : range();
    cards.forEach((c, i) => {
      const k = i + 1;
      c.classList.toggle('sel', k >= lo && k <= hi);
      c.classList.toggle('sel-first', k === lo);
      c.classList.toggle('sel-last', k === hi);
    });
    selBar.classList.toggle('show', a !== null);
    document.body.classList.toggle('has-selbar', a !== null);
    if (a !== null) selLabel.textContent = `${reference(s, lo, hi)} · ${hi - lo + 1} ${hi > lo ? 'ayat' : 'ayah'}`;
  }

  // --- gestures ---
  let timer = 0;
  let down: { x: number; y: number; ayah: number; id: number } | null = null;
  let dragging = false;
  let lastY = 0;
  let scrollRaf = 0;

  const ayahAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('.ayah');
    return el ? Number(el.dataset.a) : null;
  };

  function autoScroll() {
    if (!dragging) return;
    const edge = 90;
    const v = lastY < edge ? -(edge - lastY) / 6 : lastY > innerHeight - edge ? (lastY - (innerHeight - edge)) / 6 : 0;
    if (v) window.scrollBy(0, v);
    scrollRaf = requestAnimationFrame(autoScroll);
  }

  function onDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const a = ayahAt(e.clientX, e.clientY);
    if (a === null) return;
    down = { x: e.clientX, y: e.clientY, ayah: a, id: e.pointerId };
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (!down) return;
      dragging = true;
      lastY = down.y;
      navigator.vibrate?.(12);
      setSel(down.ayah, down.ayah);
      scrollRaf = requestAnimationFrame(autoScroll);
    }, LONG_PRESS_MS);
  }

  function onMove(e: PointerEvent) {
    if (!down || e.pointerId !== down.id) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > MOVE_TOLERANCE) {
        clearTimeout(timer);
        down = null; // it's a scroll
      }
      return;
    }
    lastY = e.clientY;
    const a = ayahAt(e.clientX, e.clientY);
    if (a !== null && a !== focus) setSel(anchor, a);
  }

  function onUp(e: PointerEvent) {
    if (!down || e.pointerId !== down.id) return;
    clearTimeout(timer);
    const wasDrag = dragging;
    const tapped = down.ayah;
    dragging = false;
    down = null;
    cancelAnimationFrame(scrollRaf);
    if (wasDrag || e.type === 'pointercancel') return;
    // Short tap: extends an existing selection; tapping the only selected ayah clears it.
    if (anchor !== null) {
      if (anchor === focus && tapped === anchor) setSel(null, null);
      else setSel(anchor, tapped);
    }
  }

  // While drag-selecting, stop the page from scrolling under the finger.
  const blockScroll = (e: TouchEvent) => { if (dragging) e.preventDefault(); };
  const blockMenu = (e: Event) => { if ((e.target as HTMLElement).closest?.('.ayah')) e.preventDefault(); };

  listEl.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('touchmove', blockScroll, { passive: false });
  window.addEventListener('contextmenu', blockMenu);

  if (focusAyah && cards[focusAyah - 1]) {
    requestAnimationFrame(() => cards[focusAyah - 1].scrollIntoView({ block: 'center' }));
  } else window.scrollTo(0, 0);

  return () => {
    clearTimeout(timer);
    cancelAnimationFrame(scrollRaf);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('touchmove', blockScroll);
    window.removeEventListener('contextmenu', blockMenu);
    document.body.classList.remove('has-selbar');
  };
}
