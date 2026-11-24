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

/** The look as one picture: the avatar's decoration box (frame pieces around the disc, each its own picture since
 *  the item restyle) laid into one SVG at the box's places, then made a small PNG for the tab. */
async function picture(l: Look): Promise<string | null> {
  const el = avatar(l.avatar, l.tier, 30, l.frame, l.figure);
  const S = 90; // user units of the decoration box (1.5 × the disc, as `.dk`)
  const pct = (v: string) => (parseFloat(v) || 0) / 100 * S;
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const svgOf = (n: Element) => {
    const c = n.cloneNode(true) as SVGElement;
    c.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(c))}`;
  };
  let body = '';
  if (el.classList.contains('dk')) {
    for (const k of el.children) {
      if (k.tagName === 'IMG') {
        const st = (k as HTMLElement).style;
        body += `<image href="${esc((k as HTMLImageElement).getAttribute('src') ?? '')}" x="${pct(st.left)}" y="${pct(st.top)}" width="${pct(st.width)}" height="${pct(st.height)}" preserveAspectRatio="none"/>`;
      } else if (k.classList.contains('dk-av')) {
        const inner = k.querySelector('svg') ?? k.querySelector('img');
        const src = inner?.tagName === 'IMG' ? inner.getAttribute('src') : inner ? svgOf(inner) : null;
        if (src) body += `<clipPath id="c"><circle cx="45" cy="45" r="30"/></clipPath><image href="${esc(src)}" x="15" y="15" width="60" height="60" clip-path="url(#c)"/><circle cx="45" cy="45" r="31.5" fill="none" stroke="#24123a" stroke-width="3"/>`;
      }
    }
    // The disc sits under the frame pieces that come after it, over those before it (DOM order kept).
  } else {
    const svg = el.tagName.toLowerCase() === 'svg' ? el : el.querySelector('svg');
    if (!svg) return null;
    body = `<image href="${esc(svgOf(svg))}" x="15" y="15" width="60" height="60"/>`;
  }
  const whole = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">${body}</svg>`)}`;
  // A small PNG: the tab never parses the frame's SVGs again (and localStorage keeps ~20 KB, not ~250 KB).
  try {
    const im = new Image();
    im.src = whole;
    await im.decode();
    const px = 120;
    const c = document.createElement('canvas');
    c.width = c.height = px;
    c.getContext('2d')!.drawImage(im, 0, 0, px, px);
    return c.toDataURL('image/png');
  } catch { return whole; }
}

let last = '';
/** Draws (or takes away) the avatar on every Me tab on screen and keeps it for the next start. */
export async function paintMeTabs() {
  const l = myLook();
  const k = l ? `v2|${account()?.id ?? ''}|${l.avatar}|${l.tier}|${l.frame}|${l.figure ?? ''}` : '';
  let src: string | null = null;
  if (l) {
    try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (v?.k === k) src = v.src; } catch { /* ignore */ }
    if (!src) {
      src = await picture(l);
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
