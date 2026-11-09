// Noor speaks (owner choice 2026-11-09, "full of life"): a small light with one short, kind line on
// Read, Me, Create and Learn. The line follows what is true right now (goals, the flame, the garden);
// it never guilts and never says anything about the religion itself. Loaded with each screen.
import './noor.css';
import { lang } from '../i18n';
import { todayGoals } from '../data/goals';
import { pageSeconds, streak } from '../data/journey';
import { thirstyTrees, trees } from '../data/garden';
import { h } from './dom';

const en = {
  lit: 'Your flame is lit for today. See you tomorrow.',
  pages1: 'One more page and today is lit.',
  pagesN: '{n} more pages and today is lit.',
  oneGoal: 'Meet one goal to light today’s flame.',
  readDone: 'Today’s pages are done. Keep going if you like.',
  readTime: 'Each page counts after {t} on screen.',
  reel: 'Your reel counts for today’s goal.',
  share: 'Share an ayah you love with someone today.',
  dry1: 'A tree is thirsty. One recitation waters it.',
  dryN: '{n} trees are thirsty. One recitation waters each.',
  plant: 'Plant a seed, and it grows as you memorise.',
  grow: 'Your garden is growing. Come back tomorrow to water it.',
};
type Key = keyof typeof en;
const ar: Record<Key, string> = {
  lit: 'شعلتك مضيئة اليوم. نلقاك غدًا.',
  pages1: 'صفحة واحدة أخرى ويضيء يومك.',
  pagesN: '{n} صفحات أخرى ويضيء يومك.',
  oneGoal: 'أكمل هدفًا واحدًا لتضيء شعلة اليوم.',
  readDone: 'أتممت صفحات اليوم. واصل إن شئت.',
  readTime: 'تُحسب كل صفحة بعد {t} على الشاشة.',
  reel: 'مقطعك يُحسب لهدف اليوم.',
  share: 'شارك آية تحبها مع أحد اليوم.',
  dry1: 'شجرة عطشى. تلاوة واحدة تسقيها.',
  dryN: '{n} أشجار عطشى. تلاوة واحدة تسقي كل شجرة.',
  plant: 'ازرع بذرة، وتنمو كلما حفظت.',
  grow: 'حديقتك تنمو. عد غدًا لتسقيها.',
};
const say = (k: Key, vars: Record<string, string | number> = {}) =>
  ((lang() === 'ar' ? ar[k] : en[k]) ?? en[k]).replace(/\{(\w+)\}/g, (_, v: string) => String(vars[v] ?? ''));

const minutes = (sec: number) => {
  const m = sec / 60;
  const n = Number.isInteger(m) ? String(m) : `${Math.floor(m)}½`;
  return lang() === 'ar' ? `${n} ${m <= 1 ? 'دقيقة' : 'دقائق'}` : `${n} ${m <= 1 ? 'minute' : 'minutes'}`;
};

export type Where = 'me' | 'read' | 'create' | 'learn';

/** Noor's line for a screen, from what is true now. */
export function noorText(where: Where): string {
  const goals = (() => { try { return todayGoals(); } catch { return []; } })();
  const g = (k: string) => goals.find((x) => x.kind === k);
  if (where === 'me') {
    if (streak().litToday) return say('lit');
    const p = g('pages');
    const left = p ? p.target - p.done : 0;
    if (left > 0) return say(left === 1 ? 'pages1' : 'pagesN', { n: left });
    return say('oneGoal');
  }
  if (where === 'read') {
    const p = g('pages');
    if (p && p.done >= p.target) return say('readDone');
    return say('readTime', { t: minutes(pageSeconds()) });
  }
  if (where === 'create') {
    const r = g('reels');
    return say(r && r.done < r.target ? 'reel' : 'share');
  }
  const dry = thirstyTrees().length;
  if (dry) return say(dry === 1 ? 'dry1' : 'dryN', { n: dry });
  return say(trees().some((x) => x.x >= 0) ? 'grow' : 'plant');
}

/** Noor (a small light, no face) beside a speech bubble. */
export function noorLine(where: Where): HTMLElement {
  return h('div', { class: `noor-line at-${where}`, role: 'note' },
    h('span', { class: 'noor-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'noor-say' }, noorText(where)));
}

/** Put (or refresh) Noor's line as the last child of `box`. */
export function noorInto(box: Element, where: Where) {
  const old = box.querySelector(':scope > .noor-line');
  const text = noorText(where);
  if (old) { old.querySelector('.noor-say')!.textContent = text; return; }
  box.append(noorLine(where));
}
