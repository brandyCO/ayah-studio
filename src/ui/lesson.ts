// A lesson in the Learn tab (#/learn/{surah}): grows the surah's tree (src/data/garden.ts).
//   New    the next chunk: Meaning first (each word's meaning, the translation) → Listen (the reciter, words lit, a turn to repeat after each round) →
//          Practise (the text, hints fading: all words → first word of each ayah → none) →
//          Exercises (src/ui/lessonKinds.ts: which word means, next word, fill the word, order) →
//          From memory (the text hidden; recite, reveal, check yourself)
//   Link   everything learned so far, from ayah 1, from memory
//   Whole  the whole surah from memory, once: the tree is full grown
//   Water  a full tree that is thirsty: the whole surah again
// From memory = tasmi': the words hidden in their place (weak words show faintly), "Stuck? Next word"
// shows one word and counts as a slip, so does a peek; an optional recording kept on the device. Then the
// text: tap the words you missed, compare yourself with the reciter (A/B), see similar ayat side by side;
// the result suggested from the slips (src/ui/tasmi.ts, src/data/weakWords.ts).
// The text is the bundled Quran text, split only at its spaces and never changed (rule 1); hidden words
// keep their place. The reference is always on screen (rule 2). Words are lit only from the reciter's
// word timings (rule 8). Tap a word: its Quran.com meaning and, where timed, its sound.
import './learn.css';
import {
  LIGHT, ayahPlaces, ensureTree, learnTo, linkTo, nextChunk, reciteWhole, stageOf, thirsty, tree, type Tree,
} from '../data/garden';
import { nextQuick, noteGrowth, pathChunk } from '../data/learnPath';
import { addLesson, addMemorised, claimGoal } from '../data/journey';
import { learnClock, timeFor } from '../data/learnClock';
import { dayKey } from '../data/readLog';
import { loadMeta, loadWordMap, surahText, surahTranslation, surahWordMeanings } from '../data/quran';
import { TIMED_RECITERS, DEFAULT_RECITER, everyayahUrl, reciterCredit, timedReciterById } from '../data/reciters';
import { currentTranslation, translationInfo } from '../data/translations';
import { displayWords, parseSpans, validSegments, wordTimings, type WordTiming } from '../engine/words';
import { surahName, t, uiRef } from '../i18n';
import { lt, type LearnKey } from '../i18n/learn';
import { celebrate } from './celebrate';
import { drills, meaningCards, type KindCtx } from './lessonKinds';
import { Recorder, keepRecording, recKey, recording, similarIn, similarSheet } from './tasmi';
import { ClipJar, helpCard, helpChoice } from './harakatClips';
import { kidsOn } from '../data/kids';
import { followFailKey, followChecksHarakat, followSupported, startFollow, type Follower } from './follow';
import { follow, followWords, hintsFrom, type FollowWord } from '../engine/follow';
import { markStrong, markWeak, weakWords } from '../data/weakWords';
import { recordPages } from '../data/pageMemory';
import { h, haptic, toast } from './dom';
import { drawTree, stageHeight, vignette } from './gardenArt';
import { icon } from './icons';
import { reduced } from './juice';
import { reelReciter } from './prefs';

type Step = 'new' | 'link' | 'whole' | 'water';
type Phase = 'meaning' | 'listen' | 'practice' | 'drill' | 'memory' | 'check' | 'done';
interface AyahAudio { src: string; from: number; to: number; words: WordTiming | null; heard: boolean[] }

const TURN_EXTRA = 1.5;
const night = () => matchMedia('(prefers-color-scheme: dark)').matches;

function pref<T extends string>(key: string, ok: readonly T[], d: T): T {
  try { const v = localStorage.getItem(key) as T; return ok.includes(v) ? v : d; } catch { return d; }
}
function setPref(key: string, v: string) { try { localStorage.setItem(key, v); } catch { /* ignore */ } }
const learnReciter = () => {
  try { const v = Number(localStorage.getItem('learnReciter')); if (TIMED_RECITERS.some((r) => r.id === v)) return v; } catch { /* ignore */ }
  return timedReciterById(reelReciter(DEFAULT_RECITER)).id;
};

/** `mode` 'tasmi': the whole surah from memory straight away ("Already know some?" on the path). */
export async function showLesson(root: HTMLElement, s: number, mode?: string): Promise<() => void> {
  const clock = learnClock();
  ensureTree(s, pathChunk());
  const quick = mode === 'tasmi';
  const [meta, arabic, trans, meanings, wordMap] = await Promise.all([
    loadMeta(), surahText(s), surahTranslation(s).catch(() => [] as string[]),
    surahWordMeanings(s).catch(() => [] as string[]), loadWordMap().catch(() => ({} as Record<string, string>))]);
  const m = meta[s - 1];
  const words = arabic.map((x) => displayWords(x));
  const tInfo = translationInfo(currentTranslation());
  const mushafMod = await import('../data/mushaf');
  const mushaf = await mushafMod.loadMushaf();
  const places = async () => ayahPlaces(mushaf, s);
  const basmalaSvg = fetch(`${import.meta.env.BASE_URL}fonts/bismillah.svg`).then((r) => r.text()).catch(() => '');
  root.classList.add('learn', 'lesson');

  // --- which step today ---
  let step: Step = 'new';
  let range: [number, number] = [1, 1];
  let reviewFirst = false; // a growing tree was thirsty: Link first, then on to New
  async function plan(after?: Step): Promise<void> {
    const tr = tree(s)!;
    if (quick && !after && !tr.full) { step = 'whole'; range = [1, m.ayahs]; return; }
    if (after === 'new' && range[0] > 1) { step = 'link'; range = [1, tr.learned]; return; }
    if (tr.full) { step = 'water'; range = [1, m.ayahs]; return; }
    if (!after && thirsty(tr) && tr.learned > 0) { step = 'link'; range = [1, tr.learned]; reviewFirst = true; return; }
    const next = nextChunk(tr.learned, m.ayahs, tr.chunk, typeof tr.chunk === 'number' ? [] : await places());
    if (next) { step = 'new'; range = next; return; }
    step = 'whole';
    range = [1, m.ayahs];
  }
  await plan();

  // --- screen ---
  const ref = h('p', { class: 'ls-ref', dir: 'ltr' });
  const stepsEl = h('ol', { class: 'ls-steps' });
  const phaseEl = h('p', { class: 'ls-phase' });
  const textEl = h('div', { class: 'ls-text', lang: 'ar', dir: 'rtl' });
  const pop = h('div', { class: 'ls-pop', hidden: true, 'aria-live': 'polite' });
  const trEl = h('div', { class: 'ls-trs' }); // page view: the chunk's translation, kept on screen under the page
  const status = h('p', { class: 'ls-status', 'aria-live': 'polite' });
  const ring = h('span', { class: 'ls-ring', 'aria-hidden': 'true' });
  const actions = h('div', { class: 'ls-actions' });
  const doneEl = h('section', { class: 'ls-done', hidden: true });
  const playBtn = h('button', { class: 'ls-play', 'aria-label': lt('learn.listen'), onclick: () => (playing ? stopAll() : void listen()) });
  const speedBtn = h('button', { class: 'chip', onclick: () => { setPref('learnSpeed', pref('learnSpeed', ['1', '0.75'], '1') === '1' ? '0.75' : '1'); paintChips(); } });
  const repBtn = h('button', { class: 'chip', onclick: () => { const v = pref('learnReps', ['1', '3', '5'], '3'); setPref('learnReps', v === '1' ? '3' : v === '3' ? '5' : '1'); paintChips(); } });
  const viewBtn = h('button', { class: 'chip', onclick: () => { setPref('lessonView', pageView() ? 'ayat' : 'page'); paintChips(); paintText(); } });
  const meaningBtn = h('button', { class: 'chip', onclick: () => { setPref('learnMeaning', showMeaning() ? 'off' : 'on'); paintChips(); paintText(); } });
  const reciterSel = h('select', { class: 'ls-reciter', 'aria-label': lt('learn.reciter'), onchange: () => { setPref('learnReciter', reciterSel.value); audios = null; stopAll(); } },
    ...TIMED_RECITERS.map((r) => h('option', { value: String(r.id), selected: r.id === learnReciter() }, reciterCredit(r))));
  const memExtras = h('div', { class: 'ls-memextra' });
  const tools = h('div', { class: 'ls-tools' }, memExtras, playBtn, speedBtn, repBtn, viewBtn, meaningBtn, reciterSel);
  const art = h('span', { class: 'ls-tree' });
  // Focus page: the page fills the screen between two thin margins; the tools come up only when asked.
  const noorBtn = h('button', { class: 'ls-noor', type: 'button', 'aria-label': lt('learn.focusTools'), 'aria-expanded': 'false', onclick: () => peek(!root.classList.contains('peek')) }, h('i', { 'aria-hidden': 'true' }));
  const focusBtn = h('button', { class: 'icon-btn ls-focus-btn', type: 'button', onclick: () => { setPref('learnFocus', focusOn() ? 'off' : 'on'); paintFocus(); paintActions(); } });
  root.append(
    h('header', { class: 'ls-head' },
      h('a', { class: 'icon-btn', href: '#/learn', 'aria-label': lt('learn.backToPath') }, icon('back', 22)),
      h('div', { class: 'ls-title' }, h('h1', {}, surahName(m)), ref),
      noorBtn, focusBtn, art),
    stepsEl, phaseEl,
    h('main', { class: 'ls-main' }, textEl, pop), trEl,
    h('div', { class: 'ls-turn' }, ring, status),
    actions, tools, doneEl);

  let phase: Phase = 'listen';
  let level = 0; // 0 all words · 1 the first word of each ayah · 2 none
  const peeked = new Set<string>();
  // tasmi'
  const helped = new Set<string>(); // shown by a prompt or a peek: slips
  const shown = new Set<string>();  // shown by "Stuck? Next word", stays shown
  const missed = new Set<string>(); // tapped as missed when the text is shown
  let weak = new Set<string>();
  const rec = new Recorder();
  let recUrl = '';
  const mine = new Audio();
  let simCount = 0;
  // voice follow-along (src/ui/follow.ts): words heard and passed over, fixed at each pause (said, skip)
  // and as the recogniser has the current utterance so far (sayP, skipP)
  let follower: Follower | null = null;
  let canFollow = false;
  let harakatOn = false;
  void followChecksHarakat().then((x) => { harakatOn = x; });
  void followSupported().then((ok) => { canFollow = ok; if (phase === 'memory') paintActions(); });
  let fw: FollowWord[] = [];
  let fBase = 0;
  const said = new Set<string>(), skip = new Set<string>(), wrongS = new Set<string>(); // skip holds the wrong ones too
  const hkS = new Set<string>(); let hkNext: string[] = []; // said with another haraka (harakat server)
  const jar = new ClipJar(); // clips for "Help improve the harakat check" (src/ui/harakatClips.ts)
  let fwText = new Map<string, string>();
  let sayP = new Set<string>(), skipP = new Set<string>(), wrongP = new Set<string>();
  const voiced = (k: string) => said.has(k) || sayP.has(k);
  const passed = (k: string) => skip.has(k) || skipP.has(k);
  const wordEls = new Map<string, HTMLElement>();
  /** Learn on the real mushaf page (visual memory) or ayah by ayah with the translation. */
  const pageView = () => pref('lessonView', ['page', 'ayat'], 'page') === 'page';
  /** Extra page words that show the same display word (the few ayat whose word positions differ). */
  const moreEls: [string, HTMLElement][] = [];
  const showMeaning = () => pref('learnMeaning', ['on', 'off'], 'on') === 'on';
  const focusOn = () => pref('learnFocus', ['on', 'off'], 'on') === 'on';
  const svgIcon = (d: string) => { const e = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); e.setAttribute('viewBox', '0 0 24 24'); e.setAttribute('width', '22'); e.setAttribute('height', '22'); e.setAttribute('aria-hidden', 'true'); e.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`; return e; };
  const FOCUS_IN = 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', FOCUS_OUT = 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5';
  // Swipe up from the bottom margin brings the tools up for a moment; a tap elsewhere puts them away.
  let swipeY = -1;
  actions.addEventListener('pointerdown', (e) => { swipeY = e.clientY; });
  actions.addEventListener('pointermove', (e) => { if (swipeY >= 0 && swipeY - e.clientY > 36 && root.classList.contains('ls-focus')) { swipeY = -1; peek(true); } });
  actions.addEventListener('pointerup', () => { swipeY = -1; });
  root.addEventListener('click', (e) => { if (root.classList.contains('peek') && !(e.target as Element).closest('.ls-tools, .ls-trs, .ls-steps, .ls-noor')) peek(false); });
  new ResizeObserver(() => { if (root.classList.contains('ls-focus')) textEl.querySelectorAll<HTMLElement>('.ls-page').forEach(fitPage); }).observe(textEl.parentElement ?? textEl);
  /** Focus page is on in the page view while the page itself is the lesson (not Meaning or Exercises). */
  function paintFocus() {
    const on = focusOn() && pageView() && !kindEl && phase !== 'done';
    const was = root.classList.contains('ls-focus');
    root.classList.toggle('ls-focus', on);
    if (!on) peek(false);
    focusBtn.hidden = !pageView() || !!kindEl;
    focusBtn.replaceChildren(svgIcon(on ? FOCUS_OUT : FOCUS_IN));
    focusBtn.setAttribute('aria-label', lt(on ? 'learn.focusOff' : 'learn.focusOn'));
    if (on !== was) requestAnimationFrame(() => textEl.querySelectorAll<HTMLElement>('.ls-page').forEach(fitPage));
  }
  function peek(on: boolean) {
    root.classList.toggle('peek', on);
    noorBtn.setAttribute('aria-expanded', String(on));
  }
  const speed = () => Number(pref('learnSpeed', ['1', '0.75'], '1'));
  const reps = () => Number(pref('learnReps', ['1', '3', '5'], '3'));

  function paintChips() {
    speedBtn.textContent = speed() === 1 ? '1×' : '0.75×';
    speedBtn.setAttribute('aria-label', lt(speed() === 1 ? 'learn.speedNormal' : 'learn.speedSlow'));
    repBtn.textContent = `×${reps()}`;
    repBtn.setAttribute('aria-label', lt('learn.repsAria', { n: reps() }));
    viewBtn.textContent = lt(pageView() ? 'learn.viewAyat' : 'learn.viewPage');
    viewBtn.setAttribute('aria-label', lt(pageView() ? 'learn.viewAyatAria' : 'learn.viewPageAria'));
    meaningBtn.textContent = lt('learn.meaning');
    meaningBtn.classList.toggle('on', showMeaning());
    meaningBtn.setAttribute('aria-pressed', String(showMeaning()));
  }
  function paintHead() {
    ref.textContent = uiRef(m, range[0], range[1]);
    const tr = tree(s)!;
    art.replaceChildren(vignette(56, (c, x, y, u) => drawTree(c, x, y, u, { s, v: tr.v, stage: stageOf(tr, m.ayahs), thirsty: thirsty(tr), t: 0, night: night() }), night(), stageHeight(s, stageOf(tr, m.ayahs))));
    const list: [Step, LearnKey][] = step === 'water' ? [['water', 'learn.stepWater']] : [['new', 'learn.stepNew'], ['link', 'learn.stepLink'], ['whole', 'learn.stepWhole']];
    stepsEl.replaceChildren(...list.map(([id, k]) => h('li', { class: id === step ? 'on' : '' , 'aria-current': id === step ? 'step' : false }, lt(k))));
  }

  const hiddenWord = (a: number, i: number) => {
    if (phase === 'check' || phase === 'done') return false;
    if (peeked.has(`${a}:${i}`)) return false;
    if (phase === 'memory' && (shown.has(`${a}:${i}`) || voiced(`${a}:${i}`) || passed(`${a}:${i}`))) return false;
    const lv = phase === 'memory' ? 2 : phase === 'listen' ? 0 : level;
    return lv === 2 || (lv === 1 && i > 0);
  };
  const wordCls = (a: number, i: number) => {
    const k = `${a}:${i}`, hid = hiddenWord(a, i);
    return `${hid ? ' hid' : ''}${hid && phase === 'memory' && weak.has(k) ? ' hint' : ''}`
      + `${(phase === 'memory' || phase === 'check') && helped.has(k) ? ' helped' : ''}${phase === 'check' && missed.has(k) ? ' missed' : ''}`
      + `${phase === 'memory' && voiced(k) ? ' heard' : ''}${phase === 'memory' && passed(k) ? (wrongS.has(k) || wrongP.has(k) ? ' wrong' : ' skipped') : ''}`
      + `${phase === 'memory' && hkS.has(k) ? ' harakah' : ''}`;
  };
  /** Display-word index for a mushaf word position (1-based), or -1 for the end-of-ayah number. */
  function displayIndex(a: number, pos: number): number {
    const spans = parseSpans(wordMap[`${s}:${a}`]);
    const i = spans ? (spans[pos - 1]?.[0] ?? -1) : pos - 1;
    return i >= 0 && i < words[a - 1].length ? i : -1;
  }
  /** The page(s) holding the chunk, everything outside it dimmed; the chunk's words work like the ayah view. */
  function paintPage() {
    wordEls.clear(); moreEls.length = 0;
    type Seg = [number, number, string];
    const inChunk = (seg: Seg) => seg[0] === s && seg[1] >= range[0] && seg[1] <= range[1];
    const segsOf = (p: number) => mushaf.pages[p - 1].lines.filter((l) => l[0] !== 'h' && l[0] !== 'b').flat() as Seg[];
    const pages = [mushaf.pageOf(s, range[0])];
    while (pages.length < 3 && pages[pages.length - 1] < mushafMod.PAGE_COUNT && segsOf(pages[pages.length - 1] + 1).some(inChunk)) pages.push(pages[pages.length - 1] + 1);
    const els: HTMLElement[] = [];
    for (const p of pages) {
      const el = h('div', { class: `mushaf-page ls-page${p <= 2 ? ' opening' : ''}`, dir: 'rtl', lang: 'ar', 'data-page': String(p) });
      el.style.fontFamily = `qcf-p${p}`;
      let headSurah = 0;
      for (const l of mushaf.pages[p - 1].lines) {
        if (l[0] === 'h') {
          headSurah = Number(l[1]);
          el.append(h('div', { class: `mp-line mp-surah${headSurah === s && range[0] === 1 ? '' : ' dim'}` },
            h('div', { class: 'surah-frame' }, h('span', { class: 'surah-name' }, String(l[1]).padStart(3, '0')))));
          continue;
        }
        if (l[0] === 'b') {
          const b = h('div', { class: `mp-line mp-basmala${headSurah === s && range[0] === 1 ? '' : ' dim'}` });
          void basmalaSvg.then((x) => { b.innerHTML = x; }); // bundled file
          el.append(b);
          continue;
        }
        const line = h('div', { class: 'mp-line text' });
        for (const seg of l as Seg[]) {
          let pos = mushaf.segStart.get(seg) ?? 1;
          for (const g of seg[2].split(' ')) {
            const a = seg[1], here = inChunk(seg), i = here ? displayIndex(a, pos) : -1;
            const w = h('span', { class: `w${here ? '' : ' dim'}` }, g);
            if (i >= 0) {
              w.className = `w lw${wordCls(a, i)}`;
              w.setAttribute('role', 'button'); w.tabIndex = 0;
              w.addEventListener('click', () => tapWord(a, i));
              const key = `${a}:${i}`;
              if (wordEls.has(key)) moreEls.push([key, w]); else wordEls.set(key, w);
            }
            line.append(w);
            pos++;
          }
        }
        el.append(line);
      }
      els.push(el);
      void mushafMod.loadPageFont(p).catch(() => {}).then(() => requestAnimationFrame(() => fitPage(el)));
    }
    const trs: Node[] = [];
    if (showMeaning() && (phase === 'listen' || phase === 'practice' || phase === 'check')) {
      for (let a = range[0]; a <= range[1]; a++) if (trans[a - 1]) trs.push(h('p', { class: 'ls-tr', lang: tInfo.lang, dir: tInfo.dir }, h('span', { class: 'ls-n' }, `${a}. `), trans[a - 1]));
    }
    textEl.replaceChildren(h('div', { class: 'ls-pages' }, ...els));
    trEl.replaceChildren(...trs);
  }
  /** Same fit as the reader: the widest line spans the page, 15 lines over the height. */
  function fitPage(el: HTMLElement) {
    if (!el.isConnected) return;
    if (root.classList.contains('ls-focus')) {
      const main = el.closest('.ls-main') as HTMLElement | null;
      if (main) el.style.height = `${main.clientHeight}px`;
    } else el.style.height = '';
    const lh = Math.floor((el.clientHeight - 10) / 15);
    el.style.setProperty('--lh', `${lh}px`);
    el.style.setProperty('--f', '30px');
    el.classList.add('measuring');
    const widest = Math.max(1, ...[...el.querySelectorAll<HTMLElement>('.mp-line.text')].map((l) => l.scrollWidth));
    el.classList.remove('measuring');
    const cs = getComputedStyle(el);
    const width = (el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * (el.classList.contains('opening') ? 0.8 : 1);
    el.style.setProperty('--f', `${Math.floor(Math.min((30 * width) / widest, lh * 0.72) * 4) / 4}px`);
    const first = el.querySelector<HTMLElement>('.lw');
    if (first && el === textEl.querySelector('.ls-page:has(.lw)')) first.scrollIntoView({ block: 'center' });
  }
  let kindEl: HTMLElement | null = null; // the Meaning or Exercises screen while that phase is on
  function paintText() {
    textEl.classList.toggle('ls-kind', !!kindEl);
    if (kindEl) {
      root.classList.remove('ls-pageview');
      paintFocus();
      wordEls.clear(); moreEls.length = 0;
      trEl.replaceChildren();
      if (kindEl.parentElement !== textEl) textEl.replaceChildren(kindEl);
      return;
    }
    root.classList.toggle('ls-pageview', pageView());
    paintFocus();
    if (pageView()) { paintPage(); return; }
    trEl.replaceChildren();
    wordEls.clear(); moreEls.length = 0;
    const blocks: Node[] = [];
    for (let a = range[0]; a <= range[1]; a++) {
      const p = h('p', { class: 'ls-ayah' });
      words[a - 1].forEach((w, i) => {
        const el = h('span', { class: `lw${wordCls(a, i)}`, role: 'button', tabindex: '0', onclick: () => tapWord(a, i) }, w);
        wordEls.set(`${a}:${i}`, el);
        p.append(i ? ' ' : '', el);
      });
      blocks.push(p);
      if (showMeaning() && trans[a - 1] && (phase === 'listen' || phase === 'practice' || phase === 'check')) {
        blocks.push(h('p', { class: 'ls-tr', lang: tInfo.lang, dir: tInfo.dir }, h('span', { class: 'ls-n' }, `${a}. `), trans[a - 1]));
      }
    }
    textEl.replaceChildren(...blocks);
  }
  /** Repaints only these words (voice follow-along updates many times a second). */
  function refreshKeys(keys: Set<string>) {
    for (const k of keys) {
      const [a, i] = k.split(':').map(Number);
      for (const el of [wordEls.get(k), ...moreEls.filter(([x]) => x === k).map(([, e]) => e)]) {
        if (!el) continue;
        const keep = el.classList.contains('on') ? ' on' : '';
        el.className = `${el.classList.contains('w') ? 'w ' : ''}lw${wordCls(a, i)}${keep}`;
      }
    }
  }
  function refreshHidden() {
    for (const [k, el] of [...wordEls, ...moreEls]) {
      const [a, i] = k.split(':').map(Number);
      const keep = el.classList.contains('on') ? ' on' : '';
      el.className = `${el.classList.contains('w') ? 'w ' : ''}lw${wordCls(a, i)}${keep}`;
    }
  }

  function paintActions() {
    const b = (label: string, on: () => void, cls = 'chip') => h('button', { class: cls, onclick: on }, label);
    const primary = (label: string, on: () => void) => b(label, on, 'primary brand-btn');
    const n = range[1] - range[0] + 1;
    const phases: [Phase, LearnKey][] = step === 'new'
      ? [['meaning', 'learn.phMeaning'], ['listen', 'learn.phListen'], ['practice', 'learn.phPractice'], ['drill', 'learn.phDrill'], ['memory', 'learn.phMemory']] : [];
    phaseEl.replaceChildren(
      h('span', { class: 'ls-goal' }, lt(step === 'new' && n === 1 ? 'learn.goal.new1' : `learn.goal.${step}` as LearnKey, { n })),
      phases.length ? h('span', { class: 'ls-phases' }, ...phases.map(([p, k], i) => h('span', { class: p === phase || (p === 'memory' && phase === 'check') ? 'on' : '' }, `${i + 1} ${lt(k)}`))) : '');
    if (phase === 'meaning') actions.replaceChildren(primary(lt('learn.toListen'), () => go('listen')));
    else if (phase === 'drill') actions.replaceChildren(b(lt('learn.skipDrill'), () => go('memory')));
    else if (phase === 'listen') actions.replaceChildren(primary(playing ? lt('learn.listening') : lt('learn.listenRounds', { n: reps() }), () => void listen(true)), b(lt('learn.skipToPractice'), () => go('practice')));
    else if (phase === 'practice') actions.replaceChildren(
      b(lt(level === 0 ? 'learn.hideSome' : level === 1 ? 'learn.hideAll' : 'learn.showAll'), () => { level = (level + 1) % 3; peeked.clear(); refreshHidden(); paintActions(); }),
      primary(lt('learn.toDrill'), () => go('drill')));
    else if (phase === 'memory') {
      const recBtn = Recorder.supported ? h('button', { class: `chip ts-rec${rec.on ? ' on' : ''}`, 'aria-pressed': String(rec.on), onclick: () => void toggleRec() },
        h('span', { class: 'ts-dot', 'aria-hidden': 'true' }), lt(rec.on ? 'learn.recording' : 'learn.record')) : '';
      const slips = new Set([...helped, ...skip, ...skipP]).size;
      const folBtn = canFollow ? h('button', { class: `chip ts-follow${follower ? ' live' : ''}`, 'aria-pressed': String(!!follower), onclick: () => void toggleFollow() },
        h('span', { class: 'ts-mic', 'aria-hidden': 'true' }), lt(follower ? 'learn.following' : 'learn.follow')) : '';
      // Focus page: only the voice, the next-word prompt and Show the text sit under the page; the rest is with the tools.
      const extra = [follower ? '' : recBtn, step === 'new' ? b(lt('learn.practiseFirst'), () => go('practice')) : ''];
      const focus = root.classList.contains('ls-focus');
      memExtras.replaceChildren(...(focus ? extra : []));
      actions.replaceChildren(
        h('p', { class: 'ls-hint muted small' }, slips ? lt(skip.size || skipP.size ? 'learn.followSkipped' : 'learn.slipsSoFar', { n: slips }) : lt(follower ? 'learn.followHint' : 'learn.memoryHint')),
        folBtn, b(lt('learn.stuck'), promptNext, 'chip ts-stuck'), ...(focus ? [] : extra), primary(lt('learn.reveal'), () => go('check')));
    } else if (phase === 'check') {
      const total = new Set([...helped, ...missed]).size;
      let all = 0;
      for (let a = range[0]; a <= range[1]; a++) all += words[a - 1].length;
      const verdict = total === 0 ? 2 : total <= Math.max(2, Math.round(all * 0.05)) ? 1 : 0;
      const pick = (k: number, label: string, on: (el: HTMLButtonElement) => void) => {
        const el: HTMLButtonElement = k === verdict ? primary(label, () => on(el)) : b(label, () => on(el));
        return el;
      };
      const ab = h('div', { class: 'ts-ab' },
        recUrl ? h('button', { class: 'chip', onclick: () => playMine() }, '▶ ', lt('learn.playMine')) : '',
        h('button', { class: 'chip', onclick: () => { mine.pause(); void listen(); } }, '▶ ', lt('learn.playSheikh')),
        simCount ? h('button', { class: 'chip ts-simbtn', onclick: () => void similarSheet(s, range[0], range[1]) }, lt('learn.simN', { n: simCount })) : '');
      actions.replaceChildren(
        h('p', { class: 'ls-hint' }, lt('learn.tapMissed')),
        h('p', { class: 'ls-hint ts-sum' }, total ? lt('learn.slipsN', { n: total }) : lt('learn.noSlips')),
        skip.size ? h('p', { class: 'ls-hint muted small' }, lt('learn.skippedN', { n: skip.size })) : '',
        hkS.size ? h('p', { class: 'ls-hint muted small' }, lt('learn.harakahN', { n: hkS.size })) : '',
        hkS.size && jar.size && helpChoice() === null && !kidsOn() ? helpCard(() => paintActions()) : '',
        ab,
        pick(0, lt('learn.notYet'), () => {
          keepWeak();
          if (step !== 'new') { const ps: number[] = []; for (let x = range[0]; x <= range[1]; x++) ps.push(mushaf.pageOf(s, x)); recordPages(ps, 0); }
          if (quick) { toast(lt('learn.quickNotYet')); const n = nextQuick(s); location.replace(n ? `#/learn/${n}/tasmi` : '#/learn'); return; }
          level = Math.max(0, level - 1); go(step === 'new' ? 'practice' : 'memory');
        }),
        pick(1, lt('learn.someSlips'), (el) => { keepWeak(); void pass(false, el); }),
        pick(2, lt('learn.hadIt'), (el) => { keepWeak(); void pass(true, el); }));
    } else actions.replaceChildren();
  }

  /** "Stuck? Next word": the first hidden word in reading order, shown for good; a slip. */
  function promptNext() {
    for (let a = range[0]; a <= range[1]; a++) for (let i = 0; i < words[a - 1].length; i++) {
      const k = `${a}:${i}`;
      if (!hiddenWord(a, i)) continue;
      shown.add(k); helped.add(k);
      refreshHidden();
      const el = wordEls.get(k);
      el?.classList.add('peek');
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      haptic(10);
      paintActions();
      return;
    }
  }
  async function toggleFollow() {
    if (follower) { stopFollow(); paintActions(); return; }
    if (rec.on) await stopRec();
    if (!localStorage.getItem(harakatOn ? 'followNotedS' : 'followNoted')) { toast(lt(harakatOn ? 'learn.followNoteServer' : 'learn.followNote')); try { localStorage.setItem(harakatOn ? 'followNotedS' : 'followNoted', '1'); } catch { /* blocked */ } }
    stopAll();
    const list: { key: string; text: string }[] = [];
    for (let a = range[0]; a <= range[1]; a++) words[a - 1].forEach((text, i) => list.push({ key: `${a}:${i}`, text }));
    fw = followWords(list);
    fwText = new Map(list.map((x) => [x.key, x.text]));
    // carry on from the first word not yet shown, heard or passed
    fBase = fw.findIndex((w) => { const [a, i] = w.key.split(':').map(Number); return hiddenWord(a, i); });
    if (fBase < 0) fBase = fw.length;
    const f = await startFollow({
      heard: (text, final) => heard(text, final),
      hints: () => hintsFrom(fw, fBase),
      ahead: () => fw.slice(fBase).map((w) => fwText.get(w.key) ?? ''),
      checked: (r, pcm) => {
        hkNext = r.flags.map((i) => fw[fBase + i]?.key).filter((k): k is string => !!k);
        const base = fBase;
        jar.take(pcm, r, (i) => { const w = fw[base + i]; if (!w) return null; const a = +w.key.split(':')[0]; return { key: w.key, s, a, text: fwText.get(w.key) ?? '' }; });
      },
      ended: (why) => {
        follower = null;
        if (why === 'denied') toast(lt('learn.followDenied'));
        else if (why === 'limit') toast(lt('learn.followLimit'));
        else if (why === 'failed') { const f = followFailKey(); toast(lt(f.key, { code: f.code })); canFollow = false; }
        else if (why === 'quiet') toast(lt('learn.followQuiet'));
        if (phase === 'memory') paintActions();
      },
    });
    if (!f) { toast(lt('learn.followFailed')); return; }
    follower = f;
    haptic(10);
    paintActions();
  }
  function stopFollow() {
    const f = follower;
    follower = null;
    f?.stop();
    for (const k of sayP) said.add(k);
    for (const k of skipP) skip.add(k);
    for (const k of wrongP) wrongS.add(k);
    sayP = new Set(); skipP = new Set(); wrongP = new Set();
  }
  let lastSaid = '', lastSig = '';
  function heard(text: string, final: boolean) {
    if (!follower || phase !== 'memory') return;
    const r = follow(fw, fBase, text);
    const touched = new Set([...sayP, ...skipP]);
    sayP = new Set(r.said.map((x) => fw[x].key));
    wrongP = new Set(r.wrong.map((x) => fw[x].key));
    skipP = new Set([...r.skipped.map((x) => fw[x].key), ...wrongP]);
    if (final) {
      for (const k of sayP) said.add(k);
      for (const k of skipP) skip.add(k);
      for (const k of wrongP) wrongS.add(k);
      for (const k of hkNext) { said.add(k); skip.add(k); wrongS.add(k); hkS.add(k); }
      sayP = new Set(); skipP = new Set(); wrongP = new Set();
      fBase = r.cursor;
    }
    for (const k of hkNext) touched.add(k);
    hkNext = [];
    for (const k of [...sayP, ...skipP, ...r.said.map((x) => fw[x].key), ...r.skipped.map((x) => fw[x].key), ...r.wrong.map((x) => fw[x].key)]) touched.add(k);
    refreshKeys(touched);
    const at = r.said.length ? fw[r.said[r.said.length - 1]].key : '';
    if (at && at !== lastSaid) {
      lastSaid = at;
      const el = wordEls.get(at);
      if (el) {
        el.classList.add('pop');
        const rc = el.getBoundingClientRect(), tc = textEl.getBoundingClientRect();
        if (rc.bottom > tc.bottom - 40 || rc.top < tc.top) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
    const sig = `${skip.size + skipP.size > 0}|${new Set([...helped, ...skip, ...skipP]).size}`;
    if (sig !== lastSig) { lastSig = sig; paintActions(); }
    if (r.cursor >= fw.length) {
      stopFollow();
      toast(lt('learn.followEnd'));
      haptic(20);
      window.setTimeout(() => { if (phase === 'memory') go('check'); }, 900);
    }
  }
  async function toggleRec() {
    if (rec.on) { await stopRec(); paintActions(); return; }
    const why = await rec.start();
    if (why) { toast(lt(why === 'denied' ? 'learn.followDenied' : why === 'busy' ? 'learn.micBusy' : 'learn.noMic')); return; }
    haptic(10);
    paintActions();
  }
  async function stopRec() {
    if (!rec.on) return;
    const blob = await rec.stop();
    if (!blob) return;
    if (recUrl) URL.revokeObjectURL(recUrl);
    recUrl = URL.createObjectURL(blob);
    void keepRecording(recKey(s, range[0], range[1]), blob);
  }
  function playMine() {
    stopAll();
    if (!recUrl) return;
    mine.src = recUrl;
    void mine.play().catch(() => {});
  }
  /** Missed and prompted words come back with a hint; weak words recited cleanly move towards leaving. */
  function keepWeak() {
    jar.share(missed);
    const bad = new Set([...helped, ...missed]);
    for (const k of bad) { const [a, i] = k.split(':').map(Number); markWeak(s, a, i); }
    for (const k of weak) if (!bad.has(k)) { const [a, i] = k.split(':').map(Number); markStrong(s, a, i); }
  }

  function go(p: Phase) {
    stopAll();
    if (follower) stopFollow();
    mine.pause();
    if (p !== 'memory' && rec.on) void stopRec().then(() => { if (phase === 'check') paintActions(); });
    if (p === 'memory' && phase !== 'check') {
      helped.clear(); shown.clear(); missed.clear();
      jar.clear();
      said.clear(); skip.clear(); wrongS.clear(); hkS.clear(); sayP = new Set(); skipP = new Set(); wrongP = new Set(); lastSaid = '';
      weak = new Set(weakWords(s, range[0], range[1]).map(([a, i]) => `${a}:${i}`));
      if (recUrl) { URL.revokeObjectURL(recUrl); recUrl = ''; }
      void recording(recKey(s, range[0], range[1])).then((b) => { if (b && !recUrl && phase !== 'memory') { recUrl = URL.createObjectURL(b); paintActions(); } });
    }
    if (p === 'check') { missed.clear(); for (const k of skip) missed.add(k); } // passed over: marked, untap if the phone misheard
    phase = p;
    pop.hidden = true;
    peeked.clear();
    kindEl = p === 'meaning' ? meaningCards(kindCtx()) : p === 'drill' ? drills(kindCtx(), () => go('memory')) : null;
    if (root.classList.contains('ls-focus') && !reduced()) textEl.animate([{ opacity: 0.25, filter: 'blur(2px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 420, easing: 'ease-out' });
    textEl.scrollTop = 0;
    if ((p === 'memory' || p === 'check') && !pageView()) textEl.scrollTop = 0;
    paintText();
    paintActions();
    status.textContent = p === 'memory' ? lt('learn.reciteNow') : '';
    root.classList.toggle('ls-memory', p === 'memory');
    root.classList.toggle('ls-check', p === 'check');
    if (p !== 'memory') memExtras.replaceChildren();
  }

  function startStep() {
    doneEl.hidden = true;
    for (const el of [stepsEl, phaseEl, textEl.parentElement!, actions, tools]) (el as HTMLElement).hidden = false;
    level = 0;
    simCount = 0;
    void similarIn(s, range[0], range[1]).then((l) => { simCount = l.length; if (phase === 'check') paintActions(); });
    paintHead();
    go(step === 'new' ? 'meaning' : 'memory');
  }

  // --- recitation ---
  let audios: AyahAudio[] | null = null;
  let blobUrl = '';
  let playing = false;
  let run = 0;
  let raf = 0;
  let turnTimer = 0;
  const audio = new Audio();
  audio.preload = 'auto';
  (audio as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = true;

  async function ensureAudio(): Promise<boolean> {
    if (audios) return true;
    const reciter = timedReciterById(learnReciter());
    status.textContent = t('common.loading');
    playBtn.replaceChildren(h('span', { class: 'spinner' }));
    try {
      let src: string;
      let q;
      if (s >= 78) {
        // Juz 'Amma: the whole short recording is kept on the device (shared with the Kids space).
        const { kidsRecitation } = await import('../data/kidsAudio');
        const r = await kidsRecitation(reciter.id, s);
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        blobUrl = r.src;
        src = r.src;
        q = r.qdc;
      } else {
        const { qdcSurah } = await import('../data/qdc');
        q = await qdcSurah(reciter.id, s);
        src = q.audioUrl; // streamed: the server answers Range requests
      }
      audios = words.map((ws, i) => {
        const v = q.timings.get(`${s}:${i + 1}`);
        const fallback: AyahAudio = { src: everyayahUrl(reciter, s, i + 1), from: 0, to: Infinity, words: null, heard: ws.map(() => false) };
        if (!v || !(v.timestamp_to > v.timestamp_from)) return fallback;
        const spans = parseSpans(wordMap[`${s}:${i + 1}`]);
        const wt = wordTimings(ws.length, v, spans);
        const heard = new Array(ws.length).fill(false);
        for (const [p] of validSegments(v.segments, spans ? spans.length : ws.length)) {
          const [f, l] = spans ? spans[p - 1] : [p - 1, p - 1];
          for (let w = f; w <= l; w++) heard[w] = true;
        }
        if (ws.length === 1 && wt) heard[0] = true;
        const to = v.timestamp_to / 1000;
        return { src, from: v.timestamp_from / 1000, to: i === words.length - 1 && wt ? Math.min(to, wt.last + 0.8) : to, words: wt, heard: wt ? heard : heard.fill(false) };
      });
      status.textContent = '';
      return true;
    } catch (e) {
      console.warn('Lesson recitation failed', e);
      status.textContent = navigator.onLine ? t('kids.playFailed') : t('kids.needsInternet');
      return false;
    } finally {
      paintPlay();
    }
  }
  function paintPlay() {
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 26));
    playBtn.setAttribute('aria-label', playing ? lt('learn.pause') : lt('learn.listen'));
  }

  async function seek(src: string, at: number) {
    if (audio.src !== src) {
      audio.src = src;
      await new Promise<void>((resolve, reject) => {
        const ok = () => { off(); resolve(); };
        const bad = () => { off(); reject(new Error(t('kids.loadFailed'))); };
        const off = () => { audio.removeEventListener('loadedmetadata', ok); audio.removeEventListener('error', bad); };
        audio.addEventListener('loadedmetadata', ok);
        audio.addEventListener('error', bad);
      });
    }
    if (Math.abs(audio.currentTime - at) > 0.12) audio.currentTime = at;
  }

  /** Plays one span (an ayah or a word); resolves when it ends, or false when stopped. */
  function playSpan(my: number, x: AyahAudio, from: number, to: number, light: (w: number | null) => void, wordOnly = false): Promise<boolean> {
    return new Promise((resolve) => {
      let stillT = -1, stillAt = performance.now();
      const finish = (ok: boolean) => { cancelAnimationFrame(raf); audio.removeEventListener('ended', onEnd); resolve(ok); };
      const onEnd = () => finish(my === run);
      const follow = () => {
        if (my !== run) { finish(false); return; }
        raf = requestAnimationFrame(follow);
        const tm = audio.currentTime;
        if (x.words && !wordOnly) {
          let w: number | null = null;
          for (const [i, a, b] of x.words.seq) if (a <= tm && tm < b) w = i;
          light(w);
        }
        const now = performance.now();
        if (tm !== stillT || audio.seeking) { stillT = tm; stillAt = now; }
        const lastEnd = x.words && !wordOnly ? x.words.last : to;
        const atEnd = Number.isFinite(audio.duration) && tm >= audio.duration - 0.05;
        if (tm >= to || atEnd || (now - stillAt > 1500 && tm >= lastEnd - 1) || (now - stillAt > 8000)) finish(true);
      };
      audio.addEventListener('ended', onEnd);
      void (async () => {
        try {
          await seek(x.src, from);
          if (my !== run) { finish(false); return; }
          audio.playbackRate = speed();
          if (audio.paused) await audio.play();
          raf = requestAnimationFrame(follow);
        } catch (e) {
          if ((e as Error).name !== 'AbortError') status.textContent = navigator.onLine ? t('kids.playFailed') : t('kids.needsInternet');
          finish(false);
        }
      })();
    });
  }

  let lit: HTMLElement | null = null;
  const lightWord = (a: number) => (w: number | null) => {
    const el = w === null ? null : wordEls.get(`${a}:${w}`) ?? null;
    if (el === lit) return;
    lit?.classList.remove('on');
    lit = el;
    if (el) {
      el.classList.add('on');
      const r = el.getBoundingClientRect(), box = (pageView() ? textEl.parentElement! : textEl).getBoundingClientRect();
      if (r.top < box.top + 8 || r.bottom > box.bottom - 8) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  /** Listens to the range: `rounds` times, with a turn to repeat after each round in the Listen phase. */
  async function listen(rounds = false) {
    if (!(await ensureAudio())) return;
    const my = ++run;
    playing = true;
    paintPlay();
    paintActions();
    pop.hidden = true;
    const total = rounds && phase === 'listen' ? reps() : 1;
    for (let r = 1; r <= total; r++) {
      status.textContent = total > 1 ? lt('learn.round', { r, n: total }) : '';
      for (let a = range[0]; a <= range[1]; a++) {
        const x = audios![a - 1];
        const ok = await playSpan(my, x, x.from, x.to, lightWord(a));
        lightWord(a)(null);
        if (!ok || my !== run) return;
      }
      if (rounds && phase === 'listen') {
        // The learner's turn: as long as the range took, plus a breath.
        audio.pause();
        let len = 0;
        for (let a = range[0]; a <= range[1]; a++) { const x = audios![a - 1]; len += Number.isFinite(x.to) ? x.to - x.from : 6; }
        len /= speed();
        status.textContent = t('kids.yourTurn');
        root.classList.add('ls-your-turn');
        ring.style.setProperty('--turn', `${len + TURN_EXTRA}s`);
        const done = await new Promise<boolean>((res) => { turnTimer = window.setTimeout(() => res(my === run), (len + TURN_EXTRA) * 1000); });
        root.classList.remove('ls-your-turn');
        if (!done || my !== run) return;
      }
    }
    audio.pause();
    playing = false;
    paintPlay();
    status.textContent = '';
    if (rounds && phase === 'listen') go('practice');
    else paintActions();
  }

  function stopAll() {
    run++;
    clearTimeout(turnTimer);
    cancelAnimationFrame(raf);
    audio.pause();
    playing = false;
    root.classList.remove('ls-your-turn');
    lit?.classList.remove('on');
    lit = null;
    paintPlay();
    status.textContent = '';
  }

  /** Quran.com word meanings of the API positions inside display word i. */
  function meaningOf(a: number, i: number): string {
    const list = (meanings[a - 1] ?? '').split('|');
    const spans = parseSpans(wordMap[`${s}:${a}`]);
    if (!spans) return list[i] ?? '';
    return spans.map(([f, l], p) => (i >= f && i <= l ? list[p] : '')).filter(Boolean).join(' ');
  }

  /** A word's own sound, where the reciter's timings cover it (rule 8). */
  async function sayWord(a: number, i: number): Promise<void> {
    if (!(await ensureAudio())) return;
    const x = audios![a - 1];
    if (!x.words || !x.heard[i]) return;
    stopAll();
    const my = run;
    lightWord(a)(i);
    await playSpan(my, x, x.words.start[i], x.words.end[i] + 0.06, () => {}, true);
    if (my === run) audio.pause();
    lightWord(a)(null);
  }
  const kindCtx = (): KindCtx => ({
    s, range, words, trans, tr: { lang: tInfo.lang, dir: tInfo.dir, name: tInfo.translator }, meaningOf, sayWord,
    refOf: (a, b) => uiRef(m, a, b ?? a),
  });

  let peekTimer = 0;
  async function tapWord(a: number, i: number) {
    const el = wordEls.get(`${a}:${i}`);
    if (!el) return;
    if (phase === 'check') {
      // Honest tasmi': tap the words that were missed or said wrong.
      const k = `${a}:${i}`;
      if (missed.has(k)) missed.delete(k); else missed.add(k);
      haptic(6);
      refreshHidden();
      paintActions();
      return;
    }
    if (el.classList.contains('hid')) {
      // From memory: a peek at one word, for a moment (a slip).
      peeked.add(`${a}:${i}`);
      if (phase === 'memory') { helped.add(`${a}:${i}`); paintActions(); }
      el.classList.remove('hid');
      el.classList.add('peek');
      haptic(6);
      clearTimeout(peekTimer);
      peekTimer = window.setTimeout(() => { peeked.delete(`${a}:${i}`); el.classList.remove('peek'); refreshHidden(); }, 1800);
      return;
    }
    const mean = meaningOf(a, i);
    pop.hidden = false;
    pop.replaceChildren(h('span', { class: 'ls-pop-ar', lang: 'ar', dir: 'rtl' }, words[a - 1][i]), h('span', { class: 'ls-pop-en' }, mean || lt('learn.noMeaning')),
      h('span', { class: 'muted small' }, `${s}:${a} · ${lt('learn.wbwCredit')}`));
    await sayWord(a, i); // rule 8: no timing of its own → its meaning only
  }

  // --- passing a step ---
  async function pass(smooth: boolean, from: Element | null) {
    stopAll();
    const time = timeFor(clock.lap());
    const before = tree(s)!;
    const stage0 = stageOf(before, m.ayahs);
    const today = dayKey(new Date());
    const ref0 = uiRef(m, range[0], range[1]);
    let moment: Promise<void> | null = null;
    if (step === 'new') {
      const n = range[1] - before.learned;
      learnTo(s, range[1]);
      if (n > 0) addMemorised(n);
      claimGoal(`gl:n:${s}:${range[1]}`, LIGHT.new);
      moment = celebrate({ kind: 'lantern', kicker: lt('learn.celNew'), title: ref0, sub: lt('learn.celNewSub'), time }, from, LIGHT.new);
    } else if (step === 'link') {
      const wasDry = thirsty(before);
      const fresh = range[1] > before.linked;
      linkTo(s, range[1]);
      const light = fresh ? LIGHT.link : wasDry ? LIGHT.water : 0;
      if (light) claimGoal(fresh ? `gl:l:${s}:${range[1]}` : `gl:wa:${s}:${today}`, light);
      moment = celebrate({ kind: 'lantern', kicker: lt(wasDry && !fresh ? 'learn.celWater' : 'learn.celLink'), title: ref0, sub: lt('learn.celLinkSub'), time }, from, light);
    } else {
      const first = !before.full;
      const wasDry = thirsty(before);
      reciteWhole(s, m.ayahs, smooth);
      if (first) {
        claimGoal(`gl:w:${s}`, LIGHT.whole);
        moment = celebrate({ kind: 'star', kicker: lt('learn.celFull'), title: surahName(m), sub: lt('learn.celFullSub'), time }, from, LIGHT.whole);
      } else {
        const light = wasDry ? LIGHT.water : 0;
        if (light) claimGoal(`gl:wa:${s}:${today}`, light);
        moment = celebrate({ kind: 'lantern', kicker: lt('learn.celWater'), title: surahName(m), sub: lt(smooth ? 'learn.celWaterSub' : 'learn.celWaterSlips'), time }, from, light);
      }
    }
    addLesson();
    // The pages this recitation covered get their strength (page memory).
    const covered: number[] = [];
    for (let x = range[0]; x <= range[1]; x++) covered.push(mushaf.pageOf(s, x));
    recordPages(covered, smooth ? 2 : 1);
    const after = tree(s)!;
    const stage1 = stageOf(after, m.ayahs);
    if (stage1 !== stage0) noteGrowth(s, stage0);
    await moment;
    const was = step;
    if (was === 'new' && range[0] > 1) { await plan('new'); startStep(); return; }
    if (was === 'link' && reviewFirst) {
      // Watered by reciting what was learned: on to the next new ayat, as a day's lesson goes.
      reviewFirst = false;
      await plan('link');
      if (step === 'new') { startStep(); return; }
    }
    if (quick && was === 'whole') {
      const n = nextQuick(s);
      if (n) { location.replace(`#/learn/${n}/tasmi`); return; }
      location.hash = '#/learn';
      return;
    }
    void showDone(after, was);
  }

  async function showDone(tr: Readonly<Tree>, was: Step) {
    for (const el of [stepsEl, phaseEl, textEl.parentElement!, actions, tools]) (el as HTMLElement).hidden = true;
    status.textContent = '';
    doneEl.hidden = false;
    paintHead();
    const next = tr.full ? null : nextChunk(tr.learned, m.ayahs, tr.chunk, typeof tr.chunk === 'number' ? [] : await places());
    const label = tr.full ? null : next ? lt(next[0] === next[1] ? 'learn.goAyah' : 'learn.goAyat', { a: next[0], b: next[1] }) : lt('learn.goWhole');
    doneEl.replaceChildren(
      vignette(150, (c, x, y, u) => drawTree(c, x, y, u, { s, v: tr.v, stage: stageOf(tr, m.ayahs), thirsty: false, t: 0, night: night() }), night(), stageHeight(s, stageOf(tr, m.ayahs))),
      h('h2', {}, lt(tr.full ? (was === 'whole' ? 'learn.doneFull' : 'learn.doneWatered') : 'learn.doneToday')),
      h('p', { class: 'muted' }, tr.full ? lt('learn.doneFullSub') : lt('learn.doneSub', { n: tr.learned, of: m.ayahs })),
      h('div', { class: 'ls-done-actions' },
        h('a', { class: label ? 'chip' : 'primary brand-btn', href: '#/learn' }, lt('learn.backToPath')),
        label ? h('button', { class: 'primary brand-btn', onclick: () => void plan().then(startStep) }, lt('learn.moreToday', { what: label })) : ''));
  }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === ' ' && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLSelectElement)) { e.preventDefault(); if (playing) stopAll(); else void listen(phase === 'listen'); }
    if (e.key === 'Escape') pop.hidden = true;
  };
  document.addEventListener('keydown', onKey);
  const onHide = () => { if (document.hidden) stopAll(); };
  document.addEventListener('visibilitychange', onHide);
  paintChips();
  paintPlay();
  startStep();
  if (tree(s)!.learned === 0 && step === 'new') toast(lt('learn.firstLesson'));
  return () => {
    clock.stop();
    stopAll();
    if (follower) stopFollow();
    void rec.stop();
    mine.pause();
    if (recUrl) URL.revokeObjectURL(recUrl);
    audio.removeAttribute('src');
    audio.load();
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHide);
  };
}
