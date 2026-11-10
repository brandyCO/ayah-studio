// The character builder (owner request 2026-11-10): Ranks → Your avatar → Make your character. A big
// character on top that hops at each change, a row of part tabs, tiles drawn with the part on, colour swatches,
// faces on or off (off by default), Surprise me, and Wear it. A few parts cost Light (bought on Wear it, kept
// in the shop like the avatars); the champion's outfit is only for a week won at #1 (checked by the server).
import { rt, type RankKey } from '../i18n/ranks';
import { t } from '../i18n';
import { shopAdd, shopHas, wallet } from '../data/garden';
import { setFigure, type Status } from '../together/ranks';
import {
  DEFAULT, PRICE, PRIZE, SWATCH, WARDROBE, bustMarkup, encode, figureSvg, hairHidden, normalize, options, parse, random,
  type Fig, type Rarity, type Slot,
} from './figure';
import { h, haptic, toast } from './dom';
import { reduced } from './juice';
import { glance, hop, layer, nod, poseClass, sparkle } from './actor';
import { sfx } from './sfx';
import { ownsPiece } from '../data/wardrobe';
import './figure.css';

type Tab = 'body' | 'wardrobe' | 'skin' | 'hair' | 'beard' | 'head' | 'outfit' | 'glasses' | 'hold' | 'pose' | 'bg';
const TABS: Tab[] = ['body', 'wardrobe', 'skin', 'hair', 'beard', 'head', 'outfit', 'glasses', 'hold', 'pose', 'bg'];
const RARITY: Rarity[] = ['legendary', 'epic', 'rare', 'cute'];
/** A wardrobe piece (earned, never sold) other than the champion's outfit, which has its own rule. */
const piece = (slot: Slot, v: number) => key(slot, v) !== PRIZE ? WARDROBE[key(slot, v)] : undefined;
/** The colour each tab can also change. */
const COLOUR: Partial<Record<Tab, 'hairC' | 'headC' | 'outC'>> = { hair: 'hairC', beard: 'hairC', head: 'headC', outfit: 'outC' };
/** Tiles that show the whole character (the rest show head and shoulders). */
const WHOLE = new Set<Tab>(['body', 'outfit', 'hold', 'pose', 'wardrobe']);

const key = (slot: Slot, v: number) => `${slot}:${v}`;
const shopId = (slot: Slot, v: number) => `fg:${slot}:${v}`;
const owned = (slot: Slot, v: number) => piece(slot, v) ? ownsPiece(key(slot, v)) : !PRICE[key(slot, v)] || shopHas(shopId(slot, v));
const label = (slot: Slot, v: number) => rt(`fb.${slot}.${v}` as RankKey);

function disc(f: Fig, size: number) {
  const s = h('span', { class: 'fb-disc', 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="2 2 36 36" width="${size}" height="${size}">${bustMarkup(f, 18)}</svg>`;
  return s;
}

/** Opens the builder; `done` runs after the character was saved (or taken off). */
export function openBuilder(s: Pick<Status, 'figure' | 'wins'>, done: () => void, first: Tab = 'body') {
  let f: Fig = parse(s.figure) ?? { ...DEFAULT };
  let tab: Tab = first;
  const champion = (s.wins ?? 0) > 0;

  const stage = h('div', { class: 'fb-stage' });
  const tabs = h('div', { class: 'fb-tabs', role: 'tablist' });
  const panel = h('div', { class: 'fb-panel', role: 'tabpanel' });
  const wear = h('button', { class: 'primary brand-btn fb-wear' });
  const light = h('span', { class: 'fb-light' });
  const faceChips = h('div', { class: 'fb-face chips', role: 'group', 'aria-label': rt('fb.face') });

  const cost = () => Object.entries(PRICE).filter(([k]) => {
    const [slot, v] = k.split(':');
    return f[slot as Slot] === Number(v) && !owned(slot as Slot, Number(v));
  }).reduce((a, [, p]) => a + p, 0);
  const prizeOn = () => key('outfit', f.outfit) === PRIZE;
  /** A worn wardrobe piece not earned yet: it can be tried on, not worn. */
  const unearned = () => (['outfit', 'hold', 'glasses', 'bg'] as Slot[]).find((sl) => piece(sl, f[sl]) && !owned(sl, f[sl]));

  // Each change gets a reaction that fits it: a nod for the head and face, a hop for the rest.
  let lastSlot: Slot | 'face' | null = null;
  const react = () => {
    if (lastSlot === 'head' || lastSlot === 'headC' || lastSlot === 'glasses' || lastSlot === 'face' || lastSlot === 'hair' || lastSlot === 'hairC' || lastSlot === 'beard') { nod(stage); hop(stage, 10, 480); } else hop(stage);
    idleAt = performance.now();
  };
  // Idle: every 4–7 s a small fidget (a glance, a nod, a little hop), never while the user is busy.
  let idleAt = performance.now();
  const idle = window.setInterval(() => {
    if (!d.open || document.hidden || performance.now() - idleAt < 4000) return;
    idleAt = performance.now() + Math.random() * 3000;
    const r = Math.random();
    if (r < 0.45 && f.face) glance(stage); else if (r < 0.75) nod(stage, 3); else hop(stage, 12, 520);
  }, 1000);
  const paintStage = (hop: boolean) => {
    const bg = SWATCH.bg[f.bg];
    stage.style.setProperty('--fb-a', bg[0]);
    stage.style.setProperty('--fb-b', bg[1]);
    stage.innerHTML = figureSvg(f, { label: rt('fb.title'), actor: true });
    layer(stage);
    if (hop) {
      react();
      sfx.pop(Math.floor(Math.random() * 3));
    }
    const c = cost();
    const un = unearned();
    wear.textContent = prizeOn() && !champion ? rt('fb.prize') : un ? rt('fb.earn') : c ? rt('fb.buy', { n: c }) : rt('fb.wear');
    wear.toggleAttribute('disabled', (prizeOn() && !champion) || !!un);
    light.textContent = `✦ ${wallet().toLocaleString()}`;
    faceChips.replaceChildren(...[0, 1].map((v) => h('button', {
      class: `chip${f.face === v ? ' on' : ''}`, 'aria-pressed': String(f.face === v),
      onclick: () => { if (f.face !== v) { lastSlot = 'face'; f = { ...f, face: v }; paintStage(true); paintPanel(); } },
    }, rt(v ? 'fb.faceOn' : 'fb.faceOff'))));
  };
  const set = (slot: Slot, v: number) => {
    if (f[slot] === v) return;
    lastSlot = slot;
    f = normalize({ ...f, [slot]: v });
    paintStage(true);
    paintTabs();
    paintPanel();
  };

  const visible = (x: Tab) => x === 'wardrobe' || (x === 'hair' ? options('hair', f).length > 0 && !hairHidden(f) : options(x, f).length > 1);
  const paintTabs = () => {
    if (!visible(tab)) tab = 'body';
    tabs.replaceChildren(...TABS.filter(visible).map((x) => h('button', {
      class: `chip${x === tab ? ' on' : ''}`, role: 'tab', 'aria-selected': String(x === tab),
      onclick: () => { tab = x; haptic(); paintTabs(); paintPanel(); },
    }, rt(`fb.tab.${x}` as RankKey))));
  };

  const tile = (slot: Slot, v: number) => {
    const g = normalize({ ...f, [slot]: v });
    const on = f[slot] === v;
    const price = PRICE[key(slot, v)];
    const pc = WARDROBE[key(slot, v)];
    const locked = (key(slot, v) === PRIZE && !champion) || (!!piece(slot, v) && !owned(slot, v));
    const art = h('span', { class: 'fb-art', 'aria-hidden': 'true' });
    art.innerHTML = WHOLE.has(slot as Tab) ? figureSvg(g, { still: true }) : `<svg viewBox="2 2 36 36">${bustMarkup(g, 18)}</svg>`;
    const how = pc ? rt(`fb.how.${key(slot, v) === PRIZE ? 'week' : pc.how}` as RankKey) : '';
    const name = slot === 'bg' ? (v >= 8 ? label(slot, v) : rt('fb.tab.bg')) : label(slot, v);
    return h('button', {
      class: `fb-tile${on ? ' on' : ''}${locked ? ' locked' : ''}${pc ? ` r-${pc.r}` : ''}`, 'aria-pressed': String(on),
      'aria-label': name + (pc ? ` · ${rt(`fb.r.${pc.r}` as RankKey)}` : '') + (price && !owned(slot, v) ? ` · ✦ ${price}` : locked ? ` · ${key(slot, v) === PRIZE ? rt('fb.prize') : how}` : ''),
      onclick: () => { set(slot, v); if (locked && piece(slot, v)) toast(rt('fb.tryOn', { how })); },
    }, art,
    pc ? h('span', { class: 'fb-rar' }, rt(`fb.r.${pc.r}` as RankKey)) : '',
    h('span', { class: 'fb-name small' }, name),
    locked && piece(slot, v) ? h('span', { class: 'fb-how' }, how) : '',
    price && !owned(slot, v) ? h('span', { class: 'fb-price' }, `✦ ${price}`) : '',
    key(slot, v) === PRIZE ? h('span', { class: 'fb-price prize' }, '🏆 #1') : '');
  };
  const swatches = (slot: 'skin' | 'hairC' | 'headC' | 'outC' | 'bg') => h('div', { class: 'fb-swatches', role: 'group', 'aria-label': rt('fb.colour') },
    ...options(slot, f).filter((v) => !piece(slot, v) || owned(slot, v)).map((v) => {
      const [a, b] = SWATCH[slot][v];
      const price = PRICE[key(slot, v)];
      return h('button', {
        class: `fb-sw${f[slot] === v ? ' on' : ''}`, style: `--a:${a};--b:${b}`, 'aria-pressed': String(f[slot] === v),
        'aria-label': `${rt('fb.colour')} ${v + 1}${price && !owned(slot, v) ? ` · ✦ ${price}` : ''}`,
        onclick: () => set(slot, v),
      }, price && !owned(slot, v) ? h('span', { class: 'fb-price' }, `✦${price}`) : '');
    }));

  const paintPanel = () => {
    const kids: (Node | string)[] = [];
    if (tab === 'wardrobe') {
      // Every piece this body can wear, rarest first; earned ones can be worn, the rest tried on.
      const all = Object.entries(WARDROBE).map(([k, p]) => { const [sl, v] = k.split(':'); return { slot: sl as Slot, v: Number(v), p }; })
        .filter((x) => options(x.slot, f).includes(x.v))
        .sort((a, b) => RARITY.indexOf(a.p.r) - RARITY.indexOf(b.p.r) || Number(owned(b.slot, b.v)) - Number(owned(a.slot, a.v)));
      kids.push(h('p', { class: 'muted small fb-wd-sub' }, rt('fb.wardrobeSub')), h('div', { class: 'fb-grid' }, ...all.map((x) => tile(x.slot, x.v))));
    } else if (tab === 'skin' || tab === 'bg') kids.push(swatches(tab));
    else {
      const c = COLOUR[tab];
      if (c && (tab !== 'head' || f.head !== 0) && (tab !== 'beard' || f.beard !== 0)) kids.push(swatches(c));
      kids.push(h('div', { class: 'fb-grid' }, ...options(tab, f).filter((v) => !piece(tab as Slot, v) || owned(tab as Slot, v)).map((v) => tile(tab as Slot, v))));
      if (tab === 'hold' && f.hold === 3) kids.push(h('p', { class: 'muted small' }, rt('fb.standNote')));
    }
    panel.replaceChildren(...kids);
  };

  // Surprise me: a quick roll through a few looks (each with a tick), then the one it lands on hops.
  let rolling = false;
  const surprise = () => {
    if (rolling) return;
    if (reduced()) { f = random(f.face); lastSlot = null; paintStage(true); paintTabs(); paintPanel(); return; }
    rolling = true;
    const steps = [0, 70, 150, 245, 360];
    steps.forEach((ms, i) => setTimeout(() => {
      f = random(f.face);
      if (i < steps.length - 1) { paintStage(false); sfx.tick(); stage.querySelector('.fg-mv')?.animate([{ transform: 'scale(1.04, .96)' }, { transform: 'none' }], { duration: 90 }); return; }
      lastSlot = null;
      paintStage(true); paintTabs(); paintPanel();
      rolling = false;
    }, ms));
  };
  const close = () => d.close();
  const d: HTMLDialogElement = h('dialog', { class: 'fb', 'aria-label': rt('fb.title') },
    h('div', { class: 'fb-top' },
      h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕'),
      h('h2', {}, rt('fb.title')), light),
    stage, faceChips, tabs, panel,
    h('div', { class: 'fb-foot' },
      h('button', { class: 'chip', onclick: surprise }, `🎲 ${rt('fb.random')}`),
      wear),
    s.figure ? h('button', { class: 'fb-classic small', onclick: async () => {
      try { await setFigure(null); close(); done(); } catch (e) { toast((e as Error).message); }
    } }, rt('fb.classic')) : '');

  wear.addEventListener('click', async () => {
    if (prizeOn() && !champion) { toast(rt('fb.prize')); return; }
    const c = cost();
    if (c > wallet()) { toast(rt('fb.noLight', { n: c - wallet() })); return; }
    try {
      await setFigure(encode(f));
      for (const [k, p] of Object.entries(PRICE)) {
        const [slot, v] = k.split(':');
        if (f[slot as Slot] === Number(v) && !owned(slot as Slot, Number(v))) shopAdd(shopId(slot as Slot, Number(v)), p);
      }
      sfx.shimmer();
      if (!reduced()) {
        // A cheer: two happy hops with sparkles, then the builder closes on the new look.
        wear.toggleAttribute('disabled', true);
        poseClass(stage, 'cheer', true);
        hop(stage, 34, 600);
        sparkle(stage);
        setTimeout(() => { hop(stage, 18, 480); sparkle(stage, 8); }, 560);
        await new Promise((r) => setTimeout(r, 1100));
      }
      close();
      done();
    } catch (e) { toast((e as Error).message); }
  });

  d.addEventListener('close', () => { clearInterval(idle); d.remove(); });
  window.addEventListener('hashchange', close, { once: true });
  document.body.append(d);
  d.showModal();
  paintStage(false);
  paintTabs();
  paintPanel();
}

/** A small preview of a worn character (or a prompt to make one) for the look sheet. */
export function builderCard(s: Status, open: () => void) {
  const f = parse(s.figure);
  return h('button', { class: 'fb-card me-card', onclick: open },
    f ? disc(f, 64) : h('span', { class: 'fb-card-new', 'aria-hidden': 'true' }, '+'),
    h('span', { class: 'fb-card-txt' },
      h('b', {}, rt(f ? 'fb.edit' : 'fb.open')),
      h('span', { class: 'muted small' }, rt('fb.sub'))),
    h('span', { class: 'muted', 'aria-hidden': 'true' }, '›'));
}
