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
