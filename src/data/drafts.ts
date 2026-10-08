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
export const saveDraft = (d: Draft) => tx('drafts', 'readwrite', (s) => s.put(d)).then(() => undefined);
export const deleteDraft = (id: string) => tx('drafts', 'readwrite', (s) => s.delete(id)).then(() => undefined);

/** The editor's address for a draft. */
export const draftHash = (p: Pick<Project, 'surah' | 'from' | 'to'>, id: string) => `#/reel/${p.surah}/${p.from}${p.to > p.from ? `-${p.to}` : ''}/${id}`;
