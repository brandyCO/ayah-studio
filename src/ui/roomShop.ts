// Decorate your room (owner pick 2026-11-10, round 3): a sheet with the room itself on top, so each piece is
// seen in its place, then a tab per place (plant, corner, rug, curtains, lantern) and its pieces: tap one you
// have to put it in, tap one you don't to get it for its Light (asked once), the prize lanterns show how they are
// won. The room on Me follows at once (`onChange`).
import { limitedIn, limitedNow, thisWeek } from '../data/limited';
import { icon } from './icons';
import { ROOM_ITEMS, SLOTS, buyRoom, ownsRoom, roomLook, setRoomLook, type RoomItem, type Slot } from '../data/roomItems';
import { wallet } from '../data/garden';
import { streak } from '../data/journey';
import { seasonNow } from '../data/wardrobe';
import { rt, type RankKey } from '../i18n/ranks';
import { t } from '../i18n';
import { SLOT_BOX, itemArt, rugTop } from './roomArt';
import { backSvg, specialNow } from './room';
import { reduced } from './juice';
import { actor } from './actor';
import { h, haptic, toast } from './dom';
import { sfx } from './sfx';

const GLOW = '<defs><radialGradient id="rmglow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient><clipPath id="rmglass"><path d="M33 98V54Q33 33 64 33Q95 33 95 54V98Z"/></clipPath></defs>';
export function tileArt(slot: Slot, id: string | null): string {
  // A rug is shown from above on the floor, so its whole design shows (in the room it lies in perspective).
  if (slot === 'rug') return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="100" height="100" fill="#c99a6a"/>${[20, 40, 60, 80].map((y) => `<path d="M0 ${y}H100" stroke="#b8885a" stroke-width="1"/>`).join('')}${rugTop(id ?? undefined)}</svg>`;
  const [x, y, w, hh] = SLOT_BOX[slot];
  const wall = `<rect x="${x - 200}" y="${y - 200}" width="${w + 400}" height="${346 - y}" fill="#f3e2c7"/><rect x="${x - 200}" y="146" width="${w + 400}" height="260" fill="#c99a6a"/>`;
  const win = slot === 'curtain' || slot === 'view' ? '<path d="M26 104V52Q26 26 64 26Q102 26 102 52V104Z" fill="#c08a52"/><path d="M33 98V54Q33 33 64 33Q95 33 95 54V98Z" fill="#9fd8ff"/>' : '';
  const art = id ? itemArt(id, slot, false, true) : '';
  return `<svg viewBox="${x} ${y} ${w} ${hh}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${GLOW}${wall}${win}${art}</svg>`;
}
const name = (id: string) => rt(`rs.i.${id}` as RankKey);

export function openRoomShop(onChange: () => void, sit: string | null = null, opt: { slot?: Slot; inRoom?: boolean } = {}) {
  // In the full-screen room the panel sits low over the room itself, so it shows no room of its own.
  let slot: Slot = opt.slot ?? 'plant';
  const close = () => d.close();
  const hr = new Date().getHours();
  const sky = hr >= 5 && hr < 8 ? 'dawn' : hr >= 8 && hr < 16 ? 'day' : hr >= 16 && hr < 19 ? 'dusk' : 'night';
  const view = h('div', { class: 'rs-view' });
  const purse = h('span', { class: 'rs-purse' });
  const tabs = h('div', { class: 'rs-tabs', role: 'tablist' });
  const grid = h('div', { class: 'rs-grid' });
  const season = seasonNow();
  const d = h('dialog', { class: `sheet bottom rs-sheet${opt.inRoom ? ' in-room' : ''}` },
    h('div', { class: 'sheet-head' }, h('h2', {}, rt('rs.title')), purse, h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕')),
    opt.inRoom ? '' : view,
    season ? h('p', { class: 'small rs-season' }, rt('rs.season', { name: rt(`rs.s.${season}` as RankKey) })) : '',
    tabs, grid,
    h('p', { class: 'muted small rs-sub' }, rt('rs.sub')));
  const full = opt.inRoom ? document.querySelector('.rm-full') : null;
  full?.classList.add('decorating');
  d.addEventListener('close', () => { d.remove(); full?.classList.remove('decorating'); });
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  window.addEventListener('hashchange', close, { once: true });

  const paint = () => {
    const look = roomLook();
    const svg = backSvg(sky, Math.max(streak().best, streak().days), false, look, season, reduced(), { days: streak().days, special: specialNow() });
    const old = view.querySelector('.rm-back');
    if (opt.inRoom) { /* the room behind follows through onChange */ } else if (old) old.outerHTML = svg;
    else {
      view.innerHTML = svg;
      const a = actor('rm-actor', sit);
      if (a) view.append(h('span', { class: 'rm-cushion', 'aria-hidden': 'true' }), a.el);
    }
    purse.textContent = `✦ ${wallet()}`;
    tabs.replaceChildren(...SLOTS.map((s) => h('button', { class: `chip${s === slot ? ' on' : ''}`, role: 'tab', 'aria-selected': String(s === slot),
      onclick: () => { slot = s; paint(); } }, rt(`rs.${s}` as RankKey))));
    const items = ROOM_ITEMS.filter((i) => i.slot === slot);
    const cur = look[slot] ?? null;
    const none = h('button', { class: `rs-tile${cur ? '' : ' on'}`, type: 'button', onclick: () => put(null) },
      h('span', { class: 'rs-art' }), h('span', { class: 'rs-name' }, slot === 'rug' || slot === 'wall' || slot === 'floor' || slot === 'view' ? rt('rs.default') : rt('rs.none')));
    none.querySelector('.rs-art')!.innerHTML = tileArt(slot, null);
    grid.replaceChildren(none, ...items.map((it) => tile(it, cur === it.id)));
  };
  // Friends see the room on a visit: what changed goes up a few seconds after the last change.
  let sendT = 0;
  const share = () => { clearTimeout(sendT); sendT = window.setTimeout(() => void import('../together/ranks').then((m) => m.sendRoom()), 3000); };
  const put = (id: string | null) => {
    setRoomLook(slot, id);
    haptic(6); sfx.tick();
    paint(); onChange(); share();
  };
  const tile = (it: RoomItem, on: boolean) => {
    const own = ownsRoom(it);
    // A limited piece is sold only in its week; the rest of the time it says when it comes back.
    const away = !!it.limited && limitedNow(thisWeek()) !== `rm:${it.id}`;
    const n = it.limited ? limitedIn(`rm:${it.id}`, thisWeek()) : -1;
    const back = n === 1 ? rt('rs.limNext') : rt('rs.limBack', { n });
    const el = h('button', { class: `rs-tile r-${it.r}${on ? ' on' : ''}${own ? '' : ' locked'}`, type: 'button',
      onclick: () => (own ? put(it.id) : it.win ? toast(rt(`rs.win${it.win}` as RankKey)) : away ? toast(back) : void ask(it)) },
      h('span', { class: 'rs-rar' }, rt(`rs.r.${it.r}` as RankKey)),
      h('span', { class: 'rs-art' }),
      h('span', { class: 'rs-name' }, name(it.id)),
      own ? '' : it.win ? h('span', { class: 'rs-how' }, rt(`rs.win${it.win}` as RankKey)) : away ? h('span', { class: 'rs-how' }, icon('lock', 18), back)
        : h('span', { class: 'rs-price' }, `✦ ${it.price}`, it.limited ? h('small', {}, ` · ${rt('rs.limNow')}`) : ''));
    el.querySelector('.rs-art')!.innerHTML = tileArt(it.slot, it.id);
    return el;
  };
  const ask = async (it: RoomItem) => {
    const left = wallet();
    if (left < (it.price ?? 0)) { toast(rt('rs.short', { n: (it.price ?? 0) - left })); return; }
    const q = h('dialog', { class: 'sheet rs-ask' },
      h('div', { class: 'rs-art big' }), h('p', {}, rt('rs.buy', { name: name(it.id), n: it.price ?? 0 })),
      h('div', { class: 'chips' }, h('button', { class: 'chip', onclick: () => q.close() }, t('common.cancel')),
        h('button', { class: 'primary brand-btn', onclick: () => {
          q.close();
          if (!buyRoom(it)) return;
          sfx.pop(); haptic(14);
          toast(rt('rs.got', { name: name(it.id) }));
          slot = it.slot; paint(); onChange(); share();
          (opt.inRoom ? document.querySelector('.rm-full .rm-back') : view.querySelector('svg'))?.animate([{ transform: 'scale(1.03)', filter: 'brightness(1.15)' }, { transform: 'none', filter: 'none' }], { duration: 500, easing: 'ease-out' });
        } }, rt('rs.buyGo'))));
    q.querySelector('.rs-art')!.innerHTML = tileArt(it.slot, it.id);
    q.addEventListener('close', () => q.remove());
    document.body.append(q);
    q.showModal();
  };
  document.body.append(d);
  paint();
  d.showModal();
}
