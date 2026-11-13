// Where the reader stopped: the ayah being recited when listening ended, or on a page read in
// silence its first ayah (stayed on a while) or its last one (the page counted). Next time the
// mushaf opens on that page after a break, that ayah glows softly with "You stopped here".
// localStorage `stoppedAt` (synced like any setting by kv.ts).
export interface Stop { s: number; a: number; p: number; at: number; how: 'listen' | 'read'; shown?: 1 }

const KEY = 'stoppedAt';
/** A break long enough that the reader may have lost the place. */
export const STOP_BREAK = 20 * 60_000;

function read(): Stop | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && typeof v.s === 'number' && typeof v.a === 'number' && typeof v.p === 'number' ? v as Stop : null;
  } catch { return null; }
}

export function noteStop(s: number, a: number, p: number, how: Stop['how']) {
  const was = read();
  // Listening is the more exact place: a silent page stay does not move it on the same page.
  if (how === 'read' && was?.how === 'listen' && was.p === p && Date.now() - was.at < STOP_BREAK) return;
  if (was && was.s === s && was.a === a && was.how === how && !was.shown) return;
  try { localStorage.setItem(KEY, JSON.stringify({ s, a, p, at: Date.now(), how } satisfies Stop)); } catch { /* private */ }
}

/** The stop to show on this page now (once, after a break), or null. */
export function stopOn(p: number, now = Date.now()): Stop | null {
  const v = read();
  return v && !v.shown && v.p === p && now - v.at >= STOP_BREAK ? v : null;
}

export function stopShown() {
  const v = read();
  if (!v) return;
  try { localStorage.setItem(KEY, JSON.stringify({ ...v, shown: 1 })); } catch { /* private */ }
}
