// Reel drafts (like CapCut's projects): every edited reel is saved on this device as it is edited,
// so an unfinished reel can be reopened later from the drafts list.
import type { Project } from '../engine/project';
import { tx } from './db';

export interface Draft {
  id: string;
  project: Project;
  created: number;
  updated: number;
  thumb?: Blob; // small JPEG of the preview
}

export const newDraftId = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 12);

export const listDrafts = () => tx<Draft[]>('drafts', 'readonly', (s) => s.getAll()).then((d) => d.sort((a, b) => b.updated - a.updated));
export const getDraft = (id: string) => tx<Draft | undefined>('drafts', 'readonly', (s) => s.get(id));
const changed = () => window.dispatchEvent(new Event('drafts-changed'));
export const saveDraft = (d: Draft) => tx('drafts', 'readwrite', (s) => s.put(d)).then(changed);
export const deleteDraft = (id: string) => {
  markDraftDeleted(id);
  return tx('drafts', 'readwrite', (s) => s.delete(id)).then(changed);
};

// Deleted drafts are remembered (id → when) for a while, so the deletion reaches the user's other
// devices when syncing (src/cloud/sync.ts).
export function deletedDrafts(): Record<string, number> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem('draftsDeleted') ?? '{}');
    return v && typeof v === 'object' ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}
function markDraftDeleted(id: string) {
  const old = Date.now() - 120 * 86_400_000;
  const list = Object.fromEntries(Object.entries(deletedDrafts()).filter(([, at]) => at > old));
  try {
    localStorage.setItem('draftsDeleted', JSON.stringify({ ...list, [id]: Date.now() }));
  } catch {
    /* ignore */
  }
}

/** The editor's address for a draft. */
export const draftHash = (p: Pick<Project, 'surah' | 'from' | 'to'>, id: string) => `#/reel/${p.surah}/${p.from}${p.to > p.from ? `-${p.to}` : ''}/${id}`;
