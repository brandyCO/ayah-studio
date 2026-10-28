// Goals and badges: whenever the journey or the reading log changes, mark a day when every goal is
// met and earn the badges whose goal is reached. A new badge fires `badge-earned` (the Me screen
// shows it large) and, elsewhere, a short toast.
import { checkBadges } from '../data/badges';
import { checkGoals } from '../data/goals';
import { t, type Key } from '../i18n';
import { toast } from './dom';

let busy = false;
function check() {
  if (busy) return;
  busy = true;
  try {
    if (checkGoals()) toast(t('goal.allMet'));
    const fresh = checkBadges();
    if (fresh.length) {
      window.dispatchEvent(new CustomEvent('badge-earned', { detail: fresh.map((b) => b.id) }));
      if (location.hash !== '#/me') toast(t('bd.toast', { name: t(fresh[0].name as Key, { n: fresh[0].need }) }));
    }
  } finally {
    busy = false;
  }
}

export function watchRewards() {
  window.addEventListener('journey-changed', check);
  window.addEventListener('readlog-changed', check);
  check();
}
