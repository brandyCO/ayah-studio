// Seven days of gifts (owner request 2026-11-24, "a 7 days of a week popup where each day gives something, like many
// of the 4X games"): seven tiles, days 1–6 in two rows and day 7 a wide tile with the biggest chest. Taken tiles carry
// a gold stamp, today's glows with Claim, the rest wait with their prize shown (never random). It pops up when the app
// opens until today's gift is taken, Me has a small card, Settings and the onboarding show it. Claiming plays the chest
// moment with exactly what the tile showed, then the calendar comes back with the stamp landing; a gift that opens the
// shop, the room or the wardrobe plays that unlock moment after it. Data: src/data/weekGift.ts.
import './weekGifts.css';
import { claimGift, giftsOn, giftView, jumuahPiece, lanternsLit, lanternsNeed, type Prize } from '../data/weekGift';
import { daysOpened, markRevealed, type Reveal } from '../data/reveal';
import { fe } from '../i18n/front';
import { locale } from '../i18n';
import { rt } from '../i18n/ranks';
import { chestArt, chestTier } from './chest';
import { h, haptic } from './dom';
import { freezeArt } from './flat';
import { icon } from './icons';
import { popIn, reduced, rise, squash, stagger } from './juice';
import { avatar, lookName } from './rankAvatars';
import { myFigureCode } from './actor';
import { tileArt } from './roomShop';
import { pieceArt } from './wardrobeCard';

const NS = 'http://www.w3.org/2000/svg';
/** A small paper lantern, lit (warm glow and flame) or waiting (grey). Friday's six, and the lamp refill's picture. */
function lantern(lit: boolean, size = 18): SVGSVGElement {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 30');
  s.setAttribute('width', String(size));
  s.setAttribute('height', String(Math.round(size * 1.25)));
  s.setAttribute('aria-hidden', 'true');
  const [b, sh, w] = lit ? ['#ffcf55', '#d39a26', '#fff3c2'] : ['#b9b2cc', '#8e86a6', '#ddd8ea'];
  s.innerHTML = `${lit ? '<circle cx="12" cy="16" r="11" fill="#ffd27a" opacity=".45"/>' : ''}`
    + `<path d="M8 6.5h8l-1.2 3H9.2z" fill="${sh}"/><path d="M10.6 3.2h2.8v3.3h-2.8z" fill="${sh}"/>`
    + `<path d="M7.6 9.5h8.8c.9 0 1.4.5 1.4 1.4v9.6c0 1.3-1 2.3-2.3 2.3H8.5c-1.3 0-2.3-1-2.3-2.3v-9.6c0-.9.5-1.4 1.4-1.4z" fill="${b}"/>`
    + `<path d="M8.8 11.4h6.4v8.8c0 .6-.4 1-1 1h-4.4c-.6 0-1-.4-1-1z" fill="${w}"/>`
    + (lit ? '<path d="M12 12.6c1.6 1.8 2.3 3.2 2.3 4.6a2.3 2.3 0 0 1-4.6 0c0-1.4.7-2.8 2.3-4.6z" fill="#ff8a2e"/><path d="M12 15.6c.7.8 1 1.4 1 2a1 1 0 0 1-2 0c0-.6.3-1.2 1-2z" fill="#ffe27a"/>' : '')
    + `<path d="M6.6 22.8h10.8l1 2.4H5.6z" fill="${sh}"/>`;
  return s;
}
const frameNo = (id: string) => +id.split(':')[1];
const frameArtEl = (id: string, size: number) => avatar(0, 0, size, frameNo(id), myFigureCode());
const frameLabel = (id: string) => lookName('frame', frameNo(id), document.documentElement.lang === 'ar') ?? fe('wg.frame');

/** The prize's picture: a chest sized by its Light, or the piece itself. */
function prizeArt(p: Prize, big = false): HTMLElement {
  const box = h('span', { class: 'gw-art', 'aria-hidden': 'true' });
  if (p.room) box.innerHTML = tileArt('plant', p.room);
  else if (p.piece) box.append(pieceArt(p.piece, big ? 72 : 52));
  else if (p.freeze) box.append(freezeArt());
  else if (p.lamps) box.append(h('span', { class: 'gw-lamps' }, lantern(true, 22), lantern(true, 30), lantern(true, 22)));
  else if (p.boost) box.append(h('span', { class: 'gw-x2' }, '×2'));
  else if (p.jumuah) box.append(h('span', { class: 'gw-jm' }, chestArt(4), h('span', { class: 'gw-jm-piece' }, frameArtEl(jumuahPiece(), 54))));
  else box.append(chestArt(chestTier(p.light ?? 0)));
  return box;
}
function prizeLabel(p: Prize): string {
  if (p.room) return rt(`rs.i.${p.room}` as 'rs.i.palm');
  if (p.piece) return rt(`fb.${p.piece.replace(':', '.')}` as 'fb.hold.5');
  if (p.freeze) return fe('wg.freeze');
  if (p.lamps) return fe('wg.lamps');
  if (p.boost) return fe('wg.boost', { n: p.boost });
  return fe('wg.light', { n: p.light ?? 0 });
}
/** Friday's tile: the week's piece and a freeze, and the six lanterns the days before it light. */
function fridayExtras(state: string): HTMLElement {
  const lit = lanternsLit(), need = lanternsNeed();
  const row = h('span', { class: 'gw-six' }, ...Array.from({ length: 6 }, (_, i) => {
    const off = i < 6 - need; // days before the calendar began this week: not asked for
    return h('i', { class: off ? 'off' : i - (6 - need) < lit ? 'lit' : '' }, lantern(!off && i - (6 - need) < lit, 16));
  }));
  const full = need > 0 && lit >= need;
  return h('span', { class: `gw-fri${full ? ' full' : ''}` },
    h('small', { class: 'gw-plus' }, `+ ${frameLabel(jumuahPiece())} · ${fe('wg.freeze')}`),
    state === 'got' ? '' : row,
    state === 'got' ? '' : h('small', { class: 'gw-six-t' }, full ? fe('wg.sixDone') : fe('wg.sixLeft', { n: Math.max(0, need - lit) })));
}

/** The tile's name: "Day 3" in the first week, the weekday after it (Friday called Jumu'ah). */
function dayName(first: boolean, i: number): string {
  if (first) return fe('wg.day', { n: i + 1 });
  if (i === 6) return fe('wg.friday');
  const d = new Date(2026, 10, 21 + i); // 21 Nov 2026 was a Saturday
  return new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(d);
}

/** The grid (the sheet, Me's card and the onboarding use it). `stamp`: the tile whose stamp lands now. */
export function giftGrid(opt: { onClaim?: (tile: HTMLElement) => void; stamp?: number; small?: boolean } = {}): HTMLElement {
  const v = giftView();
  const tiles = v.prizes.map((p, i) => {
    const state = v.states[i];
    const today = state === 'today';
    const last = i === 6;
    const extras = p.frame && last ? h('span', { class: 'gw-extra' }, frameArtEl(p.frame, 34), h('small', {}, `+ ${fe('wg.frame')}`))
      : p.jumuah ? fridayExtras(state) : '';
    const t = h(today && opt.onClaim ? 'button' : 'div', { class: `gw-tile s-${state}${last ? ' d7' : ''}${!v.first && last ? ' jumua' : ''}` },
      h('small', { class: 'gw-day' }, dayName(v.first, i)),
      prizeArt(p, last),
      h('b', { class: 'gw-name' }, prizeLabel(p)),
      extras,
      p.opens ? h('span', { class: 'gw-opens' }, fe(`wg.opens.${p.opens}`)) : '',
      today ? h('span', { class: 'gw-claim' }, fe('wg.claim')) : '',
      state === 'missed' ? h('span', { class: 'gw-missed' }, fe('wg.missed')) : '',
      state === 'got' ? h('span', { class: `gw-stamp${opt.stamp === i ? ' land' : ''}` }, icon('check', 20)) : '');
    if (today && opt.onClaim) t.addEventListener('click', () => opt.onClaim!(t));
    return t;
  });
  return h('div', { class: `gw-grid${opt.small ? ' small' : ''}` }, ...tiles);
}

function lootOf(p: Prize, got: { light: number; piece: string | null; full: boolean }): import('./celebrate').Loot[] {
  const loot: import('./celebrate').Loot[] = [];
  if (got.light) loot.push({ kind: 'light', n: got.light });
  if (p.freeze || got.full) loot.push({ kind: 'freeze' });
  if (p.room || p.piece) loot.push({ kind: 'item', art: prizeArt(p), label: prizeLabel(p) });
  if (p.lamps) loot.push({ kind: 'item', art: h('span', { class: 'gw-lamps' }, lantern(true, 22), lantern(true, 30), lantern(true, 22)), label: fe('wg.lamps') });
  if (p.boost) loot.push({ kind: 'item', art: h('span', { class: 'cel-x2' }, '×2'), label: fe('wg.boost', { n: p.boost }), rare: true });
  if (p.frame) loot.push({ kind: 'item', art: frameArtEl(p.frame, 56), label: frameLabel(p.frame), rare: true });
  if (got.piece) loot.push({ kind: 'item', art: frameArtEl(got.piece, 60), label: frameLabel(got.piece), rare: true });
  return loot;
}

function openUnlock(k: Reveal) {
  const done = () => markRevealed(k);
  const go = () => {
    done();
    if (k === 'shop') void import('./shop').then((m) => m.openShop());
    else if (k === 'room') location.hash = '#/me/room';
    else void import('./figureBuilder').then((b) => {
      let code: string | null = null;
      try { code = localStorage.getItem('rankFigure') || null; } catch { /* ignore */ }
      b.openBuilder({ figure: code, wins: 0 }, () => undefined, 'wardrobe');
    });
  };
  try {
    const played: string[] = JSON.parse(localStorage.getItem('unlockPlayed') ?? '[]');
    if (played.includes(k)) return;
    localStorage.setItem('unlockPlayed', JSON.stringify([...played, k]));
  } catch { /* storage blocked */ }
  void import('./unlock').then((m) => m.playUnlock(k, go, done));
}

/** The calendar sheet. `stamp`: the day just claimed (its stamp lands); `after`: run when it closes. */
export function openWeekGifts(stamp?: number, after?: () => void) {
  if (document.querySelector('dialog.gw')) return;
  const v = giftView();
  const close = () => { haptic(8); d.close(); };
  const claim = async (tile: HTMLElement) => {
    const got = claimGift();
    if (!got) return;
    haptic(14);
    squash(tile);
    const { celebrate } = await import('./celebrate');
    d.close();
    const last = got.day === 7;
    await celebrate({ kind: 'chest', title: dayName(got.first, got.day - 1), sub: fe(last ? (got.first ? 'wg.lastSub' : got.full ? 'wg.fridaySub' : 'wg.fridayPart') : 'wg.chestSub'),
      kicker: fe('wg.title'), loot: lootOf(got.prize, got) }, null, got.light);
    openWeekGifts(got.day - 1, got.prize.opens ? () => openUnlock(got.prize.opens!) : undefined);
  };
  const grid = giftGrid({ onClaim: (t) => void claim(t), stamp });
  const btn = v.ready
    ? h('button', { class: 'primary brand-btn gw-go', onclick: () => { const t = grid.querySelector<HTMLElement>('.s-today'); if (t) void claim(t); } }, fe('wg.claimToday'))
    : h('button', { class: 'primary brand-btn gw-go', onclick: close }, fe('wg.tomorrow'));
  const d = h('dialog', { class: 'gw', 'aria-label': fe('wg.title') },
    h('div', { class: 'gw-card' },
      h('button', { class: 'icon-btn gw-x', 'aria-label': fe('co.close'), onclick: close }, icon('close', 22)),
      h('header', { class: 'gw-head' },
        h('span', { class: 'gw-ribbon' }, fe(v.first ? 'co.title' : 'wg.thisWeek')),
        h('h2', {}, fe('wg.title')),
        h('p', {}, fe(v.first ? 'wg.sub' : 'wg.subWeek'))),
      grid,
      h('footer', { class: 'gw-foot' }, btn))) as HTMLDialogElement;
  d.addEventListener('close', () => { d.remove(); after?.(); });
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  window.addEventListener('hashchange', () => d.open && d.close(), { once: true });
  document.body.append(d);
  d.showModal();
  if (!reduced()) {
    popIn(d.querySelector('.gw-card')!);
    const tiles = [...grid.children] as HTMLElement[];
    requestAnimationFrame(() => stagger(tiles, (el, delay) => rise(el, 14, { delay, feel: 'bouncy' }), 45, 120));
  }
  if (stamp) void import('./sfx').then((m) => setTimeout(() => m.sfx.pop?.(), 420));
}

/** Me's card: the seven tiles as dots, today's waiting or the next one coming. */
export function weekGiftCard(): HTMLElement | '' {
  giftsOn(daysOpened());
  const v = giftView();
  const dots = v.states.map((st) => h('i', { class: st }));
  const next = v.states.findIndex((st) => st === 'later');
  const show = v.ready ? v.at : next >= 0 ? next : 6;
  return h('button', { class: `me-card gw-card-me${v.ready ? ' ready' : ''}`, onclick: () => openWeekGifts() },
    h('span', { class: 'gw-me-art' }, prizeArt(v.prizes[show])),
    h('span', { class: 'gw-me-txt' },
      h('small', {}, fe('wg.title')),
      h('b', {}, v.ready ? fe('wg.waiting') : fe('wg.next', { day: dayName(v.first, show) })),
      h('span', { class: 'gw-dots', 'aria-hidden': 'true' }, ...dots)),
    v.ready ? h('span', { class: 'gw-claim' }, fe('wg.claim')) : icon('right', 18));
}

/** When the app opens (and on each return, once a day at most per launch): the calendar, while today's gift waits. */
let shownDay = '';
export function maybeWeekGifts(tries = 4) {
  if (!giftsOn(daysOpened()) || !giftView().ready) return;
  const day = new Date().toDateString();
  if (shownDay === day) return;
  const busy = document.hidden || /^#\/(reel|kids|t\/)/.test(location.hash) || document.querySelector('dialog[open], .cel, .ul');
  if (busy) { if (tries > 0) setTimeout(() => maybeWeekGifts(tries - 1), 4000); return; }
  shownDay = day;
  openWeekGifts();
}

