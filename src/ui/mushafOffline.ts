// "Read without internet": the offer to download the whole mushaf on the web and iPhone (owner decision
// 2026-11-09), asked once on the mushaf, and its row in Me → Settings → Reading with the progress.
// The Android app has every page inside it, so neither shows there.
import { Capacitor } from '@capacitor/core';
import { allowMushafDownload, countMushafKept, mushafKept, mushafProgress, MUSHAF_MB } from '../data/mushafDownload';
import { t } from '../i18n';
import { h } from './dom';

const ASKED = 'mushafAsked';

/** On the mushaf, once: a small sheet offering the download. */
export function offerMushafDownload() {
  if (Capacitor.isNativePlatform() || mushafKept() || mushafProgress().allowed) return;
  try { if (localStorage.getItem(ASKED)) return; } catch { return; }
  window.setTimeout(() => {
    if (document.querySelector('dialog[open]') || !document.querySelector('.mushaf-view')) return;
    try { localStorage.setItem(ASKED, '1'); } catch { /* ignore */ }
    const d = h('dialog', { class: 'sheet bottom fav-sheet' },
      h('div', { class: 'sheet-head' }, h('h2', {}, t('mo.title')),
        h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
      h('p', { class: 'muted' }, t('mo.offer', { size: MUSHAF_MB })),
      h('div', { class: 'menu' },
        h('button', { class: 'primary brand-btn', onclick: () => { allowMushafDownload(); d.close(); } }, t('mo.download', { size: MUSHAF_MB })),
        h('button', { class: 'chip', onclick: () => d.close() }, t('mo.later'))));
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    document.body.append(d);
    d.showModal();
  }, 6000);
}

/** Me → Settings → Reading: the whole mushaf on this device, with a live progress bar. */
export function mushafOfflineRow(): Node | false {
  if (Capacitor.isNativePlatform()) return false;
  const box = h('div', { class: 'mushaf-offline' });
  const paint = () => {
    if (!box.isConnected && box.childNodes.length) { window.removeEventListener('mushaf-download', paint); return; }
    const p = mushafProgress();
    const bar = p.kept > 0 && !p.done
      ? h('div', { class: 'progress-row' }, h('progress', { max: p.total, value: p.kept }), h('span', { class: 'muted small' }, `${p.kept} / ${p.total}`))
      : false;
    box.replaceChildren(
      h('b', { class: 'set-label' }, t('mo.title')),
      h('p', { class: 'muted small' }, p.done ? t('mo.done')
        : p.allowed ? t(p.running ? 'mo.running' : 'mo.waiting')
        : t('mo.help', { size: MUSHAF_MB })),
      ...(bar ? [bar] : []),
      ...(!p.done && !p.allowed ? [h('button', { class: 'chip', onclick: () => allowMushafDownload() }, t('mo.download', { size: MUSHAF_MB }))] : []));
  };
  paint();
  window.addEventListener('mushaf-download', paint);
  void countMushafKept();
  return box;
}
