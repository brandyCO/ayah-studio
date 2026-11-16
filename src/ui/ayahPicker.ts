// "Choose ayat" (front-end review F16): a small picker (surah, from, to) that goes straight into the
// studio, instead of a hint to go and long-press in the mushaf. Selecting in the mushaf stays one tap away.
import { loadMeta } from '../data/quran';
import { MAX_AYAT } from '../engine/limits';
import './picker.css';
import { surahName, t } from '../i18n';
import { h, haptic } from './dom';
import { goMushaf } from './tabs';

export async function openAyahPicker(start = 1) {
  const meta = await loadMeta();
  let s = start;
  const surah = h('select', { class: 'search', 'aria-label': t('ap.surah') },
    ...meta.map((m) => h('option', { value: String(m.n), selected: m.n === s }, `${m.n}. ${surahName(m)}`))) as HTMLSelectElement;
  const num = (label: string) => h('input', { class: 'search ap-num', type: 'number', min: '1', inputmode: 'numeric', 'aria-label': label }) as HTMLInputElement;
  const from = num(t('ap.from'));
  const to = num(t('ap.to'));
  const note = h('p', { class: 'muted small ap-note' });
  const go = h('button', { class: 'primary brand-btn ap-go', type: 'submit' });
  const fix = (which?: 'from' | 'to') => {
    const n = meta[s - 1].ayahs;
    let a = Math.min(n, Math.max(1, Math.round(Number(from.value) || 1)));
    let b = Math.min(n, Math.max(1, Math.round(Number(to.value) || a)));
    if (which === 'from' && b < a) b = a;
    if (which === 'to' && b < a) a = b;
    if (b - a + 1 > MAX_AYAT) { if (which === 'to') a = b - MAX_AYAT + 1; else b = a + MAX_AYAT - 1; }
    from.max = to.max = String(n);
    from.value = String(a); to.value = String(b);
    note.textContent = t('ap.note', { n: MAX_AYAT, of: n });
    go.textContent = t('ap.go', { n: b - a + 1 });
  };
  surah.onchange = () => { s = Number(surah.value); from.value = '1'; to.value = '1'; fix(); };
  from.onchange = () => fix('from');
  to.onchange = () => fix('to');
  from.value = '1'; to.value = '1';
  fix();
  const d = h('dialog', { class: 'sheet bottom ap-sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, t('create.pick')),
      h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
    h('form', { class: 'ap-form', onsubmit: (e: Event) => {
      e.preventDefault();
      fix();
      haptic(10);
      d.close();
      location.hash = `#/reel/${s}/${from.value}-${to.value}`;
    } },
      h('label', { class: 'ap-row' }, h('span', { class: 'muted small' }, t('ap.surah')), surah),
      h('div', { class: 'ap-pair' },
        h('label', { class: 'ap-row' }, h('span', { class: 'muted small' }, t('ap.from')), from),
        h('label', { class: 'ap-row' }, h('span', { class: 'muted small' }, t('ap.to')), to)),
      note,
      go),
    h('button', { class: 'chip ap-mushaf', type: 'button', onclick: () => { d.close(); goMushaf('pick'); } }, t('ap.inMushaf'))) as HTMLDialogElement;
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
}
