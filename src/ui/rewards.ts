// Goals, flame and badges: whenever the journey or the reading log changes, light today's flame
// when one goal is met (once the app was opened today, so not from the Kids space), mark a day when
// every goal is met and earn the badges whose goal is reached. Nothing pops up (reading is never
// interrupted): rewards wait on the Me screen for their Claim tap, and the Me tab shows a dot.
import { checkBadges } from '../data/badges';
import { anyGoalMet, checkGoals } from '../data/goals';
import { pendingRewards } from '../data/claims';
import { lightFlame, todayRec } from '../data/journey';

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
    checkBadges();
    paintRewardDots();
  } finally {
    busy = false;
  }
}

// Many changes can arrive at once (a tasbih tap, a page counted, a sync): check once per frame.
let queued = false;
const soon = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; check(); });
};

export function watchRewards() {
  window.addEventListener('journey-changed', soon);
  window.addEventListener('readlog-changed', soon);
  check();
}
