// Learn tab (#/learn): the path (owner decision 2026-11-10). One winding path of chunky steps over a
// drawn dawn landscape: each surah a unit ("Surah 67 · Al-Mulk", long surahs in parts), each step a
// lesson of the learner's chunk size, the unit ending with a tasmi' of the whole surah, which grows the
// surah's tree in full. Thirsty trees come back as review steps just above where the path stands.
// The start sheet picks where the path begins (Juz 'Amma, a surah or a juz), the chunk size and, for
// those who already know some surahs, a quick tasmi' of each that grows their trees straight away.
// #/learn/garden lists the trees grown so far ("Your garden").
import './learn.css';
import './learnPath.css';
import { CHUNK_SIZES, DECOS, decos, juzGate, juzGates, setChunk, stageOf, started, surahJuz, thirsty, tree, trees, unplacedDecos, type ChunkSize, type DecoKind } from '../data/garden';
import { CHEST_EVERY, GATE_LIGHT, PATH_CHEST, chestId, loadSimilarKeys, markSimilarSeen, pathChunk, pathOrder, pathPosition, pathSet, pathStart, reviewSteps, setPath, startQuick, takeGrowth, unitsOf, type PathCtx, type PathStep, type PathUnit, type Start } from '../data/learnPath';
import { claimGoal, streak, todayRec } from '../data/journey';
import { LESSON_GOALS, goals, setGoals } from '../data/goals';
import { strength } from '../data/pageMemory';
import { chest } from './chest';
import { loadMeta, type SurahMeta } from '../data/quran';
import { surahName, t } from '../i18n';
import { lt, type LearnKey } from '../i18n/learn';
import { liteMode } from '../lite';
import { h, haptic, toast } from './dom';
import { drawDeco, drawTree, stageHeight, vignette } from './gardenArt';
import { icon } from './icons';
import { lightChip } from './lightChip';
import { inboxBell } from './inbox';
import { noorLine } from './noor';
import { tabBar } from './tabs';

const night = () => matchMedia('(prefers-color-scheme: dark)').matches;
const still = () => liteMode() || matchMedia('(prefers-reduced-motion: reduce)').matches;
const chunkLabel = (c: ChunkSize) => (c === 'half' ? lt('learn.chunkHalf') : c === 'page' ? lt('learn.chunkPage') : lt(c === 1 ? 'learn.chunk1' : 'learn.chunkN', { n: c }));
/** Unit colours, in turn (the Learn place colour first). */
const HUES = ['green', 'teal', 'violet', 'amber', 'blue', 'rose'] as const;
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
  book: '<path d="M4 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4z M20 5h-4a2 2 0 0 0-2 2" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  dots: '<circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>',
  tree: '<path d="M12 3c4 0 7 3 7 6.5 0 3-2.4 5.5-6 6V21h-2v-5.5c-3.6-.5-6-3-6-6C5 6 8 3 12 3z" fill="currentColor"/>',
  flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3-1-3 0-6 1-9z" fill="#ff9a2e"/><path d="M12 12c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1.5 1-2.5 3-5z" fill="#ffd04d"/>',
};

/** Light-coloured hills, sun and small trees behind the path (decoration only). */
function scenery(): SVGSVGElement {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('class', 'lp-scenery'); s.setAttribute('aria-hidden', 'true');
  s.setAttribute('viewBox', '0 0 390 844'); s.setAttribute('preserveAspectRatio', 'xMidYMin slice');
  const tree = (x: number, y: number, r: number) => `<g transform="translate(${x} ${y})"><rect x="-2" y="-2" width="4" height="${r + 2}" rx="2" class="lp-trunk"/><circle cx="0" cy="${-r * 0.8}" r="${r}" class="lp-crown"/><circle cx="${-r * 0.35}" cy="${-r * 1.1}" r="${r * 0.5}" class="lp-crown-hi"/></g>`;
  s.innerHTML = `<circle cx="318" cy="120" r="46" class="lp-sun-halo"/><circle cx="318" cy="120" r="30" class="lp-sun"/>`
    + `<path d="M0 220 C70 185 120 198 180 216 C250 236 300 192 390 206 L390 844 L0 844 Z" class="lp-hill1"/>`
    + `<path d="M0 270 C90 242 160 260 230 276 C300 292 340 266 390 272 L390 844 L0 844 Z" class="lp-hill2"/>`
    + tree(40, 270, 10) + tree(352, 300, 12) + tree(24, 520, 12) + tree(366, 610, 10) + tree(30, 760, 11);
  return s;
}

export async function showPath(root: HTMLElement): Promise<() => void> {
  const [meta, juzOf, mushaf, similar] = await Promise.all([loadMeta(), surahJuz(), import('../data/mushaf').then((x) => x.loadMushaf()), loadSimilarKeys()]);
  root.classList.add('learn', 'lp');
  const grew = takeGrowth();

  const order = () => pathOrder(pathStart(), juzOf);
  let earlier = 1; // surahs shown open before the one where the path stands
  const AHEAD = 3; // surahs shown open from where the path stands
  const openRuns = new Set<string>(); // folded juz lines the learner opened
  let due: { s: number }[] = []; // reviews still to weave in (paint → unitEl)
  let leadDone = false; // the START mark is placed once a paint
  /** The next thing to do (the step carrying START), for the Continue button. */
  let next: { what: string; hue: string; glyph: string; run: () => void } | null = null;
  const list = h('div', { class: 'lp-list' });
  const top = h('header', { class: 'lp-top' });
  const cont = h('button', { class: 'lp-cont', type: 'button' });
  const day = h('button', { class: 'lp-day', type: 'button', onclick: () => openDay() });
  const dock = h('div', { class: 'lp-dock' }, day, cont);
  root.append(scenery(), top, list, dock, tabBar('learn'));
  let ctx: PathCtx = { rank: new Map(), similar };
  const units = (k: number, ord: number[], pos: number) => unitsOf(meta[ord[k] - 1], mushaf, k <= pos, ctx);

  function paintTop() {
    const st = streak();
    top.replaceChildren(
      h('button', { class: 'lp-pill', type: 'button', onclick: () => void openStart(), 'aria-label': lt('learn.chooseStartAria') }, svg(G.book, 18), h('span', { class: 'lp-pill-t' }, lt('learn.choose'))),
      h('span', { class: 'lp-gap' }),
      h('a', { class: 'lp-pill lp-pages-btn', href: '#/learn/pages', 'aria-label': lt('learn.pmOpen') }, svg(G.page, 18)),
      h('a', { class: 'lp-pill lp-garden-btn', href: '#/learn/garden', 'aria-label': lt('learn.gardenTitle') }, svg(G.tree, 18)),
      h('span', { class: 'lp-streak', 'aria-label': lt('learn.streakAria', { n: st.days }) }, svg(G.flame, 22), String(st.days)),
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

  function nodeFor(st: PathStep, i: number, hue: string, m: SurahMeta, lead: boolean): HTMLElement {
    const label = stepLabel(st);
    hue = st.kind === 'page' ? 'teal' : st.kind === 'similar' ? 'violet' : st.kind === 'chest' ? 'amber' : hue;
    if (lead) next = { what: `${surahName(m)} · ${label}`, hue, run: () => runStep(st),
      glyph: st.kind === 'page' ? G.page : st.kind === 'whole' ? G.mic : st.kind === 'similar' ? G.twin : G.star };
    if (st.kind === 'chest') return chestNode(st, i, m, label);
    const kind = st.kind;
    const glyph = st.state === 'done' ? G.check : st.kind === 'whole' ? G.mic : st.kind === 'page' ? G.page : st.kind === 'similar' ? G.twin : G.star;
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
    wrap.append(h('div', { class: 'lp-nodewrap' }, lead ? h('span', { class: `lp-ring hue-${hue}`, 'aria-hidden': 'true' }) : '', btn));
    if (st.kind !== 'new') wrap.append(h('span', { class: 'lp-cap' }, label));
    return wrap;
  }

  /** A chest on the path: Light for the lessons before it, opened straight from the path. */
  function chestNode(st: PathStep, i: number, m: SurahMeta, label: string): HTMLElement {
    const wrap = h('div', { class: `lp-step lp-chest ${st.state}`, style: `--x:${SWAY[i % SWAY.length]}px` });
    const sub = lt('learn.chestSub', { n: CHEST_EVERY });
    const el = chest(PATH_CHEST, st.state === 'current' ? 'ready' : st.state === 'done' ? 'open' : 'locked', `${lt('learn.chestTitle')} · ${surahName(m)} · ${sub}`,
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
      await c.celebrate({ kind: 'chest', kicker: surahName(m), title: lt('learn.chestTitle'), sub: lt('learn.chestSub', { n: CHEST_EVERY }) }, from, PATH_CHEST);
    } finally {
      opening = false;
      claimGoal(chestId(st.s, st.range[1]), PATH_CHEST);
    }
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
    } else location.hash = `#/learn/${st.s}`;
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
    const pic = vignette(136, (c, x, y, u) => drawDeco(c, 'juzgate', x, y, u, 0, night()), night(), 1.5);
    const btn = h('button', { class: 'lp-gate-btn', type: 'button', 'aria-label': `${title} · ${lt(state === 'done' ? 'learn.stateDone' : state === 'current' ? 'learn.stateCurrent' : 'learn.stateLocked')}`, onclick: () => {
      haptic();
      const same = pop?.dataset.for === `gate:${j}`;
      closePop();
      if (same) return;
      const p = state === 'current' ? gatePage(j) : 0;
      pop = h('div', { class: `lp-pop ${state} hue-violet`, role: 'dialog', 'aria-label': title, 'data-for': `gate:${j}` },
        h('b', {}, title), h('span', { class: 'lp-pop-sub' }, lt('learn.gateKicker', { n: j })),
        ...(state === 'done' ? [h('p', {}, lt('learn.gateDone', { n: j })), h('a', { class: 'lp-btn ghost', href: '#/learn/garden' }, lt('learn.gardenTitle'))]
          : state === 'locked' ? [h('p', {}, lt('learn.gateLocked'))]
            : [h('p', {}, lt('learn.gateSub')), h('span', { class: 'lp-pop-sub' }, `${lt('learn.gatePage', { p })} · +${GATE_LIGHT} ✦`),
              h('button', { class: 'lp-btn hue-violet', type: 'button', onclick: () => startGate(j, p) }, lt('learn.gateStart'))]));
      btn.parentElement!.append(pop);
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
      h('span', { class: 'lp-day-n' }, met ? svg(G.check, 22) : target ? `${done}/${target}` : String(done)));
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

  function treeEnd(m: SurahMeta, hue: string): HTMLElement {
    const tr = tree(m.n);
    const stage = tr ? stageOf(tr, m.ayahs) : 0;
    const pic = vignette(112, (c, x, y, u) => drawTree(c, x, y, u, { s: m.n, v: tr?.v ?? 0, stage, thirsty: !!tr && thirsty(tr), t: 0, night: night() }), night(), stageHeight(m.n, stage));
    const el = h('button', { class: `lp-tree${tr?.full ? ' full' : ''}${grew?.s === m.n ? ' grew' : ''} hue-${hue}`, type: 'button', 'aria-label': lt('learn.treeOf', { name: surahName(m) }), onclick: () => openTree(m) },
      pic, h('span', { class: 'lp-cap' }, tr?.full ? lt('learn.treeGrown') : lt('learn.treeOf', { name: surahName(m) })));
    return el;
  }

  function unitEl(u: PathUnit, idx: number): HTMLElement {
    const m = meta[u.s - 1];
    const hue = HUES[idx % HUES.length];
    const done = u.steps.filter((x) => x.state === 'done').length;
    const first = u.steps[0], lastNew = [...u.steps].reverse().find((x) => x.kind === 'new');
    const ayat = lastNew ? `${first.range[0]}–${lastNew.range[1]}` : `1–${m.ayahs}`;
    const kicker = u.of > 1 ? lt('learn.unitPart', { n: m.n, k: u.part, of: u.of }) : lt('learn.unitSurah', { n: m.n });
    const banner = h('div', { class: `lp-banner hue-${hue}` },
      h('div', { class: 'lp-banner-t' },
        h('span', { class: 'lp-kicker' }, kicker),
        h('h2', {}, surahName(m)),
        h('span', { class: 'lp-banner-sub' }, lt('learn.unitSub', { ayat, done, of: u.steps.length }))),
      h('span', { class: 'lp-banner-ar', lang: 'ar', dir: 'rtl' }, m.ar),
      h('button', { class: 'lp-banner-btn', type: 'button', 'aria-label': lt('learn.unitOptions', { name: surahName(m) }), onclick: () => openUnit(m) }, svg(G.dots, 22)));
    const steps: HTMLElement[] = [];
    let i = 0;
    for (const st of u.steps) {
      if (st.state === 'current' && due.length) { due.forEach((tr, q) => steps.push(reviewNode(tr.s, i++, q === 0 && !leadDone))); due = []; leadDone = true; }
      const lead = st.state === 'current' && !leadDone;
      if (lead) leadDone = true;
      steps.push(nodeFor(st, i++, hue, m, lead));
    }
    const box = h('section', { class: 'lp-unit', 'aria-label': `${kicker} · ${surahName(m)}` }, banner, h('div', { class: 'lp-steps' }, ...steps));
    if (u.last) box.append(treeEnd(m, hue));
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
    const grown = run.filter((s) => tree(s)?.full).length;
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
        h('span', { class: 'lp-fold-bar', 'aria-label': lt('learn.grownOf', { n: grown, of: run.length }) }, h('i', { style: `width:${pct}%` }))),
      h('span', { class: 'lp-fold-c', 'aria-hidden': 'true' }, svg('<path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>', 22)));
  }

  /** The bottom Continue button: always the next thing to do (a review first, then the current step). */
  function paintCont() {
    dock.hidden = !next;
    if (!next) return;
    const { what, hue, glyph, run } = next;
    cont.className = `lp-cont hue-${hue}`;
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
    // Near where the path stands every unit is open; further away, one folded line per juz.
    const lo = Math.max(0, pos - earlier), hi = Math.min(ord.length, pos + AHEAD);
    const out: HTMLElement[] = [];
    let k = 0;
    while (k < ord.length) {
      if (k >= lo && k < hi) {
        for (const u of units(k, ord, pos)) out.push(unitEl(u, k));
        const j = gates.get(k);
        if (j) out.push(...gateWithReviews(j));
        k++;
        continue;
      }
      const j = juzOf[ord[k] - 1];
      let e = k;
      while (e < ord.length && !(e >= lo && e < hi) && juzOf[ord[e] - 1] === j) e++;
      const run = ord.slice(k, e);
      const key = `${j}:${run[0]}`;
      const open = openRuns.has(key);
      out.push(foldEl(run, j, key, open));
      for (let q = k; q < e; q++) {
        if (open) for (const u of units(q, ord, pos)) out.push(unitEl(u, q));
        const gj = gates.get(q);
        if (gj && (open || gateState(gj) === 'current')) out.push(...gateWithReviews(gj));
      }
      k = e;
    }
    if (pos >= ord.length) {
      const r = reviewEl(dueList); if (r) out.push(r);
      out.push(h('p', { class: 'lp-end' }, lt('learn.allDone')));
    }
    out.push(noorLine('learn'));
    list.replaceChildren(...out);
    paintCont();
    paintDay();
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

  function openTree(m: SurahMeta) {
    const tr = tree(m.n);
    const stage = tr ? stageOf(tr, m.ayahs) : 0;
    const learned = tr?.learned ?? 0;
    sheet('learn-tree', surahName(m),
      h('div', { class: 'learn-tree-top' },
        vignette(120, (c, x, y, u) => drawTree(c, x, y, u, { s: m.n, v: tr?.v ?? 0, stage, thirsty: !!tr && thirsty(tr), t: 0, night: night() }), night(), stageHeight(m.n, stage)),
        h('div', {},
          h('div', { class: 'learn-tree-ar', lang: 'ar', dir: 'rtl' }, m.ar),
          h('p', {}, tr?.full ? lt('learn.treeGrown') : lt('learn.doneSub2', { n: learned, of: m.ayahs })),
          h('div', { class: 'learn-bar' }, h('i', { style: `width:${Math.round((tr?.full ? 1 : learned / m.ayahs) * 100)}%` })))),
      h('div', { class: 'learn-tree-acts' },
        h('a', { class: 'chip', href: `#/learn/tree/${m.n}` }, lt('learn.tvLook')),
        h('a', { class: 'primary brand-btn learn-go', href: `#/learn/${m.n}` }, lt(tr?.full ? (thirsty(tr) ? 'learn.goWater' : 'learn.goRecite') : 'learn.continue'))));
  }

  async function openStart(first = false) {
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
  // Scroll the step to do now into view; a tree that just grew plays its moment.
  requestAnimationFrame(() => {
    const cur = list.querySelector('.lp-step.is-current') ?? list.querySelector('.lp-tree.grew');
    cur?.scrollIntoView({ block: 'center', behavior: still() ? 'auto' : 'smooth' });
  });
  if (!pathSet()) void openStart(true);

  const onClick = (e: MouseEvent) => { if (pop && !(e.target as Element).closest('.lp-pop, .lp-node, .lp-gate-btn, .lp-chest-hit')) closePop(); };
  const onChange = () => paint();
  document.addEventListener('click', onClick);
  window.addEventListener('garden-changed', onChange);
  window.addEventListener('journey-changed', onChange);
  return () => {
    closePop();
    document.removeEventListener('click', onClick);
    window.removeEventListener('garden-changed', onChange);
    window.removeEventListener('journey-changed', onChange);
  };
}

/** #/learn/garden: the trees grown so far, by juz, and the decorations kept. */
export async function showYourGarden(root: HTMLElement): Promise<() => void> {
  const [meta, juzOf] = await Promise.all([loadMeta(), surahJuz()]);
  root.classList.add('learn', 'lp', 'lp-garden');
  const mine = trees().filter(started).sort((a, b) => a.s - b.s);
  const byJuz = new Map<number, typeof mine>();
  for (const tr of mine) { const j = juzOf[tr.s - 1]; byJuz.set(j, [...(byJuz.get(j) ?? []), tr]); }
  const card = (s: number) => {
    const m = meta[s - 1];
    const tr = tree(s)!;
    const stage = stageOf(tr, m.ayahs);
    const dry = thirsty(tr);
    return h('a', { class: `lp-gcard${dry ? ' dry' : ''}`, href: `#/learn/tree/${s}` },
      dry ? h('span', { class: 'lp-gdrop', 'aria-hidden': 'true' }, svg(G.drop, 14)) : '',
      vignette(84, (c, x, y, u) => drawTree(c, x, y, u, { s, v: tr.v, stage, thirsty: dry, t: 0, night: night() }), night(), stageHeight(s, stage)),
      h('b', {}, surahName(m)),
      h('span', { class: dry ? 'dry' : '' }, dry ? lt('learn.thirstyShort') : tr.full ? lt('learn.treeGrownShort') : lt('learn.ayatOf', { n: tr.learned, of: m.ayahs })));
  };
  const kept = [...new Set([...unplacedDecos(), ...Array.from({ length: 30 }, (_, i) => decos(i + 1)).flat()].map((d) => d.k))].filter((k) => k !== 'juzgate') as DecoKind[];
  const gates = juzGates();
  root.append(
    h('header', { class: 'lp-top' },
      h('a', { class: 'icon-btn', href: '#/learn', 'aria-label': lt('learn.backToPath') }, icon('back', 22)),
      h('h1', { class: 'lp-title' }, lt('learn.gardenTitle')),
      h('span', { class: 'lp-gap' }),
      lightChip()),
    gates.length ? h('section', { class: 'lp-gsections' }, h('h2', { class: 'lp-gh' }, lt('learn.gatesTitle')),
      h('div', { class: 'lp-ggrid' }, ...gates.reverse().map((j) => h('div', { class: 'lp-gcard lp-ggate' },
        vignette(84, (c, x, y, u) => drawDeco(c, 'juzgate', x, y, u, 0, night()), night(), 1.5), h('b', {}, lt('learn.gateTitle', { n: j })))))) : '',
    mine.length
      ? h('div', { class: 'lp-gsections' }, ...[...byJuz.entries()].sort((a, b) => b[0] - a[0]).map(([j, list]) =>
        h('section', {}, h('h2', { class: 'lp-gh' }, lt('learn.juzN', { n: j }), h('span', {}, lt('learn.grownOf', { n: list.filter((x) => x.full).length, of: meta.filter((m) => juzOf[m.n - 1] === j).length }))),
          h('div', { class: 'lp-ggrid' }, ...list.map((tr) => card(tr.s))))))
      : h('p', { class: 'lp-end' }, lt('learn.gardenEmpty')),
    kept.length ? h('section', { class: 'lp-gsections' }, h('h2', { class: 'lp-gh' }, lt('learn.decosTitle')),
      h('div', { class: 'lp-ggrid' }, ...kept.filter((k) => DECOS.some((x) => x.k === k)).map((k) => h('div', { class: 'lp-gcard' },
        vignette(84, (c, x, y, u) => drawDeco(c, k, x, y, u, 0, night()), night(), 1.4), h('b', {}, lt(`learn.d.${k}` as LearnKey)))))) : '',
    tabBar('learn'));
  void toast;
  return () => {};
}
