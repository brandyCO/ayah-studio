// Bottom tab bar: Read · Learn · Create · Ranks · Me (owner request 2026-11-09). Create is the raised
// round button in the middle: the studio is the heart of the app.
// On the mushaf the bar stays hidden until the page is tapped (the page stays clean); on the
// surah list, drafts, Learn and Me it is always shown. Listening lives in Read (owner decision
// 2026-11-02): ▶ in the mushaf's top bar or on a selected ayah; while listening elsewhere, Read goes
// back to the page being recited. Learn is the juz gardens (#/learn). Me is its own screen (#/me).
// A tab tapped on another screen can ask the mushaf to act once it opens (sessionStorage `tabIntent`).
import { todaysAyah } from '../data/daily';
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

/** Create opens the full studio at once (owner request 2026-11-19, no quick-reel step): today's ayah with
 *  its recitation and a nature video from Pixabay already in place (src/data/starter.ts). Other ayat,
 *  drafts and the mushaf selection are one tap away inside the studio's top bar. */
export async function openCreate() {
  const daily = await todaysAyah().catch(() => null);
  const [s, a, b] = daily ? [daily.s, daily.from, daily.to] : [1, 1, 7];
  try { sessionStorage.setItem('reelFresh', '1'); } catch { /* private window */ }
  location.hash = `#/reel/${s}/${a}-${b}`;
}


/** After "Pick ayat": say how to select, near where the user will do it. */
export const pickHint = () => toast(t('create.pickHint'));
