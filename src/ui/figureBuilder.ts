// The character builder (owner request 2026-11-10): Ranks → Your avatar → Make your character. A big
// character on top that hops at each change, a row of part tabs, tiles drawn with the part on, colour swatches,
// faces on or off (off by default), Surprise me, and Wear it. A few parts cost Light (bought on Wear it, kept
// in the shop like the avatars); the champion's outfit is only for a week won at #1 (checked by the server).
import { rt, type RankKey } from '../i18n/ranks';
import { t } from '../i18n';
import { shopAdd, shopHas, wallet } from '../data/garden';
import { setFigure, type Status } from '../together/ranks';
import {
  DEFAULT, PRICE, PRIZE, SWATCH, bustMarkup, encode, figureSvg, hairHidden, normalize, options, parse, random,
  type Fig, type Slot,
} from './figure';
import { h, haptic, toast } from './dom';
import { squash } from './juice';
import { sfx } from './sfx';
import './figure.css';

type Tab = 'body' | 'skin' | 'hair' | 'beard' | 'head' | 'outfit' | 'glasses' | 'hold' | 'pose' | 'bg';
const TABS: Tab[] = ['body', 'skin', 'hair', 'beard', 'head', 'outfit', 'glasses', 'hold', 'pose', 'bg'];
/** The colour each tab can also change. */
const COLOUR: Partial<Record<Tab, 'hairC' | 'headC' | 'outC'>> = { hair: 'hairC', beard: 'hairC', head: 'headC', outfit: 'outC' };
/** Tiles that show the whole character (the rest show head and shoulders). */
const WHOLE = new Set<Tab>(['body', 'outfit', 'hold', 'pose']);

const key = (slot: Slot, v: number) => `${slot}:${v}`;
const shopId = (slot: Slot, v: number) => `fg:${slot}:${v}`;
const owned = (slot: Slot, v: number) => !PRICE[key(slot, v)] || shopHas(shopId(slot, v));
const label = (slot: Slot, v: number) => rt(`fb.${slot}.${v}` as RankKey);

function disc(f: Fig, size: number) {
  const s = h('span', { class: 'fb-disc', 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="2 2 36 36" width="${size}" height="${size}">${bustMarkup(f, 18)}</svg>`;
  return s;
}

/** Opens the builder; `done` runs after the character was saved (or taken off). */
export function openBuilder(s: Status, done: () => void) {
  let f: Fig = parse(s.figure) ?? { ...DEFAULT };
  let tab: Tab = 'body';
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

  const paintStage = (hop: boolean) => {
    const bg = SWATCH.bg[f.bg];
    stage.style.setProperty('--fb-a', bg[0]);
    stage.style.setProperty('--fb-b', bg[1]);
    stage.innerHTML = figureSvg(f, { label: rt('fb.title') });
    if (hop) {
      const g = stage.querySelector('svg');
      if (g) squash(g, 0.14);
      sfx.pop(Math.floor(Math.random() * 3));
      haptic();
    }
    const c = cost();
    wear.textContent = prizeOn() && !champion ? rt('fb.prize') : c ? rt('fb.buy', { n: c }) : rt('fb.wear');
    wear.toggleAttribute('disabled', prizeOn() && !champion);
    light.textContent = `✦ ${wallet().toLocaleString()}`;
    faceChips.replaceChildren(...[0, 1].map((v) => h('button', {
      class: `chip${f.face === v ? ' on' : ''}`, 'aria-pressed': String(f.face === v),
      onclick: () => { if (f.face !== v) { f = { ...f, face: v }; paintStage(true); paintPanel(); } },
    }, rt(v ? 'fb.faceOn' : 'fb.faceOff'))));
  };
  const set = (slot: Slot, v: number) => {
    if (f[slot] === v) return;
    f = normalize({ ...f, [slot]: v });
    paintStage(true);
    paintTabs();
    paintPanel();
  };

  const visible = (x: Tab) => (x === 'hair' ? options('hair', f).length > 0 && !hairHidden(f) : options(x, f).length > 1);
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
    const locked = key(slot, v) === PRIZE && !champion;
    const art = h('span', { class: 'fb-art', 'aria-hidden': 'true' });
    art.innerHTML = WHOLE.has(slot as Tab) ? figureSvg(g, { still: true }) : `<svg viewBox="2 2 36 36">${bustMarkup(g, 18)}</svg>`;
    return h('button', {
      class: `fb-tile${on ? ' on' : ''}${locked ? ' locked' : ''}`, 'aria-pressed': String(on),
      'aria-label': label(slot, v) + (price && !owned(slot, v) ? ` · ✦ ${price}` : locked ? ` · ${rt('fb.prize')}` : ''),
      onclick: () => set(slot, v),
    }, art,
    h('span', { class: 'fb-name small' }, label(slot, v)),
    price && !owned(slot, v) ? h('span', { class: 'fb-price' }, `✦ ${price}`) : '',
    key(slot, v) === PRIZE ? h('span', { class: 'fb-price prize' }, '🏆 #1') : '');
  };
  const swatches = (slot: 'skin' | 'hairC' | 'headC' | 'outC' | 'bg') => h('div', { class: 'fb-swatches', role: 'group', 'aria-label': rt('fb.colour') },
    ...options(slot, f).map((v) => {
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
    if (tab === 'skin' || tab === 'bg') kids.push(swatches(tab));
    else {
      const c = COLOUR[tab];
      if (c && (tab !== 'head' || f.head !== 0) && (tab !== 'beard' || f.beard !== 0)) kids.push(swatches(c));
      kids.push(h('div', { class: 'fb-grid' }, ...options(tab, f).map((v) => tile(tab, v))));
      if (tab === 'hold' && f.hold === 3) kids.push(h('p', { class: 'muted small' }, rt('fb.standNote')));
    }
    panel.replaceChildren(...kids);
  };

  const close = () => d.close();
  const d: HTMLDialogElement = h('dialog', { class: 'fb', 'aria-label': rt('fb.title') },
    h('div', { class: 'fb-top' },
      h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕'),
      h('h2', {}, rt('fb.title')), light),
    stage, faceChips, tabs, panel,
    h('div', { class: 'fb-foot' },
      h('button', { class: 'chip', onclick: () => { f = random(f.face); paintStage(true); paintTabs(); paintPanel(); } }, `🎲 ${rt('fb.random')}`),
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
      close();
      done();
    } catch (e) { toast((e as Error).message); }
  });

  d.addEventListener('close', () => d.remove());
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
