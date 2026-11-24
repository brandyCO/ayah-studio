// Unlock moment preview: bench/unlock.html?k=shop|room|wardrobe&fig=CODE (fig=none: without a character);
// ?co=1 shows the first week's timeline instead.
import { playUnlock } from '../src/ui/unlock';
import { DEFAULT, encode } from '../src/ui/figure';
import { initI18n } from '../src/i18n';
import type { Reveal } from '../src/data/reveal';

const q = new URLSearchParams(location.search);
const fig = q.get('fig');
try { if (fig === 'none') localStorage.removeItem('rankFigure'); else localStorage.setItem('rankFigure', fig ?? encode(DEFAULT)); } catch { /* */ }
await initI18n();
if (q.get('co')) void import('../src/ui/coming').then((m) => m.openComing(m.steps()[1]));
else playUnlock((q.get('k') ?? 'shop') as Reveal, () => {}, () => {});
