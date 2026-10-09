// Parent gate (docs/kids.md, open question 1): a sum of two numbers between 11 and 19, typed in.
// Guards leaving the Kids space, its settings and anything that leads out of it. A wrong answer
// gives a new sum. Resolves true only for the right answer.
import { h } from './dom';

const rnd = () => 11 + Math.floor(Math.random() * 9);

export function parentGate(purpose = 'For grown-ups'): Promise<boolean> {
  return new Promise((resolve) => {
    let a = rnd();
    let b = rnd();
    let ok = false;
    const q = h('p', { class: 'gate-q', 'aria-live': 'polite' });
    const note = h('p', { class: 'gate-note muted small', 'aria-live': 'polite' });
    const input = h('input', { class: 'gate-input', type: 'text', inputMode: 'numeric', autocomplete: 'off', 'aria-label': 'Answer', maxLength: 3 });
    const ask = () => { q.textContent = `${a} + ${b} = ?`; input.value = ''; };
    const d = h('dialog', { class: 'sheet gate' },
      h('h2', {}, purpose),
      h('p', { class: 'muted small' }, 'Please ask a parent to answer:'),
      q,
      h('form', { class: 'gate-form', onsubmit: (e: Event) => {
        e.preventDefault();
        if (Number(input.value.trim()) === a + b) {
          ok = true;
          d.close();
          return;
        }
        a = rnd();
        b = rnd();
        note.textContent = 'Not quite — here is another one.';
        ask();
        input.focus();
      } }, input, h('button', { class: 'primary', type: 'submit' }, 'Continue')),
      note,
      h('button', { class: 'link-btn', onclick: () => d.close() }, 'Cancel'));
    ask();
    d.addEventListener('close', () => { d.remove(); resolve(ok); });
    document.body.append(d);
    d.showModal();
    input.focus();
  });
}
