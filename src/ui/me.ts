// Me (#/me): a compact streak card (flame, count, this week), today's goals (pages, memorising, reels,
// dhikr, morning adhkar), today's prayer times, honest stats (this week against last week, month, all
// time), milestone badges, My library. Its settings (reading time per page, prayer method and lock
// screen, dhikr reminders) live on #/me/settings, with the way on to the app's menu.
import { dayKey } from '../data/readLog';
import { addMemorised, addDays, PAGE_TIMES, pageSeconds, setAdhkar, setPageSeconds, stats, streak, weekOf, type Period, type Stats } from '../data/journey';
import { CUSTOM_MAX, CUSTOM_TIMES, DHIKR, DHIKR_GOALS, MEMO_GOALS, PACES, PAGE_GOALS, REEL_GOALS, acceptTip, choosePace, dismissTip, goalTip, goals, needsPace, setGoals, todayGoals, type CustomGoal, type DhikrId, type GoalProgress, type GoalTip, type Pace } from '../data/goals';
import { badgeStates, type BadgeDef, type BadgeState } from '../data/badges';
import { badgeMoment } from '../data/claims';
import { addCustom, badgeClaimed, claimBadge, claimGoal, goalClaimed } from '../data/journey';
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
/** "Read 2 pages", "Read 1 page"… (a goal's name for an amount). */
const goalText = (kind: string, n: number) => t((n === 1 && ['pages', 'memorise', 'reels'].includes(kind) ? `goal.${kind}1` : `goal.${kind}`) as Key, { n });
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
  const statsBox = h('section', { class: 'me-card' });
  const badgeBox = h('section', { class: 'me-card' });
  const libBox = h('section', { class: 'me-card' });
  const prayerBox = h('section', { class: 'me-card' });
  const timeFmt = new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' });
  const dayFmt = new Intl.DateTimeFormat(locale(), { weekday: 'narrow' });
  const longDay = new Intl.DateTimeFormat(locale(), { weekday: 'long' });

  let heroSig = '';
  const paintHero = () => {
    const s = streak();
    // Repaint only when something on the card changed (keeps the flame's animation running).
    const sig = JSON.stringify([s.days, s.litToday, s.weeks, s.best, s.freeze, s.week, s.lost]);
    if (sig === heroSig) return;
    heroSig = sig;
    const tier = flameTier(s.days, s.litToday);
    const pip = (w: (typeof s.week)[number]) => h('span', { class: `me-pip ${w.state}`, title: longDay.format(parse(w.day)) },
      h('span', { class: 'me-pip-ic' }, w.state === 'lit' || w.state === 'revived' ? flame(1, 18, true) : w.state === 'frozen' ? '❄' : ''),
      h('span', { class: 'me-pip-d' }, dayFmt.format(parse(w.day))));
    // The first look at Me after today's flame was lit: it catches (flares up, sparks, the count ticks on).
    let seen = '';
    try { seen = localStorage.getItem('flameSeen') ?? ''; } catch { /* ignore */ }
    const catchNow = s.litToday && seen !== dayKey() && s.days > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (s.litToday) try { localStorage.setItem('flameSeen', dayKey()); } catch { /* ignore */ }
    const num = h('b', {}, String(catchNow ? s.days - 1 : s.days));
    const flameBox = h('div', { class: `me-flame${catchNow ? ' catch' : ''}` }, flame(tier, 76, still));
    hero.replaceChildren(
      h('div', { class: 'me-top' },
        flameBox,
        h('div', { class: 'me-top-txt' },
          h('div', { class: 'me-count' }, num, h('span', {}, t(s.days === 1 ? 'me.day' : 'me.days'))),
          h('p', { class: 'me-status' }, s.days === 0 ? t('me.statusStart') : s.litToday ? t('me.statusLit') : t('me.statusKeep')))),
      s.lost ? h('p', { class: 'me-lost' }, t('me.lost', { n: s.lost.n })) : '',
      s.lost && s.lost.days.length <= 3 ? h('button', { class: 'me-relight', onclick: () => {
        if (!account()) { toast(t('rl.signInFirst')); openAccount(); return; }
        void import('../together/relight').then((m) => m.askRelight()).catch((e) => toast(e instanceof Error ? e.message : String(e)));
      } }, `🔥  ${t('rl.askFriend')}`) : '',
      h('div', { class: 'me-week', role: 'list', 'aria-label': t('me.thisWeek') }, ...s.week.map(pip)),
      h('div', { class: 'me-chips' },
        h('span', { class: 'me-chip' }, t(s.weeks === 1 ? 'me.week1' : 'me.weeks', { n: s.weeks })),
        h('span', { class: 'me-chip', title: t('me.freezeHelp') }, s.freeze.free ? t('me.freezeReady') : t('me.freezeUsed', { day: longDay.format(parse(s.freeze.day!)) })),
        h('span', { class: 'me-chip' }, t('me.best', { n: s.best }))));
    if (catchNow) {
      const canvas = h('canvas', { class: 'me-sparks', 'aria-hidden': 'true' });
      hero.append(canvas);
      void import('./sparks').then(({ sparks }) => setTimeout(() => {
        const fx = sparks(canvas, ['rgba(255,170,70,1)', 'rgba(255,214,120,1)', 'rgba(255,240,200,1)']);
        const f = flameBox.getBoundingClientRect();
        const c = canvas.getBoundingClientRect();
        fx.burst(f.left + f.width / 2 - c.left, f.top + f.height * 0.45 - c.top, 34, 0.55);
        num.textContent = String(s.days);
        num.classList.add('tick');
        haptic(14);
        setTimeout(() => { fx.stop(); canvas.remove(); }, 2600);
      }, 650));
    }
  };

  // --- rewards: a met goal or a new badge waits for its Claim tap, then its moment plays ---
  let playing = false;
  const play = async (run: () => Promise<void>, mark: () => void) => {
    if (playing) return;
    playing = true;
    try {
      await run();
    } finally {
      playing = false;
      mark();
    }
  };
  const claimGoalRow = (g: GoalProgress, from?: Element) => play(
    () => import('./celebrate').then((m) => m.celebrate({ kind: 'lantern', title: goalLabel(g), sub: t('cel.goalSub') }, from)),
    () => claimGoal(g.id));
  const claimAll = (from?: Element) => play(
    () => import('./celebrate').then((m) => m.celebrate({ kind: 'star', title: t('cel.allTitle'), sub: t('cel.allSub') }, from)),
    () => claimGoal('all'));
  const claimBadgeNow = (b: BadgeDef, from?: Element) => play(
    () => import('./celebrate').then((m) => {
      const k = badgeMoment(b);
      return m.celebrate(k === 'flame' ? { kind: 'flame', badge: b, days: b.need } : { kind: k, badge: b }, from);
    }),
    () => claimBadge(b.id));

  // --- today's goals ---
  const goalLabel = (g: GoalProgress) => g.kind === 'dhikr'
    ? t(DHIKR.find((x) => x.id === g.dhikr)!.key as Key)
    : g.kind === 'custom' ? g.custom!.name
      : goalText(g.kind, g.target);
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
    else if (g.kind === 'custom') {
      const c = g.custom!;
      act = c.target === 1
        ? h('button', { class: `chip${met ? ' on' : ''}`, 'aria-pressed': String(met), onclick: () => { addCustom(c.id, met ? -1 : 1, 1); haptic(); } }, met ? t('goal.doneMark') : t('goal.markDone'))
        : h('span', { class: 'goal-step' },
          h('button', { class: 'chip', 'aria-label': t('goal.less'), onclick: () => { addCustom(c.id, -1, c.target); haptic(); } }, '−'),
          h('button', { class: 'chip', 'aria-label': t('goal.more'), onclick: () => { addCustom(c.id, 1, c.target); haptic(); } }, '+'));
    }
    if (met && !goalClaimed(g.id)) act = h('button', { class: 'chip claim', onclick: (e: Event) => void claimGoalRow(g, e.currentTarget as Element) }, `✦ ${t('cel.claim')}`);
    return h('div', { class: `goal${met ? ' met' : ''}` },
      h('span', { class: 'goal-ring', style: `--p:${pct}` }, met ? '✓' : ''),
      h('span', { class: 'goal-txt' },
        h('b', {}, goalLabel(g)),
        h('span', { class: 'muted small' }, g.kind === 'adhkar' ? (met ? t('goal.adhkarDone') : t('goal.adhkarHelp'))
          : g.kind === 'custom' && g.target === 1 ? (met ? t('goal.doneToday') : t('cg.mine')) : `${Math.min(g.done, g.target)} / ${g.target}`)),
      act);
  };
  // A first pace (once), then the goals; at most one gentle suggestion a week.
  const paceCard = () => h('div', { class: 'pace' },
    h('p', { class: 'muted small' }, t('pace.sub')),
    ...(['gentle', 'steady', 'devoted'] as Pace[]).map((p) => h('button', { class: `pace-opt${p === 'steady' ? ' rec' : ''}`, onclick: () => { choosePace(p); haptic(); } },
      h('b', {}, t(`pace.${p}` as Key)), h('span', { class: 'muted small' }, paceLine(p)))));
  const paceLine = (p: Pace) => {
    const v = PACES[p];
    const dk = Object.values(v.dhikr).reduce((a, b) => a + (b ?? 0), 0);
    return [goalText('pages', v.pages), v.memorise ? goalText('memorise', v.memorise) : '', t('pace.dhikr', { n: dk }), v.adhkar ? t('goal.adhkar') : '']
      .filter(Boolean).join(' · ');
  };
  const tipLabel = (tip: GoalTip, n: number) => tip.kind === 'dhikr'
    ? `${t(DHIKR.find((x) => x.id === tip.dhikr)!.key as Key)} ×${n}` : goalText(tip.kind, n);
  const tipCard = (tip: GoalTip) => h('div', { class: `goal-tip${tip.up ? ' up' : ''}` },
    h('p', {}, t(tip.up ? 'tip.up' : 'tip.down', { goal: tipLabel(tip, tip.from), to: tipLabel(tip, tip.to) })),
    h('div', { class: 'chips' },
      h('button', { class: 'chip on', onclick: () => { acceptTip(tip); haptic(); toast(t('tip.done')); } }, t('tip.yes')),
      h('button', { class: 'chip', onclick: () => dismissTip(tip) }, t('tip.no'))));
  const paintGoals = () => {
    if (needsPace()) {
      goalsBox.replaceChildren(h('h2', { class: 'me-h' }, t('pace.title')), paceCard());
      return;
    }
    const list = todayGoals();
    const all = list.length > 0 && list.every((g) => g.done >= g.target);
    const tip = goalTip();
    goalsBox.replaceChildren(
      h('div', { class: 'me-row' }, h('h2', { class: 'me-h' }, t('goal.title')),
        h('button', { class: 'chip', onclick: openGoalEditor }, t('goal.edit'))),
      tip ? tipCard(tip) : '',
      all && list.length > 1 && !goalClaimed('all')
        ? h('button', { class: 'claim-all', onclick: (e: Event) => void claimAll(e.currentTarget as Element) }, `✦ ${t('cel.claimAll')}`)
        : all ? h('p', { class: 'goal-all' }, t('goal.allMet')) : '',
      list.length ? h('div', { class: 'goals' }, ...list.map(goalRow)) : h('p', { class: 'muted' }, t('goal.none')),
      h('div', { class: 'goal-links' },
        h('button', { class: 'menu-item tb-open', onclick: () => void import('./tasbih').then((m) => m.openTasbih()) }, `📿  ${t('tb.title')}`),
        goals().custom.length < CUSTOM_MAX ? h('button', { class: 'menu-item', onclick: () => openCustom() }, `＋  ${t('cg.add')}`) : ''));
  };
  /** Add or change one of the user's own goals. */
  function openCustom(c?: CustomGoal) {
    const cur: CustomGoal = c ? { ...c, days: [...c.days] } : { id: Date.now().toString(36), name: '', target: 1, days: [] };
    const name = h('input', { class: 'search', maxlength: 40, placeholder: t('cg.placeholder'), value: cur.name, 'aria-label': t('cg.name') });
    const wd = new Intl.DateTimeFormat(locale(), { weekday: 'short' });
    const order = [1, 2, 3, 4, 5, 6, 0];
    const chip = (label: string, on: () => boolean, tap: () => void) => {
      const b = h('button', { class: `chip${on() ? ' on' : ''}`, 'aria-pressed': String(on()), onclick: () => { tap(); paint(); } }, label);
      return b;
    };
    const times = h('div', { class: 'chips' });
    const days = h('div', { class: 'chips' });
    const paint = () => {
      times.replaceChildren(...CUSTOM_TIMES.map((n) => chip(n === 1 ? t('cg.once') : `×${n}`, () => cur.target === n, () => { cur.target = n; })));
      days.replaceChildren(chip(t('cg.every'), () => !cur.days.length, () => { cur.days = []; }),
        ...order.map((d) => chip(wd.format(new Date(2026, 0, 4 + d)), () => cur.days.includes(d), () => {
          cur.days = cur.days.includes(d) ? cur.days.filter((x) => x !== d) : [...cur.days, d];
          if (cur.days.length === 7) cur.days = [];
        })));
    };
    paint();
    const d = dialog(t(c ? 'cg.edit' : 'cg.title'),
      h('div', { class: 'sheet-scroll goal-editor' },
        h('label', { class: 'goal-edit' }, h('b', {}, t('cg.name')), name),
        h('div', { class: 'goal-edit' }, h('b', {}, t('cg.times')), times),
        h('div', { class: 'goal-edit' }, h('b', {}, t('cg.days')), days),
        h('p', { class: 'muted small' }, t('cg.private')),
        h('div', { class: 'chips cg-actions' },
          h('button', { class: 'primary brand-btn', onclick: () => {
            cur.name = name.value.trim().slice(0, 40);
            if (!cur.name) { name.focus(); return; }
            const g = goals();
            const i = g.custom.findIndex((x) => x.id === cur.id);
            if (i >= 0) g.custom[i] = cur; else if (g.custom.length < CUSTOM_MAX) g.custom.push(cur);
            setGoals(g);
            d.close();
          } }, t('cg.save')),
          c ? h('button', { class: 'chip', onclick: () => {
            const g = goals();
            g.custom = g.custom.filter((x) => x.id !== cur.id);
            setGoals(g);
            d.close();
          } }, t('cg.delete')) : '')));
    if (!c) setTimeout(() => name.focus(), 50);
  }
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
    const paceRow = h('div', { class: 'goal-edit' }, h('b', {}, t('pace.title')), h('div', { class: 'chips' },
      ...(['gentle', 'steady', 'devoted'] as Pace[]).map((p) => h('button', { class: 'chip', onclick: () => { choosePace(p); d.close(); openGoalEditor(); } }, t(`pace.${p}` as Key)))));
    const mine = h('div', { class: 'goal-edit' }, h('b', {}, t('cg.mine')),
      h('div', { class: 'menu' }, ...g.custom.map((c) => h('button', { class: 'menu-item', onclick: () => { d.close(); openCustom(c); } },
        h('span', {}, c.name), h('span', { class: 'muted small' }, ` · ${c.target === 1 ? t('cg.once') : `×${c.target}`}`))),
      g.custom.length < CUSTOM_MAX ? h('button', { class: 'menu-item', onclick: () => { d.close(); openCustom(); } }, `＋  ${t('cg.add')}`) : h('p', { class: 'muted small' }, t('cg.full'))));
    const d = dialog(t('goal.editTitle'),
      h('div', { class: 'sheet-scroll goal-editor' },
        paceRow,
        row(t('goal.ePages'), PAGE_GOALS, g.pages, (n) => { g.pages = n; }),
        row(t('goal.eMemo'), MEMO_GOALS, g.memorise, (n) => { g.memorise = n; }),
        row(t('goal.eReels'), REEL_GOALS, g.reels, (n) => { g.reels = n; }),
        ...DHIKR.map((x) => row(t(x.key as Key), DHIKR_GOALS, g.dhikr[x.id] ?? 0, (n) => { if (n) g.dhikr[x.id] = n; else delete g.dhikr[x.id]; })),
        row(t('goal.eAdhkar'), [0, 1], g.adhkar ? 1 : 0, (n) => { g.adhkar = !!n; }, () => t('goal.on')),
        mine));
  }

  const paintStats = () => {
    const st: Stats = stats(period);
    const now = new Date();
    const last = period === 'week' ? stats('week', parse(addDays(weekOf(dayKey(now)), -1))) : null;
    const tab = (p: Period, label: string) => h('button', {
      class: `tab${p === period ? ' on' : ''}`, role: 'tab', 'aria-selected': String(p === period),
      onclick: () => { period = p; haptic(); paintStats(); },
    }, label);
    // This week: each tile also says how it compares with last week.
    const vs = (k: keyof Stats, show = (n: number) => String(n)) => {
      if (!last) return '';
      const d = (st[k] as number) - (last[k] as number);
      return d ? h('span', { class: `wk-diff ${d > 0 ? 'up' : 'down'}` }, `${d > 0 ? '▲' : '▼'} ${show(Math.abs(d))}`) : '';
    };
    const tile = (n: string, label: string, diff: Node | string, sub?: string) =>
      h('div', { class: 'me-tile' }, h('span', { class: 'me-tile-n' }, h('b', {}, n), diff), h('span', {}, label), sub ? h('span', { class: 'muted small' }, sub) : '');
    const names = st.surahList.slice(-3).map((s) => surahName(meta[s - 1])).join(' · ');
    statsBox.replaceChildren(
      h('h2', { class: 'me-h' }, t('me.stats')),
      h('div', { class: 'tabs me-tabs', role: 'tablist' },
        tab('week', t('me.week')), tab('month', t('me.month')), tab('all', t('me.all'))),
      h('div', { class: 'me-tiles' },
        tile(String(st.pages), t('me.pages'), vs('pages')),
        tile(String(st.ayat), t('me.ayat'), vs('ayat')),
        tile(minutes(st.listen), t('me.listened'), vs('listen', (n) => minutes(n))),
        tile(String(st.surahs), t('me.surahs'), vs('surahs'), names || undefined),
        tile(String(st.juz), t('me.juz'), vs('juz')),
        tile(String(st.memorised), t('me.memorised'), vs('memorised')),
        tile(String(st.dhikr), t('me.dhikr'), vs('dhikr')),
        tile(String(st.reels), t('me.reels'), vs('reels'))),
      h('p', { class: 'muted small' }, last
        ? (now.getDay() === 1 && last.litDays ? t('wk.monday', { pages: last.pages, dhikr: last.dhikr }) : t('wk.sub'))
        : t('me.honest', { time: timeLabel(pageSeconds()) })));
  };

  const paintBadges = () => {
    const all = badgeStates();
    const got = all.filter((b) => b.earned).length;
    const tile = (b: BadgeState) => h('button', { class: `bd-tile${b.earned ? ' earned' : ''}`, onclick: (e: Event) => (b.earned && !badgeClaimed(b.def.id) ? void claimBadgeNow(b.def, e.currentTarget as Element) : openBadge(b)) },
      badgeArt(b.def.tier, b.def.icon, !!b.earned, 68),
      h('span', { class: 'bd-name' }, t(b.def.name as Key, { n: b.def.need })),
      b.earned ? '' : h('span', { class: 'bd-mini' }, h('span', { style: `width:${Math.round((100 * b.have) / b.def.need)}%` })));
    // Earned first (newest first), then the ones closest to being earned.
    const earned = all.filter((b) => b.earned).sort((a, b) => (b.earned! > a.earned! ? 1 : -1));
    const next = all.filter((b) => !b.earned).sort((a, b) => b.have / b.def.need - a.have / a.def.need);
    const order = [...earned, ...next];
    const seeAll = () => dialog(t('bd.badges'), h('div', { class: 'sheet-scroll' }, h('div', { class: 'bd-grid' }, ...order.map(tile))));
    const waiting = earned.filter((b) => !badgeClaimed(b.def.id));
    badgeBox.replaceChildren(
      waiting.length ? h('div', { class: 'claim-badges' }, ...waiting.map((b) => h('button', { class: 'claim-badge', onclick: (e: Event) => void claimBadgeNow(b.def, e.currentTarget as Element) },
        badgeArt(b.def.tier, b.def.icon, true, 44),
        h('span', { class: 'cb-txt' }, h('span', {}, t('cel.badge')), h('b', {}, t(b.def.name as Key, { n: b.def.need }))),
        h('span', { class: 'cb-go' }, `✦ ${t('cel.claim')}`)))) : '',
      h('div', { class: 'me-row' }, h('h2', { class: 'me-h' }, t('bd.badges')),
        h('button', { class: 'chip', onclick: seeAll }, t('bd.all', { n: got, of: all.length }))),
      h('div', { class: 'bd-row' }, ...order.slice(0, 4).map(tile)));
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
    prayerBox.replaceChildren(
      h('div', { class: 'me-row' }, head, h('a', { class: 'chip', href: '#/me/settings' }, t('me.settings'))),
      h('p', { class: 'pr-next' }, t('pr.next', { name: t(`pr.${PRAYERS[next]}` as Key), time: timeFmt.format(nextAt), left: minutes(mins * 60) })),
      h('div', { class: 'pr-list' }, ...times.map((x, i) => h('div', { class: `pr-row${i === next && !tomorrow ? ' next' : ''}${i === 1 ? ' sun' : ''}` },
        h('span', {}, t(`pr.${PRAYERS[i]}` as Key)), h('b', {}, timeFmt.format(x))))),
      h('p', { class: 'muted small' }, t('pr.privacy')));
  };

  void import('../together/relight').then((m) => m.takeRelights());
  // Repaint at most once a frame, however many changes arrive (a burst of tasbih taps, a sync).
  let queued = 0;
  const paintAll = () => { queued = 0; paintHero(); paintGoals(); paintStats(); paintBadges(); };
  const refresh = () => { if (!queued) queued = requestAnimationFrame(paintAll); };
  paintAll();
  paintLibrary();
  void paintPrayer();
  const tick = window.setInterval(() => { if (!document.hidden) void paintPrayer(); }, 30_000);
  const onPrayer = () => void paintPrayer();
  root.append(
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('h1', {}, t('me.title')), h('p', { class: 'muted' }, t('me.sub'))),
      h('a', { class: 'icon-btn me-gear', href: '#/me/settings', 'aria-label': t('me.settings'), title: t('me.settings') }, '⚙')),
    hero, goalsBox, prayerBox, statsBox, badgeBox, libBox,
    tabBar('me'));

  window.addEventListener('journey-changed', refresh);
  window.addEventListener('readlog-changed', refresh);
  window.addEventListener('prayer-changed', onPrayer);
  return () => {
    clearInterval(tick);
    cancelAnimationFrame(queued);
    window.removeEventListener('prayer-changed', onPrayer);
    window.removeEventListener('journey-changed', refresh);
    window.removeEventListener('readlog-changed', refresh);
  };
}

/** #/me/settings: the Me tab's own settings, then the way on to the app's menu. */
export function showMeSettings(root: HTMLElement): () => void {
  const timeFmt = new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' });
  const body = h('div', {});
  const section = (title: string, ...kids: (Node | string)[]) => h('section', { class: 'me-card' }, h('h2', { class: 'me-h' }, title), ...kids);
  const chips = <T,>(list: readonly T[], cur: (x: T) => boolean, label: (x: T) => string, pick: (x: T) => void | Promise<void>) =>
    h('div', { class: 'chips' }, ...list.map((x) => h('button', {
      class: `chip${cur(x) ? ' on' : ''}`, 'aria-pressed': String(cur(x)),
      onclick: async () => { await pick(x); haptic(); paint(); },
    }, label(x))));

  const paint = () => {
    const ps = prayerSettings();
    const rem = dhikrReminders();
    const sel = h('select', { class: 'search pr-method', 'aria-label': t('pr.method'), onchange: (e: Event) =>
      setPrayerSettings({ ...prayerSettings(), method: (e.target as HTMLSelectElement).value as Method }) },
    ...METHODS.map((m) => h('option', { value: m, selected: m === ps.method }, t(`pr.m.${m}` as Key))));
    body.replaceChildren(
      section(t('set.reading'),
        h('p', { class: 'muted small' }, t('me.pageTimeHelp')),
        h('b', { class: 'set-label' }, t('me.pageTime')),
        chips(PAGE_TIMES, (x) => x === pageSeconds(), timeLabel, (x) => setPageSeconds(x))),
      section(t('pr.title'),
        h('p', { class: 'muted small' }, t('pr.locHelp')),
        h('button', { class: 'chip', onclick: async () => {
          toast(t('pr.finding'));
          if (!(await locatePrayer())) toast(t('pr.denied'));
        } }, ps.lat === null ? t('pr.setLocation') : t('pr.update')),
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
        h('p', { class: 'muted small' }, t('pr.privacy'))),
      isNative() ? section(t('rem.label'),
        chips(REMINDER_TIMES, (x) => rem.includes(x), (tm) => timeFmt.format(new Date(2026, 0, 1, Number(tm.slice(0, 2)), Number(tm.slice(3)))),
          async (tm) => {
            const next = rem.includes(tm) ? rem.filter((x) => x !== tm) : [...rem, tm];
            if (!(await setDhikrReminders(next))) toast(t('rem.denied'));
          })) : '',
      h('section', { class: 'me-card menu' },
        h('button', { class: 'menu-item', onclick: () => openMoreMenu() }, `⚙  ${t('me.more')}`)));
  };
  paint();
  root.append(
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/me', 'aria-label': t('me.title') }, '‹'),
      h('div', { class: 'brand' }, h('h1', {}, t('me.settings')))),
    body, tabBar('me'));
  window.addEventListener('prayer-changed', paint);
  return () => window.removeEventListener('prayer-changed', paint);
}
