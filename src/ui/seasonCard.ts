// The Ramadan season's light parts (no figures, no room art): the small card on Me that opens `#/season`, the
// crescent on the streak card all through Ramadan (class `season-ramadan` on <html>), the reminders before it
// starts (Android), and the first-day teaser for new users (owner request 2026-11-11: "send that to all new users
// … in the first day of using, after syncing their account").
import { h } from './dom';
import { snt } from '../i18n/season';
import { daysLeft, seasonState, setTeaserSeen, teaserSeen } from '../data/season';
import { PAGES, planPages, ramadanData } from '../data/ramadan';
import { allDays } from '../data/journey';
import { kidsOn } from '../data/kids';
import { account } from '../cloud/auth';
import { onSyncStatus } from '../cloud/sync';
import { isNative } from '../native';
import './seasonCard.css';

const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 3.2a9 9 0 1 0 5.3 15.1A7.6 7.6 0 0 1 15.5 3.2z" fill="currentColor"/></svg>';
const FANOUS = (c: string) => `<svg viewBox="0 0 20 40" aria-hidden="true"><path d="M10 0v8" stroke="#e8c27a" stroke-width="1.2"/><path d="M5 8h10l3 5H2z" fill="#e0a33a"/><path d="M3 13Q10 11 17 13L15.5 28H4.5Z" fill="${c}"/><rect x="7" y="16" width="6" height="9" rx="2" fill="#fff3c4"/><path d="M3 28h14l-3 4H6z" fill="#e0a33a"/></svg>`;

/** Keeps the Ramadan look on the streak card in step with the calendar. */
export function markSeason() {
  document.documentElement.classList.toggle('season-ramadan', seasonState().phase === 'open');
}

/** Me: "Ramadan in N days" (or the season's day), opening the season screen. */
export function seasonCard(): HTMLElement | null {
  markSeason();
  const st = seasonState();
  if (st.phase === 'eid') return null;
  let title: string, sub: string;
  if (st.phase === 'open') {
    const d = ramadanData(st.now);
    title = snt('sn.cardLive', { day: st.now.day ?? 1 });
    sub = d.plan && d.plan !== 'company' ? snt('sn.cardLiveSub', { n: d.khatms * PAGES + d.read.length, total: planPages(d.plan) }) : snt('sn.cardLiveCompany');
  } else {
    if (!st.start) return null;
    const n = daysLeft(st.start);
    title = n <= 1 ? snt('sn.cardIn1') : n <= 10 ? snt('sn.cardInFew', { n }) : snt('sn.cardIn', { n });
    sub = snt('sn.cardSub');
  }
  const art = h('span', { class: 'snc-art', 'aria-hidden': 'true' });
  art.innerHTML = `<span class="snc-moon">${MOON}</span><span class="snc-f a">${FANOUS('#ff5d6c')}</span><span class="snc-f b">${FANOUS('#3cc98a')}</span>`;
  return h('a', { class: `me-card snc${st.phase === 'open' ? ' live' : ''}`, href: '#/season' },
    art, h('span', { class: 'snc-t' }, h('b', {}, title), h('span', {}, sub)), h('span', { class: 'snc-go', 'aria-hidden': 'true' }, '›'));
}

// --- reminders before Ramadan (Android) ---
const IDS = [7600, 7601];
export async function scheduleSeasonReminders(): Promise<void> {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: IDS.map((id) => ({ id })) });
    const st = seasonState();
    if (st.phase !== 'soon' || !st.start) return;
    const s = st.start;
    const eve = new Date(s.getFullYear(), s.getMonth(), s.getDate() - 1, 17, 0);
    const soon = new Date(s.getFullYear(), s.getMonth(), s.getDate() - 3, 12, 0);
    const list = [
      { id: IDS[1], title: snt('sn.notifSoonTitle'), body: snt('sn.notifSoonBody'), schedule: { at: soon, allowWhileIdle: true }, extra: { hash: '#/season' }, smallIcon: 'ic_stat_crescent' },
      { id: IDS[0], title: snt('sn.notifTitle'), body: snt('sn.notifBody'), schedule: { at: eve, allowWhileIdle: true }, extra: { hash: '#/season' }, smallIcon: 'ic_stat_crescent' },
    ].filter((n) => n.schedule.at.getTime() > Date.now() + 60_000);
    if (list.length) await LocalNotifications.schedule({ notifications: list });
  } catch (e) {
    console.warn('Season reminders could not be scheduled', e);
  }
}

// --- the first-day teaser ---
/** A new user: today is the only day the app was opened (after the account's days were merged in). */
const firstDay = () => Object.values(allDays()).filter((r) => r.o).length <= 1;
const busy = () => !!document.querySelector('dialog[open]') || /^#\/(reel|kids)/.test(location.hash) || document.hidden;

/** App start: the season's reminders and notification taps, and the teaser once the account has synced. */
export function initSeason() {
  if (isNative()) {
    void import('@capacitor/local-notifications').then(({ LocalNotifications }) =>
      LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
        if (e.notification.extra?.hash === '#/season') location.hash = '#/season';
      })).catch(() => {});
    try { if (localStorage.getItem('seasonRemind') === '1') void scheduleSeasonReminders(); } catch { /* ignore */ }
  }
  if (teaserSeen() || kidsOn()) return;
  let off: (() => void) | null = null;
  let done = false;
  const tryShow = () => {
    if (done || teaserSeen() || !account()) return;
    if (!firstDay() || seasonState().phase === 'eid') { done = true; off?.(); return; }
    if (busy()) { setTimeout(tryShow, 8000); return; }
    done = true;
    off?.();
    setTeaserSeen();
    void import('./season').then((m) => m.openSeasonTeaser());
  };
  off = onSyncStatus((s) => { if (s.state === 'ok') setTimeout(tryShow, 1500); });
  if (done) off();
}
