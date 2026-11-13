// The Light shop (owner request 2026-11-12, "a shop-like feeling … every single item, seasonal items that are not
// buyable at the moment"): one full-screen shop, opened from every Light chip and from Ranks. A lantern-lit stall on
// top with the Light to spend and the character at the counter; this week's prizes and the next season up front;
// then every piece the app has, by kind — power-ups, character parts, room pieces, avatars and frames (all for
// Light), and what can only be won (streaks, Ranks weeks, badges, seasons, app icons), locked with how and when
// it comes back. Tap a piece: a card with it large, and Get / Wear / Put in my room / Use. Never money, nothing random.
import './shop.css';
import { icon } from './icons';
import { sht, type ShopKey } from '../i18n/shop';
import { rt, type RankKey } from '../i18n/ranks';
import { bt, type BadgeKey } from '../i18n/badges';
import { t, timeLeft } from '../i18n';
import { h, haptic, toast } from './dom';
import { sfx } from './sfx';
import { reduced, popIn, squash, tick } from './juice';
import { star } from './lightChip';
import { freezeArt } from './flat';
import { avatar } from './rankAvatars';
import { DEFAULT, PIECES, bustMarkup, PRICE, PRIZE, WARDROBE, encode, figureSvg, options, parse, weekPiece, wearing, type Fig, type How, type Slot as FigSlot } from './figure';
import { ROOM_ITEMS, buyRoom, ownsRoom, roomLook, setRoomLook, type RoomItem } from '../data/roomItems';
import { tileArt } from './roomShop';
import { APP_ICONS, levelNeed, pickedIcon, tierRarity, unlockedIcons, type AppIconId } from './appIcons';
import { lampNext, lampOf } from '../data/shop';
import { lwt } from '../i18n/lampWall';
import { ITEMS, FREEZE_MAX, FREEZE_PRICE, bankedFreezes, buy, buyFreeze, limitedIn, limitedNow, owns, weekPrize, weeksUntil, won, type Item, type Wins } from '../data/shop';
import { shopAdd, shopHas, wallet } from '../data/garden';
import { ownsPiece, hijri, seasonNow, streakNeed } from '../data/wardrobe';
import { lightOn, stats, streak } from '../data/journey';
import { dayKey } from '../data/readLog';
import { rankWeek, weekEndAt } from '../data/rankDay';
import { myFigureCode } from './actor';
import type { Status } from '../together/ranks';

type Rar = 'common' | 'cute' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'prize';
type Sec = 'power' | 'char' | 'room' | 'look' | 'won' | 'season' | 'icons';
type State = 'own' | 'buy' | 'locked';
interface Ware {
  id: string; sec: Sec; name: string; rar: Rar; price?: number; for: ShopKey;
  /** Sold one week at a time (never on the stall). */
  lim?: boolean;
  /** On Today's stall: the price before the discount. */
  was?: number;
  /** Bought under this id (a stall price records it at the price paid). */
  store?: string;
  art: () => Node; state: () => State;
  /** Why it is locked, and a small line (when it comes back, progress). */
  how?: string; when?: () => string; progress?: () => [number, number] | null;
  doBuy?: () => boolean;
  /** What can be done with it once owned. */
  use?: { label: ShopKey; done: ShopKey; active: () => boolean; run: () => Promise<void> | void };
}

/** Today's three stall pieces: a fixed shuffle of every piece for Light, three a day, walked through in order so a
 *  piece comes round again only after all the others. */
function stallPick<T extends { id: string }>(pool: T[], now = new Date()): T[] {
  if (pool.length < 3) return [];
  const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : 1));
  let x = 7;
  for (let i = sorted.length - 1; i > 0; i--) { x = (x * 1103515245 + 12345) & 0x7fffffff; const j = x % (i + 1); [sorted[i], sorted[j]] = [sorted[j], sorted[i]]; }
  const day = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime() - Date.UTC(2026, 10, 12, 12)) / 864e5);
  const start = (((day * 3) % sorted.length) + sorted.length) % sorted.length;
  return [0, 1, 2].map((k) => sorted[(start + k) % sorted.length]);
}
const nf = () => new Intl.NumberFormat(document.documentElement.lang || undefined);
const num = (n: number) => nf().format(n);
const svgBox = (markup: string, cls = 'sh-svg') => { const s = h('span', { class: cls }); s.innerHTML = markup; return s; };

/** Days until a season comes round again (0 = on now), from the Umm al-Qura calendar; −1 when unknown. */
const seasonCache = new Map<string, number>();
function daysUntilSeason(how: How): number {
  const key = `${dayKey()}|${how}`;
  const kept = seasonCache.get(key);
  if (kept !== undefined) return kept;
  const now = new Date();
  let out = -1;
  for (let i = 0; i < 400; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, 12);
    const s = seasonNow(d);
    if (s === how || (how === 'qadr' && s === 'ramadan' && (hijri(d)?.day ?? 0) >= 21)) { out = i; break; }
  }
  seasonCache.set(key, out);
  return out;
}
const SEASONS: How[] = ['ramadan', 'qadr', 'fitr', 'hajj', 'adha'];
const isSeason = (how: How) => SEASONS.includes(how);
/** Weeks until a weekly prize piece comes round (0 = this week). */
function pieceWeeks(id: string, week: string): number {
  for (let i = 0; i < 6; i++) {
    const d = new Date(Date.parse(`${week}T12:00Z`) + i * 6048e5).toISOString().slice(0, 10);
    if (weekPiece(d) === id) return i;
  }
  return -1;
}
/** The character to show a part on: the user's own when it can wear it, else the default look that can. */
function figFor(piece: string): Fig | null {
  const [slot, v] = piece.split(':');
  const mine = parse(myFigureCode());
  for (const base of [mine, DEFAULT, { ...DEFAULT, body: 1 }, { ...DEFAULT, body: 2 }, { ...DEFAULT, body: 3 }]) {
    if (base && options(slot as FigSlot, base as Fig).includes(Number(v))) return wearing(base as Fig, piece);
  }
  return null;
}
const canWearNow = (piece: string) => { const [slot, v] = piece.split(':'); const mine = parse(myFigureCode()) ?? DEFAULT; return options(slot as FigSlot, mine).includes(Number(v)); };
const wearingNow = (piece: string) => { const [slot, v] = piece.split(':'); const mine = parse(myFigureCode()); return !!mine && mine[slot as FigSlot] === Number(v); };
/** A part shown where it is worn: a headpiece or glasses close on the head, a held thing at the hands, a background
 *  as the disc behind the bust, clothes on the whole character. */
const CROP: Partial<Record<string, string>> = { head: '38 0 124 124', glasses: '50 20 100 100', wrap: '38 0 124 124', hold: '40 140 120 116' };
const figArt = (piece: string) => () => {
  const f = figFor(piece);
  if (!f) return svgBox('', 'sh-svg fig');
  const slot = piece.split(':')[0];
  if (slot === 'bg') return svgBox(`<svg viewBox="2 2 36 36">${bustMarkup(f, 18)}</svg>`, 'sh-svg fig disc');
  const crop = CROP[slot];
  const svg = figureSvg(f, { still: true });
  return svgBox(crop ? svg.replace('viewBox="0 0 200 262"', `viewBox="${crop}"`) : svg, `sh-svg fig${crop ? ' crop' : ''}`);
};
/** A part's name as the builder shows it (the plain backgrounds are just "Background"). */
const partName = (piece: string) => { const [slot, v] = piece.split(':'); return slot === 'bg' && Number(v) < 8 ? rt('fb.tab.bg') : rt(`fb.${slot}.${v}` as RankKey); };
const partRar = (p: number): Rar => (p >= 150 ? 'epic' : p >= 100 ? 'rare' : 'common');
const RANK_RAR: Record<string, Rar> = { sun: 'epic', p1: 'legendary', p2: 'epic', p3: 'epic', w1: 'epic', w3: 'epic', w5: 'legendary', w10: 'mythic', week: 'legendary' };

export interface ShopOpts { focus?: Sec | 'featured'; onChange?: () => void; /** Choosing a piece to give a friend. */ giftTo?: { pid: string; name: string } }

/** Opens the shop full screen (Android back / ‹ close it). */
export async function openShop(o: ShopOpts = {}): Promise<void> {
  let status: Status | null = null;
  let wonItems: string[] = [];
  const signedIn = async () => !!(await import('../cloud/auth')).account();
  const wins = (): Wins => ({ bestTier: status?.bestTier ?? status?.tier ?? 0, bestPlace: status?.bestPlace ?? null, wins: status?.wins ?? 0, items: wonItems });
  const tier = () => status?.tier ?? 0;
  const week = () => status?.weekStart ?? rankWeek();

  // --- every piece the app has ---
  const wares = (): Ware[] => {
    const out: Ware[] = [];
    out.push({
      id: 'freeze', sec: 'power', name: rt('rk.freezeTitle'), rar: 'rare', price: FREEZE_PRICE, for: 'sh.forStreak',
      art: () => freezeArt(84) as unknown as Node,
      state: () => (bankedFreezes() >= FREEZE_MAX ? 'own' : 'buy'),
      when: () => sht('sh.kept', { n: bankedFreezes(), m: FREEZE_MAX }),
      doBuy: buyFreeze,
    });
    for (const [piece, price] of Object.entries(PRICE)) {
      out.push({
        id: `fg:${piece}`, sec: 'char', name: partName(piece), rar: partRar(price), price, for: 'sh.forChar', store: `fg:${piece}`,
        art: figArt(piece), state: () => (shopHas(`fg:${piece}`) ? 'own' : 'buy'),
        doBuy: () => wallet() >= price && shopAdd(`fg:${piece}`, price),
        use: { label: 'sh.wear', done: 'sh.worn', active: () => wearingNow(piece), run: () => wear(piece) },
      });
    }
    for (const it of ROOM_ITEMS) {
      const win = !!it.win;
      out.push({
        id: `rm:${it.id}`, sec: win ? 'won' : 'room', name: rt(`rs.i.${it.id}` as RankKey), rar: win ? (it.win === 1 ? 'legendary' : 'epic') : it.r === 'legendary' ? (it.price! >= 2000 ? 'mythic' : 'legendary') : it.r as Rar,
        price: it.price, for: 'sh.forRoom', art: () => svgBox(tileArt(it.slot, it.id), 'sh-svg room'), store: win ? undefined : `rm:${it.id}`,
        lim: !!it.limited,
        state: () => (ownsRoom(it) ? 'own' : win || (it.limited && limitedNow(week()) !== `rm:${it.id}`) ? 'locked' : 'buy'),
        how: win ? rt(`rs.win${it.win}` as RankKey) : it.limited ? sht('sh.limHow') : undefined,
        when: it.limited ? () => { if (ownsRoom(it)) return ''; const n = limitedIn(`rm:${it.id}`, week()); return n === 0 ? sht('sh.limLeft') : n === 1 ? sht('sh.nextWeek') : sht('sh.backWeeks', { n }); } : undefined,
        doBuy: () => buyRoom(it),
        use: { label: 'sh.place', done: 'sh.placed', active: () => roomLook()[it.slot] === it.id, run: () => placeRoom(it) },
      });
    }
    const lookUse = (it: Item): Ware['use'] => ({
      label: 'sh.use', done: 'sh.inUse',
      active: () => (it.kind === 'avatar' ? status?.avatar === it.ref && !status?.figure : status?.frame === it.ref),
      run: () => useLook(it),
    });
    const lookArt = (it: Item) => () => (it.kind === 'avatar' ? avatar(it.ref as number, tier(), 84)
      : avatar(status?.private ? 0 : status?.avatar ?? 0, tier(), 84, it.ref as number, status?.figure ?? myFigureCode()));
    for (const it of ITEMS) {
      if (it.kind === 'icon') continue;
      const name = it.kind === 'avatar' ? rt('rk.avatarN', { n: (it.ref as number) + 1 }) : rt('rk.frameN', { n: it.ref as number });
      if (it.limited) {
        const name2 = sht(`sh.lim.${it.ref}` as ShopKey);
        out.push({ id: it.id, sec: 'look', name: name2, rar: (it.price ?? 0) >= 1000 ? 'mythic' : 'legendary', price: it.price, for: 'sh.forBoards', art: lookArt(it),
          state: () => (shopHas(it.id) ? 'own' : limitedNow(week()) === it.id ? 'buy' : 'locked'),
          how: sht('sh.limHow'),
          when: () => { if (shopHas(it.id)) return ''; const n = limitedIn(it.id, week()); return n === 0 ? sht('sh.limLeft') : n === 1 ? sht('sh.nextWeek') : sht('sh.backWeeks', { n }); },
          doBuy: () => buy(it, week()), use: lookUse(it) });
      } else if (it.price) {
        out.push({ id: it.id, sec: 'look', name, rar: it.price >= 400 ? 'epic' : 'rare', price: it.price, for: 'sh.forBoards', art: lookArt(it), store: it.id,
          state: () => (owns(it.kind as 'avatar' | 'frame', it.ref as number, wins()) ? 'own' : 'buy'), doBuy: () => buy(it), use: lookUse(it) });
      } else if (it.win) {
        const w = it.win;
        out.push({ id: it.id, sec: 'won', name, rar: RANK_RAR[w], for: 'sh.forBoards', art: lookArt(it),
          state: () => (w === 'week' ? wonItems.includes(it.id) : won(w, wins())) ? 'own' : 'locked',
          how: w === 'week' ? (it.kind === 'avatar' ? `${sht('sh.first')} · ${rt('rk.win.week')}` : `${sht('sh.top23')} · ${rt('rk.win.week')}`) : rt(`rk.win.${w}` as RankKey),
          when: w === 'week' ? () => { const n = weeksUntil(it.id, week()); return n === 0 ? sht('sh.thisWeek') : n > 0 ? (n === 1 ? sht('sh.nextWeek') : sht('sh.backWeeks', { n })) : ''; } : undefined,
          use: lookUse(it) });
      }
    }
    // The champion's outfit, the weekly prize pieces, streak and season pieces: earned, never sold.
    const best = () => Math.max(streak().best, streak().days);
    out.push({ id: `fg:${PRIZE}`, sec: 'won', name: rt(`fb.${PRIZE.replace(':', '.')}` as RankKey), rar: 'legendary', for: 'sh.forChar', art: figArt(PRIZE),
      state: () => ((status?.wins ?? 0) > 0 ? 'own' : 'locked'), how: rt('rk.win.w1'),
      use: { label: 'sh.wear', done: 'sh.worn', active: () => wearingNow(PRIZE), run: () => wear(PRIZE) } });
    for (const [piece, p] of Object.entries(WARDROBE)) {
      if (piece === PRIZE) continue;
      const season = isSeason(p.how);
      const need = streakNeed(p.how);
      out.push({
        id: `fg:${piece}`, sec: season ? 'season' : 'won', name: partName(piece), rar: p.r, for: 'sh.forChar', art: figArt(piece),
        state: () => (ownsPiece(piece) ? 'own' : 'locked'),
        how: p.how === 'week' ? `${sht('sh.top3')} · ${rt('fb.how.week')}` : rt(`fb.how.${p.how}` as RankKey),
        when: season ? () => { const n = daysUntilSeason(p.how); return n === 0 ? sht('sh.onNow') : n > 0 ? sht('sh.backIn', { n }) : ''; }
          : p.how === 'week' && PIECES.includes(piece) ? () => { const n = pieceWeeks(piece, week()); return n === 0 ? sht('sh.thisWeek') : n > 0 ? (n === 1 ? sht('sh.nextWeek') : sht('sh.backWeeks', { n })) : ''; } : undefined,
        progress: need ? () => [Math.min(best(), need), need] : undefined,
        use: { label: 'sh.wear', done: 'sh.worn', active: () => wearingNow(piece), run: () => wear(piece) },
      });
    }
    // Today's stall (owner request 2026-11-12): three pieces a day at 30 % off, the same for everyone that day.
    const pool = out.filter((w) => w.store && w.price && !w.lim && (w.sec === 'char' || w.sec === 'room' || w.sec === 'look'));
    for (const w of stallPick(pool)) {
      const p = Math.round((w.price! * 0.7) / 5) * 5, id = w.store!, after = w.sec === 'room' ? ROOM_ITEMS.find((r) => `rm:${r.id}` === id) : null;
      w.was = w.price; w.price = p;
      w.doBuy = () => { if (wallet() < p || !shopAdd(id, p)) return false; if (after) setRoomLook(after.slot, after.id); return true; };
    }
    for (const id of APP_ICONS) {
      out.push({
        id: `ic:${id}`, sec: 'icons', name: bt(`ic.${id}` as BadgeKey), rar: tierRarity(id), for: 'sh.forHome',
        art: () => h('img', { class: 'sh-icon', src: `${import.meta.env.BASE_URL}icons/app-${id}.webp`, alt: '', width: 84, height: 84, loading: 'lazy' }),
        state: () => (unlockedIcons().has(id) ? 'own' : 'locked'), how: bt(`ic.${id}How` as BadgeKey), progress: () => levelNeed(id),
        use: { label: 'sh.use', done: 'sh.inUse', active: () => pickedIcon() === id, run: () => useIcon(id) },
      });
    }
    return out;
  };

  // --- what owning does ---
  async function wear(piece: string) {
    if (!canWearNow(piece)) { toast(sht('sh.cantWear')); return; }
    const { setFigure } = await import('../together/ranks');
    const f = wearing(parse(myFigureCode()) ?? DEFAULT, piece);
    await setFigure(encode(f));
    if (status) status.figure = encode(f);
  }
  function placeRoom(it: RoomItem) {
    setRoomLook(it.slot, it.id);
    void import('../together/ranks').then((m) => m.sendRoom()).catch(() => {});
  }
  async function useLook(it: Item) {
    if (!status) { toast(sht('sh.signIn')); return; }
    const { setLook, setFigure } = await import('../together/ranks');
    if (it.kind === 'avatar') {
      await setLook(it.ref as number, status.private, status.frame);
      if (status.figure) await setFigure(null);
      status.avatar = it.ref as number; status.figure = null;
    } else {
      await setLook(status.avatar, status.private, it.ref as number);
      status.frame = it.ref as number;
    }
  }
  async function useIcon(id: AppIconId) {
    try { localStorage.setItem('appIconPick', id); } catch { /* ignore */ }
    (await import('./theme')).refreshAppIcon();
  }

  // --- the page ---
  const purseN = h('b', { class: 'sh-purse-n' });
  const purse = h('button', { class: 'sh-purse', type: 'button', 'aria-label': sht('sh.purse') }, star(), purseN);
  const earnLine = h('p', { class: 'sh-earn small' });
  const lampLine = h('p', { class: 'sh-lampline small' });
  const counter = h('div', { class: 'sh-counter', 'aria-hidden': 'true' });
  const cats = h('nav', { class: 'sh-cats', role: 'tablist' });
  const body = h('div', { class: 'sh-body' });
  const back = h('button', { class: 'icon-btn sh-back back-btn', 'aria-label': t('common.close') }, icon('back', 22));
  const lanterns = h('div', { class: 'sh-lanterns', 'aria-hidden': 'true' }, ...[0, 1, 2, 3, 4].map((i) => h('i', { style: `--i:${i}` })));
  const stall = h('header', { class: 'sh-stall' }, lanterns,
    h('div', { class: 'sh-top' }, back, h('h1', {}, sht('sh.title')), h('span', { class: 'sh-gap' })),
    h('div', { class: 'sh-hero' }, counter,
      h('div', { class: 'sh-wallet' }, h('span', { class: 'sh-wallet-k small' }, sht('sh.purse')), purse, earnLine, lampLine)),
    h('div', { class: 'sh-awning', 'aria-hidden': 'true' }));
  const giftBar = o.giftTo ? h('div', { class: 'sh-giftbar' }, icon('gift', 18), sht('sh.giftMode', { name: o.giftTo.name })) : '';
  const d: HTMLDialogElement = h('dialog', { class: `sh-page${reduced() ? ' still' : ''}`, 'aria-label': sht('sh.title') }, giftBar, stall, cats, body);

  let pushed = false;
  try { history.pushState({ shop: 1 }, ''); pushed = true; } catch { /* ignore */ }
  const onPop = () => { pushed = false; d.close(); };
  window.addEventListener('popstate', onPop);
  const close = () => { if (pushed) history.back(); else d.close(); };
  back.onclick = close;
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  d.addEventListener('close', () => { window.removeEventListener('popstate', onPop); clearInterval(clock); d.remove(); o.onChange?.(); });
  window.addEventListener('hashchange', () => { pushed = false; d.close(); }, { once: true });

  let shown = -1;
  const paintPurse = () => {
    const n = wallet();
    if (shown >= 0 && n !== shown && !reduced()) tick(purseN, n, { from: shown, ms: 600, fmt: num });
    else purseN.textContent = num(n);
    shown = n;
    earnLine.textContent = sht('sh.earned', { d: num(lightOn(dayKey())), w: num(stats('week').light), a: num(stats('all').light) });
    const lamp = lampOf(), next = lampNext();
    // Only the lamp itself up here (F22); how far the next one is shows with the totals (tap the purse).
    lampLine.hidden = !lamp;
    lampLine.replaceChildren(lamp ? rt(`rk.lamp${lamp}` as RankKey) : '');
    earnLine.append(h('span', { class: 'sh-lampnext' }, ' · ', next === null ? sht('sh.lampTop') : sht('sh.lampNext', { n: num(next) })));
  };
  purse.onclick = () => { earnLine.classList.toggle('open'); haptic(); };

  // The character at the counter (or Noor's lantern without one).
  const paintCounter = async () => {
    const code = myFigureCode();
    if (code) {
      const { actor } = await import('./actor');
      const a = actor('sh-actor', code);
      if (a) { counter.replaceChildren(a.el); if (!reduced()) setTimeout(() => a.wave(1400), 500); counter.onclick = () => a.hop(0.6); return; }
    }
    counter.replaceChildren(h('span', { class: 'sh-noor' }));
  };

  const CATS: (Sec | 'featured')[] = ['featured', 'power', 'char', 'room', 'look', 'won', 'season', 'icons'];
  const catKey = (c: Sec | 'featured') => `sh.c.${c}` as ShopKey;
  const sections = new Map<string, HTMLElement>();
  let all: Ware[] = [];

  const tile = (w: Ware) => {
    const st = w.state();
    const left = wallet();
    const el = h('button', { class: `sh-tile r-${w.rar} s-${st}${st === 'buy' && (w.price ?? 0) > left ? ' short' : ''}`, type: 'button', onclick: () => openWare(w) },
      h('span', { class: 'sh-rar' }, sht(`sh.r.${w.rar}` as ShopKey)),
      h('span', { class: 'sh-art' }, w.art()),
      h('span', { class: 'sh-name' }, w.name),
      foot(w, st));
    el.dataset.id = w.id;
    return el;
  };
  const foot = (w: Ware, st: State) => {
    if (st === 'own') return h('span', { class: 'sh-foot own' }, w.use?.active() ? `✓ ${sht(w.use.done)}` : `✓ ${sht('sh.owned')}`);
    if (st === 'buy') return h('span', { class: 'sh-foot price' }, w.was ? h('s', { class: 'sh-was' }, num(w.was)) : '', star(), num(w.price ?? 0));
    const when = w.when?.() ?? '';
    const pr = w.progress?.();
    return h('span', { class: 'sh-foot lock' },
      pr ? h('span', { class: 'sh-prog', style: `--p:${pr[0] / pr[1]}` }, h('i', {})) : '',
      h('span', { class: 'sh-lock-t' }, icon('lock', 14), when || (pr ? sht('sh.days', { n: pr[0], m: pr[1] }) : w.how ?? sht('sh.locked'))));
  };

  const section = (c: Sec, sub: ShopKey, list: Ware[]) => {
    const s = h('section', { class: `sh-sec sec-${c}`, id: `sh-${c}` },
      h('h2', {}, sht(catKey(c))), h('p', { class: 'muted small' }, sht(sub)),
      h('div', { class: `sh-grid${c === 'power' ? ' wide' : ''}` }, ...list.map(tile)));
    sections.set(c, s);
    return s;
  };

  const featured = () => {
    const wk = week();
    const ids = [weekPrize(wk, 1), weekPrize(wk, 2), `fg:${weekPiece(wk)}`];
    const tags = [sht('sh.first'), sht('sh.top23'), sht('sh.top3')];
    const prizes = ids.map((id) => all.find((w) => w.id === id)).filter((w): w is Ware => !!w);
    const left = weekEndAt().getTime() - Date.now();
    const weekCard = h('div', { class: 'sh-feat week' },
      h('div', { class: 'sh-feat-head' }, h('b', {}, icon('trophy', 18), sht('sh.weekTitle')), h('span', { class: 'sh-pill' }, sht('sh.weekEnds', { t: timeLeft(left) }))),
      h('div', { class: 'sh-feat-row' }, ...prizes.map((w, i) => h('button', { class: `sh-prize r-${w.rar}`, type: 'button', onclick: () => openWare(w) },
        h('span', { class: 'sh-art' }, w.art()), h('span', { class: 'sh-tag' }, tags[i])))),
      h('p', { class: 'small sh-feat-sub' }, sht('sh.weekSub')));
    // The next season and what it brings.
    const seasonal = all.filter((w) => w.sec === 'season');
    const next = Math.min(...seasonal.map((w) => daysUntilSeason(WARDROBE[w.id.slice(3)].how)).filter((n) => n >= 0));
    const on = seasonNow();
    const sCard = h('button', { class: 'sh-feat season', type: 'button', onclick: () => jump('season') },
      h('span', { class: 'sh-crescent', 'aria-hidden': 'true' }),
      h('div', { class: 'sh-feat-head' }, h('b', {}, on ? sht('sh.seasonNow') : sht('sh.seasonTitle')),
        Number.isFinite(next) && !on ? h('span', { class: 'sh-pill gold' }, sht('sh.seasonIn', { n: next })) : ''),
      h('div', { class: 'sh-feat-row' }, ...seasonal.slice(0, 4).map((w) => h('span', { class: `sh-prize sm r-${w.rar}` }, h('span', { class: 'sh-art' }, w.art())))));
    const deals = all.filter((w) => w.was);
    const nextDay = new Date(); nextDay.setHours(24, 0, 0, 0);
    const ml = nextDay.getTime() - Date.now();
    const stallCard = deals.length ? h('div', { class: 'sh-feat stall' },
      h('div', { class: 'sh-feat-head' }, h('b', {}, icon('lamp', 18), sht('sh.stallTitle')), h('span', { class: 'sh-pill' }, sht('sh.stallEnds', { t: timeLeft(ml) }))),
      h('div', { class: 'sh-feat-row' }, ...deals.map((w) => h('button', { class: `sh-prize r-${w.rar}${w.state() === 'own' ? ' own' : ''}`, type: 'button', onclick: () => openWare(w) },
        h('span', { class: 'sh-art' }, w.art()), h('span', { class: 'sh-tag deal' }, w.state() === 'own' ? `✓ ${sht('sh.owned')}` : '−30%')))),
      h('p', { class: 'small sh-feat-sub' }, sht('sh.stallSub'))) : '';
    const lim = all.find((w) => w.id === limitedNow(week()));
    const limCard = lim ? h('button', { class: `sh-feat limited r-${lim.rar}`, type: 'button', onclick: () => openWare(lim) },
      h('div', { class: 'sh-feat-head' }, h('b', {}, `✦ ${sht('sh.limTitle')}`), h('span', { class: 'sh-pill gold' }, sht('sh.weekEnds', { t: timeLeft(left) }))),
      h('div', { class: 'sh-lim-row' }, h('span', { class: 'sh-art big' }, lim.art()),
        h('span', { class: 'sh-lim-txt' }, h('b', {}, lim.name), h('span', { class: 'small' }, lim.state() === 'own' ? `✓ ${sht('sh.owned')}` : sht('sh.limSub')),
          lim.state() === 'own' ? '' : h('span', { class: 'sh-foot price' }, star(), num(lim.price ?? 0))))) : '';
    // The lamp wall: Light spent on a du'a for someone who passed away.
    const lwCard = h('button', { class: 'sh-feat lamps', type: 'button', onclick: () => void import('./lampWall').then((m) => m.openLampWall({ onChange: paintPurse })) },
      h('div', { class: 'sh-lw-row' }, h('span', { class: 'sh-lw-ic', 'aria-hidden': 'true' }, icon('lamp', 22)),
        h('span', { class: 'sh-lim-txt' }, h('b', {}, lwt('lw.door')), h('span', { class: 'small' }, lwt('lw.doorSub')))));
    const s = h('section', { class: 'sh-sec sec-featured', id: 'sh-featured' }, limCard, stallCard, weekCard, lwCard, sCard);
    sections.set('featured', s);
    return s;
  };

  const paint = () => {
    all = wares();
    sections.clear();
    const by = (c: Sec) => all.filter((w) => w.sec === c);
    const rank: Record<Rar, number> = { mythic: 0, legendary: 1, prize: 2, epic: 3, rare: 4, cute: 5, common: 6 };
    const won = by('won').sort((a, b) => Number(b.state() === 'own') - Number(a.state() === 'own') || rank[a.rar] - rank[b.rar]);
    const season = by('season').sort((a, b) => daysUntilSeason(WARDROBE[a.id.slice(3)].how) - daysUntilSeason(WARDROBE[b.id.slice(3)].how));
    body.replaceChildren(
      featured(),
      section('power', 'sh.powerSub', by('power')),
      section('char', 'sh.charSub', by('char').sort((a, b) => (a.price ?? 0) - (b.price ?? 0))),
      section('room', 'sh.roomSub', by('room').sort((a, b) => (a.price ?? 0) - (b.price ?? 0))),
      section('look', 'sh.lookSub', by('look')),
      section('won', 'sh.wonSub', won),
      section('season', 'sh.seasonSub', season),
      section('icons', 'sh.iconsSub', by('icons')),
      h('p', { class: 'muted small sh-note' }, sht('sh.note')));
    paintPurse();
  };
  const jump = (c: Sec | 'featured') => {
    const s = sections.get(c);
    if (!s) return;
    const top = s.getBoundingClientRect().top - d.getBoundingClientRect().top + d.scrollTop - cats.offsetHeight - 8;
    d.scrollTo({ top, behavior: reduced() ? 'auto' : 'smooth' });
  };
  const paintCats = (on: string) => cats.replaceChildren(...CATS.map((c) => h('button', {
    class: `sh-cat${c === on ? ' on' : ''}`, role: 'tab', 'aria-selected': String(c === on), type: 'button', 'data-c': c,
    onclick: () => { haptic(); jump(c); },
  }, sht(catKey(c)))));
  // The chip of the section in view lights up as the page scrolls.
  let curCat = 'featured';
  d.addEventListener('scroll', () => {
    const y = d.scrollTop + cats.offsetHeight + 40;
    let cur = 'featured';
    const base = d.getBoundingClientRect().top - d.scrollTop;
    for (const c of CATS) { const s = sections.get(c); if (s && s.getBoundingClientRect().top - base <= y) cur = c; }
    if (cur !== curCat) {
      curCat = cur;
      // Only the strip moves sideways (scrollIntoView would also stop the page's own smooth scroll).
      for (const b of cats.children) { const on = (b as HTMLElement).dataset.c === cur; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
      const on = cats.querySelector<HTMLElement>('.on');
      if (on) cats.scrollTo({ left: on.offsetLeft - (cats.clientWidth - on.offsetWidth) / 2, behavior: reduced() ? 'auto' : 'smooth' });
    }
  }, { passive: true });

  const refresh = (id?: string) => {
    const y = d.scrollTop;
    paint();
    d.scrollTop = y;
    if (id && !reduced()) { const el = body.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`); if (el) squash(el, 0.12); }
  };

  // --- one piece, large ---
  function openWare(w: Ware) {
    haptic();
    const card = h('div', { class: `sh-card r-${w.rar}` });
    const sheet = h('dialog', { class: 'sh-sheet' }, card);
    const shut = () => sheet.close();
    sheet.addEventListener('click', (e) => { if (e.target === sheet) shut(); });
    sheet.addEventListener('close', () => sheet.remove());
    const paintCard = (justGot = false) => {
      const st = w.state();
      const left = wallet();
      const art = h('div', { class: 'sh-card-art' }, h('i', { class: 'sh-rays', 'aria-hidden': 'true' }), w.art());
      const acts: Node[] = [];
      if (st === 'buy') {
        const price = w.price ?? 0;
        if (left >= price) {
          acts.push(h('button', { class: 'primary brand-btn sh-buy', type: 'button', onclick: () => {
            if (!w.doBuy?.()) { toast(sht('sh.need', { n: Math.max(0, price - wallet()) })); return; }
            sfx.pop(0, w.rar === 'legendary' || w.rar === 'mythic'); sfx.shimmer(); haptic(20);
            toast(sht('sh.got', { name: w.name }));
            paintCard(true); refresh(w.id);
            o.onChange?.();
          } }, sht('sh.get'), ' ', star(), num(price)));
        } else {
          acts.push(h('p', { class: 'sh-short' }, sht('sh.need', { n: num(price - left) })),
            h('button', { class: 'chip sh-earn-btn', type: 'button', onclick: () => { shut(); close(); setTimeout(() => { location.hash = '#/me'; }, 60); } }, `✦ ${sht('sh.earn')}`));
        }
      } else if (st === 'own' && w.use) {
        const u = w.use;
        const on = u.active();
        acts.push(h('button', { class: `primary brand-btn sh-use${on ? ' done' : ''}`, type: 'button', disabled: on, onclick: async (e: Event) => {
          const b = e.currentTarget as HTMLButtonElement;
          b.disabled = true;
          try { await u.run(); sfx.tick(); haptic(12); } catch (err) { toast((err as Error).message); }
          paintCard(); refresh(w.id); o.onChange?.();
        } }, on ? `✓ ${sht(u.done)}` : sht(u.label)));
      } else if (st === 'own') acts.push(h('p', { class: 'sh-owned' }, `✓ ${w.id === 'freeze' ? sht('sh.full') : sht('sh.owned')}`));
      const gift = o.giftTo;
      if (gift && w.store && w.price && st !== 'locked') {
        const price = w.price;
        acts.push(h('button', { class: `${st === 'own' ? 'primary brand-btn' : 'chip'} sh-gift-btn`, type: 'button', disabled: wallet() < price, onclick: async (e: Event) => {
          const b = e.currentTarget as HTMLButtonElement;
          b.disabled = true;
          try {
            const { giftPiece } = await import('../together/lightGifts');
            await giftPiece(gift.pid, w.store!, price);
            sfx.pop(0, true); sfx.shimmer(); haptic(20);
            toast(sht('sh.giftSent', { name: gift.name }));
            shut(); close();
          } catch (err) { toast((err as Error).message === 'need' ? sht('sh.need', { n: price - wallet() }) : (err as Error).message); b.disabled = false; }
        } }, icon('gift', 18), `${sht('sh.giftThis', { name: gift.name })} · `, star(), num(price)));
      }
      if (st === 'locked') {
        const pr = w.progress?.();
        acts.push(h('p', { class: 'sh-how' }, icon('lock', 18), w.how ?? sht('sh.locked')));
        if (pr) acts.push(h('div', { class: 'sh-prog big', style: `--p:${pr[0] / pr[1]}` }, h('i', {})), h('p', { class: 'small muted' }, sht('sh.days', { n: pr[0], m: pr[1] })));
        const when = w.when?.();
        if (when) acts.push(h('span', { class: 'sh-pill gold' }, when));
      }
      card.replaceChildren(
        h('button', { class: 'icon-btn sh-card-x', 'aria-label': t('common.close'), onclick: shut }, '✕'),
        h('span', { class: 'sh-rar big' }, sht(`sh.r.${w.rar}` as ShopKey)),
        art,
        h('h2', {}, w.name),
        h('p', { class: 'muted small sh-for' }, sht(w.for), w.when && st !== 'locked' ? ` · ${w.when()}` : ''),
        ...acts);
      if (justGot && !reduced()) {
        art.classList.add('got');
        popIn(art.lastElementChild as Element);
        void import('./actor').then((m) => m.sparkle(art, 18, 0.5));
      }
    };
    paintCard();
    document.body.append(sheet);
    sheet.showModal();
    if (!reduced()) popIn(card, { stiffness: 260, damping: 18 });
  }

  // Updates the "back in / this week" lines and the week's time left once a minute.
  const clock = window.setInterval(() => { if (d.open) paintPurse(); }, 60_000);
  paint();
  paintCats('featured');
  document.body.append(d);
  d.showModal();
  void paintCounter();
  if (!reduced()) { sfx.whoosh(); popIn(purse); }
  if (o.focus && o.focus !== 'featured') requestAnimationFrame(() => jump(o.focus!));
  // What the server knows (tier, look, prizes won): painted again once it arrives.
  if (await signedIn()) {
    const r = await import('../together/ranks');
    const [s, p] = await Promise.all([r.rankStatus().catch(() => null), r.myPrizes().catch(() => [])]);
    status = s;
    wonItems = (p ?? []).map((x) => x.item).filter((i): i is string => !!i);
    if (d.open) refresh();
  }
}
