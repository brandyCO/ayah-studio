// A reciter with several recordings (Murattal, Mujawwad, Mu'allim, a second recording…) is one row in the
// pickers, with its recordings as chips under it.
import { recordingLabel, type Reciter } from '../data/reciters';
import { h } from './dom';

export function recordingChips(group: Reciter[], current: number, pick: (r: Reciter) => void): HTMLElement | null {
  if (group.length < 2) return null;
  return h('div', { class: 'chips rec-chips', role: 'group', 'aria-label': 'Recording' },
    ...group.map((r) => h('button', {
      class: `chip${r.id === current ? ' on' : ''}`,
      'aria-pressed': String(r.id === current),
      onclick: (e: Event) => { e.stopPropagation(); pick(r); },
    }, recordingLabel(r))));
}

/** Letters only, lower case: "Al-Nufais" and "alnufais", "Sa'ud" and "saud" match. */
const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');

/** A search box that filters the `.rec-group` rows of `list` by name (a recording chip's label counts too). */
export function reciterSearchBox(list: HTMLElement, placeholder: string): HTMLInputElement {
  const input = h('input', { class: 'search', type: 'search', placeholder, 'aria-label': placeholder }) as HTMLInputElement;
  input.addEventListener('input', () => {
    const q = fold(input.value);
    list.querySelectorAll<HTMLElement>(':scope > .rec-group').forEach((b) => { b.hidden = !!q && !fold(b.textContent ?? '').includes(q); });
  });
  return input;
}
