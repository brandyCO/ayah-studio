// Learn tab (#/learn): the path (owner decision 2026-11-10). One winding path of chunky steps over a
// drawn dawn landscape: each surah a unit ("Surah 67 · Al-Mulk", long surahs in parts), each step a
// lesson of the learner's chunk size, the unit ending with a tasmi' of the whole surah, which grows the
// surah's tree in full. Thirsty trees come back as review steps just above where the path stands.
// The start sheet picks where the path begins (Juz 'Amma, a surah or a juz), the chunk size and, for
// those who already know some surahs, a quick tasmi' of each that grows their trees straight away.
// #/learn/garden lists the trees grown so far ("Your garden").
import './learn.css';
import './learnPath.css';
import { CHUNK_SIZES, DECOS, decos, setChunk, stageOf, started, surahJuz, thirsty, tree, trees, unplacedDecos, type ChunkSize, type DecoKind } from '../data/garden';
import { pathChunk, pathOrder, pathPosition, pathSet, pathStart, reviewSteps, setPath, startQuick, takeGrowth, unitsOf, type PathStep, type PathUnit, type Start } from '../data/learnPath';
import { streak } from '../data/journey';
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
  const [meta, juzOf, mushaf] = await Promise.all([loadMeta(), surahJuz(), import('../data/mushaf').then((x) => x.loadMushaf())]);
  root.classList.add('learn', 'lp');
  const grew = takeGrowth();

  const order = () => pathOrder(pathStart(), juzOf);
  let earlier = 1; // surahs shown open before the one where the path stands
  const AHEAD = 3; // surahs shown open from where the path stands
  const openRuns = new Set<string>(); // folded juz lines the learner opened
  let due: { s: number }[] = []; // reviews still to weave in (paint → unitEl)
  let leadDone = false; // the START mark is placed once a paint
  let curHue = 'green';
  const list = h('div', { class: 'lp-list' });
  const top = h('header', { class: 'lp-top' });
  const cont = h('button', { class: 'lp-cont', type: 'button', hidden: true });
  root.append(scenery(), top, list, cont, tabBar('learn'));

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

  function nodeFor(st: PathStep, i: number, hue: string, m: SurahMeta, lead: boolean): HTMLElement {
    const label = st.kind === 'whole' ? lt('learn.stepTasmi') : st.range[0] === st.range[1] ? lt('learn.stepAyah', { a: st.range[0] }) : lt('learn.stepAyat', { a: st.range[0], b: st.range[1] });
    const kind = st.kind === 'whole' ? 'whole' : 'new';
    const glyph = st.state === 'done' ? G.check : st.kind === 'whole' ? G.mic : G.star;
    const btn = h('button', {
      class: `lp-node ${st.state} ${kind} hue-${hue}`, type: 'button',
      'aria-label': `${label} · ${surahName(m)} · ${lt(st.state === 'done' ? 'learn.stateDone' : st.state === 'current' ? 'learn.stateCurrent' : 'learn.stateLocked')}`,
      onclick: () => openPop(btn, st, label, m, hue),
    }, svg(glyph, st.kind === 'whole' ? 40 : 34), h('span', { class: 'lp-shine', 'aria-hidden': 'true' }));
    const wrap = h('div', { class: 'lp-step', style: `--x:${SWAY[i % SWAY.length]}px` });
    if (lead) {
      wrap.classList.add('is-current');
      wrap.append(h('div', { class: 'lp-start', 'aria-hidden': 'true' }, lt('learn.start')));
    }
    wrap.append(h('div', { class: 'lp-nodewrap' }, lead ? h('span', { class: `lp-ring hue-${hue}`, 'aria-hidden': 'true' }) : '', btn));
    if (st.kind === 'whole') wrap.append(h('span', { class: 'lp-cap' }, lt('learn.stepTasmi')));
    return wrap;
  }

  function openPop(at: HTMLElement, st: PathStep, label: string, m: SurahMeta, hue: string) {
    haptic();
    const same = pop && pop.dataset.for === `${st.s}:${st.range[0]}:${st.kind}`;
    closePop();
    if (same) return;
    const go = () => { location.hash = `#/learn/${st.s}`; };
    const body = st.state === 'locked'
      ? [h('p', {}, lt('learn.lockedSub'))]
      : st.state === 'done'
        ? [h('p', {}, lt('learn.doneStepSub')), h('button', { class: 'lp-btn ghost', type: 'button', onclick: go }, lt('learn.practise'))]
        : [h('p', {}, lt(st.kind === 'whole' ? 'learn.tasmiSub' : 'learn.newSub')), h('button', { class: `lp-btn hue-${hue}`, type: 'button', onclick: go }, lt(st.kind === 'whole' ? 'learn.startTasmi' : 'learn.startLesson'))];
    pop = h('div', { class: `lp-pop ${st.state} hue-${hue}`, role: 'dialog', 'aria-label': label, 'data-for': `${st.s}:${st.range[0]}:${st.kind}` },
      h('b', {}, label), h('span', { class: 'lp-pop-sub' }, `${surahName(m)} · ${m.n}:${st.range[0]}${st.range[1] > st.range[0] ? `–${st.range[1]}` : ''}`), ...body);
    at.parentElement!.append(pop);
    (pop.querySelector('button') as HTMLElement | null)?.focus({ preventScroll: true });
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
    if (lead) { wrap.classList.add('is-current'); wrap.append(h('div', { class: 'lp-start hue-blue', 'aria-hidden': 'true' }, lt('learn.reviewHere'))); }
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
  function paintCont(ord: number[], pos: number, dueList: readonly { s: number }[]) {
    let s = 0, what = '', hue = 'green';
    if (dueList.length) { s = dueList[0].s; what = lt('learn.reviewOf', { name: surahName(meta[s - 1]) }); hue = 'blue'; }
    else if (pos < ord.length) {
      s = ord[pos];
      const m = meta[s - 1];
      const st = unitsOf(m, mushaf, true).flatMap((u) => u.steps).find((x) => x.state === 'current');
      const label = !st || st.kind === 'whole' ? lt('learn.stepTasmi') : st.range[0] === st.range[1] ? lt('learn.stepAyah', { a: st.range[0] }) : lt('learn.stepAyat', { a: st.range[0], b: st.range[1] });
      what = `${surahName(m)} · ${label}`;
      hue = curHue;
    }
    cont.hidden = !s;
    if (!s) return;
    cont.className = `lp-cont hue-${hue}`;
    cont.setAttribute('aria-label', lt('learn.contAria', { what }));
    cont.replaceChildren(h('span', { class: 'lp-cont-t' }, h('b', {}, lt('learn.continue')), h('span', {}, what)), svg(dueList.length ? G.drop : G.star, 26));
    cont.onclick = () => { haptic(); location.hash = `#/learn/${s}`; };
  }

  function paint() {
    closePop();
    paintTop();
    const ord = order();
    const pos = pathPosition(ord);
    const dueList = reviewSteps();
    due = pos < ord.length ? [...dueList] : [];
    leadDone = false;
    // Near where the path stands every unit is open; further away, one folded line per juz.
    const lo = Math.max(0, pos - earlier), hi = Math.min(ord.length, pos + AHEAD);
    const out: HTMLElement[] = [];
    let k = 0;
    while (k < ord.length) {
      if (k >= lo && k < hi) {
        const units = unitsOf(meta[ord[k] - 1], mushaf, k <= pos);
        if (k === pos) curHue = HUES[k % HUES.length];
        for (const u of units) out.push(unitEl(u, k));
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
      if (open) for (let q = k; q < e; q++) for (const u of unitsOf(meta[ord[q] - 1], mushaf, q <= pos)) out.push(unitEl(u, q));
      k = e;
    }
    if (pos >= ord.length) {
      const r = reviewEl(dueList); if (r) out.push(r);
      out.push(h('p', { class: 'lp-end' }, lt('learn.allDone')));
    }
    out.push(noorLine('learn'));
    list.replaceChildren(...out);
    paintCont(ord, pos, dueList);
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

  const onClick = (e: MouseEvent) => { if (pop && !(e.target as Element).closest('.lp-pop, .lp-node')) closePop(); };
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
  const kept = [...new Set([...unplacedDecos(), ...Array.from({ length: 30 }, (_, i) => decos(i + 1)).flat()].map((d) => d.k))] as DecoKind[];
  root.append(
    h('header', { class: 'lp-top' },
      h('a', { class: 'icon-btn', href: '#/learn', 'aria-label': lt('learn.backToPath') }, icon('back', 22)),
      h('h1', { class: 'lp-title' }, lt('learn.gardenTitle')),
      h('span', { class: 'lp-gap' }),
      lightChip()),
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
