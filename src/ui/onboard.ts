// First steps as a conversation (owner request 2026-11-14, "a full page immersive experience with the character
// speaking"): after the tour, one full screen at a time. The character (the user's own, else the app's general one)
// stands in the page and speaks in a bubble, word by word; a question screen has it small beside its question and
// the answers below; one big Continue at the bottom. What brings you here → its answer → how much each day → the
// first goal. Saves exactly what the old sheets saved (`whyHere`, the pace, `tailor()`).
import './onboard.css';
import { choosePace, goals, needsPace, type Pace } from '../data/goals';
import { fe, type FrontKey } from '../i18n/front';
import { lang, LANGS, setLang, t, type Key } from '../i18n';
import { actor, myFigureCode, type Actor } from './actor';
import { h, haptic } from './dom';
import { DEFAULT, encode, normalize } from './figure';
import { flame } from './flame';
import { goalText } from './goalName';
import { icon } from './icons';
import { sfx } from './sfx';
import { paceLine, saveWhy, tailor, WHY_IC, WHYS, type Why } from './firstSteps';

type Screen = 'lang' | 'hi' | 'few' | 'why' | 'react' | 'pace' | 'done';
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
  const screens: Screen[] = asked ? ['hi', 'pace', 'done'] : pace ? ['lang', 'hi', 'few', 'why', 'react', 'pace', 'done'] : ['lang', 'hi', 'why', 'react'];
  const picked = new Set<Why>();
  let chosen: Pace | null = null;
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

  const who = (big: boolean) => {
    const a = actor(`ob-actor${big ? ' big' : ''}`, code);
    return a;
  };

  const opt = (cls: string, on: boolean, kids: (Node | string)[], onclick: () => void) =>
    h('button', { class: `ob-opt ${cls}${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick }, ...kids);

  function draw(dir = 1) {
    const s = screens[i];
    bar.style.width = `${Math.round(((i + 1) / screens.length) * 100)}%`;
    back.style.visibility = i && !(resumed && i === 1) ? 'visible' : 'hidden';
    skip.style.visibility = s === 'why' || s === 'pace' ? 'visible' : 'hidden';
    const bubble = h('p', { class: 'ob-say' });
    const ask = s === 'why' || s === 'pace' || s === 'lang';
    const a = who(!ask);
    const body: HTMLElement[] = [];
    let line = '';
    let flameEl: HTMLElement | null = null;
    go.textContent = fe('why.go');
    go.disabled = false;
    if (s === 'lang') {
      // Asked in both languages at once, before anything else is read.
      line = '';
      const opts = LANGS.map((l) => opt(`l-${l.id}`, l.id === tongue, [
        h('span', { class: 'ob-ic ob-lang', 'aria-hidden': 'true' }, l.id === 'ar' ? 'ع' : 'En'),
        h('span', { class: 'ob-txt' }, h('b', { lang: l.id }, l.name)),
        h('span', { class: 'ob-tick', 'aria-hidden': 'true' }, icon('check', 16))], () => {
        tongue = l.id;
        opts.forEach((o, k) => { const on = LANGS[k].id === l.id; o.classList.toggle('on', on); o.setAttribute('aria-pressed', String(on)); });
        sfx.pop(1); a?.hop(0.25); haptic(8);
      }));
      body.push(h('div', { class: 'ob-list' }, ...opts));
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
    } else if (s === 'pace') {
      line = t('fs.paceTitle');
      const why = [...picked].length ? [...picked] : whyNow();
      const rec: Pace = why.includes('memorise') ? 'steady' : 'gentle';
      chosen ??= rec;
      const opts = (['gentle', 'steady', 'devoted'] as Pace[]).map((p) => opt(`p-${p}`, p === chosen, [
        h('span', { class: 'ob-txt' },
          h('b', {}, t(`pace.${p}` as Key), p === rec ? h('span', { class: 'ob-rec' }, fe('ob.rec')) : ''),
          h('small', {}, paceLine(p))),
        h('span', { class: 'ob-tick', 'aria-hidden': 'true' }, icon('check', 16))], () => {
        chosen = p;
        opts.forEach((o, k) => { const on = k === ['gentle', 'steady', 'devoted'].indexOf(p); o.classList.toggle('on', on); o.setAttribute('aria-pressed', String(on)); });
        sfx.pop(1); a?.hop(0.25); haptic(8);
      }));
      body.push(h('p', { class: 'ob-hint' }, fe('ob.paceHint')), h('div', { class: 'ob-list' }, ...opts));
    } else if (s === 'done') {
      line = t('fs.paceSet', { goal: goalText('pages', goals().pages) });
      go.textContent = fe('ob.start');
      flameEl = h('div', { class: 'ob-flame', 'aria-hidden': 'true' }, flame(1, 76));
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
      bubble.append(h('span', { class: 'ob-two', lang: 'en', dir: 'ltr' }, 'Which language?'), h('span', { class: 'ob-two', lang: 'ar', dir: 'rtl' }, 'أي لغة تفضّل؟'));
      a?.face('happy', 1200);
    } else say(bubble, line, a);
    if (s === 'hi') setTimeout(() => a?.wave(2400), 380);
    else if (s === 'react') setTimeout(() => a?.cheer(1700), 420);
    else if (s === 'done') setTimeout(() => { a?.cheer(2200); sfx.shimmer(); }, 420);
    else if (s === 'few') setTimeout(() => a?.nod(), 400);
  }

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
    if (s === 'pace' && chosen) { choosePace(chosen); tailor(asked ? whyNow() : [...picked]); }
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
    finish(); // pace: "later", as before (Me asks again)
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
