// Goal notes: a small word when a goal is done, every goal is done, the week's freeze kept the
// flame, or (Android) the flame is still unlit in the evening. In the app they are a soft banner at
// the top (tap → Me, where the Claim waits); with the app in the background (listening, the screen
// off) a local notification instead. All local, nothing sent anywhere.
// Calm by design: at most two notifications a day from here, none in quiet hours (22:00–06:00), never
// during the studio or the Kids space, and each kind can be turned off (Me → Settings → Goal notes).
// The evening reminder is the user's own time, so quiet hours do not hold it back.
import { todayGoals } from '../data/goals';
import { streak, todayRec } from '../data/journey';
import { dayKey } from '../data/readLog';
import { t } from '../i18n';
import { isNative } from '../native';
import { h, haptic } from './dom';
import { goalLabel } from './goalName';

export interface NudgeSettings {
  /** A goal done. */ goal: boolean;
  /** Every goal done. */ all: boolean;
  /** The flame still unlit at `riskAt` (Android). */ risk: boolean;
  riskAt: string;
  /** The weekly freeze kept the flame. */ freeze: boolean;
}
export const RISK_TIMES = ['18:00', '19:00', '20:00', '21:00', '22:00'] as const;
const DEFAULTS: NudgeSettings = { goal: true, all: true, risk: true, riskAt: '21:00', freeze: true };
const CAP = 2;
const RISK_IDS = Array.from({ length: 7 }, (_, i) => 3100 + i);
const NOW_ID = 3200;

const read = <T,>(k: string, d: T): T => {
  try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return v ?? d; } catch { return d; }
};
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export function nudgeSettings(): NudgeSettings {
  const v = read<Partial<NudgeSettings>>('nudges', {});
  const out = { ...DEFAULTS };
  for (const k of ['goal', 'all', 'risk', 'freeze'] as const) if (typeof v[k] === 'boolean') out[k] = v[k]!;
  if ((RISK_TIMES as readonly string[]).includes(v.riskAt as string)) out.riskAt = v.riskAt!;
  return out;
}
export function setNudgeSettings(s: NudgeSettings) {
  write('nudges', s);
  void scheduleRisk();
}

// --- what was already said today (so nothing is said twice) ---
interface Said { day: string; ids: string[]; sent: number }
const said = (): Said => {
  const v = read<Said | null>('nudgeSaid', null);
  return v && v.day === dayKey() ? v : { day: dayKey(), ids: [], sent: 0 };
};

const quiet = (d = new Date()) => d.getHours() >= 22 || d.getHours() < 6;
const busyScreen = () => /^#\/(reel|kids|me)(\/|$)/.test(location.hash)
  || !!document.querySelector('dialog[open], .cel');

/** Called after every rewards check: says what became true since the last look. */
export function checkNudges() {
  const s = nudgeSettings();
  const st = said();
  const list = todayGoals();
  const met = list.filter((g) => g.done >= g.target);
  const fresh = met.filter((g) => !st.ids.includes(g.id));
  const allNow = list.length > 1 && met.length === list.length && !st.ids.includes('all');
  let msg: { title: string; body: string } | null = null;
  if (allNow && s.all) msg = { title: t('nudge.allTitle'), body: t('nudge.allBody') };
  else if (fresh.length && s.goal) {
    const n = streak().days;
    msg = {
      title: t('nudge.goalTitle', { goal: goalLabel(fresh[0]) }),
      body: n > 1 ? t('nudge.goalBodyN', { n }) : t('nudge.goalBody'),
    };
  }
  // Freeze: the week's freeze covered yesterday (or the day before) — said once, in the app.
  const fz = streak().freeze.day;
  const fzMsg = fz && s.freeze && !read<string[]>('nudgeFreeze', []).includes(fz) && fz >= dayKey(new Date(Date.now() - 3 * 86_400_000))
    ? { title: t('nudge.freezeTitle', { n: streak().days }), body: t('nudge.freezeBody') } : null;

  // First run of this version: what was already met before it is not news.
  const first = !localStorage.getItem('nudgeSaid');
  if (!fresh.length && !allNow && !fzMsg && !first) return;
  st.ids.push(...fresh.map((g) => g.id), ...(allNow ? ['all'] : []));
  if (fzMsg) write('nudgeFreeze', [...read<string[]>('nudgeFreeze', []), fz].slice(-8));
  if (first) { write('nudgeSaid', st); return; }
  const say = msg ?? fzMsg;
  if (!say) { write('nudgeSaid', st); return; }
  if (document.hidden) {
    if (isNative() && st.sent < CAP && !quiet() && say !== fzMsg) {
      st.sent++;
      void notifyNow(say.title, say.body);
    }
  } else if (!busyScreen()) {
    banner(say.title, say.body);
  }
  write('nudgeSaid', st);
}

async function notifyNow(title: string, body: string) {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    await LocalNotifications.schedule({ notifications: [{
      id: NOW_ID, title, body, smallIcon: 'ic_stat_crescent',
      schedule: { at: new Date(Date.now() + 400), allowWhileIdle: true },
      extra: { hash: '#/me', focus: 'claim' },
    }] });
  } catch { /* an older build or notifications off */ }
}

/** The in-app note: slides down from the top, stays ~4 s, tap → Me. Never over a dialog. */
export function banner(title: string, body: string) {
  document.querySelector('.nudge')?.remove();
  const el = h('a', { class: 'nudge', href: '#/me', role: 'status', onclick: () => { focusClaim(); el.remove(); } },
    h('span', { class: 'nudge-spark', 'aria-hidden': 'true' }),
    h('span', { class: 'nudge-txt' }, h('b', {}, title), h('span', {}, body)),
    h('span', { class: 'nudge-go' }, t('nudge.open')));
  document.body.append(el);
  haptic(12);
  requestAnimationFrame(() => el.classList.add('show'));
  const hide = () => { el.classList.remove('show'); window.removeEventListener('hashchange', hide); setTimeout(() => el.remove(), 400); };
  window.addEventListener('hashchange', hide);
  let tm = window.setTimeout(hide, 4200);
  el.addEventListener('pointerenter', () => clearTimeout(tm));
  el.addEventListener('pointerleave', () => { tm = window.setTimeout(hide, 1800); });
}

// --- the evening reminder (Android): one a day for the next 7 days at the chosen time, today's
// skipped once the flame is lit. Rescheduled whenever the journey changes or the app comes back, so
// a day the user lights the flame never gets it, and a week without opening the app ends them.
let riskTimer = 0;
export function scheduleRiskSoon() {
  clearTimeout(riskTimer);
  riskTimer = window.setTimeout(() => void scheduleRisk(), 1500);
}
export async function scheduleRisk() {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.cancel({ notifications: RISK_IDS.map((id) => ({ id })) });
    const s = nudgeSettings();
    const k = streak();
    if (!s.risk || (k.best < 1 && k.days < 1)) return;
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    const [hh, mm] = s.riskAt.split(':').map(Number);
    const now = new Date();
    const lit = !!todayRec().f;
    const list = [];
    for (let i = 0; i < 7; i++) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, hh, mm);
      if (i === 0 && (lit || at.getTime() < now.getTime() + 60_000)) continue;
      const days = i === 0 ? k.days : i === 1 && lit ? k.days : 0;
      list.push({
        id: RISK_IDS[i], smallIcon: 'ic_stat_crescent',
        title: days > 1 ? t('nudge.riskTitleN', { n: days }) : t('nudge.riskTitle'),
        body: t('nudge.riskBody'),
        schedule: { at, allowWhileIdle: true },
        extra: { hash: '#/me' },
      });
    }
    if (list.length) await LocalNotifications.schedule({ notifications: list });
  } catch { /* an older build */ }
}

/** App start (Android): keep the evening reminder in step. */
/** Me opens with the waiting Claim in view (read once by Me). */
const focusClaim = () => { try { sessionStorage.setItem('meFocus', 'claim'); } catch { /* private window */ } };

export function initNudges() {
  if (!isNative()) return;
  // A goal note tapped in the notification shade: Me opens (widgets.ts follows the hash) on the Claim.
  void import('@capacitor/local-notifications').then(({ LocalNotifications }) =>
    LocalNotifications.addListener('localNotificationActionPerformed', (e) => {
      if (e.notification.extra?.focus === 'claim') { focusClaim(); if (location.hash === '#/me') window.dispatchEvent(new HashChangeEvent('hashchange')); }
    })).catch(() => {});
  void scheduleRisk();
  window.addEventListener('journey-changed', scheduleRiskSoon);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRiskSoon(); });
}

/** After the first Claim (Android): asks once whether goal notes may come as notifications. */
export async function maybeAskNudges() {
  if (!isNative() || read<boolean>('nudgeAsked', false)) return;
  write('nudgeAsked', true);
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  if ((await LocalNotifications.checkPermissions()).display === 'granted') return void scheduleRisk();
  const d = h('dialog', { class: 'sheet nudge-ask' },
    h('div', { class: 'nudge-ask-art', 'aria-hidden': 'true' }),
    h('h2', {}, t('nudge.askTitle')),
    h('p', { class: 'muted' }, t('nudge.askBody')),
    h('div', { class: 'nudge-ask-row' },
      h('button', { class: 'chip', onclick: () => d.close() }, t('nudge.notNow')),
      h('button', { class: 'primary brand-btn', onclick: async () => {
        d.close();
        const p = await LocalNotifications.requestPermissions();
        if (p.display === 'granted') void scheduleRisk();
      } }, t('nudge.yes')))) as HTMLDialogElement;
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}
