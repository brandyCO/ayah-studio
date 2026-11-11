// Copy selected ayat as text (selection bar → Copy): the Arabic with its reference, the Arabic with
// the chosen translation, or the translation only. The Quran text is copied exactly as bundled,
// ayah numbers included (rule 1); nothing is shortened. The last choice is remembered per device.
import { addShare } from '../data/journey';
import { reference, surahText, surahTranslation, type SurahMeta } from '../data/quran';
import { currentTranslation, translationInfo } from '../data/translations';
import { t } from '../i18n';
import { h, haptic, toast } from './dom';
import { icon } from './icons';

export type CopyKind = 'ar' | 'ar+tr' | 'tr';
const PREF = 'copyWith';

const lastKind = (): CopyKind => {
  try {
    const v = localStorage.getItem(PREF);
    return v === 'ar+tr' || v === 'tr' ? v : 'ar';
  } catch { return 'ar'; }
};

/** The text for ayat lo..hi of a surah. */
export async function ayatText(meta: SurahMeta, lo: number, hi: number, kind: CopyKind): Promise<string> {
  const id = currentTranslation();
  const [ar, tr] = await Promise.all([
    kind === 'tr' ? null : surahText(meta.n),
    kind === 'ar' ? null : surahTranslation(meta.n, id),
  ]);
  const many = hi > lo;
  const parts: string[] = [];
  for (let a = lo; a <= hi; a++) {
    const lines: string[] = [];
    if (ar) lines.push(ar[a - 1]);
    if (tr) lines.push(many ? `(${a}) ${tr[a - 1]}` : tr[a - 1]);
    parts.push(lines.join('\n'));
  }
  // Arabic only: one ayah a line; with a translation: a blank line between ayat.
  const body = parts.join(kind === 'ar' ? '\n' : '\n\n');
  const ref = `${meta.ar} · ${reference(meta, lo, hi)}`;
  const credit = tr ? `\n${translationInfo(id).translator}` : '';
  return `${body}\n\n— ${ref}${credit}`;
}

/** Clipboard with a fallback for WebViews without the async clipboard. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { readonly: '', style: 'position:fixed;top:0;left:0;opacity:0;pointer-events:none' }) as HTMLTextAreaElement;
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

/** The sheet: three ways to copy, the last one used marked. */
export function openCopy(meta: SurahMeta, lo: number, hi: number) {
  const last = lastKind();
  const translator = translationInfo(currentTranslation()).translator;
  const close = () => d.close();
  const option = (kind: CopyKind, title: string, sub: string) =>
    h('button', {
      class: `menu-item create-item${kind === last ? ' on' : ''}`, 'data-kind': kind,
      onclick: async () => {
        haptic();
        try { localStorage.setItem(PREF, kind); } catch { /* ignore */ }
        let ok = false;
        try { ok = await copyText(await ayatText(meta, lo, hi, kind)); } catch { /* data not loaded */ }
        toast(t(ok ? 'copy.done' : 'copy.failed'));
        if (ok) { addShare(); close(); }
      },
    }, h('span', { class: 'create-txt' }, h('b', {}, title), h('span', { class: 'muted small' }, sub)),
    kind === last ? icon('check', 20) : null);
  const d = h('dialog', { class: 'sheet bottom copy-sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, t('copy.title', { ref: reference(meta, lo, hi) })),
      h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕')),
    h('div', { class: 'menu' },
      option('ar', t('copy.ar'), t('copy.arSub')),
      option('ar+tr', t('copy.arTr'), translator),
      option('tr', t('copy.tr'), translator)));
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
}
