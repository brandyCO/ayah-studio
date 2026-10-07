// Ayah selection shared by the mushaf and translation views: long-press selects an ayah; keep the
// finger down and drag (or tap another ayah afterwards, even on another page) to extend the
// selection across consecutive ayat of one surah. A floating bar offers "Turn into reel" and shows
// the reel's estimated length for the last-used reciter. Selectable elements carry data-s (surah)
// and data-a (ayah).
import { qdcSurah } from '../data/qdc';
import { reference, type SurahMeta } from '../data/quran';
import { DEFAULT_RECITER, reciterById } from '../data/reciters';
import { MAX_AYAT } from '../engine/project';
import { clipBounds, reelDuration } from '../engine/recitation';
import { h, toast } from './dom';
import { reelReciter } from './prefs';

const fmtLength = (sec: number) => {
  const s = Math.round(sec);
  return s < 60 ? `~${s} s` : `~${Math.floor(s / 60)} min ${s % 60} s`;
};

const LONG_PRESS_MS = 420;
const MOVE_TOLERANCE = 10;
const SWIPE_MIN = 60;

export interface Sel {
  surah: number;
  lo: number;
  hi: number;
}

export interface SelectionOptions {
  meta: SurahMeta[];
  area: HTMLElement; // gestures are read inside this element
  paint(sel: Sel | null): void; // highlight the selection in the current DOM
  onTap?(hit: { s: number; a: number } | null): void; // short tap while nothing is selected
  onTranslate?(sel: Sel): void; // adds a Translation button to the selection bar
  onSwipe?(dir: 1 | -1): void; // horizontal swipe: +1 = finger moved right
}

export function selectionController(o: SelectionOptions) {
  let surah = 0;
  let anchor: number | null = null;
  let focus: number | null = null;

  const current = (): Sel | null =>
    anchor === null || focus === null ? null : { surah, lo: Math.min(anchor, focus), hi: Math.max(anchor, focus) };

  const label = h('span', { class: 'sel-label' });
  const estimate = h('span', { class: 'sel-est' });
  const bar = h('div', { class: 'selbar', 'aria-live': 'polite' },
    h('button', { class: 'icon-btn', 'aria-label': 'Clear selection', onclick: () => set(0, null, null) }, '✕'),
    label,
    o.onTranslate && h('button', { class: 'chip', onclick: () => { const sel = current(); if (sel) o.onTranslate!(sel); } }, 'Translation'),
    h('button', { class: 'primary', onclick: () => {
      const sel = current();
      if (sel) location.hash = `#/reel/${sel.surah}/${sel.lo}-${sel.hi}`;
    } }, '🎬 Turn into reel'));

  function set(s: number, a: number | null, f: number | null) {
    if (a !== null && f !== null && Math.abs(f - a) + 1 > MAX_AYAT) {
      f = a + Math.sign(f - a) * (MAX_AYAT - 1);
      toast(`Up to ${MAX_AYAT} ayat per reel for now`);
    }
    surah = s;
    anchor = a;
    focus = f;
    const sel = current();
    o.paint(sel);
    bar.classList.toggle('show', !!sel);
    document.body.classList.toggle('has-selbar', !!sel);
    if (sel) {
      label.replaceChildren(`${reference(o.meta[sel.surah - 1], sel.lo, sel.hi)} · ${sel.hi - sel.lo + 1} ${sel.hi > sel.lo ? 'ayat' : 'ayah'}`, estimate);
      void showEstimate(sel);
    }
  }

  /** Estimated reel length from the reciter's timings (same plan the editor uses). */
  let estReq = 0;
  async function showEstimate(sel: Sel) {
    const req = ++estReq;
    estimate.textContent = '';
    const r = reciterById(reelReciter(DEFAULT_RECITER));
    try {
      const q = await qdcSurah(r.id, sel.surah);
      const clip = clipBounds(q.timings, sel.surah, sel.lo, sel.hi);
      if (req === estReq && clip) estimate.textContent = ` · ${fmtLength(reelDuration(clip))} · ${r.short}`;
    } catch {
      /* offline: no estimate */
    }
  }

  // --- gestures ---
  let timer = 0;
  let down: { x: number; y: number; s: number; a: number; id: number; moved: boolean } | null = null;
  let dragging = false;
  let lastY = 0;
  let scrollRaf = 0;

  const ayahAt = (x: number, y: number): { s: number; a: number } | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-a]');
    return el && o.area.contains(el) ? { s: Number(el.dataset.s), a: Number(el.dataset.a) } : null;
  };

  function autoScroll() {
    if (!dragging) return;
    const edge = 90;
    const v = lastY < edge ? -(edge - lastY) / 6 : lastY > innerHeight - edge ? (lastY - (innerHeight - edge)) / 6 : 0;
    if (v) window.scrollBy(0, v);
    scrollRaf = requestAnimationFrame(autoScroll);
  }

  function onDown(e: PointerEvent) {
    if (e.button !== 0 || !e.isPrimary) return;
    const hit = ayahAt(e.clientX, e.clientY);
    down = { x: e.clientX, y: e.clientY, s: hit?.s ?? 0, a: hit?.a ?? 0, id: e.pointerId, moved: false };
    clearTimeout(timer);
    if (!hit) return;
    timer = window.setTimeout(() => {
      if (!down || down.moved) return;
      dragging = true;
      lastY = down.y;
      navigator.vibrate?.(12);
      set(down.s, down.a, down.a);
      scrollRaf = requestAnimationFrame(autoScroll);
    }, LONG_PRESS_MS);
  }

  function onMove(e: PointerEvent) {
    if (!down || e.pointerId !== down.id) return;
    if (!dragging) {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > MOVE_TOLERANCE) {
        clearTimeout(timer);
        down.moved = true; // a scroll or swipe, not a press
      }
      return;
    }
    lastY = e.clientY;
    const hit = ayahAt(e.clientX, e.clientY);
    if (hit && hit.s === surah && hit.a !== focus) set(surah, anchor, hit.a);
  }

  function onUp(e: PointerEvent) {
    if (!down || e.pointerId !== down.id) return;
    clearTimeout(timer);
    const d = down;
    const wasDrag = dragging;
    dragging = false;
    down = null;
    cancelAnimationFrame(scrollRaf);
    if (wasDrag || e.type === 'pointercancel') return;
    if (d.moved) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (o.onSwipe && Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > 1.5 * Math.abs(dy)) o.onSwipe(dx > 0 ? 1 : -1);
      return;
    }
    const sel = current();
    if (!sel) o.onTap?.(d.a ? { s: d.s, a: d.a } : null);
    else if (!d.a) set(0, null, null); // tap outside the ayat clears the selection
    else if (d.s !== surah) toast('A reel uses ayat from one surah');
    else if (sel.lo === sel.hi && d.a === anchor) set(0, null, null);
    else set(surah, anchor, d.a);
  }

  // While drag-selecting, stop the page from scrolling under the finger.
  const blockScroll = (e: TouchEvent) => { if (dragging) e.preventDefault(); };
  const blockMenu = (e: Event) => { if ((e.target as HTMLElement).closest?.('[data-a]')) e.preventDefault(); };

  o.area.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('touchmove', blockScroll, { passive: false });
  window.addEventListener('contextmenu', blockMenu);

  return {
    bar,
    current,
    /** Re-apply the highlight after the view re-rendered (e.g. a page turn). */
    repaint: () => o.paint(current()),
    /** Select a single ayah programmatically. */
    select: (s: number, a: number) => set(s, a, a),
    destroy() {
      clearTimeout(timer);
      cancelAnimationFrame(scrollRaf);
      o.area.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchmove', blockScroll);
      window.removeEventListener('contextmenu', blockMenu);
      document.body.classList.remove('has-selbar');
    },
  };
}
