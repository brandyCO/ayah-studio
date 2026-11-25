// A friend's gift, opened (owner request 2026-11-23): never a chest. The sender's own character walks in carrying a
// wrapped gift and hands it over; the receiver taps it open. What it is worth sets everything about it (owner, same
// day): its size, wrapping, colours and how it opens —
//   0 · ≤ 49 Light   a small parcel in brown paper tied with twine: the twine comes undone, the paper falls open
//   1 · ≤ 99         a box in paper printed in the sender's colour with a satin ribbon: the lid pops off
//   2 · ≤ 199        a bigger box in shining silk with a large bow: the bow unravels, the lid lifts, light pours out
//   3 · 200 +        a velvet box with gold filigree and a gold bow: its front opens like two petals, a pillar of light
// Pieces from the shop take the size of their price. Made for the slowest phones (owner: "for all human beings on
// Earth"): every part is its own layer of a few hundred SVG bytes drawn once, everything moves only by transform and
// opacity on an opaque, still background, no filters or blur, confetti ≤ 22 (half in old-phone mode), and the page
// behind is skipped while it plays (`holdPage`).
import './giftOpen.css';
import { h, haptic, toast } from './dom';
import { holdPage, lite, popIn, reduced, squash, tick, wobble } from './juice';
import { sfx, warmSounds } from './sfx';
import { nwt } from '../i18n/news';
import type { Gift } from '../together/lightGifts';

import { bow, front, giftTier, hueOf, inside, lid, mouth, pal, svg, type GiftTier } from './giftArt';
import { flare } from './flare';
export { giftTier, type GiftTier };
const TAPS = [1, 2, 2, 3];
const SIZE = [180, 215, 250, 285];
const CONFETTI = [8, 12, 16, 22];

/** The Light star, drawn here (big, gold, with its glint) so the moment needs nothing else. */
function starArt(): HTMLElement {
  const el = h('span', { class: 'gm-star', 'aria-hidden': 'true' });
  el.innerHTML = svg('<path d="M100 14C108 70 130 92 186 100 130 108 108 130 100 186 92 130 70 108 14 100 70 92 92 70 100 14Z" fill="#ffc93c" stroke="#d98a00" stroke-width="7" stroke-linejoin="round"/><path d="M100 46C104 78 114 92 140 98 112 98 104 80 100 46Z" fill="#fff6c9"/>');
  return el;
}
const layer = (cls: string, html: string) => { const el = h('span', { class: `gm-l ${cls}` }); el.innerHTML = html; return el; };

/** A piece's name, price and picture, for a gift holding one. */
async function pieceInfo(item: string): Promise<{ price: number; name: string; art: Node }> {
  const [kind, ...rest] = item.split(':');
  const { rt } = await import('../i18n/ranks');
  try {
    if (kind === 'rm') {
      const [{ ROOM_ITEMS }, { tileArt }] = await Promise.all([import('../data/roomItems'), import('./roomShop')]);
      const it = ROOM_ITEMS.find((r) => r.id === rest[0]);
      const art = h('span', { class: 'gm-piece-art' }); if (it) art.innerHTML = tileArt(it.slot, it.id);
      return { price: it?.price ?? 100, name: rt(`rs.i.${rest[0]}` as never), art };
    }
    if (kind === 'fg') {
      const f = await import('./figure');
      const piece = rest.join(':');
      const art = h('span', { class: 'gm-piece-art fig' }); art.innerHTML = f.figureSvg(f.wearing(f.parse((await import('./actor')).myFigureCode()) ?? f.DEFAULT, piece), { still: true });
      return { price: f.PRICE[piece] ?? 150, name: rt(`fb.${rest[0]}.${rest[1]}` as never), art };
    }
    if (kind === 'av' || kind === 'fr') {
      const [{ ITEMS }, ra] = await Promise.all([import('../data/shop'), import('./rankAvatars')]);
      const it = ITEMS.find((x) => x.id === item);
      const n = Number(rest[0]);
      const art = kind === 'av' ? ra.avatar(n, 0, 110) : ra.avatar(0, 0, 110, n, (await import('./actor')).myFigureCode());
      return { price: it?.price ?? 200, name: ra.lookName(kind === 'av' ? 'avatar' : 'frame', n, document.documentElement.lang === 'ar') ?? nwt('nw.giftPiece'), art };
    }
  } catch { /* fall through */ }
  const { icon } = await import('./icons');
  return { price: 100, name: nwt('nw.giftPiece'), art: h('span', { class: 'gm-piece-art' }, icon('gift', 64)) };
}

export interface PlayOpts {
  /** Opens it on the server; null when it was opened already. Defaults to `openGift`. */
  open?: () => Promise<boolean>;
  /** Shown on the last screen's button. */
  next?: boolean;
}

let busy = false;
/** Plays one gift from start to Continue. Resolves true once it was opened here. */
export async function playGift(g: Gift, o: PlayOpts = {}): Promise<boolean> {
  if (busy) return false;
  busy = true;
  try { return await run(g, o); } finally { busy = false; }
}

async function run(g: Gift, o: PlayOpts): Promise<boolean> {
  warmSounds();
  const who = (!g.from.private && g.from.name) || nwt('nw.someone');
  const piece = g.item ? await pieceInfo(g.item) : null;
  const t = giftTier(g.item ? piece!.price : g.light);
  const p = pal(t, hueOf(g.from.pid ?? g.from.name ?? g.id));
  const slow = lite(), still = reduced();

  // --- build everything before anything moves ---
  const parts: Record<string, HTMLElement> = {};
  const wrap = h('span', { class: 'gm-wrap' });
  const glow = h('span', { class: 'gm-l gm-glow' });
  wrap.append(layer('gm-in', inside(p)), glow);
  if (t === 0 || t === 3) {
    parts.fl = layer('gm-fl', svg(front(t, p, 34, 100)));
    parts.fr = layer('gm-fr', svg(front(t, p, 100, 166)));
    wrap.append(parts.fl, parts.fr);
  } else {
    parts.body = layer('gm-body', svg(front(t, p)));
    parts.mouth = layer('gm-mouth', mouth(p));
    wrap.append(parts.body, parts.mouth);
  }
  parts.lid = layer('gm-lid', svg(lid(t, p)));
  parts.bow = layer('gm-bow', svg(bow(t, p)));
  wrap.append(parts.lid, parts.bow);
  const idle = h('span', { class: 'gm-idle' }, wrap);
  const gift = h('button', { class: 'gm-gift', type: 'button', 'aria-label': nwt('nw.giftTap'), style: `--gs:${SIZE[t]}px` },
    h('span', { class: 'gm-shadow', 'aria-hidden': 'true' }), idle);

  let sender: HTMLElement;
  let act: import('./actor').Actor | null = null;
  if (g.from.figure && !g.from.private) {
    const { actor } = await import('./actor');
    act = actor('gm-actor', g.from.figure);
  }
  if (act) sender = h('span', { class: 'gm-sender' }, act.el);
  else {
    const { avatar } = await import('./rankAvatars');
    sender = h('span', { class: 'gm-sender av' }, avatar(g.from.private ? 0 : g.from.avatar ?? 0, g.from.tier ?? 0, 92, g.from.private ? 0 : g.from.frame ?? 0));
  }
  const n = slow ? Math.ceil(CONFETTI[t] / 2) : CONFETTI[t];
  const conf = h('span', { class: 'gm-conf', 'aria-hidden': 'true' }, ...Array.from({ length: n }, (_, i) =>
    h('i', { style: `--c:${[p.rib, p.c, p.trim ?? '#fff', p.a, '#fff'][i % 5]}` })));
  const count = h('b', { class: 'gm-n' }, '+0');
  const loot = h('div', { class: 'gm-loot' },
    piece ? piece.art : starArt(),
    piece ? h('b', { class: 'gm-pname' }, piece.name) : count,
    h('span', { class: 'gm-lsub' }, piece ? nwt('nw.giftKept') : nwt('nw.giftLight', { n: g.light })));
  const rays = h('span', { class: 'gm-rays', 'aria-hidden': 'true' });
  const pillar = t === 3 ? h('span', { class: 'gm-pillar', 'aria-hidden': 'true' }) : '';
  const title = h('h2', { class: 'gm-title' }, nwt('nw.giftFrom', { name: who }));
  const hint = h('p', { class: 'gm-hint' }, nwt('nw.giftTap'));
  const go = h('button', { class: 'primary brand-btn gm-go', type: 'button', tabindex: -1 }, o.next ? nwt('nw.giftNext') : nwt('nw.continue'));
  const stage = h('div', { class: 'gm-stage' }, rays, pillar, sender, gift, conf, loot);
  const root = h('div', { class: `gm t${t}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': nwt('nw.giftFrom', { name: who }),
    style: `--h:${hueOf(g.from.pid ?? g.from.name ?? g.id)}` }, title, stage, hint, go);
  document.body.append(root);
  holdPage(true);
  const prevFocus = document.activeElement as HTMLElement | null;

  return new Promise<boolean>((done) => {
    let opened = false, taps = 0, finished = false;
    let server: Promise<boolean> | null = null;
    const openIt = () => (server ??= (o.open ?? (async () => (await import('../together/lightGifts')).openGift(g)))().catch((e) => { toast((e as Error).message); return false; }));
    const close = (ok: boolean) => {
      if (finished) return; finished = true;
      const end = () => { root.remove(); holdPage(false); prevFocus?.focus?.(); done(ok); };
      if (still) end(); else root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in' }).finished.then(end, end);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !server) { e.preventDefault(); close(false); } };
    root.addEventListener('keydown', onKey);

    // 1 · the sender walks in carrying it, and hands it over.
    const enter = () => {
      if (still) return;
      root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
      const s = sender.getBoundingClientRect(), b = gift.getBoundingClientRect();
      const dx = s.left + s.width * 0.72 - (b.left + b.width / 2), dy = s.top + s.height * 0.62 - (b.top + b.height / 2);
      const walk = 620 + t * 120, from = -(s.right + 40);
      // Heavier gifts make the walk a little slower and bouncier.
      const bob = 5 + t * 2;
      sender.animate(Array.from({ length: 9 }, (_, i) => ({ transform: `translate(${(from * (1 - i / 8) ** 2).toFixed(1)}px, ${(-Math.abs(Math.sin(i * 1.1)) * bob).toFixed(1)}px)` })),
        { duration: walk, easing: 'linear', fill: 'backwards' });
      const k0 = 0.42;
      const carry: Keyframe[] = Array.from({ length: 9 }, (_, i) => ({ transform: `translate(${(dx + from * (1 - i / 8) ** 2).toFixed(1)}px, ${(dy - Math.abs(Math.sin(i * 1.1)) * bob).toFixed(1)}px) scale(${k0})` }));
      // The hand-over: an arc up and into the middle, growing to its size.
      const arc: Keyframe[] = Array.from({ length: 13 }, (_, i) => {
        const q = i / 12, e = 1 - (1 - q) ** 2;
        return { transform: `translate(${(dx * (1 - e)).toFixed(1)}px, ${(dy * (1 - e) - Math.sin(q * Math.PI) * (70 + t * 18)).toFixed(1)}px) scale(${(k0 + (1 - k0) * e).toFixed(3)}) rotate(${(Math.sin(q * Math.PI) * -8).toFixed(1)}deg)` };
      });
      const hand = 460 + t * 60;
      const total = walk + 160 + hand;
      gift.animate([...carry, carry[8], ...arc], { duration: total, easing: 'linear', fill: 'backwards' });
      setTimeout(() => { act?.wave(1300); sfx.whoosh(); }, walk + 60);
      setTimeout(() => {
        squash(wrap, 0.16 + t * 0.05);
        sfx.tap(0.15, t); haptic(10 + t * 4);
        hint.classList.add('on');
        // The cheer at the end is worked out now, while the gift waits for its tap.
        if (act && !slow) void import('./rig').then((m) => { const w = () => m.warmGesture('cheer'); if ('requestIdleCallback' in window) requestIdleCallback(w, { timeout: 2000 }); else setTimeout(w, 400); });
      }, total);
      hint.animate([{ opacity: 0 }, { opacity: 0 }, { opacity: 1 }], { duration: total + 300, fill: 'backwards' });
    };

    // 2 · taps: it shakes, the ribbon loosens, light leaks out; the last tap opens it.
    gift.addEventListener('click', () => {
      if (opened) return;
      taps++;
      void openIt();
      const need = still ? 1 : TAPS[t];
      const q = taps / need;
      haptic(8 + t * 3);
      if (taps < need) {
        wobble(wrap, 1.6 + t * 0.5);
        sfx.tap(q, t);
        glow.style.opacity = String(0.25 + q * 0.35);
        parts.bow.animate([{ transform: 'none' }, { transform: `translateY(${-3 * taps}px) scale(${1 + 0.06 * taps})` }], { duration: 160, fill: 'forwards', easing: 'ease-out' });
        hint.textContent = nwt('nw.giftMore');
        return;
      }
      opened = true;
      hint.classList.remove('on');
      hint.textContent = '';
      void burst();
    });

    // 3 · it opens, in its own way.
    const ms = (x: number) => (still ? 0 : x);
    const anim = (el: Element | undefined, k: Keyframe[], d: number, delay = 0, easing = 'cubic-bezier(.2,.7,.3,1)') =>
      el && !still ? el.animate(k, { duration: d, delay, easing, fill: 'forwards' }) : el ? (Object.assign((el as HTMLElement).style, k[k.length - 1]), null) : null;
    const burst = async () => {
      sfx.open(t >= 2 ? t - 1 : 0, t);
      haptic(t >= 2 ? 30 : 18);
      glow.style.opacity = '1';
      if (t === 0) {
        anim(parts.bow, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-34px) scale(1.5) rotate(25deg)', opacity: 0 }], 360);
        anim(parts.lid, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-60px) rotate(-14deg)', opacity: 0 }], 420, 60);
        anim(parts.fl, [{ transform: 'none' }, { transform: 'translate(-18px, 30px) rotate(-62deg)', opacity: 0.9 }], 520, 120);
        anim(parts.fr, [{ transform: 'none' }, { transform: 'translate(18px, 30px) rotate(62deg)', opacity: 0.9 }], 520, 140);
      } else if (t === 1) {
        anim(parts.bow, [{ transform: 'none', opacity: 1 }, { transform: 'translate(-30px, -150px) rotate(-50deg)', opacity: 0 }], 620);
        anim(parts.lid, [{ transform: 'none', opacity: 1 }, { transform: 'translate(10px, -60px) rotate(8deg)', opacity: 1, offset: 0.3 }, { transform: 'translate(90px, -230px) rotate(38deg)', opacity: 0 }], 720, 40, 'cubic-bezier(.2,.6,.4,1)');
      } else if (t === 2) {
        anim(parts.bow, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-40px) scale(1.7) rotate(200deg)', opacity: 0 }], 700);
        anim(parts.lid, [{ transform: 'none' }, { transform: 'translateY(-70px) rotate(-6deg)', offset: 0.45 }, { transform: 'translate(-40px, -190px) rotate(-16deg)', opacity: 0 }], 1100, 160, 'ease-out');
        anim(rays, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 0.9, transform: 'scale(1)' }], 700, 240);
      } else {
        anim(parts.bow, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-110px) scale(.25)', opacity: 0 }], 620);
        anim(parts.lid, [{ transform: 'none' }, { transform: 'translateY(-210px) rotate(4deg)', opacity: 0 }], 900, 220, 'ease-in-out');
        // The front opens like two petals, with an overshoot.
        const petal = (deg: number): Keyframe[] => [{ transform: 'none' }, { transform: `rotate(${deg * 1.12}deg)`, offset: 0.7 }, { transform: `rotate(${deg}deg)` }];
        anim(parts.fl, petal(-84), 900, 520, 'cubic-bezier(.3,.6,.4,1)');
        anim(parts.fr, petal(84), 900, 540, 'cubic-bezier(.3,.6,.4,1)');
        if (pillar) anim(pillar, [{ opacity: 0, transform: 'scaleY(0)' }, { opacity: 1, transform: 'scaleY(1)' }], 700, 520);
        anim(rays, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)' }], 900, 640);
      }
      flare(stage, ([1, 2, 3, 4] as const)[t], { y: gift.offsetTop + gift.offsetHeight / 2, size: Math.min(520, stage.clientWidth * 1.2), under: true, hold: t >= 2 ? 0 : 2600 });
      if (parts.mouth) anim(parts.mouth, [{ opacity: 0 }, { opacity: 1 }], 200, t === 1 ? 140 : 260);
      if (t < 2) anim(rays, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 0.55, transform: 'scale(1)' }], 600, 200);
      if (!slow && !still) rays.classList.add('turn');
      const ok = await openIt();
      if (!ok) {
        // Opened already (another phone) or it could not be opened now.
        title.textContent = nwt('nw.giftGone');
        go.classList.add('on'); go.tabIndex = 0; go.textContent = nwt('nw.continue');
        go.onclick = () => close(false);
        go.focus();
        return;
      }
      await new Promise((r) => setTimeout(r, ms([360, 380, 620, 1100][t])));
      // 4 · what it holds rises out of it; confetti; the sender cheers. Spread over three frames, so no frame of a
      // slow phone carries it all.
      const frame = () => new Promise((r) => (still ? r(0) : requestAnimationFrame(() => r(0))));
      loot.classList.add('on');
      title.textContent = nwt('nw.giftLove', { name: who });
      sfx.pop(0, t >= 2); setTimeout(() => sfx.shimmer(), ms(160));
      if (!still) loot.animate([{ transform: 'translateY(60px) scale(.3)', opacity: 0 }, { transform: 'translateY(-8px) scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }],
        { duration: 520 + t * 60, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
      if (piece) popIn(piece.art as Element);
      await frame();
      const bits = conf.children, nb = bits.length;
      const fly = (from: number, to: number) => {
        for (let i = from; i < to; i++) {
          const a = (i / nb) * Math.PI * 2 + i * 0.37, r = 120 + (i % 4) * 34 + t * 22;
          const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.8 - 70, rot = (i * 97) % 360;
          bits[i].animate([{ transform: 'translate(0,0) rotate(0) scale(.4)', opacity: 1 },
            { transform: `translate(${x | 0}px, ${y | 0}px) rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.55 },
            { transform: `translate(${(x * 1.1) | 0}px, ${(y + 170) | 0}px) rotate(${rot + 160}deg) scale(.9)`, opacity: 0 }],
          { duration: 1300 + (i % 3) * 160, delay: (i % 5) * 18, easing: 'cubic-bezier(.15,.7,.4,1)', fill: 'both' });
        }
      };
      if (!still) { fly(0, nb >> 1); await frame(); fly(nb >> 1, nb); }
      if (!piece) tick(count, g.light, { prefix: '+', ms: 500 + t * 220, onPop: () => haptic(4) });
      await frame();
      // Old phones: the star face and a hop instead of the full cheer (the rig's arms are the costliest part).
      if (slow) { act?.hop(0.6); act?.face('star', 1900); } else { act?.cheer(1900); act?.face('star', 1900); }
      setTimeout(() => {
        go.classList.add('on'); go.tabIndex = 0;
        if (!still) popIn(go);
        go.focus({ preventScroll: true });
      }, ms(700 + t * 150));
    };
    go.onclick = async () => {
      haptic(8);
      if (g.light > 0 && !g.item) { try { (await import('./celebrate')).flyLight(count, Math.min(4, t + 1)); } catch { /* no Light chip on screen */ } }
      close(true);
    };
    requestAnimationFrame(enter);
  });
}

/** Opens every gift waiting, one after another (from a notification, the inbox or Me). */
export async function openWaitingGifts(): Promise<number> {
  const { myGifts } = await import('../together/lightGifts');
  const list = await myGifts().catch((e) => { toast((e as Error).message); return null; });
  if (!list) return 0;
  if (!list.length) { toast(nwt('nw.giftNone')); return 0; }
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    if (await playGift(list[i], { next: i < list.length - 1 })) n++;
    else break;
  }
  window.dispatchEvent(new Event('gifts-changed'));
  return n;
}
