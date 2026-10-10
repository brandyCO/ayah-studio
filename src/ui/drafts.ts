// Drafts list: reels saved while being edited, newest first. Tap to keep editing; ✕ deletes.
import { deleteDraft, draftHash, listDrafts, type Draft } from '../data/drafts';
import { loadMeta, reference } from '../data/quran';
import { reciterById } from '../data/reciters';
import { h, toast } from './dom';
import { locale, t } from '../i18n';

function ago(at: number) {
  const s = (Date.now() - at) / 1000;
  if (s < 60) return t('dr.justNow');
  if (s < 3600) return t('dr.minAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return t('dr.hAgo', { n: Math.floor(s / 3600) });
  if (s < 7 * 86400) return t('dr.dAgo', { n: Math.floor(s / 86400) });
  return new Date(at).toLocaleDateString(locale());
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
        class: 'bg-del draft-del', 'aria-label': t('dr.delete'), title: t('dr.delete'),
        onclick: async () => {
          if (!confirm(t('dr.confirmDelete'))) return;
          await deleteDraft(d.id).catch((e) => toast(t('dr.deleteFailed', { msg: e instanceof Error ? e.message : String(e) })));
          el.remove();
          if (!grid.childElementCount) grid.replaceWith(empty());
        },
      }, '✕'));
    return el;
  };
  const empty = () => h('p', { class: 'muted empty empty-glow' }, t('dr.empty'));

  grid.append(...drafts.map(card));
  root.append(
    h('header', { class: 'topbar' },
      h('a', { class: 'icon-btn', href: '#/', 'aria-label': t('mushaf.allSurahs') }, '‹'),
      h('div', { class: 'brand' }, h('h1', {}, t('list.drafts')), h('p', { class: 'muted' }, t('dr.sub')))),
    drafts.length ? grid : empty(),
  );
  return () => urls.forEach((u) => URL.revokeObjectURL(u));
}
