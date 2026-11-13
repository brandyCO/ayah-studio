// Ready offline (owner-approved backlog 2026-11-13): which surahs of a reciter are on this phone, from a favourite's
// download (`favKept`, reciterDownload.ts) or a whole-surah file kept after listening (`listenKept`, listenCache.ts).
// Read straight from localStorage, so the surah list and pickers can mark them without loading either module.
const parse = (k: string): Record<string, unknown> => {
  try { const v = JSON.parse(localStorage.getItem(k) ?? '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
};

export function offlineSurahs(id: number): Set<number> {
  const out = new Set<number>((parse('favKept')[id] as { s?: number[] } | undefined)?.s ?? []);
  for (const v of Object.values(parse('listenKept'))) {
    const tag = Array.isArray(v) ? v[2] : null;
    if (typeof tag !== 'string') continue;
    const [r, s] = tag.split(':').map(Number);
    if (r === id && s) out.add(s);
  }
  return out;
}

/** The reciter the Listen tab plays (shared with the reel default), or null before one was picked. */
export function listenReciterId(): number | null {
  try { const v = Number(localStorage.getItem('reelReciter')); return v > 0 ? v : null; } catch { return null; }
}
