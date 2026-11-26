// The streak and level screens (owner request 2026-11-25, "a screen for each notification, opened from the related
// spot": the flame opens #/me/streak, the level chip #/me/level; their notifications open them too). Me builds the
// page (me.ts: the streak card stays on top of the streak screen) and paints these boxes into it. Still pictures only:
// no running effects, so they stay smooth on slow phones.
import { h } from './dom';
import { icon } from './icons';
import { dayMark } from './streakMoment';
import { addDays, dayStates, streak } from '../data/journey';
import { dayKey } from '../data/readLog';
import { isFireDay } from '../data/fireDays';
import { MAX_LEVEL, levelLabel, levelProgress, levelStart, lookBand, myXp } from '../data/xp';
import { ICON_TIERS } from '../data/iconTiers';
import { RULES } from './appIcons';
import { locale } from '../i18n';
import { fe } from '../i18n/front';
import { bt, type BadgeKey } from '../i18n/badges';
import { mpt } from '../i18n/mePages';

const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const firstOfMonth = (d: Date) => dayKey(new Date(d.getFullYear(), d.getMonth(), 1));
const lastOfMonth = (d: Date) => dayKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));

let shownMonth = 0; // months back from this one, kept while the app is open

/** #/me/streak under the streak card: the month of lit days, the numbers, the next fire day and how it works. */
export function paintStreakPage(box: HTMLElement) {
  const s = streak();
  const now = new Date();
  const month = new Date(now.getFullYear(), now.getMonth() - shownMonth, 1);
  const days = dayStates(firstOfMonth(month), lastOfMonth(month), now);
  const lit = days.filter((d) => d.state === 'lit' || d.state === 'revived').length;
  // The grid starts on Saturday, as the week row and the app's weeks do.
  const lead = (parse(days[0].day).getDay() + 1) % 7;
  const wk = new Intl.DateTimeFormat(locale(), { weekday: 'narrow' });
  const heads = Array.from({ length: 7 }, (_, i) => wk.format(parse(addDays('2026-01-03', i)))); // 3 Jan 2026 was a Saturday
  const today = dayKey(now);
  const cell = (d: (typeof days)[number]) => h('span', { class: `me-pip sk-day ${d.state}${d.day === today ? ' is-today' : ''}`, title: d.day },
    dayMark(d.state), h('span', { class: 'me-pip-d' }, String(parse(d.day).getDate())));
  // Kept history goes back ~13 months (journey.ts KEEP_DAYS).
  const canBack = shownMonth < 12;
  const step = (by: number) => () => { shownMonth = Math.max(0, Math.min(12, shownMonth + by)); paintStreakPage(box); };
  const title = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(month);
  const tile = (n: string, label: string, cls = '') => h('div', { class: `me-tile sk-tile${cls}` }, h('span', { class: 'me-tile-n' }, h('b', {}, n)), h('span', {}, label));
  const freezes = (s.freeze.free ? 1 : 0) + (s.extra.free ? 1 : 0);
  // The next day the character goes up in flames.
  let to = s.days + 1;
  while (!isFireDay(to)) to++;
  const left = to - s.days;
  box.replaceChildren(
    h('div', { class: 'me-tiles sk-tiles' },
      tile(String(s.days), mpt('mp.stCur')),
      tile(String(s.best), mpt('mp.stBest')),
      tile(String(s.weeks), mpt('mp.stWeeks')),
      tile(`${freezes} ❄`, mpt('mp.stFreezes'), ' sk-ice')),
    s.days > 0 ? h('p', { class: 'sk-fire' }, icon('flame', 18), left === 1 ? fe(s.litToday ? 'st.fire1' : 'st.fire0', { m: to }) : fe('st.fireN', { n: left, m: to })) : '',
    h('div', { class: 'sk-cal' },
      h('div', { class: 'me-row sk-cal-head' },
        h('button', { class: 'icon-btn sk-nav', type: 'button', disabled: !canBack, 'aria-label': mpt('mp.stPrev'), onclick: step(1) }, icon('back', 20)),
        h('b', {}, title),
        h('button', { class: 'icon-btn sk-nav sk-next', type: 'button', disabled: shownMonth === 0, 'aria-label': mpt('mp.stNext'), onclick: step(-1) }, icon('back', 20))),
      h('div', { class: 'sk-grid', role: 'list' },
        ...heads.map((x) => h('span', { class: 'sk-wd', 'aria-hidden': 'true' }, x)),
        ...Array.from({ length: lead }, () => h('span', { class: 'sk-gap' })),
        ...days.map(cell)),
      h('p', { class: 'muted small sk-lit' }, mpt('mp.stMonthLit', { n: lit }))),
    h('p', { class: 'muted small sk-how' }, mpt('mp.stHow')));
}

/** #/me/level: the level, the XP to the next one and what the next levels unlock. */
export function paintLevelPage(box: HTMLElement) {
  const xp = myXp();
  const pr = levelProgress(xp);
  const nf = new Intl.NumberFormat(locale());
  type Step = { level: number; label: string; pic: Node };
  const steps: Step[] = [];
  // Every band of the character's look (levelLook.ts) and every app icon won by level (appIcons.ts RULES).
  for (const l of [5, 10, 20, 30, 40, 50]) steps.push({ level: l, label: mpt('mp.lvLook'), pic: h('span', { class: `lv-glow b${lookBand(l)}`, 'aria-hidden': 'true' }, icon('sparkle', 22)) });
  for (const id of ICON_TIERS) steps.push({ level: RULES[id].level, label: mpt('mp.lvIcon', { name: bt(`ic.${id}` as BadgeKey) }),
    pic: h('img', { class: 'lv-ic', src: `${import.meta.env.BASE_URL}icons/app-${id}.webp`, alt: '', width: 40, height: 40, loading: 'lazy' }) });
  steps.sort((a, b) => a.level - b.level);
  const next = steps.filter((x) => x.level > pr.level).slice(0, 4);
  const got = steps.filter((x) => x.level <= pr.level).slice(-2);
  const row = (x: Step, done: boolean) => h('div', { class: `lv-step${done ? ' done' : ''}` }, x.pic,
    h('span', { class: 'lv-step-t' }, h('b', {}, x.label), h('span', { class: 'muted small' }, levelLabel(x.level))),
    done ? h('span', { class: 'lv-ok' }, mpt('mp.lvGot')) : h('span', { class: 'lv-need muted small' }, `${nf.format(Math.max(0, levelStart(x.level) - xp))} XP`));
  box.replaceChildren(
    h('div', { class: 'lv-hero' },
      h('span', { class: 'lv-num' }, String(pr.level)),
      h('b', { class: 'lv-name' }, levelLabel(pr.level)),
      h('span', { class: 'muted small' }, mpt('mp.lvXp', { n: nf.format(xp) })),
      h('span', { class: 'goal-bar lv-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pr.p * 100)) },
        h('i', { style: `--p:${pr.p}` })),
      h('span', { class: 'small' }, pr.level >= MAX_LEVEL ? mpt('mp.lvMax') : mpt('mp.lvNext', { n: nf.format(pr.need), level: levelLabel(pr.level + 1) }))),
    next.length ? h('h2', { class: 'me-h' }, mpt('mp.lvUnlocks')) : '',
    ...next.map((x) => row(x, false)),
    ...got.reverse().map((x) => row(x, true)),
    h('p', { class: 'muted small sk-how' }, mpt('mp.lvHow')),
    h('a', { class: 'chip lv-ranks', href: '#/ranks' }, icon('trophy', 18), mpt('mp.lvRanks')));
}
