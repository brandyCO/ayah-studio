import { errMsg } from '../i18n';
type Child = Node | string | null | undefined | false;
type Attrs = Record<string, unknown>;

/** Tiny element builder: h('button', { class: 'x', onclick: fn }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k in el && k !== 'list') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const kids = children.filter((c) => c !== null && c !== undefined && c !== false) as (Node | string)[];
  for (const c of kids) el.append(c);
  // An icon alone in its box (a round button, a tile) is centred there: styles.css gives it no label gap.
  if (kids.length === 1 && kids[0] instanceof SVGElement) el.dataset.ico = '';
  return el;
}

let toastTimer = 0;
export function toast(msg: string) {
  let el = document.querySelector<HTMLDivElement>('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = errMsg(msg); // never English in the Arabic interface
  // Over an open modal dialog (a friend's profile, a sheet) a toast in the page sits under it, unseen: put it in the top
  // layer as a popover, shown again each time so it lands above the newest dialog.
  if ('showPopover' in el) {
    if (!el.popover) el.popover = 'manual';
    try {
      if (el.matches(':popover-open')) el.hidePopover();
      el.classList.remove('show');
      el.showPopover();
      void el.offsetWidth; // start the slide-in from above
    } catch { /* ignore */ }
  } else {
    const top = [...document.querySelectorAll('dialog[open]')].pop(); // older WebViews: inside the dialog on top
    (top ?? document.body).append(el);
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove('show'), 2200);
}

export const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

/** A light tap felt in the hand (Android; ignored where vibration is not available or reduced motion is on). */
export function haptic(ms = 8) {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    navigator.vibrate?.(ms);
  } catch { /* ignore */ }
}

/** A skeleton of a screen while it loads: a mushaf page (15 soft lines) or a list (a header and rows). */
export function skeleton(kind: 'page' | 'list'): HTMLElement {
  if (kind === 'page') {
    return h('div', { class: 'route-skel skel skel-page', 'aria-busy': 'true' },
      ...Array.from({ length: 15 }, (_, i) => h('span', { class: 'skel-line', style: i === 14 ? 'width:58%' : '' })));
  }
  return h('div', { class: 'route-skel skel skel-list', 'aria-busy': 'true' },
    h('span', { class: 'skel-bar skel-title' }), h('span', { class: 'skel-bar skel-search' }),
    ...Array.from({ length: 8 }, () => h('span', { class: 'skel-row' },
      h('span', { class: 'skel-dot' }), h('span', { class: 'skel-lines' }, h('span', { class: 'skel-bar' }), h('span', { class: 'skel-bar short' })))));
}

/** The studio's loading light (owner request 2026-11-19): motes of light drift in and gather into the gold
 *  star while the reel gets ready. Transform / opacity only, so it stays smooth on a busy slow phone. */
export const studioLoader = () => h('div', { class: 'studio-load', 'aria-hidden': 'true' },
  h('i', { class: 'sl-halo' }),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => h('i', { class: 'sl-m', style: `--a:${i * 45 + 20}deg;--d:${(i * 0.37) % 1.6}s` })),
  h('i', { class: 'sl-star' }));

/** The studio's frame shown at once while its code and the reel load (main.ts; the editor replaces it). */
export const studioShell = () => h('div', { class: 'studio studio-shell', 'aria-busy': 'true' },
  h('header', { class: 'studio-top' }, h('span', { class: 'shell-pill' }), h('span', { class: 'shell-pill wide' })),
  h('div', { class: 'studio-stage' }, h('div', { class: 'stage loading' }, studioLoader())),
  h('div', { class: 'transport' }),
  h('div', { class: 'studio-bottom' }, h('span', { class: 'shell-track' }), h('span', { class: 'shell-track' }), h('span', { class: 'shell-tools' })));

/** Rows of a list while it loads (search results, drafts). */
export const skeletonRows = (n = 4) =>
  h('div', { class: 'skel skel-rows', 'aria-busy': 'true' }, ...Array.from({ length: n }, () => h('span', { class: 'skel-row' },
    h('span', { class: 'skel-lines' }, h('span', { class: 'skel-bar' }), h('span', { class: 'skel-bar short' })))));

// Listeners that belong to a piece of a screen: removed once that piece has left the page (checked at
// every screen change by main.ts), so going back and forth between tabs never piles them up.
const bound = new Set<{ el: Element; target: EventTarget; type: string; fn: EventListener }>();
/** `target.addEventListener(type, fn)` for as long as `el` is on the page. */
export function listenWhile(el: Element, target: EventTarget, type: string, fn: EventListener) {
  target.addEventListener(type, fn);
  bound.add({ el, target, type, fn });
}
/** Drops the listeners of pieces no longer on the page (main.ts, on each screen change). */
export function sweepListeners() {
  for (const b of bound) if (!b.el.isConnected) { b.target.removeEventListener(b.type, b.fn); bound.delete(b); }
}
