// "Read without internet": the offer to download the whole mushaf on the web and iPhone (owner decision
// 2026-11-09), asked once on the mushaf, and its row in Me → Settings → Reading with the progress.
// The Android app has every page inside it, so neither shows there.
import { Capacitor } from '@capacitor/core';
import { allowMushafDownload, countMushafKept, mushafKept, mushafProgress, MUSHAF_MB } from '../data/mushafDownload';
import { t } from '../i18n';
import { h, listenWhile } from './dom';

const ASKED = 'mushafAsked';

/** On the mushaf, once (F25): never a sheet over a tap. After the reader has stayed on a few pages
 *  this visit, a quiet card above the tab bar offers the download; it leaves by itself after 14 s. */
let pagesSeen = 0;
export function offerMushafDownload() {
  if (Capacitor.isNativePlatform() || mushafKept() || mushafProgress().allowed) return;
  try { if (localStorage.getItem(ASKED)) return; } catch { return; }
  if (++pagesSeen < 4 || document.querySelector('dialog[open], .mo-card') || !document.querySelector('.mushaf-view')) return;
  try { localStorage.setItem(ASKED, '1'); } catch { /* ignore */ }
  let gone = 0;
  const close = () => { clearTimeout(gone); card.classList.remove('show'); setTimeout(() => card.remove(), 320); };
  const card = h('div', { class: 'mo-card', role: 'status' },
    h('div', { class: 'mo-text' }, h('b', {}, t('mo.title')), h('span', { class: 'muted small' }, t('mo.short', { size: MUSHAF_MB }))),
    h('button', { class: 'chip primary brand-btn', onclick: () => { allowMushafDownload(); close(); } }, t('mo.get')),
    h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕'));
  document.body.append(card);
  requestAnimationFrame(() => card.classList.add('show'));
  gone = window.setTimeout(close, 14000);
  window.addEventListener('hashchange', close, { once: true });
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
  listenWhile(box, window, 'mushaf-download', paint);
  void countMushafKept();
  return box;
}
