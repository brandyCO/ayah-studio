// The Me tab shows your own avatar in its frame (owner request 2026-11-23: "replace the me icon in the main nav with the
// profile picture and frame of the character"), instead of a person icon. Drawn here (lazy, with the avatar art) as one
// small picture and kept on this device (localStorage `meTabAv`, device-only), so the next start shows it at once
// from tabs.ts without loading this module.
import { account } from '../cloud/auth';
import { avatar } from './rankAvatars';
import { icon } from './icons';

const KEY = 'meTabAv';
interface Look { avatar: number; tier: number; frame: number; figure: string | null }

/** Your look: the status the ranks kept for this account, your character on this device, a look just picked. */
function myLook(): Look | null {
  const who = account()?.id ?? null;
  let s: Partial<Look> | null = null;
  if (who) {
    try {
      const v = JSON.parse(localStorage.getItem('rankCache') ?? 'null');
      if (v && v.who === who && v.v?.status) s = v.v.status;
    } catch { /* ignore */ }
  }
  let fig: string | null = null;
  try { fig = localStorage.getItem('rankFigure') || null; } catch { /* ignore */ }
  let now: { who?: string; avatar?: number; frame?: number } | null = null;
  try { now = JSON.parse(localStorage.getItem('myLookNow') ?? 'null'); } catch { /* ignore */ }
  if (now && now.who !== who) now = null;
  const figure = fig ?? s?.figure ?? null;
  const av = now?.avatar ?? s?.avatar ?? (figure ? 0 : null);
  if (av === null || av === undefined) return null;
  return { avatar: av, tier: s?.tier ?? 0, frame: now?.frame ?? s?.frame ?? 0, figure };
}

/** The look as one picture (a data: URL of the same SVG the boards draw). */
function picture(l: Look): string | null {
  const el = avatar(l.avatar, l.tier, 30, l.frame, l.figure);
  const img = el.querySelector('img') ?? (el.tagName === 'IMG' ? el as HTMLImageElement : null);
  if (img?.getAttribute('src')) return img.getAttribute('src');
  const svg = el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg');
  if (!svg) return null;
  const c = svg.cloneNode(true) as SVGElement;
  c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  c.setAttribute('viewBox', '-10 -10 60 60');
  c.setAttribute('width', '60');
  c.setAttribute('height', '60');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(c))}`;
}

let last = '';
/** Draws (or takes away) the avatar on every Me tab on screen and keeps it for the next start. */
export function paintMeTabs() {
  const l = myLook();
  const k = l ? `${account()?.id ?? ''}|${l.avatar}|${l.tier}|${l.frame}|${l.figure ?? ''}` : '';
  let src: string | null = null;
  if (l) {
    try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (v?.k === k) src = v.src; } catch { /* ignore */ }
    if (!src) {
      src = picture(l);
      try { if (src) localStorage.setItem(KEY, JSON.stringify({ k, src })); } catch { /* full */ }
    }
  } else {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }
  if (k === last && document.querySelectorAll('.tab-btn.me .tab-av').length === document.querySelectorAll('.tab-btn.me').length) return;
  last = k;
  for (const b of document.querySelectorAll<HTMLElement>('.tab-btn.me')) {
    const old = b.querySelector('.tab-av');
    if (!src) { old?.replaceWith(icon('me', 24)); continue; }
    const img = old?.querySelector('img');
    if (img) { if (img.getAttribute('src') !== src) img.setAttribute('src', src); continue; }
    const ic = b.firstElementChild;
    const span = document.createElement('span');
    span.className = 'tab-av';
    span.setAttribute('aria-hidden', 'true');
    const im = document.createElement('img');
    im.alt = '';
    im.draggable = false;
    im.src = src;
    span.append(im);
    if (ic) ic.replaceWith(span); else b.prepend(span);
  }
}
