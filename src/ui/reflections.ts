// The reflections journal (docs/together.md T4): "Reflect" on an ayah opens a paper-like sheet with
// the reference and the date; writing saves itself. A note keeps dated paragraphs — today's is the
// one being written, earlier ones can be tapped to edit. ☰ → Reflections lists and searches them.
// The user's words are shown in the UI font, never styled like the ayah, and never put on a video.
import { account } from '../cloud/auth';
import { reference, surahTranslation, type SurahMeta } from '../data/quran';
import {
  deleteReflection, findFolded, fold, lastWritten, liveEntries, loadReflections, MAX_TEXT, reflectionAt, reflections, writeEntry,
  type Entry, type Reflection,
} from '../data/reflections';
import { h, toast } from './dom';

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const sameDay = (t: number, d = new Date()) => new Date(t).toDateString() === d.toDateString();
export const writtenOn = (t: number) => (sameDay(t) ? 'today' : `on ${shortDate.format(t)}`);

function sheet(cls: string, ...content: (Node | string | false)[]) {
  const d = h('dialog', { class: `sheet bottom ${cls}` }, ...content);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
  return d;
}
const head = (text: string, close: () => void) =>
  h('div', { class: 'sheet-head' }, h('h2', {}, text), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕'));

/** A textarea that grows with its text and saves itself (debounced, and when the sheet closes). */
function editor(value: string, placeholder: string, save: (text: string) => void) {
  const ta = h('textarea', { class: 'rf-input', rows: 3, maxlength: MAX_TEXT, placeholder, value });
  let timer = 0;
  const grow = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
  const flush = () => { clearTimeout(timer); timer = 0; save(ta.value); };
  ta.addEventListener('input', () => { grow(); clearTimeout(timer); timer = window.setTimeout(flush, 600); });
  ta.addEventListener('blur', () => { if (timer) flush(); });
  requestAnimationFrame(grow);
  return { el: ta, flush: () => { if (timer) flush(); } };
}

/** The note on s:a — read it, add today's paragraph, edit earlier ones. */
export async function openReflection(meta: SurahMeta[], s: number, a: number) {
  await loadReflections(); // never write over a stored note that is not loaded yet
  const ref = reference(meta[s - 1], a, a);
  const pending: (() => void)[] = []; // savers to run when the sheet closes
  const status = h('span', { class: 'rf-status muted small' });
  const saved = () => { status.textContent = account() ? 'Saved · synced to your account' : 'Saved on this device'; };

  const paragraph = (e: Entry) => {
    const box = h('div', { class: 'rf-entry' }, h('div', { class: 'rf-date' }, dateFmt.format(e.at)));
    const text = h('p', { class: 'rf-text', tabindex: 0, title: 'Tap to edit' }, e.text);
    const edit = () => {
      let id: string | null = e.id;
      const ed = editor(e.text, '', (t) => { id = writeEntry(s, a, id, t); saved(); });
      pending.push(ed.flush);
      text.replaceWith(ed.el);
      ed.el.focus();
    };
    text.addEventListener('click', edit);
    text.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); edit(); } });
    box.append(text);
    return box;
  };

  const note = reflectionAt(s, a);
  const entries = note ? liveEntries(note) : [];
  // Today's paragraph: continued if one was started today, else a new one.
  const todays = entries.at(-1) && sameDay(entries.at(-1)!.at) ? entries.at(-1)! : null;
  let todayId: string | null = todays?.id ?? null;
  const today = editor(todays?.text ?? '', entries.length ? 'Add to it…' : 'What does this ayah say to you?', (t) => {
    todayId = writeEntry(s, a, todayId, t);
    saved();
  });
  pending.push(today.flush);

  const translation = h('p', { class: 'rf-ayah muted small' });
  void surahTranslation(s).then((tr) => { translation.textContent = `${tr[a - 1]} (Saheeh International)`; }).catch(() => {});

  const del = h('button', { class: 'chip danger', onclick: () => {
    if (del.dataset.armed) {
      pending.length = 0;
      deleteReflection(s, a);
      d.close();
      toast('Reflection deleted');
      return;
    }
    del.dataset.armed = '1';
    del.textContent = 'Tap again to delete';
    window.setTimeout(() => { delete del.dataset.armed; del.textContent = 'Delete'; }, 3000);
  } }, 'Delete');

  const d = sheet('reflect-sheet',
    head(`✎ ${ref}`, () => d.close()),
    translation,
    h('div', { class: 'rf-body' },
      ...entries.filter((e) => e !== todays).map(paragraph),
      h('div', { class: 'rf-entry' }, h('div', { class: 'rf-date' }, `Today · ${dateFmt.format(Date.now())}`), today.el)),
    h('div', { class: 'rf-foot' },
      status,
      h('button', { class: 'chip', title: 'Copy the text for your post’s caption (it is never put on the video)', onclick: () => {
        for (const f of pending) f();
        const r = reflectionAt(s, a);
        const text = r ? liveEntries(r).map((e) => e.text.trim()).join('\n\n') : '';
        if (!text) return toast('Write something first');
        void navigator.clipboard.writeText(`${text}\n\n— ${ref}`).then(() => toast('Copied for your caption'), () => toast('Could not copy'));
      } }, 'Copy for caption'),
      entries.length ? del : false));
  status.textContent = 'Private — only you can read this';
  d.addEventListener('close', () => { for (const f of pending) f(); });
  if (!entries.length) today.el.focus();
}

/** Text around the first match (or the start), with the match marked. */
function snippet(text: string, q: string): (Node | string)[] {
  const flat = text.replace(/\s+/g, ' ').trim();
  const hit = findFolded(flat, q);
  if (!hit) return [flat.length > 140 ? `${flat.slice(0, 140)}…` : flat];
  const [i, j] = hit;
  let from = Math.max(0, i - 50);
  if (from) from = Math.min(i, flat.indexOf(' ', from) + 1 || i); // start on a word
  return [from ? '…' : '', flat.slice(from, i), h('mark', {}, flat.slice(i, j)), flat.slice(j, j + 90), j + 90 < flat.length ? '…' : ''];
}

/** ☰ → Reflections: every note, grouped by surah, with a search box. */
export async function openReflections(meta: SurahMeta[], onGo: (s: number, a: number) => void) {
  await loadReflections();
  const input = h('input', { type: 'search', class: 'search', placeholder: 'Search your reflections', 'aria-label': 'Search your reflections' });
  const list = h('div', { class: 'sheet-scroll rf-list' });

  function draw() {
    const q = fold(input.value.trim());
    const notes = reflections().sort((x, y) => x.s - y.s || x.a - y.a);
    const match = (r: Reflection) => {
      if (!q) return { r, text: liveEntries(r).at(-1)!.text };
      const hit = liveEntries(r).find((e) => fold(e.text).includes(q));
      if (hit) return { r, text: hit.text };
      const m = meta[r.s - 1];
      return fold(`${m.en} ${m.tr} ${r.s}:${r.a}`).includes(q) ? { r, text: liveEntries(r).at(-1)!.text } : null;
    };
    const found = notes.map(match).filter((x): x is { r: Reflection; text: string } => !!x);
    if (!notes.length) {
      list.replaceChildren(h('p', { class: 'muted' }, 'Long-press an ayah, then tap ✎ Reflect to write a private note. Only you can read it.'));
      return;
    }
    if (!found.length) {
      list.replaceChildren(h('p', { class: 'muted' }, `Nothing found for “${input.value.trim()}”.`));
      return;
    }
    const out: Node[] = [];
    let surah = 0;
    for (const { r, text } of found) {
      if (r.s !== surah) {
        surah = r.s;
        out.push(h('h3', { class: 'rf-group' }, `${r.s}. ${meta[r.s - 1].en}`));
      }
      out.push(h('button', { class: 'menu-item rf-row', onclick: () => { d.close(); onGo(r.s, r.a); } },
        h('span', { class: 'rf-row-head' }, h('b', {}, `${r.s}:${r.a}`), h('span', { class: 'muted small' }, dateFmt.format(lastWritten(r)))),
        h('span', { class: 'rf-snip' }, ...snippet(text, q))));
    }
    list.replaceChildren(...out);
  }
  input.addEventListener('input', draw);
  draw();
  const d = sheet('reflections-sheet', head('Reflections', () => d.close()), input, list,
    h('p', { class: 'muted small' }, 'Private: only you can read your reflections.'));
}
