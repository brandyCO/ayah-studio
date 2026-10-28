// Me (#/me): the daily streak flame, today's goals (pages, memorising, reels, dhikr, morning
// adhkar), the week compared with last week, honest stats (week / month / all time), milestone
// badges, My library (bookmarks, recently read, drafts), the reading time a page needs to count, and
// the way to the settings menu.
import { dayKey } from '../data/readLog';
import { addMemorised, addDays, PAGE_TIMES, pageSeconds, setAdhkar, setPageSeconds, stats, streak, weekOf, type Period, type Stats } from '../data/journey';
import { DHIKR, DHIKR_GOALS, MEMO_GOALS, PAGE_GOALS, REEL_GOALS, goals, setGoals, todayGoals, type DhikrId, type GoalProgress } from '../data/goals';
import { badgeStates, type BadgeState } from '../data/badges';
import { bookmarks } from '../data/bookmarks';
import { recentPages } from '../data/history';
import { loadMeta, reference, type SurahMeta } from '../data/quran';
import { locale, surahName, t, type Key } from '../i18n';
import { h, haptic, toast } from './dom';
import { flame, flameTier } from './flame';
import { badgeArt } from './badge';
import { openMoreMenu, tabBar } from './tabs';
import { METHODS, PRAYERS, locatePrayer, prayerDay, prayerSettings, setPrayerSettings, type Method } from '../data/prayer';
import { REMINDER_TIMES, allowNotifications, dhikrReminders, setDhikrReminders } from './widgets';
import { isNative } from '../native';
import { account } from '../cloud/auth';
import { openAccount } from './account';

const minutes = (sec: number) => {
  const m = Math.floor(sec / 60);
  return m >= 60 ? t('me.hm', { h: Math.floor(m / 60), m: m % 60 }) : t('me.min', { n: m });
};
const timeLabel = (sec: number) => (sec % 60 ? t('me.minHalf', { n: Math.floor(sec / 60) }) : t('me.minN', { n: sec / 60 }));
const parse = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };

let period: Period = 'week';

function dialog(title: string, ...body: (Node | string | false)[]) {
  const close = () => d.close();
  const d = h('dialog', { class: 'sheet bottom' },
    h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕')),
    ...body.filter((x): x is Node | string => x !== false));
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  window.addEventListener('hashchange', close, { once: true });
  document.body.append(d);
  d.showModal();
  return d;
}

/** A badge's sheet: the medallion large, its goal and progress, or the day it was earned. */
export function openBadge(b: BadgeState, fresh = false) {
  const n = b.def.need;
  dialog(fresh ? t('bd.new') : t('bd.title'),
    h('div', { class: `bd-detail${fresh ? ' fresh' : ''}` },
      badgeArt(b.def.tier, b.def.icon, !!b.earned, 148),
      h('h3', {}, t(b.def.name as Key, { n })),
      h('p', { class: 'muted' }, t(b.def.goal as Key, { n })),
      b.earned
        ? h('p', { class: 'bd-when' }, t('bd.earned', { date: new Intl.DateTimeFormat(locale(), { dateStyle: 'medium' }).format(parse(b.earned)) }))
        : h('div', { class: 'bd-progress' }, h('span', { style: `width:${Math.round((100 * b.have) / n)}%` }), h('b', {}, `${b.have} / ${n}`))));
}

export async function showMe(root: HTMLElement): Promise<() => void> {
  const meta = await loadMeta();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('lite');
  const hero = h('section', { class: 'me-hero' });
  const goalsBox = h('section', { class: 'me-card' });
  const weekBox = h('section', { class: 'me-card' });
  const statsBox = h('section', { class: 'me-card' });
  const badgeBox = h('section', { class: 'me-card' });
  const libBox = h('section', { class: 'me-card' });
  const timeBox = h('section', { class: 'me-card' });
  const prayerBox = h('section', { class: 'me-card' });
  const timeFmt = new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat(locale(), { weekday: 'narrow' });
  const longDay = new Intl.DateTimeFormat(locale(), { weekday: 'long' });

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
      s.lost && s.lost.days.length <= 3 ? h('button', { class: 'me-relight', onclick: () => {
        if (!account()) { toast(t('rl.signInFirst')); openAccount(); return; }
        void import('../together/relight').then((m) => m.askRelight()).catch((e) => toast(e instanceof Error ? e.message : String(e)));
      } }, `🔥  ${t('rl.askFriend')}`) : '',
      h('div', { class: 'me-week', role: 'list', 'aria-label': t('me.thisWeek') }, ...s.week.map(pip)),
      h('div', { class: 'me-chips' },
        h('span', { class: 'me-chip' }, t('me.weeks', { n: s.weeks })),
        h('span', { class: 'me-chip', title: t('me.freezeHelp') }, s.freeze.free ? t('me.freezeReady') : t('me.freezeUsed', { day: longDay.format(parse(s.freeze.day!)) })),
        h('span', { class: 'me-chip' }, t('me.best', { n: s.best }))));
  };

  // --- today's goals ---
  const goalLabel = (g: GoalProgress) => g.kind === 'dhikr'
    ? t(DHIKR.find((x) => x.id === g.dhikr)!.key as Key)
    : t(`goal.${g.kind}` as Key, { n: g.target });
  const goalRow = (g: GoalProgress) => {
    const met = g.done >= g.target;
    const pct = Math.min(1, g.done / g.target);
    let act: Node | string = '';
    if (g.kind === 'dhikr') act = h('button', { class: 'chip', onclick: () => void import('./tasbih').then((m) => m.openTasbih(g.dhikr as DhikrId)) }, t('goal.count'));
    else if (g.kind === 'memorise') act = h('span', { class: 'goal-step' },
      h('button', { class: 'chip', 'aria-label': t('goal.less'), onclick: () => { addMemorised(-1); haptic(); } }, '−'),
      h('button', { class: 'chip', 'aria-label': t('goal.more'), onclick: () => { addMemorised(1); haptic(); } }, '+'));
    else if (g.kind === 'adhkar') act = h('button', { class: `chip${met ? ' on' : ''}`, 'aria-pressed': String(met), onclick: () => { setAdhkar(!met); haptic(); } }, met ? t('goal.doneMark') : t('goal.markDone'));
    else if (g.kind === 'pages') act = h('a', { class: 'chip', href: '#/' }, t('goal.read'));
    else if (g.kind === 'reels') act = h('a', { class: 'chip', href: '#/drafts' }, t('goal.make'));
    return h('div', { class: `goal${met ? ' met' : ''}` },
      h('span', { class: 'goal-ring', style: `--p:${pct}` }, met ? '✓' : ''),
      h('span', { class: 'goal-txt' },
        h('b', {}, goalLabel(g)),
        h('span', { class: 'muted small' }, g.kind === 'adhkar' ? (met ? t('goal.adhkarDone') : t('goal.adhkarHelp')) : `${Math.min(g.done, g.target)} / ${g.target}`)),
      act);
  };
  const paintGoals = () => {
    const list = todayGoals();
    const all = list.length > 0 && list.every((g) => g.done >= g.target);
    goalsBox.replaceChildren(
      h('div', { class: 'me-row' }, h('h2', { class: 'me-h' }, t('goal.title')),
        h('button', { class: 'chip', onclick: openGoalEditor }, t('goal.edit'))),
      all ? h('p', { class: 'goal-all' }, t('goal.allMet')) : '',
      list.length ? h('div', { class: 'goals' }, ...list.map(goalRow)) : h('p', { class: 'muted' }, t('goal.none')),
      h('button', { class: 'menu-item tb-open', onclick: () => void import('./tasbih').then((m) => m.openTasbih()) }, `📿  ${t('tb.title')}`),
      isNative() ? remindRow() : '');
  };
  const remindRow = () => {
    const on = dhikrReminders();
    return h('div', { class: 'goal-edit rem-row' }, h('b', {}, t('rem.label')),
      h('div', { class: 'chips' }, ...REMINDER_TIMES.map((tm) => h('button', {
        class: `chip${on.includes(tm) ? ' on' : ''}`, 'aria-pressed': String(on.includes(tm)),
        onclick: async () => {
          const next = on.includes(tm) ? on.filter((x) => x !== tm) : [...on, tm];
          if (!(await setDhikrReminders(next))) toast(t('rem.denied'));
          paintGoals();
        },
      }, timeFmt.format(new Date(2026, 0, 1, Number(tm.slice(0, 2)), Number(tm.slice(3))))))));
  };
  function openGoalEditor() {
    const g = goals();
    const row = (label: string, list: readonly number[], cur: number, set: (n: number) => void, fmt = (n: number) => String(n)) =>
      h('div', { class: 'goal-edit' }, h('b', {}, label), h('div', { class: 'chips' }, ...list.map((n) => h('button', {
        class: `chip${n === cur ? ' on' : ''}`, 'aria-pressed': String(n === cur),
        onclick: (e: Event) => {
          set(n); setGoals(g);
          (e.currentTarget as HTMLElement).parentElement!.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === e.currentTarget));
        },
      }, n ? fmt(n) : t('goal.off')))));
    dialog(t('goal.editTitle'),
      h('div', { class: 'sheet-scroll goal-editor' },
        row(t('goal.ePages'), PAGE_GOALS, g.pages, (n) => { g.pages = n; }),
        row(t('goal.eMemo'), MEMO_GOALS, g.memorise, (n) => { g.memorise = n; }),
        row(t('goal.eReels'), REEL_GOALS, g.reels, (n) => { g.reels = n; }),
        ...DHIKR.map((x) => row(t(x.key as Key), DHIKR_GOALS, g.dhikr[x.id] ?? 0, (n) => { if (n) g.dhikr[x.id] = n; else delete g.dhikr[x.id]; })),
        row(t('goal.eAdhkar'), [0, 1], g.adhkar ? 1 : 0, (n) => { g.adhkar = !!n; }, () => t('goal.on'))));
  }

  // --- this week vs last week ---
  const paintWeek = () => {
    const now = new Date();
    const lastSunday = parse(addDays(weekOf(dayKey(now)), -1));
    const a = stats('week', now);
    const b = stats('week', lastSunday);
    const line = (label: string, x: number, y: number, show = (n: number) => String(n)) => {
      const diff = x - y;
      return h('div', { class: 'wk-line' }, h('span', {}, label), h('b', {}, show(x)),
        h('span', { class: `wk-diff ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}` }, diff ? `${diff > 0 ? '▲' : '▼'} ${show(Math.abs(diff))}` : '–'));
    };
    const monday = new Date().getDay() === 1;
    weekBox.replaceChildren(
      h('h2', { class: 'me-h' }, t('wk.title')),
      h('p', { class: 'muted small' }, monday && b.litDays ? t('wk.monday', { pages: b.pages, dhikr: b.dhikr }) : t('wk.sub')),
      h('div', { class: 'wk' },
        line(t('me.pages'), a.pages, b.pages),
        line(t('me.ayat'), a.ayat, b.ayat),
        line(t('me.listened'), a.listen, b.listen, minutes),
        line(t('me.dhikr'), a.dhikr, b.dhikr),
        line(t('me.memorised'), a.memorised, b.memorised),
        line(t('wk.goalDays'), a.goalDays, b.goalDays),
        line(t('wk.lit'), a.litDays, b.litDays)));
  };

  const paintStats = () => {
    const st: Stats = stats(period);
    const tab = (p: Period, label: string) => h('button', {
      class: `tab${p === period ? ' on' : ''}`, role: 'tab', 'aria-selected': String(p === period),
      onclick: () => { period = p; haptic(); paintStats(); },
    }, label);
    const tile = (n: string, label: string, sub?: string) =>
      h('div', { class: 'me-tile' }, h('b', {}, n), h('span', {}, label), sub ? h('span', { class: 'muted small' }, sub) : '');
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
        tile(String(st.juz), t('me.juz')),
        tile(String(st.memorised), t('me.memorised')),
        tile(String(st.dhikr), t('me.dhikr')),
        tile(String(st.reels), t('me.reels'))),
      h('p', { class: 'muted small' }, t('me.honest', { time: timeLabel(pageSeconds()) })));
  };

  const paintBadges = () => {
    const all = badgeStates();
    const got = all.filter((b) => b.earned).length;
    const tile = (b: BadgeState) => h('button', { class: `bd-tile${b.earned ? ' earned' : ''}`, onclick: () => openBadge(b) },
      badgeArt(b.def.tier, b.def.icon, !!b.earned, 68),
      h('span', { class: 'bd-name' }, t(b.def.name as Key, { n: b.def.need })),
      b.earned ? '' : h('span', { class: 'bd-mini' }, h('span', { style: `width:${Math.round((100 * b.have) / b.def.need)}%` })));
    badgeBox.replaceChildren(
      h('div', { class: 'me-row' }, h('h2', { class: 'me-h' }, t('bd.badges')), h('span', { class: 'muted small' }, t('bd.count', { n: got, of: all.length }))),
      h('div', { class: 'bd-grid' }, ...[...all.filter((b) => b.earned), ...all.filter((b) => !b.earned)].map(tile)));
  };

  const paintLibrary = () => {
    const bms = bookmarks();
    const recent = recentPages().slice(0, 3);
    const ref = (s: number, a: number) => reference(meta[s - 1] as SurahMeta, a, a);
    libBox.replaceChildren(
      h('h2', { class: 'me-h' }, t('lib.title')),
      h('div', { class: 'menu' },
        h('button', { class: 'menu-item', onclick: () => openBookmarks() }, `🔖  ${t('lib.bookmarks', { n: bms.length })}`),
        h('a', { class: 'menu-item', href: '#/drafts' }, `🎬  ${t('lib.reels')}`),
        ...recent.map((r) => h('a', { class: 'menu-item', href: `#/s/${r.s}/${r.a}` },
          h('span', {}, `📖  ${ref(r.s, r.a)}`), h('span', { class: 'muted small' }, ` · ${t('common.page', { n: r.page })}`)))));
    function openBookmarks() {
      dialog(t('menu.bookmarks'), bms.length
        ? h('div', { class: 'sheet-scroll menu' }, ...bms.map((b) => h('a', { class: 'menu-item', href: `#/s/${b.s}/${b.a}` }, ref(b.s, b.a))))
        : h('p', { class: 'muted' }, t('bm.empty')));
    }
  };

  const paintPrayer = async () => {
    const ps = prayerSettings();
    const head = h('h2', { class: 'me-h' }, t('pr.title'));
    const locate = h('button', { class: 'chip', onclick: async () => {
      toast(t('pr.finding'));
      if (!(await locatePrayer())) toast(t('pr.denied'));
    } }, ps.lat === null ? t('pr.setLocation') : t('pr.update'));
    if (ps.lat === null) {
      prayerBox.replaceChildren(head, h('p', { class: 'muted small' }, t('pr.locHelp')), locate);
      return;
    }
    const times = (await prayerDay(new Date(), ps))!;
    const now = Date.now();
    let next = times.findIndex((x, i) => i !== 1 && x.getTime() > now);
    const tomorrow = next < 0 ? (await prayerDay(new Date(Date.now() + 86_400_000), ps))![0] : null;
    const nextAt = tomorrow ?? times[next];
    if (next < 0) next = 0;
    const mins = Math.max(0, Math.round((nextAt.getTime() - now) / 60_000));
    const sel = h('select', { class: 'search pr-method', 'aria-label': t('pr.method'), onchange: (e: Event) =>
      setPrayerSettings({ ...prayerSettings(), method: (e.target as HTMLSelectElement).value as Method }) },
    ...METHODS.map((m) => h('option', { value: m, selected: m === ps.method }, t(`pr.m.${m}` as Key))));
    prayerBox.replaceChildren(
      h('div', { class: 'me-row' }, head, locate),
      h('p', { class: 'pr-next' }, t('pr.next', { name: t(`pr.${PRAYERS[next]}` as Key), time: timeFmt.format(nextAt), left: minutes(mins * 60) })),
      h('div', { class: 'pr-list' }, ...times.map((x, i) => h('div', { class: `pr-row${i === next && !tomorrow ? ' next' : ''}${i === 1 ? ' sun' : ''}` },
        h('span', {}, t(`pr.${PRAYERS[i]}` as Key)), h('b', {}, timeFmt.format(x))))),
      h('label', { class: 'pr-set' }, h('span', { class: 'muted small' }, t('pr.method')), sel),
      h('div', { class: 'chips pr-asr' }, h('span', { class: 'muted small' }, t('pr.asr')),
        ...[false, true].map((hanafi) => h('button', {
          class: `chip${ps.hanafi === hanafi ? ' on' : ''}`, 'aria-pressed': String(ps.hanafi === hanafi),
          onclick: () => setPrayerSettings({ ...prayerSettings(), hanafi }),
        }, t(hanafi ? 'pr.hanafi' : 'pr.standard')))),
      isNative() ? h('button', {
        class: `menu-item${ps.lockScreen ? ' on' : ''}`, 'aria-pressed': String(ps.lockScreen),
        onclick: async () => {
          const on = !prayerSettings().lockScreen;
          if (on && !(await allowNotifications())) return toast(t('rem.denied'));
          setPrayerSettings({ ...prayerSettings(), lockScreen: on });
        },
      }, `🔒  ${t('pr.lock', { state: t(ps.lockScreen ? 'menu.on' : 'menu.off') })}`) : '',
      h('p', { class: 'muted small' }, t('pr.privacy')));
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

  void import('../together/relight').then((m) => m.takeRelights());
  const refresh = () => { paintHero(); paintGoals(); paintWeek(); paintStats(); paintBadges(); };
  refresh();
  paintLibrary();
  paintTime();
  void paintPrayer();
  const tick = window.setInterval(() => { if (!document.hidden) void paintPrayer(); }, 30_000);
  const onPrayer = () => void paintPrayer();
  root.append(
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('h1', {}, t('me.title')), h('p', { class: 'muted' }, t('me.sub')))),
    hero, goalsBox, prayerBox, weekBox, statsBox, badgeBox, libBox, timeBox,
    h('section', { class: 'me-card menu' },
      h('button', { class: 'menu-item', onclick: () => openMoreMenu() }, `⚙  ${t('me.more')}`)),
    tabBar('me'));

  const onBadge = (e: Event) => {
    const ids = (e as CustomEvent<string[]>).detail;
    const b = badgeStates().find((x) => x.def.id === ids[0]);
    if (b && !document.querySelector('dialog[open]')) openBadge(b, true);
  };
  window.addEventListener('journey-changed', refresh);
  window.addEventListener('readlog-changed', refresh);
  window.addEventListener('badge-earned', onBadge);
  window.addEventListener('prayer-changed', onPrayer);
  return () => {
    clearInterval(tick);
    window.removeEventListener('prayer-changed', onPrayer);
    window.removeEventListener('journey-changed', refresh);
    window.removeEventListener('readlog-changed', refresh);
    window.removeEventListener('badge-earned', onBadge);
  };
}
