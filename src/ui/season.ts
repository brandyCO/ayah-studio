// The Ramadan season screen `#/season` (owner request 2026-11-11, "the time remaining for Ramadan to start …
// waiting to be unlocked"). Before Ramadan: a night sky with a fanous garland and a live countdown, then what the
// season unlocks, each with a lock: four new characters (each bringing a wardrobe piece), the Khatm tracker (a
// ring of the 30 juz; the plan can be picked early), the Ramadan room sky, the Ramadan streak card and four
// seasonal badges. In Ramadan the same screen is the season's home: the day, the live tracker with today's
// portion, the characters' pieces in the wardrobe, the badges as they are earned. On Eid: the recap.
import { BG, bgDeco, figureSvg, normalize, DEFAULT, type Fig } from './figure';
import { badgeArt } from './badge';
import { flame } from './flame';
import { backSvg } from './room';
import { hop } from './actor';
import { h, haptic, toast } from './dom';
import { locale } from '../i18n';
import { rt, type RankKey } from '../i18n/ranks';
import { snt, type SeasonKey } from '../i18n/season';
import { countdown, juzFill, juzStart, seasonBadges, seasonState, type SeasonState } from '../data/season';
import { PAGES, planPages, ramadanData, setPlan, type Plan } from '../data/ramadan';
import { WARDROBE } from './figure';
import { t as tr } from '../i18n';
import { isNative } from '../native';
import type { BadgeIcon } from '../data/badges';
import './figure.css';
import './season.css';

const MAN = 0, WOMAN = 1, BOY = 2, GIRL = 3;
/** The Ramadan cast: our own characters, each wearing the piece it brings to the wardrobe. */
export const CAST: { id: 'musaharati' | 'noura' | 'huda' | 'yusuf'; piece: string; fig: Fig }[] = [
  { id: 'musaharati', piece: 'hold:10', fig: normalize({ ...DEFAULT, body: MAN, skin: 3, hair: 1, hairC: 5, beard: 2, age: 1, head: 1, headC: 0, outfit: 12, outC: 2, hold: 10, bg: 6 }) },
  { id: 'noura', piece: 'hold:9', fig: normalize({ ...DEFAULT, body: GIRL, skin: 1, hair: 10, hairC: 1, beard: 0, head: 0, outfit: 16, outC: 8, hold: 9, bg: 3 }) },
  { id: 'huda', piece: 'hold:11', fig: normalize({ ...DEFAULT, body: WOMAN, skin: 2, hair: 0, beard: 0, head: 4, headC: 3, age: 1, outfit: 3, outC: 1, hold: 11, bg: 4 }) },
  { id: 'yusuf', piece: 'bg:12', fig: normalize({ ...DEFAULT, body: BOY, skin: 4, hair: 6, hairC: 0, beard: 0, head: 7, headC: 1, outfit: 14, outC: 0, hold: 4, bg: 12 }) },
];
const BADGE_ICON: Record<string, BadgeIcon> = { first: 'moon', ten: 'calendar', khatm: 'mushaf', nights: 'lantern' };

const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><rect x="4.5" y="10" width="15" height="11" rx="3.5" fill="currentColor"/><circle cx="12" cy="15.2" r="1.8" fill="#1b1440"/></svg>';
const CRESCENT = '<svg viewBox="0 0 100 100" aria-hidden="true"><defs><radialGradient id="snMoonG" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#ffe7a3" stop-opacity=".5"/><stop offset="1" stop-color="#ffe7a3" stop-opacity="0"/></radialGradient></defs>'
  + '<circle cx="50" cy="50" r="50" fill="url(#snMoonG)"/><path d="M58 18a32 32 0 1 0 22 52a26 26 0 1 1 -22 -52z" fill="#ffe08a"/><path d="M58 18a32 32 0 1 0 22 52a26 26 0 1 1 -22 -52z" fill="none" stroke="#fff6d0" stroke-width="2" opacity=".6"/>'
  + '<path d="M46 34q-10 8 -10 20" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".55"/></svg>';

const el = (html: string, cls: string, tag: keyof HTMLElementTagNameMap = 'span') => { const e = h(tag, { class: cls, 'aria-hidden': 'true' }); e.innerHTML = html; return e; };
const lockPill = (text = snt('sn.locked')) => { const p = h('span', { class: 'sn-lock' }); p.innerHTML = LOCK; p.append(text); return p; };

/** A string of seven lanterns swaying under a cord (the season's mark). */
export function garland(n = 7): HTMLElement {
  const cols: [string, string][] = [['#ff5d6c', '#c22a3e'], ['#ffd25e', '#d39a26'], ['#3cc98a', '#1d8a5a'], ['#4aa8ff', '#2366c4'], ['#b48cff', '#7a52d8']];
  const W = 360, cord = (x: number) => 10 + Math.sin((x / W) * Math.PI) * 26;
  let s = `<svg viewBox="0 0 ${W} 120" preserveAspectRatio="xMidYMin meet"><path d="M0 10Q${W / 2} 62 ${W} 10" stroke="#e8c27a" stroke-width="1.6" fill="none" opacity=".8"/>`;
  for (let i = 0; i < n; i++) {
    const x = (W / (n + 1)) * (i + 1), y = cord(x) + 1, len = 14 + (i % 3) * 9, [a, b] = cols[i % cols.length];
    const ly = y + len;
    s += `<g class="sn-fan" style="--d:${(i * 0.37).toFixed(2)}s;transform-origin:${x}px ${y}px">`
      + `<path d="M${x} ${y}V${ly}" stroke="#e8c27a" stroke-width="1.2"/>`
      + `<circle cx="${x}" cy="${ly + 15}" r="18" fill="${a}" opacity=".18" class="sn-glow"/>`
      + `<path d="M${x - 6} ${ly}h12l4 6h-20z" fill="#e0a33a"/>`
      + `<path d="M${x - 9} ${ly + 6}Q${x} ${ly + 3} ${x + 9} ${ly + 6}L${x + 7} ${ly + 24}H${x - 7}Z" fill="${a}"/>`
      + `<path d="M${x - 2} ${ly + 6}V${ly + 24}M${x + 4} ${ly + 6}V${ly + 24}" stroke="${b}" stroke-width="1.4"/>`
      + `<rect x="${x - 3.5}" y="${ly + 10}" width="7" height="10" rx="2.5" fill="#fff3c4" opacity=".9"/>`
      + `<path d="M${x - 9} ${ly + 24}h18l-4 5h-10z" fill="#e0a33a"/><path d="M${x} ${ly + 29}v4" stroke="#e0a33a" stroke-width="1.6"/></g>`;
  }
  return el(`${s}</svg>`, 'sn-garland');
}

/** The live countdown tiles; returns its element and a stop function. */
function countdownTiles(start: Date): { node: HTMLElement; stop(): void } {
  const keys: SeasonKey[] = ['sn.days', 'sn.hours', 'sn.mins', 'sn.secs'];
  const nums = keys.map(() => h('b', {}, '0'));
  const node = h('div', { class: 'sn-cd', role: 'timer', 'aria-live': 'off' },
    ...keys.map((k, i) => h('div', { class: 'sn-cd-t' }, nums[i], h('span', {}, snt(k)))));
  const paint = () => {
    const c = countdown(start);
    [c.d, c.h, c.m, c.s].forEach((v, i) => {
      const txt = i === 0 ? String(v) : String(v).padStart(2, '0');
      if (nums[i].textContent === txt) return;
      nums[i].textContent = txt;
      nums[i].classList.remove('tick');
      void nums[i].offsetWidth;
      nums[i].classList.add('tick');
    });
    node.setAttribute('aria-label', `${c.d} ${snt('sn.days')}, ${c.h} ${snt('sn.hours')}`);
    if (c.ms <= 0) { stop(); setTimeout(() => window.dispatchEvent(new Event('ramadan-changed')), 1500); }
  };
  const id = window.setInterval(paint, 1000);
  const stop = () => clearInterval(id);
  paint();
  return { node, stop };
}

/** The night-sky hero: garland, crescent, title, and the countdown or the day of Ramadan. */
export function seasonHero(st: SeasonState, compact = false): { node: HTMLElement; stop(): void } {
  let stop = () => {};
  const kids: (Node | string)[] = [garland(compact ? 5 : 7), el(CRESCENT, 'sn-moon'), el('', 'sn-stars')];
  if (st.phase === 'soon') {
    kids.push(h('span', { class: 'sn-kicker' }, snt('sn.kicker')), h('h1', { class: 'sn-h' }, snt('sn.head', { year: st.year || '' })));
    if (st.start) {
      const cd = countdownTiles(st.start);
      stop = cd.stop;
      const date = st.start.toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      kids.push(cd.node, h('p', { class: 'sn-date' }, snt('sn.expected', { date })));
    }
    if (!compact) kids.push(lockPill());
  } else if (st.phase === 'open') {
    kids.push(h('span', { class: 'sn-kicker open' }, snt('sn.open')), h('h1', { class: 'sn-h' }, snt('sn.head', { year: st.year })),
      h('p', { class: 'sn-day' }, snt('sn.dayOf', { day: st.now.day ?? 1, n: st.now.length }) + (st.now.lastTen ? ` · ${snt('sn.lastTen')}` : '')),
      h('p', { class: 'sn-date' }, snt('sn.liveSub')));
  } else {
    kids.push(h('h1', { class: 'sn-h' }, snt('sn.eid')), h('p', { class: 'sn-date' }, snt('sn.eidSub')),
      h('button', { class: 'sn-btn', onclick: () => void import('./ramadan').then((m) => m.openRecap()) }, snt('sn.recap')));
  }
  return { node: h('section', { class: `sn-hero${compact ? ' compact' : ''} ph-${st.phase}` }, ...kids), stop };
}

/** One of the cast on its own little stage; a tap makes it hop and says who it is. */
export function castCard(c: (typeof CAST)[number], open: boolean, small = false): HTMLElement {
  const fig = h('span', { class: 'sn-fig' });
  const [g1, g2] = BG[c.fig.bg];
  fig.innerHTML = `<span class="sn-disc" aria-hidden="true"><svg viewBox="0 0 100 100"><defs><linearGradient id="snd${c.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${g1}"/><stop offset="1" stop-color="${g2}"/></linearGradient></defs><circle cx="50" cy="50" r="48" fill="url(#snd${c.id})"/>${bgDeco(c.fig.bg, 50, 50, 48)}<circle cx="36" cy="30" r="30" fill="#fff" opacity=".1"/></svg></span>`
    + figureSvg(c.fig, { label: snt(`sn.c.${c.id}` as SeasonKey) });
  const pc = WARDROBE[c.piece];
  const pieceName = rt(`fb.${c.piece.replace(':', '.')}` as RankKey);
  const card = h('button', {
    class: `sn-char${open ? ' open' : ''}${small ? ' small' : ''}`, type: 'button',
    onclick: () => { hop(fig, 22, 600); haptic(10); if (!small) toast(snt(`sn.c.${c.id}Line` as SeasonKey)); },
  }, fig,
  h('b', {}, snt(`sn.c.${c.id}` as SeasonKey)),
  small ? '' : h('span', { class: 'sn-role' }, snt(`sn.c.${c.id}Role` as SeasonKey)),
  small ? '' : h('span', { class: `sn-piece r-${pc?.r ?? 'rare'}` }, open ? '' : el(LOCK, 'sn-pl'), snt('sn.piece', { piece: pieceName })));
  return card;
}

/** The Khatm ring: 30 arcs, each filled as far as its juz is read. */
function khatmRing(fill: number[], locked: boolean, center: string, sub: string): HTMLElement {
  const R = 84, C = 100, gap = 2.2;
  const arc = (i: number, frac: number) => {
    const a0 = ((i * 12 + gap / 2 - 90) * Math.PI) / 180, a1 = ((i * 12 + gap / 2 + (12 - gap) * frac - 90) * Math.PI) / 180;
    const p = (a: number) => `${(C + R * Math.cos(a)).toFixed(2)} ${(C + R * Math.sin(a)).toFixed(2)}`;
    return `M${p(a0)}A${R} ${R} 0 0 1 ${p(a1)}`;
  };
  let s = '<svg viewBox="0 0 200 200" aria-hidden="true">';
  for (let i = 0; i < 30; i++) s += `<path d="${arc(i, 1)}" class="sn-k-track"/>`;
  fill.forEach((f, i) => { if (f > 0) s += `<path d="${arc(i, f)}" class="sn-k-fill${f >= 1 ? ' full' : ''}" style="--i:${i}"/>`; });
  // Juz numbers every five, outside the ring.
  for (const j of [1, 5, 10, 15, 20, 25, 30]) {
    const a = (((j - 0.5) * 12 - 90) * Math.PI) / 180;
    s += `<text x="${(C + 99 * Math.cos(a)).toFixed(1)}" y="${(C + 99 * Math.sin(a) + 3).toFixed(1)}" class="sn-k-n">${j}</text>`;
  }
  s += '</svg>';
  const ring = el(s, 'sn-k-ring', 'div');
  ring.append(h('div', { class: 'sn-k-mid' }, locked ? el(LOCK, 'sn-k-lock') : '', h('b', {}, center), h('span', {}, sub)));
  return ring;
}

function khatmSection(st: SeasonState, repaint: () => void): HTMLElement {
  const d = ramadanData(st.now);
  const open = st.phase !== 'soon';
  const total = planPages(d.plan);
  const done = d.khatms * PAGES + d.read.length;
  const fill = open ? juzFill(d.read) : Array(30).fill(0);
  const nextJuz = fill.findIndex((f) => f < 1) + 1;
  const center = d.plan && d.plan !== 'company' ? `${done}` : '—';
  const sub = d.plan && d.plan !== 'company' ? snt('sn.ofPages', { total }) : '';
  const plans: { v: Plan; k: string }[] = [{ v: 'one', k: 'ram.one' }, { v: 'two', k: 'ram.two' }, { v: 'company', k: 'ram.company' }];
  const note = d.plan === 'company' ? snt('sn.khatmCompany') : !d.plan ? snt('sn.khatmNone') : !open ? snt('sn.khatmEarly') : '';
  const sec = h('section', { class: `sn-sec sn-khatm${open ? ' open' : ''}` },
    h('div', { class: 'sn-sec-h' }, h('h2', {}, snt('sn.khatm')), open ? '' : lockPill()),
    h('p', { class: 'sn-sub' }, snt('sn.khatmSub')),
    khatmRing(fill, !open, center, sub),
    open && d.plan && d.plan !== 'company' ? h('p', { class: 'sn-k-line' },
      [d.khatms ? snt('sn.khatms', { n: d.khatms }) : '', nextJuz ? snt('sn.juz', { n: nextJuz }) + ` · p. ${juzStart(nextJuz)}` : ''].filter(Boolean).join(' · ')) : '',
    h('div', { class: 'sn-plans', role: 'group', 'aria-label': tr('ram.plan') }, ...plans.map((p) => h('button', {
      class: `sn-plan${d.plan === p.v ? ' on' : ''}`, 'aria-pressed': String(d.plan === p.v),
      onclick: () => {
        setPlan(d.plan === p.v ? null : p.v);
        haptic(10);
        if (!open && d.plan !== p.v) toast(snt('sn.planSet'));
        void import('./ramadan').then((m) => m.scheduleReminders());
        repaint();
      },
    }, tr(p.k as never)))),
    note ? h('p', { class: 'sn-note' }, note) : '');
  if (open && st.phase === 'open' && d.plan && d.plan !== 'company') {
    const btn = h('a', { class: 'sn-btn', href: '#/ramadan' }, snt('sn.read'));
    sec.append(btn);
    void import('./ramadan').then((m) => m.portionLabel()).then((l) => { if (l?.text) btn.before(h('p', { class: 'sn-k-line' }, snt('sn.today', { text: l.text }))); });
  }
  return sec;
}

function rewardsSection(st: SeasonState): HTMLElement {
  const open = st.phase !== 'soon';
  const room = h('div', { class: 'sn-room' });
  room.innerHTML = backSvg('night', 7, false, {}, 'ramadan', true);
  const card = h('div', { class: 'sn-streak' }, garland(4), el(CRESCENT, 'sn-streak-moon'), flame(2, 58, true), h('b', {}, '7'));
  const badges = seasonBadges(ramadanData(st.now));
  return h('section', { class: 'sn-sec' },
    h('div', { class: 'sn-sec-h' }, h('h2', {}, snt('sn.rewards')), open ? '' : lockPill()),
    h('div', { class: 'sn-rw' },
      h('div', { class: `sn-rw-c${open ? '' : ' locked'}` }, room, h('b', {}, snt('sn.sky')), h('span', {}, snt('sn.skySub'))),
      h('div', { class: `sn-rw-c${open ? '' : ' locked'}` }, card, h('b', {}, snt('sn.streak')), h('span', {}, snt('sn.streakSub')))),
    h('h3', { class: 'sn-h3' }, snt('sn.badges')),
    h('div', { class: 'sn-badges' }, ...badges.map((b) => h('div', { class: `sn-badge${b.earned ? ' earned' : ''}` },
      badgeArt('gold', BADGE_ICON[b.id], b.earned, 64),
      h('b', {}, snt(`sn.b.${b.id}` as SeasonKey)),
      h('span', {}, b.earned ? snt('sn.earned') : open ? `${snt(`sn.b.${b.id}Goal` as SeasonKey)} · ${b.have}/${b.need}` : snt(`sn.b.${b.id}Goal` as SeasonKey))))));
}

const REMIND = 'seasonRemind';
export const remindOn = () => { try { return localStorage.getItem(REMIND) === '1'; } catch { return false; } };

export async function showSeason(screen: HTMLElement): Promise<() => void> {
  let stopHero = () => {};
  const paint = () => {
    stopHero();
    const st = seasonState();
    const hero = seasonHero(st);
    stopHero = hero.stop;
    const open = st.phase !== 'soon';
    const remind = isNative() && st.phase === 'soon' ? h('button', {
      class: `sn-btn${remindOn() ? ' done' : ''}`, disabled: remindOn(),
      onclick: async () => {
        const { scheduleSeasonReminders } = await import('./seasonCard');
        try { localStorage.setItem(REMIND, '1'); } catch { /* ignore */ }
        await scheduleSeasonReminders();
        toast(snt('sn.remindSet'));
        paint();
      },
    }, remindOn() ? snt('sn.reminded') : snt('sn.remind')) : '';
    screen.replaceChildren(h('div', { class: 'sn' },
      h('header', { class: 'sn-top' },
        h('button', { class: 'sn-back', 'aria-label': snt('sn.back'), onclick: () => { if (history.length > 1) history.back(); else location.hash = '#/me'; } }, '‹'),
        h('span', {}, snt('sn.title'))),
      hero.node,
      remind,
      h('section', { class: 'sn-sec' },
        h('div', { class: 'sn-sec-h' }, h('h2', {}, snt('sn.cast'))),
        h('p', { class: 'sn-sub' }, open ? snt('sn.castLive') : snt('sn.castSub')),
        h('div', { class: 'sn-cast' }, ...CAST.map((c) => castCard(c, open))),
        open ? h('a', { class: 'sn-btn ghost', href: '#/me/room' }, snt('sn.dress')) : ''),
      khatmSection(st, paint),
      rewardsSection(st)));
  };
  paint();
  window.addEventListener('ramadan-changed', paint);
  return () => { stopHero(); window.removeEventListener('ramadan-changed', paint); };
}

/** The first-day teaser (once): the sky, the countdown, the four new characters, and a way in. */
export function openSeasonTeaser() {
  const st = seasonState();
  const hero = seasonHero(st, true);
  const d = h('dialog', { class: 'sn-tease', 'aria-label': snt('sn.teaseTitle') },
    hero.node,
    h('div', { class: 'sn-tease-body' },
      h('span', { class: 'sn-kicker' }, snt('sn.teaseKicker')),
      h('h2', {}, snt('sn.teaseTitle')),
      h('p', {}, snt('sn.teaseSub')),
      h('div', { class: 'sn-cast small' }, ...CAST.map((c) => castCard(c, st.phase !== 'soon', true))),
      h('a', { class: 'sn-btn', href: '#/season', autofocus: true, onclick: () => d.close() }, snt('sn.see')),
      h('button', { class: 'sn-later', onclick: () => d.close() }, snt('sn.later')))) as HTMLDialogElement;
  d.addEventListener('close', () => { hero.stop(); d.remove(); });
  d.addEventListener('cancel', () => d.close());
  document.body.append(d);
  d.showModal();
}
