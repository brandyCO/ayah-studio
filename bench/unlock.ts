// Unlock moment preview: bench/unlock.html?k=shop|room|wardrobe&fig=CODE (fig=none: without a character).
import { playUnlock } from '../src/ui/unlock';
import { DEFAULT, encode } from '../src/ui/figure';
import { initI18n } from '../src/i18n';
import type { Reveal } from '../src/data/reveal';

const q = new URLSearchParams(location.search);
const fig = q.get('fig');
try { if (fig === 'none') localStorage.removeItem('rankFigure'); else localStorage.setItem('rankFigure', fig ?? encode(DEFAULT)); } catch { /* */ }
await initI18n();
playUnlock((q.get('k') ?? 'shop') as Reveal, () => {}, () => {});
