// Learn tab (#/learn): the path (owner decision 2026-11-10). One winding path of chunky steps over a
// drawn dawn landscape: each surah a unit ("Surah 67 · Al-Mulk", long surahs in parts) in its own theme
// (surahTheme.ts), each step a lesson of the learner's chunk size, chests along the way that grow richer,
// the unit ending with a tasmi' of the whole surah, which earns the surah's Hifz badge (owner decision
// 2026-11-23, replacing the trees). Surahs due for review come back as review steps just above where the
// path stands. The start sheet picks where the path begins (Juz 'Amma, a surah or a juz), the chunk size
// and, for those who already know some surahs, a quick tasmi' of each that earns their badges straight away.
// #/learn/hifz is the Hifz shelf: every surah held, by juz.
import './learn.css';
import './learnPath.css';
import { CHUNK_SIZES, hifzAll, hifzAt, hifzNext, juzGate, juzGates, setChunk, started, surahJuz, tree, trees, type ChunkSize } from '../data/garden';
import { CHEST_EVERY, GATE_LIGHT, chestId, chestLight, loadSimilarKeys, markSimilarSeen, pathChunk, pathOrder, pathPosition, pathSet, pathStart, reviewSteps, setPath, startQuick, takeGrowth, unitsOf, type PathCtx, type PathStep, type PathUnit, type Start } from '../data/learnPath';
import { claimGoal, streak, todayRec } from '../data/journey';
import { LESSON_GOALS, goals, setGoals } from '../data/goals';
import { strength } from '../data/pageMemory';
import { chest } from './chest';
import { loadMeta, type SurahMeta } from '../data/quran';
import { surahName, t } from '../i18n';
import { lt, type LearnKey } from '../i18n/learn';
import { fe } from '../i18n/front';
import { practiceTarget } from '../data/practice';
import { liteMode } from '../lite';
import { h, haptic, toast } from './dom';
import { hifzBadge, juzGateArt } from './hifzBadge';
import { motifEl, themeVars } from './surahTheme';
import { icon } from './icons';
import { lightChip } from './lightChip';
import { isFlawless } from '../data/learnLamps';
import { lampChip } from './learnLamps';
import { inboxBell } from './inbox';
import { noorLine } from './noor';
import { tabBar } from './tabs';

const still = () => liteMode() || matchMedia('(prefers-reduced-motion: reduce)').matches;
const chunkLabel = (c: ChunkSize) => (c === 'half' ? lt('learn.chunkHalf') : c === 'page' ? lt('learn.chunkPage') : lt(c === 1 ? 'learn.chunk1' : 'learn.chunkN', { n: c }));
/** The path's sideways sway, in px, step by step. */
const SWAY = [0, 46, 70, 46, 0, -46, -70, -46];

const svg = (inner: string, size = 34) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', String(size)); s.setAttribute('height', String(size)); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = inner;
  return s;
};
const G = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>',
  star: '<path d="M12 2.5l2.1 4.6 5-.6-1.6 4.8 3.9 3.1-4.8 1.6.6 5-4.6-2.1-3.3 3.9-1.2-4.9-4.9-1.2 3.9-3.3L5 8.8l5 .6z" fill="currentColor"/>',
  drop: '<path d="M12 3c3 4 6 7.2 6 10.5a6 6 0 0 1-12 0C6 10.2 9 7 12 3z" fill="currentColor"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  page: '<rect x="5" y="3" width="14" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  twin: '<rect x="3" y="5" width="8" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2.3"/><rect x="13" y="5" width="8" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2.3"/><path d="M5.5 9.5h3M5.5 13h3M15.5 9.5h3M15.5 13h3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // A new lesson (F18): an open mushaf, so the path shows lessons, tasmi', pages and similar ayat apart.
  lesson: '<path d="M2.5 6.2c3.3-1.6 6.4-1.3 8.7.7V20c-2.3-1.7-5.4-2-8.7-.6z" fill="currentColor"/><path d="M21.5 6.2c-3.3-1.6-6.4-1.3-8.7.7V20c2.3-1.7 5.4-2 8.7-.6z" fill="currentColor" opacity=".8"/>',
  book: '<path d="M4 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z M20 5h-4a2 2 0 0 0-2 2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  dots: '<circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" fill="currentColor"/>',
  flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3-1-3 0-6 1-9z" fill="#ff9a2e"/><path d="M12 12c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1.5 1-2.5 3-5z" fill="#ffd04d"/>',
};

/** Light-coloured hills and the sun behind the path (decoration only). */
function scenery(): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'lp-scenery'); s.setAttribute('aria-hidden', 'true');
  s.setAttribute('viewBox', '0 0 390 844'); s.setAttribute('preserveAspectRatio', 'xMidYMin slice');
  s.innerHTML = `<circle cx="358" cy="112" r="36" class="lp-sun-halo"/><circle cx="358" cy="112" r="23" class="lp-sun"/><circle cx="368" cy="105" r="20" class="lp-moon-cut"/>`
    + `<path d="M0 220 C70 185 120 198 180 216 C250 236 300 192 390 206 L390 844 L0 844 Z" class="lp-hill1"/>`
    + `<path d="M0 270 C90 242 160 260 230 276 C300 292 340 266 390 272 L390 844 L0 844 Z" class="lp-hill2"/>`;
  return s;
}

export async function showPath(root: HTMLElement): Promise<() => void> {
  const [meta, juzOf, mushaf, similar] = await Promise.all([loadMeta(), surahJuz(), import('../data/mushaf').then((x) => x.loadMushaf()), loadSimilarKeys()]);
  root.classList.add('learn', 'lp');
  const earned = takeGrowth(); // a badge just earned or climbed: its place on the path glows once

  const order = () => pathOrder(pathStart(), juzOf);
  let earlier = 1; // surahs shown open before the one where the path stands
  const AHEAD = 3; // surahs shown open from where the path stands
  const openRuns = new Set<string>(); // folded juz lines the learner opened
  let due: { s: number }[] = []; // reviews still to weave in (paint → unitEl)
  let leadDone = false; // the START mark is placed once a paint
  /** The next thing to do (the step carrying START), for the Continue button. */
  let next: { what: string; hue: string; vars?: string; glyph: string; run: () => void } | null = null;
  let paintGen = 0; // a newer paint drops the pieces an older one still had to build
  const list = h('div', { class: 'lp-list' });
  const top = h('header', { class: 'lp-top' });
  const cont = h('button', { class: 'lp-cont', type: 'button' });
  const day = h('button', { class: 'lp-day', type: 'button', onclick: () => openDay() });
  const prac = h('a', { class: 'lp-prac', hidden: true });
  const dock = h('div', { class: 'lp-dock' }, day, cont, prac);
  root.append(scenery(), top, list, dock, tabBar('learn'));
  let ctx: PathCtx = { rank: new Map(), similar };
  const units = (k: number, ord: number[], pos: number) => unitsOf(meta[ord[k] - 1], mushaf, k <= pos, ctx);

  function paintTop() {
    top.replaceChildren(
      h('button', { class: 'lp-pill', type: 'button', onclick: () => openMenu(), 'aria-label': lt('learn.chooseStartAria') }, svg(G.book, 18), h('span', { class: 'lp-pill-t' }, lt('learn.choose'))),
      h('span', { class: 'lp-gap' }),
      lampChip(),
      lightChip(),
      inboxBell());
  }

  let pop: HTMLElement | null = null;
  const closePop = () => { pop?.remove(); pop = null; };

  const stepLabel = (st: PathStep) => st.kind === 'whole' ? lt('learn.stepTasmi')
    : st.kind === 'page' ? lt('learn.stepPage', { p: st.p! })
      : st.kind === 'similar' ? lt('learn.stepSimilar')
        : st.kind === 'chest' ? lt('learn.stepChest')
          : st.range[0] === st.range[1] ? lt('learn.stepAyah', { a: st.range[0] }) : lt('learn.stepAyat', { a: st.range[0], b: st.range[1] });

  function nodeFor(st: PathStep, i: number, m: SurahMeta, lead: boolean): HTMLElement {
    const label = stepLabel(st);
    // Lessons and the tasmi' wear the surah's own theme (set on the unit); pages, similar ayat and chests keep their colours.
    const hue = st.kind === 'page' ? 'teal' : st.kind === 'similar' ? 'violet' : st.kind === 'chest' ? 'amber' : 'theme';
    if (lead) next = { what: `${surahName(m)} · ${label}`, hue, vars: hue === 'theme' ? themeVars(m.n) : undefined, run: () => runStep(st),
      glyph: st.kind === 'page' ? G.page : st.kind === 'whole' ? G.mic : st.kind === 'similar' ? G.twin : G.lesson };
    if (st.kind === 'chest') return chestNode(st, i, m, label);
    const kind = st.kind;
    const glyph = st.state === 'done' ? G.check : st.kind === 'whole' ? G.mic : st.kind === 'page' ? G.page : st.kind === 'similar' ? G.twin : G.lesson;
    const btn = h('button', {
      class: `lp-node ${st.state} ${kind} hue-${hue}`, type: 'button',
      'aria-label': `${label} · ${surahName(m)} · ${lt(st.state === 'done' ? 'learn.stateDone' : st.state === 'current' ? 'learn.stateCurrent' : 'learn.stateLocked')}`,
      onclick: () => openPop(btn, st, label, m, hue),
    }, svg(glyph, st.kind === 'whole' ? 40 : st.kind === 'new' ? 34 : 30), h('span', { class: 'lp-shine', 'aria-hidden': 'true' }));
    const wrap = h('div', { class: 'lp-step', style: `--x:${SWAY[i % SWAY.length]}px` });
    if (lead) {
      wrap.classList.add('is-current');
      wrap.append(h('div', { class: 'lp-start', 'aria-hidden': 'true' }, lt('learn.start')));
    }
    // A lesson passed with no mistake keeps a gold star on its step.
    const flaw = st.kind === 'new' && st.state === 'done' && isFlawless(st.s, st.range[1]);
    if (flaw) btn.setAttribute('aria-label', `${btn.getAttribute('aria-label')} · ${lt('learn.flawlessMark')}`);
    wrap.append(h('div', { class: 'lp-nodewrap' }, lead ? h('span', { class: `lp-ring hue-${hue}`, 'aria-hidden': 'true' }) : '', btn,
      flaw ? h('span', { class: 'lp-flaw', 'aria-hidden': 'true' }, svg(G.star, 14)) : ''));
    if (st.kind !== 'new') wrap.append(h('span', { class: 'lp-cap' }, label));
    return wrap;
  }

  /** A chest on the path: Light for the lessons before it, opened straight from the path. */
  function chestNode(st: PathStep, i: number, m: SurahMeta, label: string): HTMLElement {
    const light = chestLight(st.s, st.k ?? 0);
    const wrap = h('div', { class: `lp-step lp-chest ${st.state}`, style: `--x:${SWAY[i % SWAY.length]}px` });
    const sub = lt('learn.chestSub', { n: CHEST_EVERY });
    const el = chest(light, st.state === 'current' ? 'ready' : st.state === 'done' ? 'open' : 'locked', `${lt('learn.chestTitle')} · ${surahName(m)} · ${sub}`,
      (b) => void openChest(st, m, b));
    if (st.state === 'locked') {
      const b = h('button', { class: 'lp-chest-hit', type: 'button', 'aria-label': `${label} · ${lt('learn.stateLocked')}`, onclick: () => openPop(b, st, label, m, 'amber') }, el);
      wrap.append(b);
    } else wrap.append(el);
    return wrap;
  }
  let opening = false;
  async function openChest(st: PathStep, m: SurahMeta, from: Element) {
    if (opening) return;
    opening = true;
    haptic();
    try {
      const c = await import('./celebrate');
      await c.celebrate({ kind: 'chest', kicker: surahName(m), title: lt('learn.chestTitle'), sub: lt('learn.chestSub', { n: CHEST_EVERY }) }, from, chestLight(st.s, st.k ?? 0));
    } finally {
      opening = false;
      claimGoal(chestId(st.s, st.range[1]), chestLight(st.s, st.k ?? 0));
    }
  }

  /** Moves a step's card sideways so it stays inside the screen (a step on the path's outer bend pushed it off the edge). */
  function keepInView(el: HTMLElement) {
    const r = el.getBoundingClientRect(), vw = document.documentElement.clientWidth, m = 12;
    const dx = r.left < m ? m - r.left : r.right > vw - m ? vw - m - r.right : 0;
    if (dx) el.style.translate = `${Math.round(dx)}px 0`;
  }

  function openPop(at: HTMLElement, st: PathStep, label: string, m: SurahMeta, hue: string) {
    haptic();
    const same = pop && pop.dataset.for === `${st.s}:${st.range[0]}:${st.kind}`;
    closePop();
    if (same) return;
    const go = () => runStep(st);
    const sub: LearnKey = st.kind === 'whole' ? 'learn.tasmiSub' : st.kind === 'page' ? 'learn.pageSub' : st.kind === 'similar' ? 'learn.similarSub' : 'learn.newSub';
    const act: LearnKey = st.kind === 'whole' ? 'learn.startTasmi' : st.kind === 'page' ? 'learn.startPage' : st.kind === 'similar' ? 'learn.startSimilar' : 'learn.startLesson';
    const body = st.state === 'locked'
      ? [h('p', {}, lt(st.kind === 'chest' ? 'learn.chestLocked' : 'learn.lockedSub'))]
      : st.state === 'done'
        ? [h('p', {}, lt('learn.doneStepSub')), h('button', { class: 'lp-btn ghost', type: 'button', onclick: go }, lt('learn.practise'))]
        : [h('p', {}, lt(sub)), h('button', { class: `lp-btn hue-${hue}`, type: 'button', onclick: go }, lt(act))];
    pop = h('div', { class: `lp-pop ${st.state} hue-${hue}`, role: 'dialog', 'aria-label': label, 'data-for': `${st.s}:${st.range[0]}:${st.kind}` },
      h('b', {}, label), h('span', { class: 'lp-pop-sub' }, st.kind === 'page' ? surahName(m) : `${surahName(m)} · ${m.n}:${st.range[0]}${st.range[1] > st.range[0] ? `–${st.range[1]}` : ''}`), ...body);
    at.parentElement!.append(pop);
    keepInView(pop);
    (pop.querySelector('button') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  /** Opens a step: a lesson, a page's memory screen, the similar ayat or a chest. */
  function runStep(st: PathStep, from?: Element) {
    closePop();
    if (st.kind === 'page') {
      try { sessionStorage.setItem('pmFromPath', String(st.p)); sessionStorage.removeItem('pmGate'); sessionStorage.setItem('pmMode', 'starts'); } catch { /* ignore */ }
      location.hash = `#/learn/page/${st.p}`;
    } else if (st.kind === 'similar') {
      const [a, b] = st.range;
      void import('./tasmi').then((x) => x.similarSheet(st.s, a, b, { done: lt('learn.simGotIt'), onDone: () => markSimilarSeen(st.s, a, b) }));
    } else if (st.kind === 'chest') {
      const el = list.querySelector('.lp-chest.current .chest');
      el?.scrollIntoView({ block: 'center', behavior: still() ? 'auto' : 'smooth' });
      void openChest(st, meta[st.s - 1], el ?? from ?? cont);
    } else location.hash = st.state === 'done' && (st.kind === 'new' || st.kind === 'whole') ? `#/learn/${st.s}/review` : `#/learn/${st.s}`;
  }

  /** The surahs starting in each juz, and where in path order the last of them stands. */
  function gatesOf(ord: number[]) {
    const last = new Map<number, number>(); // path index → juz whose gate follows it
    const byJuz = new Map<number, number>();
    ord.forEach((s, k) => byJuz.set(juzOf[s - 1], k));
    for (const [j, k] of byJuz) last.set(k, j);
    return last;
  }
  const gateState = (j: number): PathStep['state'] => juzGate(j) ? 'done' : meta.every((m) => juzOf[m.n - 1] !== j || tree(m.n)?.full) ? 'current' : 'locked';
  /** The weakest page of a juz's surahs (where its checkpoint is recited). */
  function gatePage(j: number): number {
    const pages = new Set<number>();
    for (const m of meta) if (juzOf[m.n - 1] === j) for (let a = 1; a <= m.ayahs; a++) pages.add(mushaf.pageOf(m.n, a));
    let best = 0, low = 2;
    for (const p of [...pages].sort((a, b) => a - b)) { const v = strength(p); if (v < low) { low = v; best = p; } }
    return best || [...pages][0];
  }
  function gateEl(j: number, lead: boolean): HTMLElement {
    const state = gateState(j);
    const title = lt('learn.gateTitle', { n: j });
    const wrap = h('section', { class: `lp-gate ${state}${lead ? ' is-current' : ''}`, 'aria-label': lt('learn.gateKicker', { n: j }) });
    if (lead) next = { what: lt('learn.gateKicker', { n: j }), hue: 'violet', glyph: G.mic, run: () => startGate(j, gatePage(j)) };
    const pic = juzGateArt(j, state, 112);
    const btn = h('button', { class: 'lp-gate-btn', type: 'button', 'aria-label': `${title} · ${lt(state === 'done' ? 'learn.stateDone' : state === 'current' ? 'learn.stateCurrent' : 'learn.stateLocked')}`, onclick: () => {
      haptic();
      const same = pop?.dataset.for === `gate:${j}`;
      closePop();
      if (same) return;
      const p = state === 'current' ? gatePage(j) : 0;
      pop = h('div', { class: `lp-pop ${state} hue-violet`, role: 'dialog', 'aria-label': title, 'data-for': `gate:${j}` },
        h('b', {}, title), h('span', { class: 'lp-pop-sub' }, lt('learn.gateKicker', { n: j })),
        ...(state === 'done' ? [h('p', {}, lt('learn.gatePassed2', { n: j })), h('a', { class: 'lp-btn ghost', href: '#/learn/hifz' }, lt('learn.hifzShelf'))]
          : state === 'locked' ? [h('p', {}, lt('learn.gateLocked'))]
            : [h('p', {}, lt('learn.gateSub')), h('span', { class: 'lp-pop-sub' }, `${lt('learn.gatePage', { p })} · +${GATE_LIGHT} ✦`),
              h('button', { class: 'lp-btn hue-violet', type: 'button', onclick: () => startGate(j, p) }, lt('learn.gateStart'))]));
      btn.parentElement!.append(pop);
      keepInView(pop);
      (pop.querySelector('button, a') as HTMLElement | null)?.focus({ preventScroll: true });
    } }, pic);
    wrap.append(
      lead ? h('div', { class: 'lp-start', 'aria-hidden': 'true' }, lt('learn.start')) : '',
      h('span', { class: 'lp-kicker' }, lt('learn.gateKicker', { n: j })),
      h('div', { class: 'lp-gate-wrap' }, btn),
      h('span', { class: 'lp-cap' }, title));
    return wrap;
  }
  /** A gate, with any thirsty trees' reviews just before it when it is the step to do now. */
  function gateWithReviews(j: number): HTMLElement[] {
    const cur = gateState(j) === 'current' && !leadDone;
    const out: HTMLElement[] = [];
    if (cur && due.length) {
      out.push(h('div', { class: 'lp-steps' }, ...due.map((tr, q) => reviewNode(tr.s, q + 1, q === 0))));
      due = [];
      leadDone = true;
    }
    const lead = cur && !leadDone;
    if (cur) leadDone = true;
    out.push(gateEl(j, lead));
    return out;
  }
  function startGate(j: number, p: number) {
    closePop();
    try { sessionStorage.setItem('pmGate', `${j}:${p}`); sessionStorage.removeItem('pmFromPath'); sessionStorage.setItem('pmMode', 'recite'); } catch { /* ignore */ }
    location.hash = `#/learn/page/${p}`;
  }

  /** Daily lessons target (the Learn goal on Me): a ring beside Continue. */
  function paintDay() {
    const target = goals().lessons;
    const done = todayRec().ls ?? 0;
    const f = target ? Math.min(1, done / target) : 0;
    const met = target > 0 && done >= target;
    day.className = `lp-day${met ? ' met' : ''}${target ? '' : ' none'}`;
    day.setAttribute('aria-label', target ? lt('learn.dayAria', { n: done, of: target }) : lt('learn.dayNoneAria', { n: done }));
    const C = 2 * Math.PI * 21;
    day.replaceChildren(svg(`<circle cx="24" cy="24" r="21" class="lp-day-bg"/><circle cx="24" cy="24" r="21" class="lp-day-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}" transform="rotate(-90 24 24)"/>`, 52),
      h('span', { class: 'lp-day-n' }, met ? svg(G.check, 22) : target ? `${done}/${target}` : '+',
        met ? '' : h('small', {}, lt(target ? 'learn.dayToday' : 'learn.dayGoal'))));
    (day.firstChild as SVGSVGElement).setAttribute('viewBox', '0 0 48 48');
  }
  function openDay() {
    haptic();
    const cur = goals().lessons;
    const d = sheet('lp-daysheet', lt('learn.daySet'),
      h('p', { class: 'muted' }, lt('learn.daySetSub')),
      h('div', { class: 'lp-chips', role: 'radiogroup' }, ...LESSON_GOALS.map((n) => h('button', {
        class: `chip${n === cur ? ' on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(n === cur),
        onclick: () => { setGoals({ ...goals(), lessons: n }); d.close(); },
      }, n ? lt('learn.dayN', { n }) : lt('learn.dayOff')))));
  }

  /** The end of a surah: its Hifz badge, waiting (slate), earned in its tier, or dusty when a review is due. */
  function hifzEnd(m: SurahMeta): HTMLElement {
    const tr = tree(m.n);
    const hz = tr ? hifzAt(tr) : null;
    const cap = hz ? lt(hz.due ? 'learn.hzDue' : 'learn.hzTier', { tier: lt(`learn.hz${hz.tier}` as LearnKey) }) : lt('learn.hzWaiting');
    return h('button', { class: `lp-hifz${hz ? ' held' : ''}${hz?.due ? ' due' : ''}${earned?.s === m.n ? ' grew' : ''}`, type: 'button', 'aria-label': `${lt('learn.hzOf', { name: surahName(m) })} · ${cap}`, onclick: () => openHifz(m) },
      hifzBadge(m.n, hz?.tier ?? 0, 96, hz ? (hz.due ? 'due' : '') : 'locked'), h('span', { class: 'lp-cap' }, cap));
  }

  function unitEl(u: PathUnit): HTMLElement {
    const m = meta[u.s - 1];
    const done = u.steps.filter((x) => x.state === 'done').length;
    const first = u.steps[0], lastNew = [...u.steps].reverse().find((x) => x.kind === 'new');
    const ayat = lastNew ? `${first.range[0]}–${lastNew.range[1]}` : `1–${m.ayahs}`;
    const kicker = u.of > 1 ? lt('learn.unitPart', { n: m.n, k: u.part, of: u.of }) : lt('learn.unitSurah', { n: m.n });
    const banner = h('div', { class: 'lp-banner' }, motifEl(m.n),
      h('div', { class: 'lp-banner-t' },
        h('span', { class: 'lp-kicker' }, kicker),
        h('h2', {}, surahName(m)),
        h('span', { class: 'lp-banner-sub' }, lt('learn.unitSub', { ayat, done, of: u.steps.length }))),
      // In the Arabic interface the title already is the Arabic name: it shows once (front-end review G7).
      surahName(m) === m.ar || document.documentElement.lang === 'ar' ? '' : h('span', { class: 'lp-banner-ar', lang: 'ar', dir: 'rtl' }, m.ar),
      h('button', { class: 'lp-banner-btn', type: 'button', 'aria-label': lt('learn.unitOptions', { name: surahName(m) }), onclick: () => openUnit(m) }, svg(G.dots, 22)));
    const steps: HTMLElement[] = [];
    let i = 0;
    for (const st of u.steps) {
      if (st.state === 'current' && due.length) { due.forEach((tr, q) => steps.push(reviewNode(tr.s, i++, q === 0 && !leadDone))); due = []; leadDone = true; }
      const lead = st.state === 'current' && !leadDone;
      if (lead) leadDone = true;
      steps.push(nodeFor(st, i++, m, lead));
    }
    const box = h('section', { class: 'lp-unit', style: themeVars(m.n), 'aria-label': `${kicker} · ${surahName(m)}` }, banner, h('div', { class: 'lp-steps' }, ...steps));
    if (u.last) box.append(hifzEnd(m));
    return box;
  }

  /** A thirsty tree's review, woven into the path just before the step to do now. */
  function reviewNode(s: number, i: number, lead: boolean): HTMLElement {
    const m = meta[s - 1];
    const label = lt('learn.reviewOf', { name: surahName(m) });
    const wrap = h('div', { class: 'lp-step lp-rv', style: `--x:${SWAY[i % SWAY.length]}px` });
    if (lead) {
      wrap.classList.add('is-current'); wrap.append(h('div', { class: 'lp-start hue-blue', 'aria-hidden': 'true' }, lt('learn.reviewHere')));
      next = { what: label, hue: 'blue', glyph: G.drop, run: () => { location.hash = `#/learn/${s}`; } };
    }
    wrap.append(
      h('div', { class: 'lp-nodewrap' }, lead ? h('span', { class: 'lp-ring hue-blue', 'aria-hidden': 'true' }) : '',
        h('button', { class: 'lp-node current review hue-blue', type: 'button', 'aria-label': `${label} · ${lt('learn.reviewWater')}`, onclick: () => { location.hash = `#/learn/${s}`; } }, svg(G.drop, 32), h('span', { class: 'lp-shine', 'aria-hidden': 'true' }))),
      h('span', { class: 'lp-cap' }, label));
    return wrap;
  }

  /** Reviews when the path is finished (nothing left to weave them into). */
  function reviewEl(list: readonly { s: number }[]): HTMLElement | null {
    if (!list.length) return null;
    return h('section', { class: 'lp-unit lp-review', 'aria-label': lt('learn.reviewTitle') },
      h('div', { class: 'lp-banner hue-blue' },
        h('div', { class: 'lp-banner-t' }, h('span', { class: 'lp-kicker' }, lt('learn.reviewKicker')), h('h2', {}, lt(list.length === 1 ? 'learn.review1' : 'learn.reviewN', { n: list.length })),
          h('span', { class: 'lp-banner-sub' }, lt('learn.reviewWater')))),
      h('div', { class: 'lp-steps' }, ...list.map((tr, i) => reviewNode(tr.s, i + 1, i === 0))));
  }

  /** Surahs far from where the path stands, folded into one line per juz (opened by a tap). */
  function foldEl(run: number[], j: number, key: string, open: boolean): HTMLElement {
    const grown = run.filter((s) => tree(s)?.full).length; // held by heart (Hifz badge earned)
    const juz = lt('learn.juzN', { n: j });
    const a = surahName(meta[run[0] - 1]), b = surahName(meta[run[run.length - 1] - 1]);
    const pct = Math.round((grown / run.length) * 100);
    return h('button', {
      class: `lp-fold${grown === run.length ? ' all' : grown ? ' some' : ''}${open ? ' open' : ''}`, type: 'button', 'aria-expanded': String(open),
      'aria-label': lt(open ? 'learn.foldClose' : 'learn.foldOpen', { juz }),
      onclick: () => { if (openRuns.has(key)) openRuns.delete(key); else openRuns.add(key); paint(); },
    },
      h('span', { class: 'lp-fold-n' }, String(j)),
      h('span', { class: 'lp-fold-t' },
        h('b', {}, juz, h('span', {}, ' · ', run.length === 1 ? lt('learn.foldSurah1') : lt('learn.foldSurahs', { n: run.length }))),
        h('span', { class: 'lp-fold-sub' }, run.length === 1 ? a : `${a} – ${b}`),
        h('span', { class: 'lp-fold-bar', 'aria-label': lt('learn.heldOf', { n: grown, of: run.length }) }, h('i', { style: `width:${pct}%` }))),
      h('span', { class: 'lp-fold-c', 'aria-hidden': 'true' }, svg('<path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>', 22)));
  }

  /** The bottom Continue button: always the next thing to do (a review first, then the current step). */
  /** Practice: about three minutes on the words that slip most, or the page that most needs a revision. */
  function paintPrac() {
    const p = practiceTarget();
    prac.hidden = !p;
    if (!p) return;
    const what = p.kind === 'page' ? fe('pr.page', { p: p.p }) : fe('pr.words', { n: p.n, name: surahName(meta[p.s - 1]) });
    prac.setAttribute('href', p.href);
    prac.setAttribute('aria-label', fe('pr.btnAria', { what }));
    prac.title = what;
    prac.replaceChildren(svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor"/>', 24), h('span', {}, fe('pr.btn')));
    prac.onclick = () => haptic();
  }

  function paintCont() {
    paintPrac();
    dock.hidden = !next;
    if (!next) return;
    const { what, hue, vars, glyph, run } = next;
    cont.className = `lp-cont hue-${hue}`;
    cont.style.cssText = vars ?? '';
    cont.setAttribute('aria-label', lt('learn.contAria', { what }));
    cont.replaceChildren(h('span', { class: 'lp-cont-t' }, h('b', {}, lt('learn.continue')), h('span', {}, what)), svg(glyph, 26));
    cont.onclick = () => { haptic(); run(); };
  }

  function paint() {
    closePop();
    paintTop();
    const ord = order();
    const pos = pathPosition(ord);
    ctx = { rank: new Map(ord.map((s, k) => [s, k])), similar };
    const gates = gatesOf(ord);
    const dueList = reviewSteps();
    due = pos < ord.length ? [...dueList] : [];
    leadDone = false;
    next = null;
    // Near where the path stands every unit is open; further away, one folded line per juz. Each piece is
    // built in path order; what lies well below the step to do now is built after the screen shows, a few
    // pieces a task, so opening the tab never freezes (a long surah's parts and chests are many nodes).
    const lo = Math.max(0, pos - earlier), hi = Math.min(ord.length, pos + AHEAD);
    const parts: { big: boolean; make: () => HTMLElement[] }[] = [];
    let k = 0;
    while (k < ord.length) {
      if (k >= lo && k < hi) {
        const q = k;
        for (const u of units(q, ord, pos)) parts.push({ big: true, make: () => [unitEl(u)] });
        const j = gates.get(k);
        if (j) parts.push({ big: false, make: () => gateWithReviews(j) });
        k++;
        continue;
      }
      const j = juzOf[ord[k] - 1];
      let e = k;
      while (e < ord.length && !(e >= lo && e < hi) && juzOf[ord[e] - 1] === j) e++;
      const run = ord.slice(k, e);
      const key = `${j}:${run[0]}`;
      const open = openRuns.has(key);
      parts.push({ big: false, make: () => [foldEl(run, j, key, open)] });
      for (let q = k; q < e; q++) {
        if (open) for (const u of units(q, ord, pos)) parts.push({ big: true, make: () => [unitEl(u)] });
        const gj = gates.get(q);
        if (gj && (open || gateState(gj) === 'current')) parts.push({ big: false, make: () => gateWithReviews(gj) });
      }
      k = e;
    }
    if (pos >= ord.length) parts.push({ big: false, make: () => {
      const r = reviewEl(dueList);
      return [...(r ? [r] : []), h('p', { class: 'lp-end' }, lt('learn.allDone'))];
    } });
    parts.push({ big: false, make: () => [noorLine('learn')] });
    // Built now: everything up to the step to do now and two open units after it (room to centre it).
    // A badge just earned may stand anywhere, so then everything is built at once.
    const out: HTMLElement[] = [];
    let i = 0, after = -1;
    while (i < parts.length) {
      const pt = parts[i++];
      out.push(...pt.make());
      if (after < 0) { if (leadDone && !earned) after = 0; } else if (pt.big && ++after >= 2) break;
    }
    if (!trees().some(started)) {
      const st = pathStart();
      const where = st.kind === 'amma' ? lt('learn.startAmma') : st.kind === 'surah' ? surahName(meta[st.s - 1]) : lt('learn.juzN', { n: st.j });
      out.unshift(h('div', { class: 'lp-intro' },
        h('span', {}, lt('learn.introAt', { where })),
        h('span', { class: 'lp-intro-links' },
          h('button', { type: 'button', onclick: () => void openStart() }, lt('learn.introChange')),
          h('button', { type: 'button', onclick: () => void openStart() }, lt('learn.knowTitle')))));
    }
    list.replaceChildren(...out);
    paintCont();
    paintDay();
    const gen = ++paintGen;
    const step = () => {
      if (gen !== paintGen) return;
      const t0 = performance.now(), more: HTMLElement[] = [];
      while (i < parts.length && performance.now() - t0 < 8) more.push(...parts[i++].make());
      list.append(...more);
      if (i < parts.length) setTimeout(step, 0);
    };
    if (i < parts.length) setTimeout(step, 0);
  }

  // --- sheets ---
  const sheet = (cls: string, title: string, ...content: (Node | string)[]) => {
    const d = h('dialog', { class: `sheet bottom learn-sheet ${cls}` },
      h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
      ...content);
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
    return d;
  };

  function chunkChips(cur: ChunkSize, pick: (c: ChunkSize) => void) {
    const box = h('div', { class: 'lp-chips', role: 'radiogroup' });
    const paintC = (c: ChunkSize) => box.replaceChildren(...CHUNK_SIZES.map((x) => h('button', {
      class: `chip${x === c ? ' on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(x === c), onclick: () => { pick(x); paintC(x); },
    }, chunkLabel(x))));
    paintC(cur);
    return box;
  }

  function openUnit(m: SurahMeta) {
    const tr = tree(m.n);
    const d = sheet('lp-unit-sheet', surahName(m),
      h('h3', {}, lt('learn.chunkTitle')),
      chunkChips(tr?.chunk ?? pathChunk(), (c) => {
        if (tr) setChunk(m.n, c);
        else setPath(pathStart(), c);
        paint();
      }),
      h('p', { class: 'muted small' }, lt('learn.chunkNote')),
      h('div', { class: 'learn-sheet-foot' },
        h('button', { class: 'chip', type: 'button', onclick: () => { d.close(); setPath({ kind: 'surah', s: m.n }, pathChunk()); earlier = 1; paint(); } }, lt('learn.startHere'))));
  }

  /** A surah's Hifz badge: its tier, when its review is due and how long until the next tier. */
  function openHifz(m: SurahMeta) {
    const tr = tree(m.n);
    const hz = tr ? hifzAt(tr) : null;
    const nx = tr ? hifzNext(tr) : null;
    const learned = tr?.learned ?? 0;
    const days = hz ? Math.ceil((hz.dueAt - Date.now()) / 86_400_000) : 0;
    const lines: (Node | string)[] = hz
      ? [h('p', { class: 'lp-hz-tier' }, lt('learn.hzTier', { tier: lt(`learn.hz${hz.tier}` as LearnKey) })),
        h('p', {}, hz.due ? lt('learn.hzDueSub') : days <= 1 ? lt('learn.hzNext1') : lt('learn.hzNextN', { n: days })),
        nx ? h('p', { class: 'muted small' }, lt('learn.hzClimb', { tier: lt(`learn.hz${nx.tier}` as LearnKey), n: Math.max(1, nx.inDays) })) : h('p', { class: 'muted small' }, lt('learn.hzTop'))]
      : [h('p', {}, lt('learn.hzEarn')), h('div', { class: 'learn-bar' }, h('i', { style: `width:${Math.round((learned / m.ayahs) * 100)}%` })), h('p', { class: 'muted small' }, lt('learn.doneSub2', { n: learned, of: m.ayahs }))];
    sheet('learn-tree lp-hz-sheet', surahName(m),
      h('div', { class: 'learn-tree-top' },
        hifzBadge(m.n, hz?.tier ?? 0, 112, hz ? (hz.due ? 'due' : '') : 'locked'),
        h('div', {}, h('div', { class: 'learn-tree-ar', lang: 'ar', dir: 'rtl' }, m.ar), ...lines)),
      h('p', { class: 'muted small' }, lt('learn.hzRule')),
      h('div', { class: 'learn-tree-acts' },
        h('a', { class: 'chip', href: '#/learn/hifz' }, lt('learn.hifzShelf')),
        h('a', { class: 'primary brand-btn learn-go', href: `#/learn/${m.n}` }, lt(tr?.full ? (hz?.due ? 'learn.goReviewNow' : 'learn.goRecite') : 'learn.continue'))));
  }

  /** F4: the path's menu (where to start, page memory, the Hifz shelf), so the top bar keeps only lamps, Light and the bell. */
  function openMenu() {
    const item = (ic: string, label: string, go: () => void) => h('button', { class: 'menu-item lp-menu-item', type: 'button', onclick: () => { d.close(); go(); } },
      svg(ic, 20), h('span', {}, label));
    const d = sheet('lp-menu', lt('learn.choose'),
      h('div', { class: 'menu' },
        item(G.book, lt('learn.startTitle'), () => void openStart()),
        item(G.page, lt('learn.pmOpen'), () => { location.hash = '#/learn/pages'; }),
        item(G.heart, lt('learn.hifzShelf'), () => { location.hash = '#/learn/hifz'; })));
  }

  async function openStart(first = false) {
    if (document.querySelector('.lp-startsheet[open]')) return; // already open: never a second one
    const ord0 = order();
    let start: Start = pathStart();
    let chunk: ChunkSize = pathChunk();
    const known = new Set<number>();
    let shown = 12;
    const surahSel = h('select', { class: 'lp-select', 'aria-label': lt('learn.pickSurah') },
      ...meta.map((m) => h('option', { value: String(m.n), selected: start.kind === 'surah' && start.s === m.n }, `${m.n}. ${surahName(m)}`)));
    const juzSel = h('select', { class: 'lp-select', 'aria-label': lt('learn.pickJuz') },
      ...Array.from({ length: 30 }, (_, i) => h('option', { value: String(i + 1), selected: start.kind === 'juz' && start.j === i + 1 }, lt('learn.juzN', { n: i + 1 }))));
    const opt = (kind: Start['kind'], title: LearnKey, sub: LearnKey, extra?: HTMLElement) => {
      const b = h('button', { class: 'lp-opt', type: 'button', role: 'radio', onclick: () => { start = kind === 'amma' ? { kind } : kind === 'surah' ? { kind, s: Number(surahSel.value) } : { kind, j: Number(juzSel.value) }; paintOpts(); } },
        h('span', { class: 'lp-opt-ic' }, svg(G.book, 22)), h('span', { class: 'lp-opt-t' }, h('b', {}, lt(title)), h('span', {}, lt(sub))));
      return { kind, el: h('div', { class: 'lp-opt-wrap' }, b, extra ?? ''), b };
    };
    const opts = [opt('amma', 'learn.startAmma', 'learn.startAmmaSub'), opt('surah', 'learn.startSurah', 'learn.startSurahSub', surahSel), opt('juz', 'learn.startJuz', 'learn.startJuzSub', juzSel)];
    surahSel.onchange = () => { start = { kind: 'surah', s: Number(surahSel.value) }; paintOpts(); };
    juzSel.onchange = () => { start = { kind: 'juz', j: Number(juzSel.value) }; paintOpts(); };
    const knownBox = h('div', { class: 'lp-chips' });
    const go = h('button', { class: 'lp-btn hue-green lp-go', type: 'button' });
    function paintKnown() {
      const ord = pathOrder(start, juzOf).filter((s) => !tree(s)?.full);
      knownBox.replaceChildren(...ord.slice(0, shown).map((s) => h('button', {
        class: `chip${known.has(s) ? ' on' : ''}`, type: 'button', 'aria-pressed': String(known.has(s)),
        onclick: () => { if (known.has(s)) known.delete(s); else known.add(s); paintKnown(); },
      }, known.has(s) ? icon('check', 14) : '', surahName(meta[s - 1]))),
      ord.length > shown ? h('button', { class: 'chip ghost', type: 'button', onclick: () => { shown += 24; paintKnown(); } }, lt('learn.more')) : '');
      go.textContent = known.size ? lt('learn.quickN', { n: known.size }) : lt('learn.startPath');
    }
    function paintOpts() {
      for (const o of opts) { const on = o.kind === start.kind; o.b.classList.toggle('on', on); o.b.setAttribute('aria-checked', String(on)); }
      surahSel.hidden = start.kind !== 'surah'; juzSel.hidden = start.kind !== 'juz';
      paintKnown();
    }
    const d = sheet('lp-startsheet', lt('learn.startTitle'),
      h('p', { class: 'muted' }, lt('learn.startSub')),
      h('div', { class: 'lp-opts', role: 'radiogroup' }, ...opts.map((o) => o.el)),
      h('h3', {}, lt('learn.chunkTitle')),
      chunkChips(chunk, (c) => { chunk = c; }),
      h('h3', {}, lt('learn.knowTitle')),
      h('p', { class: 'muted small' }, lt('learn.knowSub')),
      knownBox,
      h('div', { class: 'learn-sheet-foot' }, go));
    go.onclick = () => {
      setPath(start, chunk);
      d.close();
      earlier = 1;
      if (known.size) {
        const ord = pathOrder(start, juzOf).filter((s) => known.has(s));
        startQuick(ord);
        location.hash = `#/learn/${ord[0]}/tasmi`;
      } else paint();
    };
    if (first) d.addEventListener('cancel', () => setPath(start, chunk));
    paintOpts();
    void ord0;
  }

  paint();
  void import('./pathBuddy').then((b) => b.pathBuddy(list));
  // Scroll the step to do now into view (or a badge just earned, which glows once).
  const toCurrent = () => requestAnimationFrame(() => {
    const cur = list.querySelector('.lp-hifz.grew') ?? list.querySelector('.lp-step.is-current');
    cur?.scrollIntoView({ block: 'center', behavior: still() ? 'auto' : 'smooth' });
  });
  // Built ahead while another tab shows (main.ts): scrolled into view when first shown instead.
  let scrollOnShow = root.classList.contains('screen-kept');
  if (!scrollOnShow) toCurrent();
  // F8: no sheet on the first visit: Juz 'Amma, one ayah at a time, and the path at once.
  if (!pathSet()) setPath({ kind: 'amma' }, 1);

  const onClick = (e: MouseEvent) => { if (pop && !(e.target as Element).closest('.lp-pop, .lp-node, .lp-gate-btn, .lp-chest-hit')) closePop(); };
  // Kept alive while another tab shows (main.ts): a change waits, and is painted (with the step to do now in view)
  // when the path shows again, e.g. back from a lesson.
  let dirty = false;
  const onChange = () => { if (root.classList.contains('screen-kept')) dirty = true; else paint(); };
  root.addEventListener('screen-shown', () => {
    if (scrollOnShow && !dirty) { scrollOnShow = false; toCurrent(); }
    if (!dirty) return;
    dirty = false;
    paint();
    toCurrent();
  });
  document.addEventListener('click', onClick);
  window.addEventListener('garden-changed', onChange);
  window.addEventListener('journey-changed', onChange);
  return () => {
    closePop();
    paintGen++;
    document.querySelector<HTMLDialogElement>('.lp-startsheet[open]')?.close(); // leaving Learn: its start sheet goes too
    document.removeEventListener('click', onClick);
    window.removeEventListener('garden-changed', onChange);
    window.removeEventListener('journey-changed', onChange);
  };
}

/** #/learn/hifz: the Hifz shelf. Every surah held by heart, by juz, each badge in its tier (dusty when due), the
 *  juz gates passed, and how many surahs are held in all. */
export async function showHifzShelf(root: HTMLElement): Promise<() => void> {
  const [meta, juzOf] = await Promise.all([loadMeta(), surahJuz()]);
  root.classList.add('learn', 'lp', 'lp-garden');
  const held = hifzAll();
  const growing = trees().filter((t) => started(t) && !t.full).sort((a, b) => a.s - b.s);
  const byJuz = new Map<number, typeof held>();
  for (const x of held) { const j = juzOf[x.s - 1]; byJuz.set(j, [...(byJuz.get(j) ?? []), x]); }
  const tiers = [0, 0, 0, 0, 0];
  for (const x of held) tiers[x.tier]++;
  const card = (s: number, tier: number, state: '' | 'due' | 'locked', sub: string) => h('a', { class: `lp-gcard${state === 'due' ? ' dry' : ''}`, href: `#/learn/${s}` },
    hifzBadge(s, tier, 76, state), h('b', {}, surahName(meta[s - 1])), h('span', { class: state === 'due' ? 'dry' : '' }, sub));
  const gates = juzGates();
  root.append(
    h('header', { class: 'lp-top' },
      h('a', { class: 'icon-btn back-btn', href: '#/learn', 'aria-label': lt('learn.backToPath') }, icon('back', 22)),
      h('h1', { class: 'lp-title' }, lt('learn.hifzShelf')),
      h('span', { class: 'lp-gap' }),
      lightChip()),
    h('section', { class: 'lp-hz-sum' },
      h('b', {}, lt(held.length === 1 ? 'learn.heart1' : 'learn.heartN', { n: held.length })),
      h('span', {}, ...[4, 3, 2, 1, 0].filter((k) => tiers[k]).map((k) => h('i', { class: `t${k}` }, `${tiers[k]} ${lt(`learn.hz${k}` as LearnKey)}`))),
      h('p', { class: 'muted small' }, lt('learn.hzRule'))),
    held.length
      ? h('div', { class: 'lp-gsections' }, ...[...byJuz.entries()].sort((a, b) => b[0] - a[0]).map(([j, list]) =>
        h('section', {}, h('h2', { class: 'lp-gh' }, lt('learn.juzN', { n: j }), h('span', {}, lt('learn.heldOf', { n: list.length, of: meta.filter((m) => juzOf[m.n - 1] === j).length }))),
          h('div', { class: 'lp-ggrid' }, ...list.map((x) => card(x.s, x.tier, x.due ? 'due' : '', x.due ? lt('learn.hzDueShort') : lt(`learn.hz${x.tier}` as LearnKey)))))))
      : h('p', { class: 'lp-end' }, lt('learn.hifzEmpty')),
    growing.length ? h('section', { class: 'lp-gsections' }, h('h2', { class: 'lp-gh' }, lt('learn.hzLearning')),
      h('div', { class: 'lp-ggrid' }, ...growing.map((t) => card(t.s, 0, 'locked', lt('learn.ayatOf', { n: t.learned, of: meta[t.s - 1].ayahs }))))) : '',
    gates.length ? h('section', { class: 'lp-gsections' }, h('h2', { class: 'lp-gh' }, lt('learn.gatesTitle')),
      h('div', { class: 'lp-ggrid' }, ...gates.reverse().map((j) => h('div', { class: 'lp-gcard lp-ggate' }, juzGateArt(j, 'done', 76), h('b', {}, lt('learn.gateTitle', { n: j })))))) : '',
    tabBar('learn'));
  return () => {};
}
