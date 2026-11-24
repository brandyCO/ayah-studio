// Seven days of gifts (owner request 2026-11-24, "a 7 days of a week popup where each day gives something, like many
// of the 4X games"): seven tiles, days 1–6 in two rows and day 7 a wide tile with the biggest chest. Taken tiles carry
// a gold stamp, today's glows with Claim, the rest wait with their prize shown (never random). It pops up when the app
// opens until today's gift is taken, Me has a small card, Settings and the onboarding show it. Claiming plays the chest
// moment with exactly what the tile showed, then the calendar comes back with the stamp landing; a gift that opens the
// shop, the room or the wardrobe plays that unlock moment after it. Data: src/data/weekGift.ts.
import './weekGifts.css';
import { claimGift, giftsOn, giftView, type Prize } from '../data/weekGift';
import { daysOpened, markRevealed, type Reveal } from '../data/reveal';
import { fe } from '../i18n/front';
import { locale } from '../i18n';
import { rt } from '../i18n/ranks';
import { chestArt, chestTier } from './chest';
import { h, haptic } from './dom';
import { freezeArt } from './flat';
import { icon } from './icons';
import { popIn, reduced, rise, squash, stagger } from './juice';
import { avatar } from './rankAvatars';
import { myFigureCode } from './actor';
import { tileArt } from './roomShop';
import { pieceArt } from './wardrobeCard';

/** The prize's picture: a chest sized by its Light, or the piece itself. */
function prizeArt(p: Prize, big = false): HTMLElement {
  const box = h('span', { class: 'gw-art', 'aria-hidden': 'true' });
  if (p.room) box.innerHTML = tileArt('plant', p.room);
  else if (p.piece) box.append(pieceArt(p.piece, big ? 72 : 52));
  else if (p.freeze) box.append(freezeArt());
  else box.append(chestArt(chestTier(p.light ?? 0)));
  return box;
}
function prizeLabel(p: Prize): string {
  if (p.room) return rt(`rs.i.${p.room}` as 'rs.i.palm');
  if (p.piece) return rt(`fb.${p.piece.replace(':', '.')}` as 'fb.hold.5');
  if (p.freeze) return fe('wg.freeze');
  return fe('wg.light', { n: p.light ?? 0 });
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
    const extras = p.frame && last ? h('span', { class: 'gw-extra' }, avatar(0, 0, 34, +p.frame.split(':')[1], myFigureCode()), h('small', {}, `+ ${fe('wg.frame')}`)) : '';
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

function lootOf(p: Prize): import('./celebrate').Loot[] {
  const loot: import('./celebrate').Loot[] = [];
  if (p.light) loot.push({ kind: 'light', n: p.light });
  if (p.freeze) loot.push({ kind: 'freeze' });
  if (p.room || p.piece) loot.push({ kind: 'item', art: prizeArt(p), label: prizeLabel(p) });
  if (p.frame) loot.push({ kind: 'item', art: avatar(0, 0, 56, +p.frame.split(':')[1], myFigureCode()), label: fe('wg.frame'), rare: true });
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
    await celebrate({ kind: 'chest', title: dayName(got.first, got.day - 1), sub: fe(last ? (got.first ? 'wg.lastSub' : 'wg.fridaySub') : 'wg.chestSub'),
      kicker: fe('wg.title'), loot: lootOf(got.prize) }, null, got.prize.light ?? 0);
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

