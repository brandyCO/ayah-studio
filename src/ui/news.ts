// #/news (owner request 2026-11-23): one page for everything about other people — friend asks and new followers, your
// friends with their friend streaks (reading now, today), the news feed of friends, people you follow and readers near
// you (same flag, else a clock within an hour), what others cheered on yours, people you follow, invite rewards and an
// invite link. Reached from the News button in Ranks' top bar. Drawn at once from what the phone kept, then fresh.
import './news.css';
import { account, onAccount } from '../cloud/auth';
import { nwt } from '../i18n/news';
import { rt } from '../i18n/ranks';
import { t } from '../i18n';
import { h, haptic, skeletonRows } from './dom';
import { icon } from './icons';
import { tabBar } from './tabs';
import { inboxBell } from './inbox';
import { openAccount } from './account';

export async function showNews(root: HTMLElement): Promise<() => void> {
  const body = h('div', { class: 'nw-body' }, skeletonRows(5, true));
  const back = () => { haptic(6); if (history.length > 1) history.back(); else location.hash = '#/ranks'; };
  root.append(
    h('header', { class: 'topbar nw-top' },
      h('button', { class: 'icon-btn back-btn', 'aria-label': t('common.close'), onclick: back }, icon('back', 22)),
      h('div', { class: 'brand' }, h('h1', {}, nwt('nw.title'))),
      inboxBell()),
    h('main', { class: 'nw-page' },
      h('div', { class: 'nw-hero', 'aria-hidden': 'true' }, h('span', { class: 'nw-hero-ic' }, icon('news', 30)),
        h('p', {}, nwt('nw.sub'))),
      body),
    tabBar('ranks'));
  const [{ friendsTab }, rk] = await Promise.all([import('./friends'), import('../together/ranks')]);
  let id = 0;
  const paint = async (fresh: boolean) => {
    const my = ++id;
    if (!account()) {
      body.replaceChildren(h('div', { class: 'me-card nw-out' }, h('p', {}, nwt('nw.signIn')),
        h('button', { class: 'primary brand-btn', onclick: () => openAccount() }, rt('rk.signIn'))));
      return;
    }
    try {
      const el = fresh ? await friendsTab(true, () => void paint(true)) : await rk.staleFirst(() => friendsTab(false, () => void paint(true), true));
      if (my === id) body.replaceChildren(el);
    } catch (e) {
      if (e instanceof rk.StaleMiss) return;
      if (my === id && !body.querySelector('.fr-tab')) body.replaceChildren(h('p', { class: 'muted' }, (e as Error).message));
    }
  };
  await paint(false);
  void paint(true);
  const again = () => void paint(true);
  addEventListener('news-refresh', again);
  let who = account()?.id ?? null;
  const off = onAccount((a) => { if ((a?.id ?? null) === who) return; who = a?.id ?? null; void paint(true); });
  // Seen now: new followers count as seen, Ranks' News dot goes out and a friend moment may play.
  try { localStorage.setItem('newsSeen', String(Date.now())); } catch { /* ignore */ }
  setTimeout(() => void import('./friends').then((m) => m.friendsShown()), 600);
  return () => { removeEventListener('news-refresh', again); off(); };
}
