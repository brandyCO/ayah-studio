// Drafts list: reels saved while being edited, newest first. Tap to keep editing; ✕ deletes.
import { deleteDraft, draftHash, listDrafts, type Draft } from '../data/drafts';
import { loadMeta, reference } from '../data/quran';
import { reciterById } from '../data/reciters';
import { h, toast } from './dom';

function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}

export async function showDrafts(root: HTMLElement): Promise<() => void> {
  const [meta, drafts] = await Promise.all([loadMeta(), listDrafts().catch(() => [] as Draft[])]);
  const urls: string[] = [];
  const grid = h('div', { class: 'draft-grid' });

  const card = (d: Draft) => {
    const s = meta[d.project.surah - 1];
    const thumb = d.thumb ? URL.createObjectURL(d.thumb) : '';
    if (thumb) urls.push(thumb);
    const el = h('div', { class: 'draft' },
      h('a', { class: 'draft-open', href: draftHash(d.project, d.id) },
        h('span', { class: 'draft-thumb', style: thumb ? `background-image:url("${thumb}")` : '' }),
        h('strong', {}, s ? reference(s, d.project.from, d.project.to) : `${d.project.surah}:${d.project.from}`),
        h('span', { class: 'muted small' }, `${reciterById(d.project.reciterId).short} · ${ago(d.updated)}`)),
      h('button', {
        class: 'bg-del draft-del', 'aria-label': 'Delete draft', title: 'Delete draft',
        onclick: async () => {
          if (!confirm('Delete this draft? This cannot be undone.')) return;
          await deleteDraft(d.id).catch((e) => toast(`Could not delete: ${e instanceof Error ? e.message : e}`));
          el.remove();
          if (!grid.childElementCount) grid.replaceWith(empty());
        },
      }, '✕'));
    return el;
  };
  const empty = () => h('p', { class: 'muted empty' }, 'No drafts yet. Open a surah, long-press an ayah and tap “Turn into reel” — your reel is saved here as you edit it.');

  grid.append(...drafts.map(card));
  root.append(
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'All surahs' }, '‹'),
      h('div', { class: 'brand' }, h('h1', {}, 'Drafts'), h('p', { class: 'muted' }, 'Reels you started, saved on this device'))),
    drafts.length ? grid : empty(),
  );
  return () => urls.forEach((u) => URL.revokeObjectURL(u));
}
