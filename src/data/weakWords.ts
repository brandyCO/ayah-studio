// Words a learner missed in a lesson's exercises (and later in a tasmi'), kept on this device so they
// come back with a hint. Key `s:a:i` = surah, ayah, display-word index (0-based). localStorage `learnWeak`.
const KEY = 'learnWeak';
type Store = Record<string, { n: number; at: number }>;

function load(): Store {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return v && typeof v === 'object' ? v as Store : {}; } catch { return {}; }
}
function save(v: Store) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked */ } }

/** A word was missed: it comes back with a hint until it is got right twice. */
export function markWeak(s: number, a: number, i: number) {
  const v = load();
  const k = `${s}:${a}:${i}`;
  v[k] = { n: Math.min(3, (v[k]?.n ?? 0) + 2), at: Date.now() };
  const keys = Object.keys(v);
  if (keys.length > 600) for (const old of keys.sort((x, y) => v[x].at - v[y].at).slice(0, keys.length - 600)) delete v[old];
  save(v);
}

/** A word was got right: one step closer to leaving the weak list. */
export function markStrong(s: number, a: number, i: number) {
  const v = load();
  const k = `${s}:${a}:${i}`;
  if (!v[k]) return;
  if (--v[k].n <= 0) delete v[k];
  save(v);
}

/** The weak words of a surah, inside ayat a..b when given, as [ayah, word index]. */
export function weakWords(s: number, from = 1, to = Infinity): [number, number][] {
  return Object.keys(load())
    .map((k) => k.split(':').map(Number))
    .filter(([x, a]) => x === s && a >= from && a <= to)
    .map(([, a, i]) => [a, i] as [number, number]);
}
