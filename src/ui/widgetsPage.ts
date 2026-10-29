// #/me/widgets (Me → Settings → Widgets): the four home-screen widgets (streak, tasbih, prayer
// times, today's ayah), each drawn small with the user's own numbers, with "Add to home screen"
// (Android 8+: the launcher places it after its own confirmation) or the steps by hand where a
// launcher cannot. Also the one-time hint on Me (`widgetHintOff`), shown on the Android app until a
// widget is on the home screen or the hint is closed.
import { streak, todayRec } from '../data/journey';
import { DHIKR, goals } from '../data/goals';
import { PRAYERS, nextPrayer } from '../data/prayer';
import { todaysAyah } from '../data/daily';
import { loadMeta, reference } from '../data/quran';
import { locale, t, type Key } from '../i18n';
import { isNative } from '../native';
import { h, haptic, toast } from './dom';
import { flame, flameTier } from './flame';
import { tabBar } from './tabs';
import { WIDGETS, pinWidget, widgetStatus, type WidgetKind, type WidgetStatus } from './widgets';

const timeFmt = () => new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' });

/** A small picture of the widget with today's numbers. */
async function preview(kind: WidgetKind): Promise<HTMLElement> {
  if (kind === 'streak') {
    const s = streak();
    return h('div', { class: 'wg-pv wg-streak' },
      flame(flameTier(s.days, s.litToday), 46, true),
      h('div', {}, h('b', { class: 'wg-big' }, String(s.days)), h('span', { class: 'wg-small' }, t('w.dayStreak'))));
  }
  if (kind === 'tasbih') {
    const d = DHIKR[0];
    const target = goals().dhikr[d.id] || 33;
    const n = todayRec().dk?.[d.id] ?? 0;
    const f = Math.min(1, n / target);
    return h('div', { class: 'wg-pv wg-tasbih' },
      h('span', { class: 'wg-ring', style: `--f:${f}` }, h('b', {}, String(n))),
      h('div', {}, h('b', { class: 'wg-ar', lang: 'ar', dir: 'rtl' }, d.ar), h('span', { class: 'wg-small' }, `${n} / ${target}`)));
  }
  if (kind === 'prayer') {
    const nx = await nextPrayer().catch(() => null);
    return h('div', { class: 'wg-pv wg-prayer' },
      nx
        ? h('div', {}, h('span', { class: 'wg-small' }, t('w.next')), h('b', { class: 'wg-big' }, t(`pr.${nx.name}` as Key)), h('span', { class: 'wg-small' }, timeFmt().format(nx.at)))
        : h('div', {}, h('b', {}, t('pr.title')), h('span', { class: 'wg-small' }, t('w.noLocation'))),
      h('div', { class: 'wg-dots' }, ...PRAYERS.filter((p) => p !== 'sunrise').map((p) => h('i', { class: nx?.name === p ? 'on' : '' }))));
  }
  const item = await todaysAyah().catch(() => null);
  let ref = '';
  if (item) {
    const meta = await loadMeta().catch(() => null);
    const sm = meta?.[item.s - 1];
    if (sm) ref = reference(sm, item.from, item.to);
  }
  return h('div', { class: 'wg-pv wg-daily' },
    h('div', {}, h('span', { class: 'wg-small' }, t('wg.dailyHead')), h('b', {}, ref || t('wg.daily'))));
}

export async function showMeWidgets(root: HTMLElement): Promise<() => void> {
  const body = h('div', {});
  const native = isNative();
  let status: WidgetStatus = await widgetStatus();
  const cards = await Promise.all(WIDGETS.map(async (kind) => ({ kind, pv: await preview(kind) })));

  const steps = () => h('section', { class: 'me-card' },
    h('h2', { class: 'me-h' }, t('wg.byHand')),
    h('ol', { class: 'wg-steps' }, h('li', {}, t('wg.step1')), h('li', {}, t('wg.step2')), h('li', {}, t('wg.step3'))));

  const paint = () => {
    body.replaceChildren(
      h('p', { class: 'muted wg-intro' }, native ? t('wg.intro') : t('wg.web')),
      ...cards.map(({ kind, pv }) => {
        const count = status.on[kind] ?? 0;
        return h('section', { class: 'me-card wg-card' },
          pv,
          h('div', { class: 'wg-text' },
            h('h3', {}, t(`wg.${kind}` as Key)),
            h('p', { class: 'muted small' }, t(`wg.${kind}Desc` as Key)),
            h('div', { class: 'wg-actions' },
              count ? h('span', { class: 'wg-on' }, `✓ ${t('wg.onHome')}`) : '',
              native && status.canPin ? h('button', {
                class: `chip${count ? '' : ' on'}`,
                onclick: async () => {
                  haptic();
                  if (!(await pinWidget(kind))) toast(t('wg.cannot'));
                },
              }, count ? t('wg.addAnother') : t('wg.add')) : '')));
      }),
      native && !status.canPin ? steps() : native ? h('p', { class: 'muted small wg-intro' }, t('wg.after')) : '');
  };
  paint();
  // Back from the launcher's confirmation: show what is on the home screen now.
  const onVis = async () => {
    if (document.hidden) return;
    status = await widgetStatus();
    paint();
  };
  document.addEventListener('visibilitychange', onVis);
  const poll = native ? window.setInterval(() => void onVis(), 4000) : 0;
  root.append(
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/me/settings', 'aria-label': t('me.settings') }, '‹'),
      h('div', { class: 'brand' }, h('h1', {}, t('wg.title')))),
    body, tabBar('me'));
  return () => {
    document.removeEventListener('visibilitychange', onVis);
    clearInterval(poll);
  };
}

const HINT = 'widgetHintOff';
/** The hint card on Me: only in the Android app, while no widget is on the home screen. */
export async function widgetHint(): Promise<HTMLElement | null> {
  if (!isNative()) return null;
  try { if (localStorage.getItem(HINT)) return null; } catch { /* ignore */ }
  const st = await widgetStatus();
  if (!st.canPin || WIDGETS.some((k) => st.on[k] > 0)) return null;
  const s = streak();
  const off = () => { try { localStorage.setItem(HINT, '1'); } catch { /* ignore */ } card.remove(); };
  const card = h('section', { class: 'me-card wg-hint' },
    flame(flameTier(Math.max(1, s.days), true), 40, true),
    h('div', { class: 'wg-text' },
      h('b', {}, t('wg.hint')),
      h('div', { class: 'wg-actions' },
        h('button', { class: 'chip on', onclick: async () => { haptic(); if (await pinWidget('streak')) off(); else toast(t('wg.cannot')); } }, t('wg.add')),
        h('a', { class: 'chip', href: '#/me/widgets' }, t('wg.all')))),
    h('button', { class: 'icon-btn wg-x', 'aria-label': t('common.close'), onclick: off }, '✕'));
  return card;
}
