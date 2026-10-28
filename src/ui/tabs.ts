// Bottom tab bar: Read · Listen · Create · Me. One tap to the four things people come for.
// On the mushaf the bar stays hidden until the page is tapped (the page stays clean); on the
// surah list and drafts it is always shown. Listen and Me act on the mushaf: from another screen
// they open the last page read and then start (sessionStorage `tabIntent`).
import { draftHash, listDrafts } from '../data/drafts';
import { todaysAyah } from '../data/daily';
import { loadMeta, reference } from '../data/quran';
import { t } from '../i18n';
import { h, haptic, toast } from './dom';
import { icon } from './icons';
import { lastRead } from './prefs';

export type Tab = 'read' | 'listen' | 'create' | 'me';
type Intent = 'listen' | 'me' | 'pick';
export interface TabHandlers { read?: () => void; listen?: () => void; me?: () => void }

const goMushaf = (intent?: Intent) => {
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
    return v === 'listen' || v === 'me' || v === 'pick' ? v : null;
  } catch { return null; }
}

export function tabBar(active: Tab, on: TabHandlers = {}, auto = false): HTMLElement {
  const btn = (id: Tab, ic: string, label: string, act: () => void) =>
    h('button', {
      class: `tab-btn${id === active ? ' on' : ''}`, 'aria-current': id === active ? 'page' : false,
      onclick: () => { haptic(); act(); },
    }, icon(ic, 24), h('span', {}, label));
  return h('nav', { class: `tabbar${auto ? ' auto' : ''}`, 'aria-label': t('tab.nav') },
    btn('read', 'book', t('tab.read'), on.read ?? (() => goMushaf())),
    btn('listen', 'listen', t('tab.listen'), on.listen ?? (() => goMushaf('listen'))),
    btn('create', 'create', t('tab.create'), () => void openCreate()),
    btn('me', 'me', t('tab.me'), on.me ?? (() => goMushaf('me'))));
}

/** The Create sheet: start from today's ayah, continue a draft, or pick ayat in the mushaf. */
export async function openCreate() {
  const [meta, drafts, daily] = await Promise.all([
    loadMeta(), listDrafts().catch(() => []), todaysAyah().catch(() => null)]);
  const close = () => d.close();
  const link = (href: string, title: string, sub: string, ic: string) =>
    h('a', { class: 'menu-item create-item', href, onclick: close },
      h('span', { class: 'create-ic' }, icon(ic, 22)),
      h('span', { class: 'create-txt' }, h('b', {}, title), h('span', { class: 'muted small' }, sub)));
  const last = drafts[0];
  const d = h('dialog', { class: 'sheet bottom' },
    h('div', { class: 'sheet-head' }, h('h2', {}, t('create.title')),
      h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕')),
    h('div', { class: 'menu' },
      h('button', {
        class: 'menu-item create-item', onclick: () => {
          close();
          goMushaf('pick');
        },
      }, h('span', { class: 'create-ic brand' }, icon('plus', 22)),
      h('span', { class: 'create-txt' }, h('b', {}, t('create.pick')), h('span', { class: 'muted small' }, t('create.pickSub')))),
      daily && link(`#/reel/${daily.s}/${daily.from}-${daily.to}`, t('create.today'),
        reference(meta[daily.s - 1], daily.from, daily.to), 'sparkle'),
      last && link(draftHash(last.project, last.id),
        t('create.continue'), reference(meta[last.project.surah - 1], last.project.from, last.project.to), 'clip'),
      link('#/drafts', t('create.drafts'), drafts.length ? t('create.draftsN', { n: drafts.length }) : t('create.draftsNone'), 'scenes')));
  d.addEventListener('close', () => { d.remove(); window.removeEventListener('hashchange', close); });
  window.addEventListener('hashchange', close); // a link was followed: the sheet goes with the old screen
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
}

/** After "Pick ayat": say how to select, near where the user will do it. */
export const pickHint = () => toast(t('create.pickHint'));
