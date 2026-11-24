// Unlock moment preview: bench/unlock.html?k=shop|room|wardrobe&fig=CODE (fig=none: without a character);
// ?fs=1 the first screen, ?fs=wb the welcome back; ?co=1 shows the first week's timeline instead;
// ?chest=N a goal chest upgraded to ×N while tapping (1–4);
// ?wg=JSON the seven days of gifts with that `weekGift` state (?wg=1: a fresh first week).
import { playUnlock } from '../src/ui/unlock';
import { DEFAULT, encode } from '../src/ui/figure';
import { initI18n } from '../src/i18n';
import type { Reveal } from '../src/data/reveal';

const q = new URLSearchParams(location.search);
const fig = q.get('fig');
try { if (fig === 'none') localStorage.removeItem('rankFigure'); else localStorage.setItem('rankFigure', fig ?? encode(DEFAULT)); } catch { /* */ }
await initI18n();
if (q.get('prof')) {
  // ?prof=1 another player's Discord-style profile (friend), ?prof=me your own.
  const me = q.get('prof') === 'me';
  const p = { name: me ? 'Marwan' : 'Yusuf', pid: 'p1', me, figure: fig === 'none' ? null : encode(DEFAULT), avatar: 3, frame: +(q.get('frame') ?? 21), tier: +(q.get('tier') ?? 3), xp: 52340,
    flag: 'LB', lamp: 3, relation: me ? 'me' : 'friend', show: 63, bestTier: 4, week: 1240, streak: 86, trophies: 4, pages: 312, listen: 940,
    friend: me ? undefined : { streak: 23, meToday: true, themToday: true }, follow: { on: true, back: true, followers: 128, following: 64 },
    badges: { top: ['streak-4', 'pages-3', 'juz-2', 'dhikr-3', 'listen-1', 'hz18-4', 'hz67-2', 'hzc12-0'], n: 41 }, cups: [1, 2, 3] };
  try { if (q.get('cold')) localStorage.removeItem('rankProfiles'); else localStorage.setItem('rankProfiles', JSON.stringify({ p: { p1: p } })); } catch { /* */ }
  void import('../src/ui/friends').then((m) => m.openProfile({ ...p, score: 0 } as never));
} else if (q.get('chest')) {
  const up = +q.get('chest')!;
  void Promise.all([import('../src/ui/celebrate'), import('../src/ui/dom'), import('../src/i18n/front')]).then(([c, d, f]) => c.celebrate({ kind: 'chest', title: 'Read 5 pages', sub: 'Goal met', up,
    loot: [{ kind: 'light', n: 30 * up }, ...(up > 1 ? [{ kind: 'item' as const, art: d.h('span', { class: 'cel-x2' }, `×${up}`), label: f.fe('ch.up', { n: up }), rare: true }] : [])] }, null, 30 * up));
} else if (q.get('wg')) {
  try { localStorage.setItem('weekGift', q.get('wg') === '1' ? JSON.stringify({ got: 0, last: null, from: '2026-11-24' }) : q.get('wg')!); } catch { /* */ }
  void import('../src/ui/weekGifts').then((m) => m.openWeekGifts());
} else if (q.get('fs')) void import('../src/ui/firstScreen').then((m) => q.get('fs') === 'wb' ? m.welcomeBack() : m.openFirstScreen(() => {}));
else if (q.get('co')) void import('../src/ui/coming').then((m) => m.openComing(m.steps()[1]));
else playUnlock((q.get('k') ?? 'shop') as Reveal, () => {}, () => {});
