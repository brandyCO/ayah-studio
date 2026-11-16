// Goals, flame and badges: whenever the journey or the reading log changes, light today's flame
// when one goal is met (once the app was opened today, so not from the Kids space), mark a day when
// every goal is met and earn the badges whose goal is reached. Nothing pops up (reading is never
// interrupted): rewards wait on the Me screen for their Claim tap, and the Me tab shows a dot.
import { anyGoalMet, checkGoals } from '../data/goals';
import { pendingRewards } from '../data/claims';
import { lightFlame, todayRec } from '../data/journey';
import { checkNudges } from './nudges';

/** Puts the dot on every Me tab while a reward waits. */
export function paintRewardDots() {
  const on = pendingRewards().length > 0;
  document.querySelectorAll('.tab-btn.me').forEach((b) => b.classList.toggle('has-dot', on));
}

let busy = false;
function check() {
  if (busy) return;
  busy = true;
  try {
    const d = todayRec();
    if (d.o && !d.f && anyGoalMet()) lightFlame();
    checkGoals();
    // Badges load on their own (src/data/badges.ts stays out of the first load).
    void import('../data/badges').then((m) => { if (m.checkBadges().length) paintRewardDots(); });
    paintRewardDots();
    checkNudges();
  } finally {
    busy = false;
  }
}

// Many changes can arrive at once (a tasbih tap, a page counted, a sync): check once per frame.
let queued = false;
const soon = () => {
  if (queued) return;
  queued = true;
  // In the background (listening with the screen off) frames do not come: use a timer instead.
  if (document.hidden) setTimeout(() => { queued = false; check(); }, 50);
  else requestAnimationFrame(() => { queued = false; check(); });
};

export function watchRewards() {
  window.addEventListener('journey-changed', soon);
  window.addEventListener('readlog-changed', soon);
  // Badges also count Learn trees, page memory and Ranks weeks (src/data/badges.ts).
  for (const e of ['garden-changed', 'pages-changed', 'rank-cache']) window.addEventListener(e, soon);
  check();
  // The morning after the bedtime du'a: the waking dawn (src/ui/dawn.ts).
  const dawn = () => void import('../data/duas').then((m) => { if (m.dawnDue()) void import('./dawn').then((d) => d.showDawn()); });
  setTimeout(dawn, 1800);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(dawn, 900); });
  // Back after three days or more: a warm welcome and one page back in (src/ui/comeback.ts). Signed in, it waits for
  // the account's days to arrive, so a day read on another phone counts.
  const comeback = () => void import('../cloud/sync').then(async (sy) => {
    if (sy.firstSyncPending() || (sy.syncStatus().state !== 'off' && !sy.syncStatus().at)) return;
    const m = await import('./comeback');
    if (m.comebackDue()) void m.showComeback();
  });
  setTimeout(comeback, 2600);
  void import('../cloud/sync').then((sy) => sy.onSyncStatus((st) => { if (st.state === 'ok') setTimeout(comeback, 600); }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(comeback, 1400); });
  // Du'a notes on: a soft banner after each adhan / salah while the app is open (src/ui/prayerAlerts.ts).
  try { if (/"(duas|salah)":true/.test(localStorage.getItem('prayerAlerts') ?? '')) void import('./prayerAlerts').then((m) => m.watchDuaBanners()); } catch { /* ignore */ }
}
