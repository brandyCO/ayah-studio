// The living mushaf (docs/together.md T1): marks in the page margin, a page tint that follows the time
// of day, the Ramadan crescent and the "Today" card in the drop-down bar. Features add their marks and
// Today lines through registerMarks() / registerToday(); everything here works without an account.
import { ramadanNow } from '../data/ramadan';
import { h } from './dom';
import { t } from '../i18n';
import { touchPref } from './prefs';

// --- margin marks ---
export interface Mark {
  s: number;
  a: number; // drawn beside the line where this ayah starts
  kind: string; // CSS class: .mp-mark.{kind}
  title: string;
}
type MarkSource = () => Mark[];
const markSources: MarkSource[] = [];
export const registerMarks = (src: MarkSource) => void markSources.push(src);

/** Draws the marks of a built page into its right-hand margin (at most two per line). */
export function paintMarks(page: HTMLElement) {
  for (const el of page.querySelectorAll('.mp-mark')) el.remove();
  const perLine = new Map<HTMLElement, number>();
  for (const m of markSources.flatMap((src) => src())) {
    const word = page.querySelector<HTMLElement>(`.w[data-s="${m.s}"][data-a="${m.a}"][data-p="1"]`);
    const line = word?.closest<HTMLElement>('.mp-line');
    if (!line) continue;
    const n = perLine.get(line) ?? 0;
    if (n >= 2) continue;
    perLine.set(line, n + 1);
    const mark = h('span', { class: `mp-mark ${m.kind}`, title: m.title, 'data-s': String(m.s), 'data-a': String(m.a), 'data-kind': m.kind });
    mark.style.top = `${line.offsetTop + line.offsetHeight / 2}px`;
    if (n) mark.style.marginTop = `${line.offsetHeight * 0.3}px`; // a second mark sits a little lower
    page.append(mark);
  }
}

// --- the page follows the time of day ---
const TINT_KEY = 'timeTint';
export function timeTintOn(): boolean {
  try {
    return localStorage.getItem(TINT_KEY) !== 'off';
  } catch {
    return true;
  }
}
export function setTimeTint(on: boolean) {
  try {
    localStorage.setItem(TINT_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  touchPref('timeTint');
  applyTimeTint();
}

/** A soft bump around `centre` (hours), `half` hours wide on each side, peaking at `max` %. */
const bump = (h: number, centre: number, half: number, max: number) => {
  const d = Math.min(Math.abs(h - centre), 24 - Math.abs(h - centre));
  return d >= half ? 0 : max * (0.5 + 0.5 * Math.cos((Math.PI * d) / half));
};

/** Tint colour and strength (%) for a local time: dawn rose, Maghrib amber, night indigo; none by day. */
export function timeTint(date = new Date()): { color: string; amount: number } {
  const hour = date.getHours() + date.getMinutes() / 60;
  const lastTen = ramadanNow(date).lastTen; // the last ten nights: the night deepens (still ≤ 6 %)
  const options = [
    { color: '#f0b49a', amount: bump(hour, 5.75, 1.75, 5) }, // dawn
    { color: '#e9a053', amount: bump(hour, 18.25, 1.75, 6) }, // Maghrib
    { color: '#3d4f86', amount: lastTen ? Math.min(6, bump(hour, 0.5, 6, 9)) : Math.min(4, bump(hour, 0.5, 4.5, 6.5)) }, // night (flat in the middle)
  ];
  const best = options.reduce((a, b) => (b.amount > a.amount ? b : a));
  return { color: best.color, amount: Math.round(best.amount * 10) / 10 };
}

export function applyTimeTint() {
  const { color, amount } = timeTintOn() ? timeTint() : { color: '#ffffff', amount: 0 };
  const root = document.documentElement.style;
  root.setProperty('--tod', color);
  root.setProperty('--tod-amt', `${amount}%`);
}

// --- Ramadan ---
/** Today's date in the Umm al-Qura calendar (null if the browser lacks it). */
export function hijriToday(date = new Date()): { month: number; day: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { month: 'numeric', day: 'numeric' }).formatToParts(date);
    const num = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const month = num('month');
    const day = num('day');
    return Number.isInteger(month) && Number.isInteger(day) ? { month, day } : null;
  } catch {
    return null;
  }
}
/** Day of Ramadan, with the user's moon-sighting shift and the Ramadan-mode preview (T7). */
export const ramadanDay = (date = new Date()): number | null => ramadanNow(date).day;

export const crescent = () => {
  const el = h('span', { class: 'crescent', 'aria-hidden': 'true' });
  el.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13"><path d="M15.5 3.2a9 9 0 1 0 5.3 15.1A7.6 7.6 0 0 1 15.5 3.2z" fill="currentColor"/></svg>';
  return el;
};

// --- the Today card (in the drop-down bar) ---
export interface TodayItem {
  icon: string;
  text: string;
  href?: string;
  onClick?(): void;
}
type TodaySource = () => Promise<TodayItem[]> | TodayItem[];
const todaySources: TodaySource[] = [];
export const registerToday = (src: TodaySource) => void todaySources.push(src);

/** Fills `card` with today's lines; hidden when there is nothing to say. */
export async function fillToday(card: HTMLElement, onPick: () => void) {
  const items = (await Promise.all(todaySources.map(async (src) => {
    try {
      return await src();
    } catch {
      return [];
    }
  }))).flat();
  card.replaceChildren(...items.map((it) => {
    const content = [h('span', { class: 'today-icon', 'aria-hidden': 'true' }, it.icon), h('span', {}, it.text)];
    return it.href
      ? h('a', { class: 'today-item', href: it.href, onclick: onPick }, ...content)
      : h('button', { class: 'today-item', onclick: () => { onPick(); it.onClick?.(); } }, ...content);
  }));
  card.hidden = !items.length;
}

registerToday(() => {
  const now = ramadanNow();
  return now.day ? [{ icon: '☾', text: t(now.lastTen ? 'today.ramadanLastTen' : 'today.ramadan', { day: now.day }) }] : [];
});
