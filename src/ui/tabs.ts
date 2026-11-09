// Bottom tab bar: Read · Learn · Create · Ranks · Me (owner request 2026-11-09). Create is the raised
// round button in the middle: the studio is the heart of the app.
// On the mushaf the bar stays hidden until the page is tapped (the page stays clean); on the
// surah list, drafts, Learn and Me it is always shown. Listening lives in Read (owner decision
// 2026-11-02): ▶ in the mushaf's top bar or on a selected ayah; while listening elsewhere, Read goes
// back to the page being recited. Learn is the juz gardens (#/learn). Me is its own screen (#/me).
// A tab tapped on another screen can ask the mushaf to act once it opens (sessionStorage `tabIntent`).
import { draftHash, listDrafts } from '../data/drafts';
import { todaysAyah } from '../data/daily';
import { weeklyTemplate } from '../data/popular';
import { loadMeta, reference } from '../data/quran';
import { t } from '../i18n';
import { h, haptic, toast } from './dom';
import { icon } from './icons';
import { lastRead } from './prefs';
import { pendingRewards } from '../data/claims';
import { followAlong, playerActive } from './player';

const rewardWaiting = () => { try { return pendingRewards().length > 0; } catch { return false; } };

export type Tab = 'read' | 'learn' | 'create' | 'ranks' | 'me';
export type Intent = 'listen' | 'pick' | 'bookmarks' | 'reflections' | 'ramadan' | 'tour' | `page:${number}`;
export interface TabHandlers { read?: () => void }

export const goMushaf = (intent?: Intent) => {
  if (intent === 'pick' && document.body.classList.contains('mushaf-mode')) {
    // Already on the page: just put the bars away and say how to select.
    document.querySelector('.mushaf-bar')?.classList.remove('show');
    document.body.classList.remove('tabs-up');
    pickHint();
    return;
  }
  try { if (intent) sessionStorage.setItem('tabIntent', intent); } catch { /* ignore */ }
  const to = lastRead();
  if (location.hash === to) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = to;
};

/** What a tab tapped on another screen asked the mushaf to do once it opens (read once). */
export function takeTabIntent(): Intent | null {
  try {
    const v = sessionStorage.getItem('tabIntent');
    sessionStorage.removeItem('tabIntent');
    return v && /^(listen|pick|bookmarks|reflections|ramadan|tour|page:\d+)$/.test(v) ? (v as Intent) : null;
  } catch { return null; }
}

export function tabBar(active: Tab, on: TabHandlers = {}, auto = false): HTMLElement {
  const btn = (id: Tab, ic: string, label: string, act: () => void) =>
    h('button', {
      class: `tab-btn ${id}${id === active ? ' on' : ''}${id === 'me' && rewardWaiting() ? ' has-dot' : ''}`, 'aria-current': id === active ? 'page' : false,
      onclick: () => { haptic(); act(); },
    }, icon(ic, 24), h('span', {}, label));
  return h('nav', { class: `tabbar${auto ? ' auto' : ''}`, 'aria-label': t('tab.nav') },
    // Listening from another screen: Read goes back to the page being recited.
    btn('read', 'book', t('tab.read'), on.read ?? (() => (playerActive() ? followAlong() : goMushaf()))),
    btn('learn', 'sprout', t('tab.learn'), () => { if (location.hash !== '#/learn') location.hash = '#/learn'; }),
    h('button', {
      class: `tab-btn create tab-fab${active === 'create' ? ' on' : ''}`, 'aria-current': active === 'create' ? 'page' : false,
      onclick: () => { haptic(12); void openCreate(); },
    }, h('span', { class: 'fab-disc' }, icon('plus', 28)), h('span', {}, t('tab.create'))),
    btn('ranks', 'trophy', t('tab.ranks'), () => { if (location.hash !== '#/ranks') location.hash = '#/ranks'; }),
    btn('me', 'me', t('tab.me'), () => { if (location.hash !== '#/me') location.hash = '#/me'; }));
}

/** The Create sheet: start from today's ayah, continue a draft, or pick ayat in the mushaf. */
export async function openCreate() {
  const [meta, drafts, daily, tpl] = await Promise.all([
    loadMeta(), listDrafts().catch(() => []), todaysAyah().catch(() => null), weeklyTemplate(), import('./create.css').catch(() => null)]);
  const noor = await import('./noor').catch(() => null);
  const close = () => d.close();
  const link = (href: string, title: string, sub: string, ic: string, c: string) =>
    h('a', { class: `menu-item create-item ${c}`, href, onclick: close },
      h('span', { class: 'create-ic' }, icon(ic, 22)),
      h('span', { class: 'create-txt' }, h('b', {}, title), h('span', { class: 'muted small' }, sub)));
  const last = drafts[0];
  const d = h('dialog', { class: 'sheet bottom create-sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, t('create.title')),
      h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕')),
    h('div', { class: 'menu' },
      h('button', {
        class: 'menu-item create-item c-pick', onclick: () => {
          close();
          goMushaf('pick');
        },
      }, h('span', { class: 'create-ic brand' }, icon('plus', 22)),
      h('span', { class: 'create-txt' }, h('b', {}, t('create.pick')), h('span', { class: 'muted small' }, t('create.pickSub')))),
      tpl && link(`#/t/${tpl.surah}/${tpl.from}-${tpl.to}/${tpl.reciter}${tpl.look ? `/${tpl.look}` : ''}`, t('create.template'),
        reference(meta[tpl.surah - 1], tpl.from, tpl.to), 'sparkle', 'c-tpl'),
      daily && link(`#/reel/${daily.s}/${daily.from}-${daily.to}`, t('create.today'),
        reference(meta[daily.s - 1], daily.from, daily.to), 'sparkle', 'c-day'),
      last && link(draftHash(last.project, last.id),
        t('create.continue'), reference(meta[last.project.surah - 1], last.project.from, last.project.to), 'clip', 'c-cont'),
      link('#/drafts', t('create.drafts'), drafts.length ? t('create.draftsN', { n: drafts.length }) : t('create.draftsNone'), 'scenes', 'c-mine')),
    noor ? noor.noorLine('create') : '');
  d.addEventListener('close', () => { d.remove(); window.removeEventListener('hashchange', close); });
  window.addEventListener('hashchange', close); // a link was followed: the sheet goes with the old screen
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
}


/** After "Pick ayat": say how to select, near where the user will do it. */
export const pickHint = () => toast(t('create.pickHint'));
