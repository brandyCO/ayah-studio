// First steps as a conversation (owner request 2026-11-14, "a full page immersive experience with the character
// speaking"): after the tour, one full screen at a time. The character (the user's own, else the app's general one)
// stands in the page and speaks in a bubble, word by word; a question screen has it small beside its question and
// the answers below; one big Continue at the bottom. What brings you here → its answer → how much each day → the
// first goal. Saves exactly what the old sheets saved (`whyHere`, the pace, `tailor()`).
import './onboard.css';
import { choosePace, goals, needsPace, setGoals } from '../data/goals';
import { mark } from '../usage';
import { account, signInAvailable } from '../cloud/auth';
import { fe, type FrontKey } from '../i18n/front';
import { lang, setLang, t, type Lang } from '../i18n';
import { LANGS } from '../i18n/langs';
import { actor, myFigureCode, type Actor } from './actor';
import { h, haptic } from './dom';
import { DEFAULT, encode, normalize, parse } from './figure';
import { flame } from './flame';
import { goalText } from './goalName';
import { icon } from './icons';
import { sfx } from './sfx';
import { saveWhy, tailor, WHY_IC, WHYS, type Why } from './firstSteps';

/** "Which language?" in each language, asked before anything else is read. */
const LANG_ASK: Partial<Record<Lang, string>> = {
  en: 'Which language?', ar: 'أي لغة تفضّل؟', ur: 'آپ کون سی زبان پسند کریں گے؟', id: 'Mau pakai bahasa apa?',
  bn: 'কোন ভাষা পছন্দ করবেন?', tr: 'Hangi dili tercih edersin?', fa: 'کدام زبان را ترجیح می‌دهی؟', fr: 'Quelle langue préfères-tu ?',
  ms: 'Bahasa mana pilihan anda?', hi: 'आप कौन सी भाषा चाहेंगे?', ru: 'Какой язык тебе удобнее?', es: '¿Qué idioma prefieres?',
  de: 'Welche Sprache möchtest du?', pt: 'Qual idioma você prefere?', sw: 'Ungependa lugha gani?', ha: 'Wane harshe kake so?',
  so: 'Luqaddee ayaad doorbidaysaa?', ps: 'کومه ژبه غوره کوې؟', uz: 'Qaysi tilni tanlaysiz?', az: 'Hansı dili seçirsən?',
  bs: 'Koji jezik želiš?', sq: 'Cilën gjuhë preferon?', ckb: 'کام زمانت پێ باشترە؟', ta: 'எந்த மொழி வேண்டும்?',
  ml: 'ഏത് ഭാഷ വേണം?', zh: '你想用哪种语言？', it: 'Quale lingua preferisci?', nl: 'Welke taal wil je?', ja: 'どの言語にしますか？',
  ko: '어떤 언어로 할까요?',
};

type Screen = 'lang' | 'hi' | 'few' | 'why' | 'react' | 'pages' | 'pagesSay' | 'tasbih' | 'tasbihSay' | 'heard' | 'heardSay' | 'done';
const PAGES = [1, 2, 5, 10, 20] as const;
const PAGE_MIN: Record<number, number> = { 1: 2, 2: 3, 5: 8, 10: 15, 20: 30 };
const TASBIH = [33, 100, 300, 1000, 0] as const;
const TASBIH_MIN: Record<number, number> = { 33: 1, 100: 2, 300: 5, 1000: 15 };
const HEARD = ['instagram', 'tiktok', 'youtube', 'friend', 'store', 'masjid', 'search', 'other'] as const;
type Heard = (typeof HEARD)[number];
const HEARD_IC: Record<Heard, string> = { instagram: 'film', tiktok: 'film', youtube: 'play', friend: 'users', store: 'download', masjid: 'moon', search: 'search', other: 'sparkle' };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Shows the flow (once: nothing when both questions were answered before). `resumed`: back after the
 *  language screen reloaded the app in the language picked. */
export function openOnboarding(resumed = false) {
  try { sessionStorage.removeItem('obResume'); } catch { /* private */ }
  let asked = false;
  try { asked = localStorage.getItem('whyHere') !== null; } catch { /* private */ }
  const pace = needsPace();
  if (asked && !pace) return;
  if (document.querySelector('.ob')) return;
  const goalsPart: Screen[] = ['pages', 'pagesSay', 'tasbih', 'tasbihSay'];
  const screens: Screen[] = asked ? ['hi', ...goalsPart, 'done']
    : pace ? ['lang', 'hi', 'few', 'why', 'react', ...goalsPart, 'heard', 'heardSay', 'done']
    : ['lang', 'hi', 'why', 'react', 'heard', 'heardSay'];
  const picked = new Set<Why>();
  let pagesN: number | null = null;
  let tasbihN: number | null = null;
  let heard: Heard | null = null;
  let i = resumed && screens[0] === 'lang' ? 1 : 0;
  let tongue = lang();
  let typing = 0;

  const code = myFigureCode() ?? encode(normalize({ ...DEFAULT, face: 1 }));
  const bar = h('span', { class: 'ob-fill' });
  const back = h('button', { class: 'ob-back', 'aria-label': fe('ob.back') }, icon('back', 24));
  const skip = h('button', { class: 'ob-skip' }, fe('why.skip'));
  const stage = h('div', { class: 'ob-stage' });
  const go = h('button', { class: 'ob-go' }, fe('why.go'));
  const d = h('dialog', { class: 'ob', 'aria-label': fe('why.title') },
    h('div', { class: 'ob-sky', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('header', { class: 'ob-top' }, back, h('span', { class: 'ob-bar', role: 'progressbar' }, bar), skip),
    stage,
    h('footer', { class: 'ob-foot' }, go)) as HTMLDialogElement;

  /** The bubble's words come in one by one; the character's head bobs and its mouth moves with them. */
  const say = (el: HTMLElement, text: string, a: Actor | null) => {
    window.clearTimeout(typing);
    const words = text.split(/(\s+)/);
    el.textContent = '';
    el.setAttribute('aria-label', text);
    if (reduced()) { el.textContent = text; return; }
    const spans = words.map((w) => h('span', { class: /\S/.test(w) ? 'ob-w' : '' }, w));
    el.append(...spans);
    const head = a?.el.querySelector('.fg-hd');
    let k = 0;
    const next = () => {
      while (k < spans.length && !spans[k].classList.contains('ob-w')) k++;
      if (k >= spans.length) { a?.face('happy', 1200); return; }
      spans[k++].classList.add('on');
      a?.face(k % 4 === 1 ? 'wow' : 'happy', 0);
      head?.animate([{ translate: '0 0' }, { translate: '0 -1.4%' }, { translate: '0 0' }], { duration: 190, easing: 'ease-out' });
      typing = window.setTimeout(next, 72);
    };
    typing = window.setTimeout(next, 260);
  };

  /** The character; `hold` puts something in its hands for this screen (2 the mushaf, 1 the masbaha). */
  const who = (big: boolean, hold?: number) => {
    const f = parse(code);
    return actor(`ob-actor${big ? ' big' : ''}`, f && hold !== undefined ? encode(normalize({ ...f, hold })) : code);
  };
  /** One answer of several (a single choice): the row lights, the character hops. */
  const single = <T,>(vals: readonly T[], cur: () => T | null, set: (v: T) => void, row: (v: T) => (Node | string)[], cls: (v: T) => string, a: Actor | null) => {
    const opts = vals.map((v) => opt(cls(v), cur() === v, [...row(v), h('span', { class: 'ob-tick', 'aria-hidden': 'true' }, icon('check', 16))], () => {
      set(v);
      opts.forEach((o, k) => { const on = vals[k] === v; o.classList.toggle('on', on); o.setAttribute('aria-pressed', String(on)); });
      go.disabled = false;
      sfx.pop(1); a?.hop(0.3); haptic(8);
    }));
    go.disabled = cur() === null;
    return h('div', { class: 'ob-list' }, ...opts);
  };

  const opt = (cls: string, on: boolean, kids: (Node | string)[], onclick: () => void) =>
    h('button', { class: `ob-opt ${cls}${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick }, ...kids);

  function draw(dir = 1) {
    const s = screens[i];
    bar.style.width = `${Math.round(((i + 1) / screens.length) * 100)}%`;
    back.style.visibility = i && !(resumed && i === 1) ? 'visible' : 'hidden';
    skip.style.visibility = s === 'why' || s === 'pages' || s === 'tasbih' || s === 'heard' ? 'visible' : 'hidden';
    const bubble = h('p', { class: 'ob-say' });
    const ask = s === 'why' || s === 'pages' || s === 'tasbih' || s === 'heard' || s === 'lang';
    const a = who(!ask, s === 'pagesSay' ? 2 : s === 'tasbihSay' && tasbihN ? 1 : undefined);
    const body: HTMLElement[] = [];
    let line = '';
    let flameEl: HTMLElement | null = null;
    go.textContent = fe('why.go');
    go.disabled = false;
    if (s === 'lang') {
      // Asked in both languages at once, before anything else is read.
      line = '';
      // The phone's language first (already picked), then every other one; each in its own words, with the
      // English name under it.
      const list = [...LANGS].sort((x, y) => Number(y.id === tongue) - Number(x.id === tongue));
      const opts = list.map((l, k) => opt(`l-${l.id} c${k % 6}`, l.id === tongue, [
        h('span', { class: 'ob-ic ob-lang', 'aria-hidden': 'true', lang: l.id }, l.mark),
        h('span', { class: 'ob-txt' }, h('b', { lang: l.id, dir: l.dir }, l.name), l.id === 'en' ? '' : h('small', { lang: 'en' }, l.en)),
        h('span', { class: 'ob-tick', 'aria-hidden': 'true' }, icon('check', 16))], () => {
        tongue = l.id;
        opts.forEach((o, j) => { const on = list[j].id === l.id; o.classList.toggle('on', on); o.setAttribute('aria-pressed', String(on)); });
        sfx.pop(1); a?.hop(0.25); haptic(8);
      }));
      body.push(h('div', { class: 'ob-list langs' }, ...opts));
    } else if (s === 'hi') line = fe('ob.hi');
    else if (s === 'few') line = fe('ob.few');
    else if (s === 'react') line = picked.size > 1 ? fe('ob.many') : picked.size ? fe(`ob.${[...picked][0]}` as FrontKey) : fe('ob.none');
    else if (s === 'why') {
      line = fe('why.title');
      go.disabled = !picked.size;
      body.push(h('p', { class: 'ob-hint' }, fe('ob.whyHint')), h('div', { class: 'ob-list' }, ...WHYS.map((w) => {
        const b = opt(`w-${w}`, picked.has(w), [
          h('span', { class: 'ob-ic', 'aria-hidden': 'true' }, icon(WHY_IC[w], 24)),
          h('span', { class: 'ob-txt' }, h('b', {}, fe(`why.${w}` as FrontKey)), h('small', {}, fe(`why.${w}Sub` as FrontKey))),
          h('span', { class: 'ob-tick', 'aria-hidden': 'true' }, icon('check', 16))], () => {
          if (picked.has(w)) picked.delete(w); else { picked.add(w); sfx.pop(picked.size); a?.hop(0.25); }
          b.classList.toggle('on', picked.has(w));
          b.setAttribute('aria-pressed', String(picked.has(w)));
          go.disabled = !picked.size;
          haptic(8);
        });
        return b;
      })));
    } else if (s === 'pages') {
      line = fe('ob.pages');
      pagesN ??= ([...picked].length ? [...picked] : whyNow()).includes('memorise') ? 2 : 1;
      body.push(h('p', { class: 'ob-hint' }, fe('ob.pagesHint')), single(PAGES, () => pagesN, (v) => { pagesN = v; }, (v) => [
        h('span', { class: 'ob-ic ob-num', 'aria-hidden': 'true' }, String(v)),
        h('span', { class: 'ob-txt' }, h('b', {}, goalText('pages', v)), h('small', {}, fe('ob.min', { n: PAGE_MIN[v] })))], (v) => `n-${v}`, a));
    } else if (s === 'pagesSay') line = fe(`ob.p${pagesN ?? 1}` as FrontKey);
    else if (s === 'tasbih') {
      line = fe('ob.tasbih');
      body.push(h('p', { class: 'ob-hint' }, fe('ob.tasbihHint')), single(TASBIH, () => tasbihN, (v) => { tasbihN = v; }, (v) => [
        h('span', { class: 'ob-ic ob-num', 'aria-hidden': 'true' }, v ? String(v) : '–'),
        h('span', { class: 'ob-txt' }, h('b', {}, v ? fe('ob.times', { n: v }) : fe('ob.tasbihNone')), v ? h('small', {}, TASBIH_MIN[v] > 1 ? fe('ob.min', { n: TASBIH_MIN[v] }) : fe('ob.underMin')) : '')], (v) => `t-${v}`, a));
    } else if (s === 'tasbihSay') line = fe(`ob.t${tasbihN ?? 0}` as FrontKey);
    else if (s === 'heard') {
      line = fe('ob.heard');
      body.push(single(HEARD, () => heard, (v) => { heard = v; }, (v) => [
        h('span', { class: `ob-ic h-${v}`, 'aria-hidden': 'true' }, icon(HEARD_IC[v], 22)),
        h('span', { class: 'ob-txt' }, h('b', {}, fe(`ob.h.${v}` as FrontKey)))], (v) => `h-${v}`, a));
    } else if (s === 'heardSay') line = fe(`ob.hs.${heard ?? 'other'}` as FrontKey);
    else if (s === 'done') {
      line = pagesN === null ? fe('ob.doneLater') : t('fs.paceSet', { goal: goalText('pages', goals().pages) });
      go.textContent = fe('ob.start');
      flameEl = h('div', { class: 'ob-flame', 'aria-hidden': 'true' }, flame(1, 76));
      // One quiet line (front-end review G1): progress can follow them to any phone once they sign in on Me.
      if (!account() && signInAvailable()) body.push(h('p', { class: 'ob-hint ob-safe' }, fe('g1.ob')));
    }
    const talk = ask
      ? h('div', { class: 'ob-talk ask' }, a?.el ?? '', h('div', { class: 'ob-bubble' }, bubble))
      : h('div', { class: 'ob-talk' }, h('div', { class: 'ob-bubble' }, bubble), h('div', { class: 'ob-who' }, a?.el ?? '', flameEl ?? ''));
    const page = h('section', { class: `ob-page s-${s}` }, talk, ...body);
    const old = stage.firstElementChild as HTMLElement | null;
    if (old && !reduced()) {
      const x = (document.documentElement.dir === 'rtl' ? -1 : 1) * dir;
      old.animate([{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `${-40 * x}px 0` }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).onfinish = () => old.remove();
      page.animate([{ opacity: 0, translate: `${48 * x}px 0` }, { opacity: 1, translate: '0 0' }], { duration: 360, delay: 120, easing: 'cubic-bezier(.2,.9,.3,1.15)', fill: 'backwards' });
    } else old?.remove();
    stage.append(page);
    if (s === 'lang') {
      // Asked in the phone's language, and in English (or Arabic, for an English phone) under it.
      const second = tongue === 'en' ? 'ar' : 'en';
      const line2 = (id: Lang) => h('span', { class: 'ob-two', lang: id, dir: LANGS.find((l) => l.id === id)?.dir ?? 'ltr' }, LANG_ASK[id] ?? LANG_ASK.en);
      bubble.append(line2(tongue), line2(second));
      a?.face('happy', 1200);
    } else say(bubble, line, a);
    if (s === 'hi') setTimeout(() => a?.wave(2400), 380);
    else if (s === 'react' || s === 'heardSay') setTimeout(() => a?.cheer(1700), 420);
    else if (s === 'pagesSay') setTimeout(() => (pagesN ?? 1) >= 5 ? a?.cheer(2000) : (a?.nod(), a?.hop(0.6)), 420);
    else if (s === 'tasbihSay') setTimeout(() => (tasbihN ?? 0) >= 300 ? a?.cheer(2000) : tasbihN ? a?.hop(0.6) : a?.nod(), 420);
    else if (s === 'done') setTimeout(() => { a?.cheer(2200); sfx.shimmer(); }, 420);
    else if (s === 'few') setTimeout(() => a?.nod(), 400);
  }

  /** The daily goals from the answers: the nearest pace as a base, then the pages and the tasbih as said. */
  const apply = () => {
    if (pagesN === null) return;
    choosePace(pagesN >= 5 ? 'devoted' : pagesN >= 2 ? 'steady' : 'gentle');
    const g = goals();
    g.pages = pagesN;
    if (tasbihN !== null) g.dhikr = tasbihN ? { subhan: tasbihN } : {};
    setGoals(g);
    tailor(asked ? whyNow() : [...picked]);
  };
  const whyNow = (): Why[] => { try { return JSON.parse(localStorage.getItem('whyHere') ?? '[]'); } catch { return []; } };
  let ending = false;
  const finish = () => {
    if (ending) return;
    ending = true;
    window.clearTimeout(typing);
    d.classList.add('out');
    setTimeout(() => d.close(), reduced() ? 0 : 300);
  };
  const next = () => {
    const s = screens[i];
    if (s === 'lang' && tongue !== lang()) {
      // The whole app changes language: reload in it and carry on from hello.
      try { sessionStorage.setItem('obResume', '1'); } catch { /* private */ }
      setLang(tongue);
      return;
    }
    if (s === 'why') saveWhy([...picked]);
    if (s === 'tasbihSay' || s === 'tasbih') apply();
    if (s === 'heard' && heard) { try { localStorage.setItem('heardFrom', heard); } catch { /* private */ } mark(`ev:heard-${heard}`); }
    haptic(12);
    sfx.tick();
    if (i >= screens.length - 1) { finish(); return; }
    i++;
    draw(1);
  };
  go.onclick = next;
  const canBack = () => i > 0 && !(resumed && i === 1);
  back.onclick = () => { if (canBack()) { i--; draw(-1); } };
  skip.onclick = () => {
    const s = screens[i];
    if (s === 'why') { picked.clear(); saveWhy([]); i++; draw(1); return; }
    // Skipping a question also skips the character's answer to it.
    if (s === 'pages') pagesN = null;
    if (s === 'tasbih') { tasbihN = null; apply(); }
    if (s === 'heard') heard = null;
    i = Math.min(screens.length - 1, i + 2);
    if (i === screens.length - 1 && screens[i] !== 'done') { finish(); return; }
    draw(1);
  };
  // Android back / Esc steps back a screen; on the first it closes.
  d.addEventListener('cancel', (e) => { e.preventDefault(); if (canBack()) { i--; draw(-1); } else finish(); });
  d.addEventListener('close', () => {
    if (screens[i] === 'why' && !asked) saveWhy([...picked]);
    d.remove();
  });
  document.body.append(d);
  d.showModal();
  draw(1);
}
