// Gift moment preview (owner review): bench/gift.html?t=0..3&fig=CODE&auto=1 plays one gift with a fake sender.
import { playGift } from '../src/ui/giftOpen';
import { DEFAULT, encode } from '../src/ui/figure';
import { initI18n } from '../src/i18n';

const q = new URLSearchParams(location.search);
const t = Number(q.get('t') ?? 0);
const light = [25, 50, 100, 200][t] ?? 25;
await initI18n();
const go = () => playGift({ id: 'g' + t, light, item: q.get('item'), at: new Date().toISOString(),
  from: { name: 'Bilal', me: false, pid: q.get('pid') ?? ['amal', 'yusuf', 'noor', 'sara'][t], tier: 2, avatar: 3, frame: 0, figure: q.get('fig') ?? encode(DEFAULT) } },
  { open: async () => { await new Promise((r) => setTimeout(r, 150)); return true; } });
(window as unknown as { go: () => Promise<boolean> }).go = go;
if (q.get('auto') !== '0') void go();
