// Ayah selection shared by the mushaf and translation views: long-press selects an ayah; keep the
// finger down and drag (or tap another ayah afterwards, even on another page) to extend the
// selection across consecutive ayat of one surah. A floating bar offers "Turn into reel" and shows
// the reel's estimated length for the last-used reciter. Selectable elements carry data-s (surah)
// and data-a (ayah).
import { qdcSurah } from '../data/qdc';
import { reference, type SurahMeta } from '../data/quran';
import { DEFAULT_RECITER, reciterById } from '../data/reciters';
import { applyLook, MAX_AYAT, newProject, pacing } from '../engine/project';
import { clipBounds, pacingExtra, reelDuration } from '../engine/recitation';
import { h, toast } from './dom';
import { t } from '../i18n';
import { reelLook, reelReciter } from './prefs';

const fmtLength = (sec: number) => {
  const s = Math.round(sec);
  return s < 60 ? t('sel.seconds', { s }) : t('sel.minutes', { m: Math.floor(s / 60), s: s % 60 });
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
  /** Horizontal drag that follows the finger (replaces onSwipe): dx in px, vx in px/ms at release. */
  onPan?(phase: 'move' | 'end' | 'cancel', dx: number, vx: number): void;
  onListen?(sel: Sel): void; // adds a ▶ button to the selection bar
  onBookmark?(sel: Sel): void; // adds a 🔖 button (bookmarks the first selected ayah)
  onReflect?(sel: Sel): void; // adds a ✎ Reflect button (a private note on the first selected ayah)
  onGift?(sel: Sel): void; // adds a 🎁 Gift button (send the selected ayat as a gift link)
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
    h('button', { class: 'icon-btn', 'aria-label': t('sel.clear'), onclick: () => set(0, null, null) }, '✕'),
    label,
    o.onListen && h('button', { class: 'icon-btn', 'aria-label': t('sel.listen'), title: t('sel.listenTitle'), onclick: () => { const sel = current(); if (sel) o.onListen!(sel); } }, '▶'),
    o.onBookmark && h('button', { class: 'icon-btn', 'aria-label': t('sel.bookmark'), title: t('sel.bookmarkTitle'), onclick: () => { const sel = current(); if (sel) o.onBookmark!(sel); } }, '🔖'),
    o.onTranslate && h('button', { class: 'chip', onclick: () => { const sel = current(); if (sel) o.onTranslate!(sel); } }, t('sel.translation')),
    o.onReflect && h('button', { class: 'chip', title: t('sel.reflectTitle'), onclick: () => { const sel = current(); if (sel) o.onReflect!(sel); } }, t('sel.reflect')),
    o.onGift && h('button', { class: 'chip', title: t('sel.giftTitle'), onclick: () => { const sel = current(); if (sel) o.onGift!(sel); } }, t('sel.gift')),
    h('button', { class: 'primary brand-btn', onclick: () => {
      const sel = current();
      if (sel) location.hash = `#/reel/${sel.surah}/${sel.lo}-${sel.hi}`;
    } }, t('sel.reel')));

  function set(s: number, a: number | null, f: number | null) {
    if (a !== null && f !== null && Math.abs(f - a) + 1 > MAX_AYAT) {
      f = a + Math.sign(f - a) * (MAX_AYAT - 1);
      toast(t('sel.max', { n: MAX_AYAT }));
    }
    surah = s;
    anchor = a;
    focus = f;
    const sel = current();
    o.paint(sel);
    bar.classList.toggle('show', !!sel);
    document.body.classList.toggle('has-selbar', !!sel);
    if (sel) {
      label.replaceChildren(`${reference(o.meta[sel.surah - 1], sel.lo, sel.hi)} · ${t(sel.hi > sel.lo ? 'common.ayat' : 'common.ayah', { n: sel.hi - sel.lo + 1 })}`, estimate);
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
      // Same pacing as the editor will use (pause between ayat, cards: remembered from the last reel).
      const p = newProject(sel.surah, sel.lo, sel.hi, r.id);
      applyLook(p, reelLook(), () => true);
      const len = clip && reelDuration(clip) + pacingExtra(pacing(p), sel.hi - sel.lo + 1);
      if (req === estReq && len) estimate.textContent = ` · ${fmtLength(len)} · ${r.short}`;
    } catch {
      /* offline: no estimate */
    }
  }

  // --- gestures ---
  let timer = 0;
  let down: { x: number; y: number; s: number; a: number; id: number; moved: boolean; pan: boolean } | null = null;
  let track: { x: number; t: number; vx: number } = { x: 0, t: 0, vx: 0 }; // for the release speed of a pan
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
    down = { x: e.clientX, y: e.clientY, s: hit?.s ?? 0, a: hit?.a ?? 0, id: e.pointerId, moved: false, pan: false };
    track = { x: e.clientX, t: e.timeStamp, vx: 0 };
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
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.moved && Math.hypot(dx, dy) > MOVE_TOLERANCE) {
        clearTimeout(timer);
        down.moved = true; // a scroll or swipe, not a press
        down.pan = !!o.onPan && Math.abs(dx) > Math.abs(dy); // the axis is decided once
      }
      if (down.pan) {
        const dt = e.timeStamp - track.t;
        if (dt > 0) track = { x: e.clientX, t: e.timeStamp, vx: 0.7 * ((e.clientX - track.x) / dt) + 0.3 * track.vx };
        o.onPan!('move', dx, 0);
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
    if (d.pan) {
      // A pause before lifting the finger means no fling.
      o.onPan!(e.type === 'pointercancel' ? 'cancel' : 'end', e.clientX - d.x, e.timeStamp - track.t > 80 ? 0 : track.vx);
      return;
    }
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
    /** Clear the selection. */
    clear: () => set(0, null, null),
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
