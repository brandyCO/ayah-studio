// Lesson kinds before reciting from memory (Learn tab, src/ui/lesson.ts):
//   Meaning first   every word of the chunk with its Quran.com meaning, then the ayah's translation
//   Exercises       a short run of cards: which word means …, what comes next, fill the word, put the
//                   ayat (or the parts of one ayah) in order. A missed card comes back once at the end,
//                   and the word is kept as weak (src/data/weakWords.ts) so it returns with a hint. A wrong
//                   answer shows the right word with its meaning and sound at once, dims a lamp (src/data/learnLamps.ts),
//                   and the words missed are looked at once more before reciting.
// Only the bundled text is used, split at its spaces (rule 1); wrong choices are other words of the
// same surah, never altered words. The reference stays on screen (rule 2).
import { markStrong, markWeak, weakWords } from '../data/weakWords';
import { lt } from '../i18n/learn';
import { h, haptic } from './dom';
import { popIn, reduced, squash } from './juice';
import { sfx } from './sfx';

export interface KindCtx {
  s: number;
  range: [number, number];
  /** Display words per ayah of the surah (index 0 = ayah 1). */
  words: string[][];
  trans: string[];
  tr: { lang: string; dir: string; name: string };
  meaningOf(a: number, i: number): string;
  /** Plays a word's own sound where the reciter's timings cover it (rule 8); resolves when done. */
  sayWord(a: number, i: number): Promise<void>;
  refOf(a: number, b?: number): string;
}

const shuffle = <T>(xs: T[]): T[] => {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const uiDir = () => document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
const ar = (text: string, cls = '') => h('span', { class: `lk-ar ${cls}`, lang: 'ar', dir: 'rtl' }, text);

// --- Meaning first ---

export function meaningCards(c: KindCtx): HTMLElement {
  const box = h('div', { class: 'lk lk-meaning', dir: uiDir() });
  box.append(h('p', { class: 'lk-lead' }, lt('learn.meaningLead')));
  for (let a = c.range[0]; a <= c.range[1]; a++) {
    const row = h('div', { class: 'lk-tiles', dir: 'rtl' });
    c.words[a - 1].forEach((w, i) => {
      const mean = c.meaningOf(a, i);
      const tile = h('button', { class: 'lk-tile', style: `--d:${Math.min(i, 14) * 40}ms`, 'aria-label': `${w}: ${mean}`, onclick: () => { squash(tile, 0.12); void c.sayWord(a, i); } },
        ar(w), h('span', { class: 'lk-gloss', dir: 'ltr', lang: 'en' }, mean || '·'));
      row.append(tile);
    });
    box.append(
      h('p', { class: 'lk-ayahref' }, c.refOf(a)),
      row,
      c.trans[a - 1] ? h('p', { class: 'lk-trans', lang: c.tr.lang, dir: c.tr.dir }, c.trans[a - 1]) : '');
  }
  box.append(h('p', { class: 'muted small lk-credit' }, `${lt('learn.wbwCredit')} · ${c.tr.name}`));
  return box;
}

// --- Exercises ---

type Card =
  | { k: 'mean'; a: number; i: number; opts: [number, number][] }
  | { k: 'next'; a: number; i: number; opts: string[] }
  | { k: 'fill'; a: number; i: number; opts: string[] }
  | { k: 'order'; ayat: boolean; pieces: { label: string; text: string }[] };

const NUM = /\u00a0[\u0660-\u0669]+$/; // the printed ayah number at the end of an ayah's last word
const END = /[\u0660-\u0669\u06DD]/; // the end-of-ayah number (on the last word)
/** 2 other words of the surah that differ from `answer` (from the chunk first: harder to tell apart). */
function others(c: KindCtx, answer: string, shown: string[], n = 2): string[] {
  const near: string[] = [], far: string[] = [];
  const [f, l] = c.range;
  c.words.forEach((ws, ai) => ws.forEach((w) => {
    if (w === answer || shown.includes(w) || END.test(w) !== END.test(answer)) return;
    (ai + 1 >= f && ai + 1 <= l ? near : far).push(w);
  }));
  const out = new Set<string>();
  for (const pool of [shuffle(near), shuffle(far)]) for (const w of pool) { if (out.size >= n) break; out.add(w); }
  return [...out];
}

function buildCards(c: KindCtx): Card[] {
  const [f, l] = c.range;
  const all: [number, number][] = [];
  for (let a = f; a <= l; a++) c.words[a - 1].forEach((_, i) => all.push([a, i]));
  const total = Math.max(3, Math.min(6, Math.round(all.length / 4)));
  // Weak words come first: a missed word is asked again.
  const weak = weakWords(c.s, f, l).filter(([a, i]) => i < c.words[a - 1].length);
  const spot = (minI: number, maxBack: number): [number, number] | null => {
    const ok = all.filter(([a, i]) => i >= minI && i <= c.words[a - 1].length - 1 - maxBack);
    const w = weak.filter(([a, i]) => ok.some(([x, y]) => x === a && y === i));
    return w.length ? pick(w) : ok.length ? pick(ok) : null;
  };
  const cards: Card[] = [];
  // Which word means …? (only words whose meaning is listed and differs from the other choices)
  // The last word of an ayah carries its number, which would give it away: left out where possible.
  const inner = all.filter(([a, i]) => i < c.words[a - 1].length - 1);
  const meant0 = all.filter(([a, i]) => c.meaningOf(a, i).trim());
  const meantIn = meant0.filter((x) => inner.includes(x));
  const meant = meantIn.length >= 3 ? meantIn : meant0;
  if (meant.length >= 3) {
    const [a, i] = pick(meant);
    const m0 = c.meaningOf(a, i).trim();
    const seen = new Set([c.words[a - 1][i]]), means = new Set([m0]);
    const opts = shuffle(meant).filter(([x, y]) => {
      const w = c.words[x - 1][y], mm = c.meaningOf(x, y).trim();
      if (seen.has(w) || means.has(mm)) return false;
      seen.add(w); means.add(mm); return true;
    }).slice(0, 2);
    if (opts.length === 2) cards.push({ k: 'mean', a, i, opts: shuffle([[a, i], ...opts] as [number, number][]) });
  }
  const order = orderCard(c);
  while (cards.length < total - (order ? 1 : 0)) {
    const kind = cards.length % 2 ? 'fill' : 'next';
    const at = spot(1, 1) ?? (kind === 'next' ? spot(1, 0) : null);
    if (!at) break;
    const [a, i] = at;
    const answer = c.words[a - 1][i];
    const wrong = others(c, answer, c.words[a - 1]);
    if (wrong.length < 2) break;
    cards.push({ k: kind, a, i, opts: shuffle([answer, ...wrong]) });
    const wi = weak.findIndex(([x, y]) => x === a && y === i);
    if (wi >= 0) weak.splice(wi, 1);
  }
  if (order) cards.push(order);
  return cards;
}

/** Put in order: up to 4 consecutive ayat of the chunk, or a single long ayah's three parts. */
function orderCard(c: KindCtx): Card | null {
  const [f, l] = c.range;
  if (l > f) {
    const n = Math.min(4, l - f + 1);
    const start = f + Math.floor(Math.random() * (l - f + 2 - n));
    const pieces = [];
    // Each ayah's words exactly, without the printed ayah number after them (it would give the order away).
    for (let a = start; a < start + n; a++) pieces.push({ label: '', text: c.words[a - 1].join(' ').replace(NUM, '') });
    return { k: 'order', ayat: true, pieces };
  }
  const ws = c.words[f - 1];
  if (ws.length < 6) return null;
  const cut1 = Math.round(ws.length / 3), cut2 = Math.round((2 * ws.length) / 3);
  return { k: 'order', ayat: false, pieces: [ws.slice(0, cut1), ws.slice(cut1, cut2), ws.slice(cut2)].map((p) => ({ label: '', text: p.join(' ').replace(NUM, '') })) };
}

/** Lamps (src/data/learnLamps.ts): a wrong answer dims one; with none left the run rests (`rest`). */
export interface DrillLamps {
  /** Shown above the bar. */
  row: HTMLElement;
  /** A wrong answer: dims a lamp, returns the lamps still lit. */
  wrong(): number;
  /** The resting panel; `resume` carries on with the next card once a lamp is lit again. */
  rest(resume: () => void): HTMLElement;
}

/** The run of exercise cards; `done(missed)` when the last one is answered. */
export function drills(c: KindCtx, done: (missed: number) => void, lamps?: DrillLamps): HTMLElement {
  const cards = buildCards(c);
  const box = h('div', { class: 'lk lk-drill', dir: uiDir() });
  const bar = h('div', { class: 'lk-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(cards.length) }, h('span'));
  const stage = h('div', { class: 'lk-stage', 'aria-live': 'polite' });
  const foot = h('div', { class: 'lk-foot' });
  box.append(lamps ? h('div', { class: 'lk-top' }, bar, lamps.row) : bar, stage, foot);
  if (!cards.length) { queueMicrotask(() => done(0)); return box; }
  const queue = cards.slice();
  let right = 0, missed = 0, lit = 1;
  const retried = new Set<Card>();
  // The words missed in this run, looked at once more before reciting (kindness: the right word, its meaning, its sound).
  const slips: [number, number][] = [];

  const setBar = () => {
    const p = Math.min(1, right / cards.length);
    (bar.firstChild as HTMLElement).style.width = `${Math.max(4, p * 100)}%`;
    bar.setAttribute('aria-valuenow', String(right));
  };

  function feedback(ok: boolean, card: Card, answerNode: Node | null) {
    foot.className = `lk-foot show ${ok ? 'good' : 'bad'}`;
    const cont = h('button', { class: 'primary lk-continue', onclick: () => next() }, lt('learn.continue'));
    foot.replaceChildren(
      h('div', { class: 'lk-verdict' },
        h('strong', {}, lt(ok ? pick(['learn.good1', 'learn.good2', 'learn.good3'] as const) : 'learn.notQuite')),
        !ok && answerNode ? h('span', { class: 'lk-answer' }, ...((answerNode as Element).classList?.contains('lk-ar') ? [lt('learn.answerIs'), ' ', answerNode] : [answerNode])) : ''),
      cont);
    if (!reduced()) popIn(foot.firstElementChild!);
    setTimeout(() => cont.focus(), 30);
    if (ok) { right++; setBar(); sfx.pop(Math.min(right, 4)); haptic(8); } else {
      haptic(30);
      missed++;
      if (!retried.has(card)) { retried.add(card); queue.push(card); }
      if (card.k !== 'order' && !slips.some(([a, i]) => a === card.a && i === card.i)) slips.push([card.a, card.i]);
      if (lamps) lit = lamps.wrong();
    }
  }

  function choice(card: Card & { k: 'next' | 'fill' | 'mean' }, label: Node, isRight: boolean, onRight?: () => void) {
    const b = h('button', { class: 'lk-opt' }, label);
    b.addEventListener('click', () => {
      if (stage.classList.contains('answered')) return;
      stage.classList.add('answered');
      const a = card.a, i = card.i;
      if (isRight) {
        b.classList.add('right');
        squash(b, 0.15);
        markStrong(c.s, a, i);
        onRight?.();
        void c.sayWord(a, i);
        feedback(true, card, null);
      } else {
        b.classList.add('wrong');
        stage.querySelector('.lk-opt.is')?.classList.add('right', 'soft');
        markWeak(c.s, a, i);
        feedback(false, card, ar(c.words[a - 1][i]));
        // Right away: the right word's meaning beside it, and its sound where the reciter's timings cover it.
        const mean = c.meaningOf(a, i).trim();
        if (mean && card.k !== 'mean') foot.querySelector('.lk-answer')?.append(h('span', { class: 'lk-ansmean', dir: 'ltr', lang: 'en' }, `“${mean}”`));
        setTimeout(() => void c.sayWord(a, i), 350);
      }
    });
    if (isRight) b.classList.add('is');
    return b;
  }

  function show(card: Card) {
    stage.classList.remove('answered');
    foot.className = 'lk-foot';
    foot.replaceChildren();
    let body: Node[];
    if (card.k === 'mean') {
      const m0 = c.meaningOf(card.a, card.i);
      body = [
        h('p', { class: 'lk-q' }, lt('learn.qMeans')),
        h('p', { class: 'lk-meant' }, `“${m0}”`),
        h('div', { class: 'lk-opts' }, ...card.opts.map(([a, i]) => {
          const b = choice(card, ar(c.words[a - 1][i]), a === card.a && i === card.i);
          return b;
        })),
      ];
    } else if (card.k === 'next' || card.k === 'fill') {
      const ws = c.words[card.a - 1];
      const blank = h('span', { class: 'lk-blank' }, ws[card.i]);
      const line = h('p', { class: 'lk-line', lang: 'ar', dir: 'rtl' },
        ...ws.flatMap((w, i) => i === card.i ? [blank, ' '] : card.k === 'next' && i > card.i ? [] : [w, ' ']),
        card.k === 'next' ? h('span', { class: 'lk-more' }, '…') : '');
      const fillIn = () => { blank.classList.add('filled'); if (!reduced()) popIn(blank); };
      body = [
        h('p', { class: 'lk-q' }, lt(card.k === 'next' ? 'learn.qNext' : 'learn.qFill')),
        h('p', { class: 'lk-ayahref' }, c.refOf(card.a)),
        line,
        h('div', { class: 'lk-opts' }, ...card.opts.map((w) => choice(card, ar(w), w === ws[card.i], fillIn))),
      ];
    } else {
      body = orderBody(card);
    }
    stage.replaceChildren(h('div', { class: 'lk-card' }, ...body));
    if (!reduced()) popIn(stage.firstElementChild!, { stiffness: 260, damping: 22 });
  }

  function orderBody(card: Card & { k: 'order' }): Node[] {
    const placed: number[] = [];
    let mix = shuffle(card.pieces.map((_, i) => i));
    if (mix.every((v, i) => v === i)) mix = mix.reverse();
    const slots = h('div', { class: 'lk-slots' });
    const pool = h('div', { class: 'lk-pool' });
    const check = h('button', { class: 'primary lk-check', disabled: true }, lt('learn.check'));
    const piece = (i: number, on: () => void) => {
      const p = card.pieces[i];
      return h('button', { class: 'lk-piece', onclick: on }, p.label ? h('span', { class: 'lk-plabel' }, p.label) : '', ar(p.text));
    };
    const paint = () => {
      slots.replaceChildren(...placed.map((i, k) => piece(i, () => { if (stage.classList.contains('answered')) return; placed.splice(k, 1); paint(); })));
      pool.replaceChildren(...mix.filter((i) => !placed.includes(i)).map((i) => piece(i, () => { placed.push(i); paint(); if (!reduced()) popIn(slots.lastElementChild!); })));
      check.disabled = placed.length !== card.pieces.length;
      slots.classList.toggle('empty', !placed.length);
    };
    check.addEventListener('click', () => {
      if (stage.classList.contains('answered')) return;
      stage.classList.add('answered');
      const ok = placed.every((v, i) => v === i);
      check.hidden = true;
      if (ok) [...slots.children].forEach((el) => el.classList.add('right'));
      else {
        // Shown in the right order, the pieces that were out of place marked.
        slots.replaceChildren(...card.pieces.map((_, i) => { const el = piece(i, () => {}); el.classList.add(placed[i] === i ? 'right' : 'wrong'); return el; }));
      }
      feedback(ok, card, ok ? null : h('span', {}, lt('learn.rightOrder')));
    });
    paint();
    return [h('p', { class: 'lk-q' }, lt(card.ayat ? 'learn.qOrder' : 'learn.qOrderParts')), slots, pool, check];
  }

  function next() {
    // No lamp left: the run rests here until one is lit again (reciting from memory stays open).
    if (lamps && lit <= 0 && queue.length) {
      foot.className = 'lk-foot';
      foot.replaceChildren();
      stage.replaceChildren(lamps.rest(() => { lit = 1; next(); }));
      return;
    }
    const card = queue.shift();
    if (!card) { if (slips.length) lookAgain(); else done(missed); return; }
    show(card);
  }

  /** Before reciting: each word missed once more, with its meaning; tap to hear it. */
  function lookAgain() {
    foot.className = 'lk-foot';
    foot.replaceChildren();
    const go = h('button', { class: 'primary lk-continue', onclick: () => done(missed) }, lt('learn.fixGo'));
    stage.replaceChildren(h('div', { class: 'lk-card lk-fix' },
      h('p', { class: 'lk-q' }, lt('learn.fixTitle')),
      h('p', { class: 'muted small' }, lt('learn.fixSub')),
      h('div', { class: 'lk-fixlist' }, ...slips.map(([a, i], k) => {
        const mean = c.meaningOf(a, i).trim();
        const b = h('button', { class: 'lk-fixw', style: `--d:${k * 70}ms`, onclick: () => { squash(b, 0.12); void c.sayWord(a, i); } },
          ar(c.words[a - 1][i]), h('span', { class: 'lk-gloss', dir: 'ltr', lang: 'en' }, mean || '·'), h('span', { class: 'lk-fixref' }, c.refOf(a)));
        return b;
      })),
      go));
    if (!reduced()) popIn(stage.firstElementChild!, { stiffness: 260, damping: 22 });
    setTimeout(() => go.focus(), 30);
  }
  setBar();
  next();
  return box;
}
