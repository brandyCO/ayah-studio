// Kids space (docs/kids.md K1): a calm sky screen for children that a parent switches on from ☰.
// While it is on, the app opens here and every other address leads back (src/main.ts); the parent
// gate guards leaving, the settings and anything that leads out. No sign-in, no social features.
//   #/kids          home: the surahs to listen to
//   #/kids/{surah}  listen & repeat (src/ui/kidsListen.ts)
import { cleanName, kidsSettings, KIDS_SURAHS, kidsSetUp, learned, NAME_MAX, setKidsOn, setKidsSettings } from '../data/kids';
import { loadMeta } from '../data/quran';
import { h, toast } from './dom';
import { parentGate } from './kidsGate';
import { lastRead } from './prefs';

const lockIcon = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<rect x="5" y="11" width="14" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
  return s;
};

/** The parent button in the corner of every Kids screen. */
export const parentButton = () =>
  h('button', { class: 'kids-parent', 'aria-label': 'For grown-ups', onclick: () => void openParent() }, lockIcon());

/** ☰ → Kids space: the first time a short setup for the parent, then the space opens. */
export function openKidsSpace() {
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((x) => x.close());
  if (kidsSetUp()) return enter();
  const name = h('input', { class: 'kids-name-input', type: 'text', maxLength: NAME_MAX, placeholder: "Child's name (optional)", autocomplete: 'off', 'aria-label': "Child's name" });
  const d = h('dialog', { class: 'sheet bottom kids-setup' },
    h('div', { class: 'sheet-head' }, h('h2', {}, 'Kids space'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => d.close() }, '✕')),
    h('p', {}, 'A calm place for children to listen to and repeat the short surahs. Big text, few buttons, no sign-in, works offline.'),
    h('p', { class: 'muted small' }, 'Leaving the Kids space, its settings and anything that leads out of it ask a grown-up to answer a small sum.'),
    h('label', { class: 'kids-field' }, h('span', {}, "Your child's name — used in greetings and on their keepsake reel. Stays on this device."), name),
    h('button', { class: 'primary wide', onclick: () => { setKidsSettings({ name: name.value }); d.close(); enter(); } }, 'Open the Kids space'));
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}

function enter() {
  setKidsOn(true);
  location.hash = '#/kids';
}

/** The parent sheet (after the gate): name, reading options, leaving the space. */
export async function openParent() {
  if (!(await parentGate())) return;
  const k = kidsSettings();
  const name = h('input', { class: 'kids-name-input', type: 'text', maxLength: NAME_MAX, value: k.name, autocomplete: 'off', 'aria-label': "Child's name" });
  const toggle = (label: string, on: boolean, set: (v: boolean) => void) => {
    const b = h('button', { class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: () => {
      on = !on;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      set(on);
    } }, label);
    return b;
  };
  const d = h('dialog', { class: 'sheet bottom kids-parent-sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, 'For grown-ups'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => d.close() }, '✕')),
    h('label', { class: 'kids-field' }, h('span', {}, "Child's name"), name),
    h('div', { class: 'kids-field' }, h('span', {}, 'Show'), h('div', { class: 'chips' },
      toggle('English translation', k.translation, (v) => setKidsSettings({ translation: v })))),
    h('button', { class: 'primary wide', onclick: () => { d.close(); leave(); } }, 'Leave the Kids space'),
    h('p', { class: 'muted small' }, 'Everything in the Kids space stays on this device. It never asks to sign in and has no ads.'));
  d.addEventListener('close', () => {
    if (cleanName(name.value) !== k.name) setKidsSettings({ name: name.value });
    d.remove();
  });
  document.body.append(d);
  d.showModal();
}

function leave() {
  setKidsOn(false);
  toast('Kids space closed');
  location.hash = lastRead();
}

const greeting = () => {
  const n = kidsSettings().name;
  return n ? `Assalamu alaikum, ${n}` : 'Assalamu alaikum';
};

export async function showKids(root: HTMLElement): Promise<() => void> {
  const meta = await loadMeta();
  const lit = learned();
  root.classList.add('kids');
  const tiles = KIDS_SURAHS.map((n) => {
    const s = meta[n - 1];
    return h('a', { class: `kids-tile${lit[n] ? ' lit' : ''}`, href: `#/kids/${n}`, 'aria-label': `${s.en}, ${s.ayahs} ayat${lit[n] ? ', learned' : ''}` },
      h('span', { class: 'kids-tile-ar', lang: 'ar', dir: 'rtl' }, s.ar),
      h('strong', {}, s.en),
      h('span', { class: 'kids-tile-sub' }, `${s.tr} · ${s.ayahs} ayat`));
  });
  root.append(
    h('header', { class: 'kids-top' }, h('h1', { class: 'kids-hello' }, greeting()), parentButton()),
    h('p', { class: 'kids-lead' }, 'Which surah shall we listen to?'),
    h('div', { class: 'kids-tiles' }, ...tiles));
  return () => {};
}
