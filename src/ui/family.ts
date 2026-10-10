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
  addChild, canManage, createFamily, deleteNote, kidsLink, leaveNote, loadFamily, markNoteSeen, removeChild,
  renameChild, setChildSurah, setKidsLink, type Child, type FamilyNote, type FamilyState,
} from '../together/family';
import { h, toast } from './dom';
import { surahName, t } from '../i18n';

function sheet(cls: string, ...content: (Node | string | false)[]) {
  const d = h('dialog', { class: `sheet bottom ${cls}` }, ...content);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
  return d;
}
const head = (text: string, close: () => void) =>
  h('div', { class: 'sheet-head' }, h('h2', {}, text), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕'));
const sep = ' · ';
const status = (s: 'learning' | 'learned') => (s === 'learned' ? t('fam.stLearned') : t('fam.stLearning'));
/** Note presets in the interface language (the member's own words once sent). */
const presets = () => [t('fam.p1'), t('fam.p2'), t('fam.p3'), t('fam.p4')];
const firstName = () => (account()?.name ?? '').split(' ')[0].slice(0, 40);

/** The form for a new family circle (from ☰ → Khatm circles). */
export function createFamilyForm(onCreated: (id: string) => void) {
  const name = h('input', { class: 'search', maxLength: 60, placeholder: t('fam.namePh'), 'aria-label': t('fam.nameAria') });
  const me = h('input', { class: 'search', maxLength: 40, value: firstName(), placeholder: t('fam.mePh'), 'aria-label': t('fam.meAria') });
  const btn = h('button', { class: 'primary', type: 'submit' }, t('fam.create'));
  const d = sheet('circles-sheet', head(t('fam.new'), () => d.close()),
    h('p', { class: 'muted small' }, t('fam.intro')),
    h('form', { class: 'circle-form', onsubmit: async (e: Event) => {
      e.preventDefault();
      if (!name.value.trim() || !me.value.trim()) return toast(t('fam.bothNames'));
      btn.disabled = true;
      try {
        const id = await createFamily(name.value, me.value);
        d.close();
        onCreated(id);
      } catch (err) {
        toast(errorText(err));
        btn.disabled = false;
      }
    } }, h('label', {}, t('fam.circleName'), name), h('label', {}, t('fam.yourName'), me), btn));
}

/** Small lanterns for the 38 surahs of a child (lit = learned, ringed = learning). */
function surahDots(st: FamilyState, ch: Child, meta: SurahMeta[]) {
  const by = new Map(st.parts.filter((p) => p.child_id === ch.id).map((p) => [p.surah, p.status]));
  const learnedNames = KIDS_SURAHS.filter((s) => by.get(s) === 'learned').map((s) => surahName(meta[s - 1]));
  const learning = KIDS_SURAHS.filter((s) => by.get(s) === 'learning').map((s) => surahName(meta[s - 1]));
  return h('div', { class: 'fam-surahs' },
    h('div', { class: 'fam-dots', role: 'img', 'aria-label': `${learnedNames.length ? t('fam.learned', { list: learnedNames.join(sep) }) : t('fam.noneLearned')}${learning.length ? `. ${t('fam.learningNow', { list: learning.join(sep) })}` : ''}` },
      ...KIDS_SURAHS.map((s) => h('span', { class: `fam-dot ${by.get(s) ?? ''}`, title: `${surahName(meta[s - 1])}${by.get(s) ? ` · ${status(by.get(s)!)}` : ''}` }))),
    learning.length ? h('p', { class: 'small' }, t('fam.learningNow', { list: learning.join(sep) })) : false,
    learnedNames.length ? h('p', { class: 'muted small' }, t('fam.learned', { list: learnedNames.join(sep) })) : false);
}

export async function openFamily(id: string) {
  const meta = await loadMeta();
  const body = h('div', { class: 'circles fam' }, h('p', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
  const title = h('h2', {}, t('kids.family'));
  const d = sheet('circles-sheet', h('div', { class: 'sheet-head' }, title, h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')), body);
  let st: FamilyState | null = null;

  async function refresh() {
    try {
      st = await loadFamily(id);
    } catch (e) {
      body.replaceChildren(h('p', { class: 'muted' }, navigator.onLine ? t('fam.loadFailed', { msg: errorText(e) }) : t('fam.offline')));
      return;
    }
    if (!st) {
      body.replaceChildren(h('p', {}, t('fam.gone')));
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
          link?.child === ch.id ? h('span', { class: 'muted small' }, t('fam.onThisDevice')) : false),
        surahDots(s, ch, meta),
        ...s.notes.filter((n) => n.child_id === ch.id).slice(0, 3).map((n) => noteRow(n, ch)),
        h('div', { class: 'row' },
          h('button', { class: 'chip', onclick: () => composeNote(ch) }, t('fam.leaveNote')),
          canManage(s, ch) ? h('button', { class: 'chip', onclick: () => manageChild(ch) }, t('fam.learningBtn')) : false))),
      ...(s.children.length ? [] : [h('p', { class: 'muted' }, t('fam.noChildren'))]),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => addChildForm() }, t('fam.addChild')),
        h('button', { class: 'chip', onclick: () => void share() }, t('fam.invite'))),
      h('p', { class: 'muted small' }, t('fam.linkHint')),
      h('div', { class: 'row' },
        h('button', { class: 'chip danger', onclick: () => {
          if (!confirm(s.circle.owner_id === me ? t('fam.confirmDelete') : t('fam.confirmLeave'))) return;
          void (s.circle.owner_id === me ? deleteCircle(id) : leaveCircle(id)).then(() => { d.close(); toast(t('common.done')); void loadCircles().catch(() => {}); }).catch((e) => toast(errorText(e)));
        } }, s.circle.owner_id === me ? t('fam.delete') : t('fam.leave'))));
  }

  function noteRow(n: FamilyNote, ch: Child) {
    const s = st!;
    const mine = n.from_id === account()?.id;
    return h('div', { class: 'fam-note' },
      h('p', { class: 'fam-note-body' }, `“${n.body}”`),
      h('p', { class: 'muted small' }, `— ${n.from_name}${n.surah ? ` · ${t('fam.forSurah', { surah: surahName(meta[n.surah - 1]) })}` : ''}${n.seen_at ? ` · ${t('fam.seen')}` : ''}`,
        mine || canManage(s, ch) ? h('button', { class: 'link-btn', onclick: () => void act(() => deleteNote(n.id), t('fam.noteDeleted')) }, ` ${t('fam.deleteNote')}`) : false));
  }

  function addChildForm() {
    const name = h('input', { class: 'search', maxLength: 24, placeholder: t('fam.childPh'), 'aria-label': t('kids.childName') });
    const f = sheet('circles-sheet', head(t('fam.addChildTitle'), () => f.close()),
      h('p', { class: 'muted small' }, t('fam.childNote')),
      h('form', { class: 'circle-form', onsubmit: (e: Event) => {
        e.preventDefault();
        if (!name.value.trim()) return;
        f.close();
        void act(() => addChild(id, name.value), t('fam.childAdded'));
      } }, name, h('button', { class: 'primary', type: 'submit' }, t('fam.add'))));
  }

  function manageChild(ch: Child) {
    const s = st!;
    const by = new Map(s.parts.filter((p) => p.child_id === ch.id).map((p) => [p.surah, p.status]));
    const pick = h('select', { class: 'search', 'aria-label': t('fam.surah') }, ...KIDS_SURAHS.map((n) => h('option', { value: String(n) }, `${surahName(meta[n - 1])}${by.get(n) ? ` (${status(by.get(n)!)})` : ''}`)));
    const name = h('input', { class: 'search', maxLength: 24, value: ch.name, 'aria-label': t('kids.childName') });
    const f = sheet('circles-sheet', head(ch.name, () => f.close()),
      h('label', {}, t('fam.surah'), pick),
      h('div', { class: 'row' },
        h('button', { class: 'chip', onclick: () => { f.close(); void act(() => setChildSurah(ch.id, Number(pick.value), 'learning'), t('fam.markedLearning')); } }, t('fam.learningNowBtn')),
        h('button', { class: 'chip', onclick: () => { f.close(); void act(() => setChildSurah(ch.id, Number(pick.value), 'learned'), t('fam.lanternLit')); } }, t('fam.learnedBtn')),
        h('button', { class: 'chip', onclick: () => { f.close(); void act(() => setChildSurah(ch.id, Number(pick.value), 'none')); } }, t('fam.clear'))),
      h('label', {}, t('fam.name'), name),
      h('div', { class: 'row' },
        h('button', { class: 'chip', onclick: () => { f.close(); void act(() => renameChild(ch.id, name.value), t('fam.renamed')); } }, t('fam.rename')),
        h('button', { class: 'chip danger', onclick: () => {
          if (!confirm(t('fam.confirmRemove', { name: ch.name }))) return;
          f.close();
          if (kidsLink()?.child === ch.id) setKidsLink(null);
          void act(() => removeChild(ch.id), t('fam.removed'));
        } }, t('fam.remove'))));
  }

  function composeNote(ch: Child) {
    const text = h('textarea', { class: 'search fam-note-input', maxLength: 140, rows: 3, placeholder: t('fam.notePh', { name: ch.name }), 'aria-label': t('fam.note') });
    const count = h('span', { class: 'muted small' }, '0 / 140');
    text.addEventListener('input', () => { count.textContent = `${text.value.length} / 140`; });
    const surah = h('select', { class: 'search', 'aria-label': t('fam.whenAria') },
      h('option', { value: '' }, t('fam.nextTime')), ...KIDS_SURAHS.map((n) => h('option', { value: String(n) }, t('fam.whenLearned', { surah: surahName(meta[n - 1]) }))));
    const f = sheet('circles-sheet', head(t('fam.noteFor', { name: ch.name }), () => f.close()),
      h('div', { class: 'chips' }, ...presets().map((p) => h('button', { class: 'chip', onclick: () => { text.value = p; count.textContent = `${p.length} / 140`; } }, p))),
      text, count, surah,
      h('p', { class: 'muted small' }, t('fam.noteInfo')),
      h('button', { class: 'primary', onclick: () => {
        if (!text.value.trim()) return toast(t('fam.writeNote'));
        f.close();
        void act(() => leaveNote(ch.id, surah.value ? Number(surah.value) : null, text.value), t('fam.noteLeft'));
      } }, t('fam.leaveTheNote')));
  }

  async function share() {
    const s = st!;
    const url = inviteLink(s.circle.invite_code);
    const text = t('fam.inviteText', { name: s.circle.name });
    try {
      if (navigator.share) return await navigator.share({ title: s.circle.name, text, url });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast(t('fam.linkCopied'));
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
      box.replaceChildren(h('p', { class: 'muted small' }, t('fam.signInHint')));
      return;
    }
    const l = kidsLink();
    if (l) {
      box.replaceChildren(h('p', { class: 'small' }, t('fam.linked', { child: l.childName, circle: l.circleName })),
        h('button', { class: 'chip', onclick: () => { setKidsLink(null); void paint(); } }, t('fam.unlink')));
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
      box.replaceChildren(h('p', { class: 'muted small' }, navigator.onLine ? t('fam.loadAllFailed', { msg: errorText(e) }) : t('fam.linkOffline')));
      return;
    }
    if (!options.length) {
      box.replaceChildren(h('p', { class: 'muted small' }, t('fam.noneToLink')));
      return;
    }
    box.replaceChildren(h('p', { class: 'muted small' }, t('fam.whichChild')),
      h('div', { class: 'chips' }, ...options.map((o) => h('button', { class: 'chip', onclick: () => { setKidsLink(o); toast(t('fam.linkedToast', { child: o.childName })); void paint(); } }, `${o.childName} · ${o.circleName}`))));
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
    h('p', { class: 'kids-note-to' }, t('fam.duaFor', { name: childName })),
    h('p', { class: 'kids-note-body' }, `“${n.body}”`),
    h('p', { class: 'kids-note-from' }, t('fam.from', { name: n.from_name })),
    h('button', { class: 'kids-btn lamp', onclick: () => d.close() }, t('fam.ameen')));
  d.addEventListener('close', () => {
    d.remove();
    void markNoteSeen(n.id).catch((e) => console.warn('Note not marked as seen', e));
    showNotes(notes.slice(1), childName);
  });
  document.body.append(d);
  d.showModal();
}
