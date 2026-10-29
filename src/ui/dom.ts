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
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

let toastTimer = 0;
export function toast(msg: string) {
  let el = document.querySelector<HTMLDivElement>('.toast');
  if (!el) {
    el = h('div', { class: 'toast', role: 'status' });
    document.body.append(el);
  }
  el.textContent = msg;
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

/** Rows of a list while it loads (search results, drafts). */
export const skeletonRows = (n = 4) =>
  h('div', { class: 'skel skel-rows', 'aria-busy': 'true' }, ...Array.from({ length: n }, () => h('span', { class: 'skel-row' },
    h('span', { class: 'skel-lines' }, h('span', { class: 'skel-bar' }), h('span', { class: 'skel-bar short' })))));
