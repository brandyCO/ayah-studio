// Family circles (docs/kids.md K6), outside the Kids space: ☰ → Khatm circles → "New family circle".
// A family circle lists its children (first names only, no child accounts); each child's short surahs
// show as small lanterns (learned = lit, learning = ringed; shape as well as colour). The parent who
// added a child (or the owner) says which surah the child is learning; any member can leave a short
// du'a note, which the Kids space shows on the parent's device when the lantern lights. Calm: no
// scores, no comparison between children. Names and notes are user text in the UI font.
import { account } from '../cloud/auth';
import { KIDS_SURAHS } from '../data/kids';
import { loadMeta, type SurahMeta } from '../data/quran';
import { errorText, inviteLink, leaveCircle, deleteCircle, loadCircles } from '../together/circles';
import {
  addChild, canManage, createFamily, deleteNote, kidsLink, leaveNote, loadFamily, markNoteSeen, NOTE_PRESETS, removeChild,
  renameChild, setChildSurah, setKidsLink, type Child, type FamilyNote, type FamilyState,
} from '../together/family';
import { h, toast } from './dom';

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
const firstName = () => (account()?.name ?? '').split(' ')[0].slice(0, 40);

/** The form for a new family circle (from ☰ → Khatm circles). */
export function createFamilyForm(onCreated: (id: string) => void) {
  const name = h('input', { class: 'search', maxLength: 60, placeholder: 'e.g. Our family', 'aria-label': 'Family circle name' });
  const me = h('input', { class: 'search', maxLength: 40, value: firstName(), placeholder: 'e.g. Mum, Grandma', 'aria-label': 'Your name in the circle' });
  const btn = h('button', { class: 'primary', type: 'submit' }, 'Create');
  const d = sheet('circles-sheet', head('New family circle', () => d.close()),
    h('p', { class: 'muted small' }, 'Children learning the short surahs, encouraged by the family. Add each child by first name (children have no accounts); grandparents and relatives join with the invite link and can leave a short du\'a note for a child.'),
    h('form', { class: 'circle-form', onsubmit: async (e: Event) => {
      e.preventDefault();
      if (!name.value.trim() || !me.value.trim()) return toast('Please fill in both names');
      btn.disabled = true;
      try {
        const id = await createFamily(name.value, me.value);
        d.close();
        onCreated(id);
      } catch (err) {
        toast(errorText(err));
        btn.disabled = false;
      }
    } }, h('label', {}, 'Name of the circle', name), h('label', {}, 'Your name, as the family will see it', me), btn));
}

/** Small lanterns for the 38 surahs of a child (lit = learned, ringed = learning). */
function surahDots(st: FamilyState, ch: Child, meta: SurahMeta[]) {
  const by = new Map(st.parts.filter((p) => p.child_id === ch.id).map((p) => [p.surah, p.status]));
  const learnedNames = KIDS_SURAHS.filter((s) => by.get(s) === 'learned').map((s) => meta[s - 1].en);
  const learning = KIDS_SURAHS.filter((s) => by.get(s) === 'learning').map((s) => meta[s - 1].en);
  return h('div', { class: 'fam-surahs' },
    h('div', { class: 'fam-dots', role: 'img', 'aria-label': `${learnedNames.length ? `Learned: ${learnedNames.join(', ')}` : 'No surah learned yet'}${learning.length ? `. Learning: ${learning.join(', ')}` : ''}` },
      ...KIDS_SURAHS.map((s) => h('span', { class: `fam-dot ${by.get(s) ?? ''}`, title: `${meta[s - 1].en}${by.get(s) ? ` · ${by.get(s)}` : ''}` }))),
    learning.length ? h('p', { class: 'small' }, `Learning now: ${learning.join(', ')}`) : false,
    learnedNames.length ? h('p', { class: 'muted small' }, `Learned: ${learnedNames.join(', ')}`) : false);
}

export async function openFamily(id: string) {
  const meta = await loadMeta();
  const body = h('div', { class: 'circles fam' }, h('p', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
  const title = h('h2', {}, 'Family circle');
  const d = sheet('circles-sheet', h('div', { class: 'sheet-head' }, title, h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => d.close() }, '✕')), body);
  let st: FamilyState | null = null;

  async function refresh() {
    try {
      st = await loadFamily(id);
    } catch (e) {
      body.replaceChildren(h('p', { class: 'muted' }, navigator.onLine ? `Could not load the circle: ${errorText(e)}` : 'Family circles need the internet — you are offline.'));
      return;
    }
    if (!st) {
      body.replaceChildren(h('p', {}, 'This circle is not available any more.'));
      return;
    }
    draw();
  }

  async function act(fn: () => Promise<unknown>, ok?: string) {
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      toast(errorText(e));
    }
    await refresh();
  }

  function draw() {
    const s = st!;
    const me = account()?.id;
    title.textContent = s.circle.name;
    const link = kidsLink();
    body.replaceChildren(
      h('p', { class: 'muted small' }, `${s.members.map((m) => m.name).join(' · ')}`),
      ...s.children.map((ch) => h('section', { class: 'fam-child' },
        h('div', { class: 'fam-child-head' },
          h('b', {}, ch.name),
          link?.child === ch.id ? h('span', { class: 'muted small' }, ' · Kids space on this device') : false),
        surahDots(s, ch, meta),
        ...s.notes.filter((n) => n.child_id === ch.id).slice(0, 3).map((n) => noteRow(n, ch)),
        h('div', { class: 'row' },
          h('button', { class: 'chip', onclick: () => composeNote(ch) }, '✎ Leave a du\'a note'),
          canManage(s, ch) ? h('button', { class: 'chip', onclick: () => manageChild(ch) }, 'Learning…') : false))),
      ...(s.children.length ? [] : [h('p', { class: 'muted' }, 'No children yet. Add your child by first name, then share the invite link with the family.')]),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => addChildForm() }, '+ Add a child'),
        h('button', { class: 'chip', onclick: () => void share() }, 'Invite family')),
      h('p', { class: 'muted small' }, 'In the Kids space on this device: For grown-ups → Family circle, to link it to a child. Lit lanterns then appear here, and notes appear for the child.'),
      h('div', { class: 'row' },
        h('button', { class: 'chip danger', onclick: () => {
          if (!confirm(s.circle.owner_id === me ? 'Delete this family circle for everyone?' : 'Leave this family circle?')) return;
          void (s.circle.owner_id === me ? deleteCircle(id) : leaveCircle(id)).then(() => { d.close(); toast('Done'); void loadCircles().catch(() => {}); }).catch((e) => toast(errorText(e)));
        } }, s.circle.owner_id === me ? 'Delete circle' : 'Leave circle')));
  }

  function noteRow(n: FamilyNote, ch: Child) {
    const s = st!;
    const mine = n.from_id === account()?.id;
    return h('div', { class: 'fam-note' },
      h('p', { class: 'fam-note-body' }, `“${n.body}”`),
      h('p', { class: 'muted small' }, `— ${n.from_name}${n.surah ? ` · for ${meta[n.surah - 1].en}` : ''}${n.seen_at ? ' · seen' : ''}`,
        mine || canManage(s, ch) ? h('button', { class: 'link-btn', onclick: () => void act(() => deleteNote(n.id), 'Note deleted') }, ' delete') : false));
  }

  function addChildForm() {
    const name = h('input', { class: 'search', maxLength: 24, placeholder: 'First name or nickname', 'aria-label': "Child's name" });
    const f = sheet('circles-sheet', head('Add a child', () => f.close()),
      h('p', { class: 'muted small' }, 'Only a first name or nickname; the family in this circle will see it.'),
      h('form', { class: 'circle-form', onsubmit: (e: Event) => {
        e.preventDefault();
        if (!name.value.trim()) return;
        f.close();
        void act(() => addChild(id, name.value), 'Child added');
      } }, name, h('button', { class: 'primary', type: 'submit' }, 'Add')));
  }

  function manageChild(ch: Child) {
    const s = st!;
    const by = new Map(s.parts.filter((p) => p.child_id === ch.id).map((p) => [p.surah, p.status]));
    const pick = h('select', { class: 'search', 'aria-label': 'Surah' }, ...KIDS_SURAHS.map((n) => h('option', { value: String(n) }, `${meta[n - 1].en}${by.get(n) ? ` (${by.get(n)})` : ''}`)));
    const name = h('input', { class: 'search', maxLength: 24, value: ch.name, 'aria-label': "Child's name" });
    const f = sheet('circles-sheet', head(ch.name, () => f.close()),
      h('label', {}, 'Surah', pick),
      h('div', { class: 'row' },
        h('button', { class: 'chip', onclick: () => { f.close(); void act(() => setChildSurah(ch.id, Number(pick.value), 'learning'), 'Marked as learning'); } }, 'Learning now'),
        h('button', { class: 'chip', onclick: () => { f.close(); void act(() => setChildSurah(ch.id, Number(pick.value), 'learned'), 'Lantern lit'); } }, 'Learned'),
        h('button', { class: 'chip', onclick: () => { f.close(); void act(() => setChildSurah(ch.id, Number(pick.value), 'none')); } }, 'Clear')),
      h('label', {}, 'Name', name),
      h('div', { class: 'row' },
        h('button', { class: 'chip', onclick: () => { f.close(); void act(() => renameChild(ch.id, name.value), 'Renamed'); } }, 'Rename'),
        h('button', { class: 'chip danger', onclick: () => {
          if (!confirm(`Remove ${ch.name} from the circle? Their lanterns and notes here are deleted.`)) return;
          f.close();
          if (kidsLink()?.child === ch.id) setKidsLink(null);
          void act(() => removeChild(ch.id), 'Removed');
        } }, 'Remove')));
  }

  function composeNote(ch: Child) {
    const text = h('textarea', { class: 'search fam-note-input', maxLength: 140, rows: 3, placeholder: `A short du'a for ${ch.name}`, 'aria-label': 'Note' });
    const count = h('span', { class: 'muted small' }, '0 / 140');
    text.addEventListener('input', () => { count.textContent = `${text.value.length} / 140`; });
    const surah = h('select', { class: 'search', 'aria-label': 'Show it when this surah is learned' },
      h('option', { value: '' }, 'Show it next time'), ...KIDS_SURAHS.map((n) => h('option', { value: String(n) }, `When ${meta[n - 1].en} is learned`)));
    const f = sheet('circles-sheet', head(`A note for ${ch.name}`, () => f.close()),
      h('div', { class: 'chips' }, ...NOTE_PRESETS.map((p) => h('button', { class: 'chip', onclick: () => { text.value = p; count.textContent = `${p.length} / 140`; } }, p))),
      text, count, surah,
      h('p', { class: 'muted small' }, 'Shown to the child in the Kids space as your own words, with your name. Up to 3 notes a day.'),
      h('button', { class: 'primary', onclick: () => {
        if (!text.value.trim()) return toast('Please write a note');
        f.close();
        void act(() => leaveNote(ch.id, surah.value ? Number(surah.value) : null, text.value), 'Note left — jazakAllahu khayran');
      } }, 'Leave the note'));
  }

  async function share() {
    const s = st!;
    const url = inviteLink(s.circle.invite_code);
    const text = `Join our family circle “${s.circle.name}” on Ayah Studio — follow the children's short surahs and leave them a du'a.`;
    try {
      if (navigator.share) return await navigator.share({ title: s.circle.name, text, url });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast('Invite link copied');
    } catch {
      toast(url);
    }
  }

  await refresh();
}

// --- inside the Kids space (after the parent gate) ---

/** Parent sheet section: link this device's Kids space to a child of a family circle. */
export function familyLinkSection(): HTMLElement {
  const box = h('div', { class: 'kids-offline' });
  async function paint() {
    if (!account()) {
      box.replaceChildren(h('p', { class: 'muted small' }, 'To share lit lanterns with family and receive their du\'a notes: leave the Kids space, sign in (☰ → Account) and create a family circle (☰ → Khatm circles). The Kids space itself never asks to sign in.'));
      return;
    }
    const l = kidsLink();
    if (l) {
      box.replaceChildren(h('p', { class: 'small' }, `Linked to ${l.childName} in “${l.circleName}”.`),
        h('button', { class: 'chip', onclick: () => { setKidsLink(null); void paint(); } }, 'Unlink'));
      return;
    }
    box.replaceChildren(h('p', { class: 'muted small' }, h('span', { class: 'spinner' }), ' Loading your family circles…'));
    let options: { circle: string; circleName: string; child: string; childName: string }[] = [];
    try {
      const circles = (await loadCircles()).filter((c) => c.circle.kind === 'family');
      for (const c of circles) {
        const st = await loadFamily(c.circle.id);
        for (const ch of st?.children ?? []) if (st && canManage(st, ch)) options.push({ circle: c.circle.id, circleName: c.circle.name, child: ch.id, childName: ch.name });
      }
    } catch (e) {
      box.replaceChildren(h('p', { class: 'muted small' }, navigator.onLine ? `Could not load family circles: ${errorText(e)}` : 'Linking needs the internet.'));
      return;
    }
    if (!options.length) {
      box.replaceChildren(h('p', { class: 'muted small' }, 'No family circle with a child you added yet. Create one outside the Kids space: ☰ → Khatm circles → New family circle.'));
      return;
    }
    box.replaceChildren(h('p', { class: 'muted small' }, 'Which child uses the Kids space on this device?'),
      h('div', { class: 'chips' }, ...options.map((o) => h('button', { class: 'chip', onclick: () => { setKidsLink(o); toast(`Linked to ${o.childName}`); void paint(); } }, `${o.childName} · ${o.circleName}`))));
  }
  void paint();
  return box;
}

/** Shows unseen du'a notes one at a time on a soft card over the lantern path; "Ameen" marks it seen. */
export function showNotes(notes: FamilyNote[], childName: string) {
  const n = notes[0];
  if (!n) return;
  const d = h('dialog', { class: 'kids-note' },
    h('div', { class: 'kids-note-glow', 'aria-hidden': 'true' }),
    h('p', { class: 'kids-note-to' }, `A du'a for ${childName}`),
    h('p', { class: 'kids-note-body' }, `“${n.body}”`),
    h('p', { class: 'kids-note-from' }, `— from ${n.from_name}`),
    h('button', { class: 'kids-btn lamp', onclick: () => d.close() }, 'Ameen'));
  d.addEventListener('close', () => {
    d.remove();
    void markNoteSeen(n.id).catch((e) => console.warn('Note not marked as seen', e));
    showNotes(notes.slice(1), childName);
  });
  document.body.append(d);
  d.showModal();
}
