// Unlock moment preview: bench/unlock.html?k=shop|room|wardrobe&fig=CODE (fig=none: without a character);
// ?fs=1 the first screen, ?fs=wb the welcome back; ?co=1 shows the first week's timeline instead;
// ?wg=JSON the seven days of gifts with that `weekGift` state (?wg=1: a fresh first week).
import { playUnlock } from '../src/ui/unlock';
import { DEFAULT, encode } from '../src/ui/figure';
import { initI18n } from '../src/i18n';
import type { Reveal } from '../src/data/reveal';

const q = new URLSearchParams(location.search);
const fig = q.get('fig');
try { if (fig === 'none') localStorage.removeItem('rankFigure'); else localStorage.setItem('rankFigure', fig ?? encode(DEFAULT)); } catch { /* */ }
await initI18n();
if (q.get('wg')) {
  try { localStorage.setItem('weekGift', q.get('wg') === '1' ? JSON.stringify({ got: 0, last: null, from: '2026-11-24' }) : q.get('wg')!); } catch { /* */ }
  void import('../src/ui/weekGifts').then((m) => m.openWeekGifts());
} else if (q.get('fs')) void import('../src/ui/firstScreen').then((m) => q.get('fs') === 'wb' ? m.welcomeBack() : m.openFirstScreen(() => {}));
else if (q.get('co')) void import('../src/ui/coming').then((m) => m.openComing(m.steps()[1]));
else playUnlock((q.get('k') ?? 'shop') as Reveal, () => {}, () => {});
