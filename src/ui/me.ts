// Me (#/me): the daily streak flame, this week's days, the weekly streak and freeze, and honest
// stats (pages, ayat, minutes listened, surahs finished, reels made) for this week, this month or
// all time. Also the reading time a page needs to count, and the way to the settings menu.
import { PAGE_TIMES, pageSeconds, setPageSeconds, stats, streak, type Period } from '../data/journey';
import { loadMeta } from '../data/quran';
import { locale, surahName, t } from '../i18n';
import { h, haptic } from './dom';
import { flame, flameTier } from './flame';
import { openMoreMenu, tabBar } from './tabs';

const minutes = (sec: number) => {
  const m = Math.floor(sec / 60);
  return m >= 60 ? t('me.hm', { h: Math.floor(m / 60), m: m % 60 }) : t('me.min', { n: m });
};
const timeLabel = (sec: number) => (sec % 60 ? t('me.minHalf', { n: Math.floor(sec / 60) }) : t('me.minN', { n: sec / 60 }));

let period: Period = 'week';

export async function showMe(root: HTMLElement): Promise<() => void> {
  const meta = await loadMeta();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('lite');
  const hero = h('section', { class: 'me-hero' });
  const statsBox = h('section', { class: 'me-card' });
  const timeBox = h('section', { class: 'me-card' });
  const dayFmt = new Intl.DateTimeFormat(locale(), { weekday: 'narrow' });
  const longDay = new Intl.DateTimeFormat(locale(), { weekday: 'long' });
  const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

  const paintHero = () => {
    const s = streak();
    const tier = flameTier(s.days, s.litToday);
    const pip = (w: (typeof s.week)[number]) => h('span', { class: `me-pip ${w.state}`, title: longDay.format(parse(w.day)) },
      h('span', { class: 'me-pip-ic' }, w.state === 'lit' || w.state === 'revived' ? flame(1, 22, true) : w.state === 'frozen' ? '❄' : ''),
      h('span', { class: 'me-pip-d' }, dayFmt.format(parse(w.day))));
    hero.replaceChildren(
      h('div', { class: 'me-flame' }, flame(tier, 150, still)),
      h('div', { class: 'me-count' }, h('b', {}, String(s.days)), h('span', {}, t(s.days === 1 ? 'me.day' : 'me.days'))),
      h('p', { class: 'me-status' }, s.days === 0 ? t('me.statusStart') : s.litToday ? t('me.statusLit') : t('me.statusKeep')),
      s.lost ? h('p', { class: 'me-lost' }, t('me.lost', { n: s.lost.n })) : '',
      h('div', { class: 'me-week', role: 'list', 'aria-label': t('me.thisWeek') }, ...s.week.map(pip)),
      h('div', { class: 'me-chips' },
        h('span', { class: 'me-chip' }, t('me.weeks', { n: s.weeks })),
        h('span', { class: 'me-chip', title: t('me.freezeHelp') }, s.freeze.free ? t('me.freezeReady') : t('me.freezeUsed', { day: longDay.format(parse(s.freeze.day!)) })),
        h('span', { class: 'me-chip' }, t('me.best', { n: s.best }))));
  };

  const paintStats = () => {
    const st = stats(period);
    const tab = (p: Period, label: string) => h('button', {
      class: `tab${p === period ? ' on' : ''}`, role: 'tab', 'aria-selected': String(p === period),
      onclick: () => { period = p; haptic(); paintStats(); },
    }, label);
    const tile = (n: string, label: string, sub?: string) =>
      h('div', { class: 'me-tile' }, h('b', {}, n), h('span', {}, label), sub ? h('span', { class: 'muted small' }, sub) : false);
    const names = st.surahList.slice(-3).map((s) => surahName(meta[s - 1])).join(' · ');
    statsBox.replaceChildren(
      h('h2', { class: 'me-h' }, t('me.stats')),
      h('div', { class: 'tabs me-tabs', role: 'tablist' },
        tab('week', t('me.week')), tab('month', t('me.month')), tab('all', t('me.all'))),
      h('div', { class: 'me-tiles' },
        tile(String(st.pages), t('me.pages')),
        tile(String(st.ayat), t('me.ayat')),
        tile(minutes(st.listen), t('me.listened')),
        tile(String(st.surahs), t('me.surahs'), names || undefined),
        tile(String(st.reels), t('me.reels'))),
      h('p', { class: 'muted small' }, t('me.honest', { time: timeLabel(pageSeconds()) })));
  };

  const paintTime = () => {
    const cur = pageSeconds();
    timeBox.replaceChildren(
      h('h2', { class: 'me-h' }, t('me.pageTime')),
      h('p', { class: 'muted small' }, t('me.pageTimeHelp')),
      h('div', { class: 'chips' }, ...PAGE_TIMES.map((sec) => h('button', {
        class: `chip${sec === cur ? ' on' : ''}`, 'aria-pressed': String(sec === cur),
        onclick: () => { setPageSeconds(sec); haptic(); paintTime(); paintStats(); },
      }, timeLabel(sec)))));
  };

  paintHero();
  paintStats();
  paintTime();
  root.append(
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('h1', {}, t('me.title')), h('p', { class: 'muted' }, t('me.sub')))),
    hero, statsBox, timeBox,
    h('section', { class: 'me-card menu' },
      h('a', { class: 'menu-item', href: '#/drafts' }, `🎬  ${t('menu.drafts')}`),
      h('button', { class: 'menu-item', onclick: () => openMoreMenu() }, `⚙  ${t('me.more')}`)),
    tabBar('me'));

  const refresh = () => { paintHero(); paintStats(); };
  window.addEventListener('journey-changed', refresh);
  window.addEventListener('readlog-changed', refresh);
  return () => {
    window.removeEventListener('journey-changed', refresh);
    window.removeEventListener('readlog-changed', refresh);
  };
}
