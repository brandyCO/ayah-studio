// Kids space (docs/kids.md K1): a calm sky screen for children that a parent switches on from ☰.
// While it is on, the app opens here and every other address leads back (src/main.ts); the parent
// gate guards leaving, the settings and anything that leads out. No sign-in, no social features.
//   #/kids          home: the surahs to listen to
//   #/kids/{surah}  listen & repeat (src/ui/kidsListen.ts)
import { cleanName, grantPass, kidsSettings, KIDS_SURAHS, kidsSetUp, learned, NAME_MAX, setKidsOn, setKidsSettings, setLearned } from '../data/kids';
import { keepAllOffline, keptCount } from '../data/kidsAudio';
import { loadMeta } from '../data/quran';
import { h, toast } from './dom';
import { parentGate } from './kidsGate';
import { DEFAULT_RECITER, RECITERS, reciterById, reciterPickerLabel } from '../data/reciters';
import { lastRead, reelLook, reelReciter } from './prefs';

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
  // Husary (Muallim) first: his slow teaching recitation suits repeating.
  const current = kidsReciter();
  const order = [...RECITERS.filter((r) => r.id === 12), ...RECITERS.filter((r) => r.id !== 12)];
  const reciterSelect = h('select', { class: 'kids-name-input', onchange: () => { setKidsSettings({ reciter: Number(reciterSelect.value) }); paintOffline(); } },
    ...order.map((r) => h('option', { value: String(r.id), selected: r.id === current }, `${reciterPickerLabel(r)}${r.id === 12 ? ' — slow, for learning' : ''}`)));
  const offline = h('div', { class: 'kids-offline' });
  const paintOffline = () => {
    const id = kidsReciter();
    const kept = keptCount(id);
    offline.replaceChildren(h('p', { class: 'muted small' }, kept >= KIDS_SURAHS.length ? `All ${KIDS_SURAHS.length} surahs are kept on this device for ${reciterById(id).short}.`
        : `${kept} of ${KIDS_SURAHS.length} surahs are kept on this device for ${reciterById(id).short}. A surah is kept once it has played.`));
    if (kept < KIDS_SURAHS.length) offline.append(h('button', { class: 'chip', onclick: async (e: Event) => {
        const b = e.currentTarget as HTMLButtonElement;
        b.disabled = true;
        const failed = await keepAllOffline(id, (n, t) => { b.textContent = `Downloading… ${n} / ${t}`; });
        toast(failed ? `${failed} surahs could not be downloaded — try again online` : 'All short surahs are kept for offline use');
        paintOffline();
      } }, 'Keep all for offline use (about 40 MB)'));
  };
  paintOffline();
  const meta = await loadMeta();
  const learnedList = h('div', { class: 'chips' });
  const paintLearned = () => {
    const lit = learned();
    const list = KIDS_SURAHS.filter((n) => lit[n]);
    learnedList.replaceChildren(...(list.length ? list.map((n) => h('button', { class: 'chip', onclick: () => { setLearned(n, false); paintLearned(); window.dispatchEvent(new HashChangeEvent('hashchange')); } }, `${meta[n - 1].en} ✕`))
      : [h('span', { class: 'muted small' }, 'None yet. "We learned it" at the end of a surah lights its lantern.')]));
  };
  paintLearned();
  const d = h('dialog', { class: 'sheet bottom kids-parent-sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, 'For grown-ups'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => d.close() }, '✕')),
    h('label', { class: 'kids-field' }, h('span', {}, "Child's name"), name),
    h('div', { class: 'kids-field' }, h('span', {}, 'Show'), h('div', { class: 'chips' },
      toggle('English translation', k.translation, (v) => setKidsSettings({ translation: v })))),
    h('div', { class: 'kids-field' }, h('span', {}, 'Learned surahs (lit lanterns) — tap to put one out'), learnedList),
    h('label', { class: 'kids-field' }, h('span', {}, 'Reciter'), reciterSelect),
    h('div', { class: 'kids-field' }, h('span', {}, 'Offline'), offline),
    h('button', { class: 'primary wide', onclick: () => { d.close(); leave(); } }, 'Leave the Kids space'),
    h('p', { class: 'muted small' }, 'Everything in the Kids space stays on this device. It never asks to sign in and has no ads.'));
  d.addEventListener('close', () => {
    if (cleanName(name.value) !== k.name) setKidsSettings({ name: name.value });
    d.remove();
  });
  document.body.append(d);
  d.showModal();
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * "My first surah" keepsake (docs/kids.md K4), after the parent gate: an editor draft of the surah
 * (up to MAX_AYAT ayat) in a calm mood, with "{name} memorised {surah}" and the date on the closing
 * card (user text, drawn in the UI fonts by the closing-card code, inside the safe area).
 */
export async function makeKeepsake(n: number) {
  if (!(await parentGate('Make a keepsake reel'))) return;
  const [{ newProject, applyLook, MAX_AYAT }, { applyMood, MOODS }, drafts, meta] = await Promise.all([
    import('../engine/project'), import('../engine/moods'), import('../data/drafts'), loadMeta()]);
  const s = meta[n - 1];
  const p = newProject(n, 1, Math.min(s.ayahs, MAX_AYAT), kidsReciter());
  applyLook(p, reelLook(), () => true);
  applyMood(p, MOODS.find((m) => m.id === KEEPSAKE_MOOD) ?? MOODS[0]);
  p.outro = true;
  const name = kidsSettings().name;
  const when = learned()[n] ?? Date.now();
  p.closing = { title: `${name ? `${name} memorised` : 'Memorised'} ${s.en}`.slice(0, 80), names: [dateFmt.format(when)] };
  const id = drafts.newDraftId();
  const now = Date.now();
  await drafts.saveDraft({ id, project: p, created: now, updated: now });
  grantPass('#/reel/');
  location.hash = drafts.draftHash(p, id);
}
const KEEPSAKE_MOOD = 'dawn';

/** The reciter of the space: the parent's pick, else the reel reciter. */
export const kidsReciter = () => kidsSettings().reciter ?? reciterById(reelReciter(DEFAULT_RECITER)).id;

function leave() {
  setKidsOn(false);
  toast('Kids space closed');
  location.hash = lastRead();
}

const greeting = () => {
  const n = kidsSettings().name;
  return n ? `Assalamu alaikum, ${n}` : 'Assalamu alaikum';
};

/** A lantern (SVG): outline when unlit; filled with a flame when lit (shape, not only colour). */
function lantern(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path class="l-frame" d="M19 9a5 5 0 0 1 10 0"/><rect class="l-frame" x="15" y="10" width="18" height="5" rx="2"/>'
    + '<path class="l-body" d="M14 16h20l-2.5 32h-15z"/><rect class="l-frame" x="14.5" y="48" width="19" height="5" rx="2"/>'
    + '<ellipse class="l-flame" cx="24" cy="34" rx="4.5" ry="7.5"/>';
  return svg;
}

/** Remembers that a lantern was just lit, so the path can bloom it once when the child returns. */
export function bloomNext(s: number) {
  try {
    sessionStorage.setItem('kidsBloom', String(s));
  } catch {
    /* ignore */
  }
}
function takeBloom(): number {
  try {
    const v = Number(sessionStorage.getItem('kidsBloom'));
    sessionStorage.removeItem('kidsBloom');
    return v;
  } catch {
    return 0;
  }
}

const STEP = 112; // px between lanterns
/** Home of the space: a path winding down the sky through the short surahs, one lantern each. */
export async function showKids(root: HTMLElement): Promise<() => void> {
  const meta = await loadMeta();
  const lit = learned();
  const bloom = takeBloom();
  root.classList.add('kids');
  const next = KIDS_SURAHS.find((n) => !lit[n]);
  // Lantern positions: x in % of the width (a gentle wave), y in px.
  const pts = KIDS_SURAHS.map((_, i) => ({ x: 50 + 26 * Math.sin(i * 0.95), y: 64 + i * STEP }));
  const height = pts[pts.length - 1].y + 80;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], my = (a.y + b.y) / 2;
    d += ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'kids-path-line');
  svg.setAttribute('viewBox', `0 0 100 ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<path d="${d}" vector-effect="non-scaling-stroke"/>`;

  let target: HTMLElement | null = null;
  const stops = KIDS_SURAHS.map((n, i) => {
    const s = meta[n - 1];
    const { x, y } = pts[i];
    const right = x < 50; // the label sits on the side with more room
    const el = h('a', {
      class: `kids-stop${lit[n] ? ' lit' : ''}${n === next ? ' next' : ''}${n === bloom && lit[n] ? ' bloom' : ''}${right ? '' : ' label-left'}`,
      href: `#/kids/${n}`, style: `left: ${x}%; top: ${y}px`,
      'aria-label': `${s.en}, ${s.ayahs} ayat${lit[n] ? ', learned' : ''}`,
    },
    h('span', { class: 'kids-lantern' }, lantern()),
    h('span', { class: 'kids-stop-label' },
      h('strong', {}, s.en),
      h('span', { class: 'kids-stop-ar', lang: 'ar', dir: 'rtl' }, s.ar),
      h('span', { class: 'kids-stop-sub' }, `${s.ayahs} ayat`)));
    if (n === (bloom && lit[bloom] ? bloom : next)) target = el;
    return el;
  });
  root.append(
    h('header', { class: 'kids-top' }, h('h1', { class: 'kids-hello' }, greeting()), parentButton()),
    h('p', { class: 'kids-lead' }, 'Which surah shall we listen to?'),
    h('div', { class: 'kids-path', style: `height: ${height}px` }, svg, ...stops));
  if (target) requestAnimationFrame(() => (target as HTMLElement).scrollIntoView({ block: 'center' }));
  return () => {};
}
