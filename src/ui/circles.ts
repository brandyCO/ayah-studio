// Khatm circles (docs/together.md T2): ☰ → Khatm circles lists the user's circles; a circle shows a
// ring of 30 juz — free ones outlined, taken ones in the member's soft colour with their initial,
// finished ones filled. Tap a juz to take it, read it, finish it or give it back. When all 30 are
// finished the ring glows once, the names appear, and "Make the Khatm reel" opens the editor on the
// closing ayat with the circle and its members on the closing card. Invite links open #/join/{code}.
// Names are user text: shown in the UI font, never like the ayah. Calm: no scores, no ranking.
import { account, onAccount } from '../cloud/auth';
import { newDraftId, saveDraft, draftHash } from '../data/drafts';
import { DEFAULT_RECITER, reciterById } from '../data/reciters';
import { applyLook, newProject } from '../engine/project';
import {
  cachedCircles, createCircle, deleteCircle, errorText, inviteLink, joinCircle, leaveCircle, loadCircle, loadCircles, MEMBER_COLORS,
  newRound, pagesRead, previewCircle, setPart, takePart, watchCircle, type CircleState, type Member, type Part,
} from '../together/circles';
import { openAccount } from './account';
import { h, toast } from './dom';
import { lastRead, reelLook, reelReciter } from './prefs';

export interface CircleContext {
  /** Pages of a juz in the mushaf (1-based page numbers). */
  juzPages(juz: number): number[];
  /** Opens the mushaf on a page. */
  goToPage(page: number): void;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag: string, attrs: Record<string, string | number>) => {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

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

/** Circles need an account: offers sign-in (everything else in the app works without). */
function needAccount(body: HTMLElement, why: string): boolean {
  if (account()) return false;
  body.replaceChildren(
    h('p', {}, why),
    h('p', { class: 'muted small' }, 'Your own reading, bookmarks and reflections keep working without an account.'),
    h('button', { class: 'primary', onclick: () => openAccount() }, 'Sign in with Google'));
  return true;
}

/** ☰ → Khatm circles. */
export function openCircles(ctx: CircleContext) {
  const body = h('div', { class: 'circles' });
  const d = sheet('circles-sheet', head('Khatm circles', () => d.close()), body);
  const off = onAccount(() => void draw());
  d.addEventListener('close', off);

  async function draw() {
    if (needAccount(body, 'Read the whole Quran together with family or friends: everyone takes a juz, and the circle completes a Khatm.')) return;
    body.replaceChildren(h('p', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading your circles…'));
    let list: CircleState[];
    try {
      list = await loadCircles();
    } catch (e) {
      body.replaceChildren(h('p', { class: 'muted' }, navigator.onLine ? `Could not load your circles: ${errorText(e)}` : 'Circles need the internet — you are offline.'));
      return;
    }
    const me = account()?.id;
    body.replaceChildren(
      ...list.map((st) => {
        if (st.circle.kind === 'family') {
          return h('button', { class: 'menu-item circle-row', onclick: () => { d.close(); void import('./family').then((m) => m.openFamily(st.circle.id)); } },
            h('span', { class: 'fam-row-icon', 'aria-hidden': 'true' }, '🏮'),
            h('span', { class: 'circle-row-text' },
              h('b', {}, st.circle.name),
              h('span', { class: 'muted small' }, `Family circle · ${st.members.length} ${st.members.length === 1 ? 'member' : 'members'}`)));
        }
        const done = st.parts.filter((p) => p.status === 'done').length;
        const mine = st.parts.filter((p) => p.user_id === me).map((p) => p.juz);
        return h('button', { class: 'menu-item circle-row', onclick: () => { d.close(); void openCircle(ctx, st.circle.id); } },
          miniRing(st),
          h('span', { class: 'circle-row-text' },
            h('b', {}, st.circle.name),
            h('span', { class: 'muted small' }, st.circle.status === 'complete' ? `Khatm complete · round ${st.circle.round}`
              : `${done} of 30 finished · ${st.members.length} ${st.members.length === 1 ? 'member' : 'members'}${mine.length ? ` · your juz ${mine.join(', ')}` : ''}`)));
      }),
      ...(list.length ? [] : [h('p', { class: 'muted' }, 'No circles yet. Start one and share the link with your family.')]),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => createForm() }, '+ New circle'),
        h('button', { class: 'chip', onclick: () => joinForm() }, 'Join with a code'),
        h('button', { class: 'chip', onclick: () => void import('./family').then((m) => m.createFamilyForm((id) => { d.close(); void m.openFamily(id); })) }, '+ Family circle (children)')));
  }

  function createForm() {
    const name = h('input', { class: 'search', maxlength: 60, placeholder: 'e.g. Family Ramadan Khatm', 'aria-label': 'Circle name' });
    const me = h('input', { class: 'search', maxlength: 40, value: firstName(), 'aria-label': 'Your name in the circle' });
    const due = h('input', { class: 'search', type: 'date', 'aria-label': 'Finish by (optional)' });
    const go = h('button', { class: 'primary', type: 'submit' }, 'Create circle');
    body.replaceChildren(h('form', { class: 'circle-form', onsubmit: async (e: Event) => {
      e.preventDefault();
      if (!name.value.trim() || !me.value.trim()) return toast('Please fill in both names');
      go.disabled = true;
      try {
        const id = await createCircle(name.value, me.value, due.value || null);
        d.close();
        void openCircle(ctx, id, true);
      } catch (err) {
        toast(errorText(err));
        go.disabled = false;
      }
    } },
    h('label', {}, 'Name of the circle', name),
    h('label', {}, 'Your name, as the others will see it', me),
    h('label', {}, 'Finish by (optional)', due),
    h('div', { class: 'row' }, h('button', { class: 'chip', type: 'button', onclick: () => void draw() }, 'Back'), go)));
    name.focus();
  }

  function joinForm() {
    const code = h('input', { class: 'search', maxlength: 60, placeholder: 'Invite code or link', 'aria-label': 'Invite code or link' });
    body.replaceChildren(h('form', { class: 'circle-form', onsubmit: (e: Event) => {
      e.preventDefault();
      const c = code.value.trim().split('/').pop()!.toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{8}$/.test(c)) return toast('That code does not look right (8 letters and numbers)');
      d.close();
      location.hash = `#/join/${c}`;
    } },
    h('label', {}, 'Invite code (from the link you were sent)', code),
    h('div', { class: 'row' }, h('button', { class: 'chip', type: 'button', onclick: () => void draw() }, 'Back'), h('button', { class: 'primary', type: 'submit' }, 'Continue'))));
    code.focus();
  }

  void draw();
}

/** A small ring for the list (finished parts filled). */
function miniRing(st: CircleState) {
  const s = svg('svg', { viewBox: '0 0 40 40', width: 40, height: 40, class: 'mini-ring', 'aria-hidden': 'true' });
  st.parts.forEach((p) => {
    const a0 = ((p.juz - 1) / 30) * Math.PI * 2 - Math.PI / 2;
    const a1 = (p.juz / 30) * Math.PI * 2 - Math.PI / 2 - 0.06;
    s.append(svg('path', { d: arcPath(20, 20, 18, 13, a0, a1), class: `seg ${p.status}` }));
  });
  return s;
}

/** [1, 2, 4, 5, 6, 9] → "1–2, 4–6, 9". */
function ranges(nums: number[]): string {
  const out: string[] = [];
  const sorted = [...nums].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    out.push(j > i ? `${sorted[i]}–${sorted[j]}` : String(sorted[i]));
    i = j;
  }
  return out.join(', ');
}

function arcPath(cx: number, cy: number, R: number, r: number, a0: number, a1: number) {
  const p = (rad: number, a: number) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p(R, a0)} A ${R} ${R} 0 ${large} 1 ${p(R, a1)} L ${p(r, a1)} A ${r} ${r} 0 ${large} 0 ${p(r, a0)} Z`;
}

// Juz finished since this device last looked: they fill with a slow light sweep.
const seenKey = (st: CircleState) => `circleSeen:${st.circle.id}:${st.circle.round}`;
function newlyDone(st: CircleState): Set<number> {
  let seen: number[] | null = null;
  try {
    seen = JSON.parse(localStorage.getItem(seenKey(st)) ?? 'null');
  } catch {
    /* none */
  }
  const done = st.parts.filter((p) => p.status === 'done').map((p) => p.juz);
  try {
    localStorage.setItem(seenKey(st), JSON.stringify(done));
  } catch {
    /* ignore */
  }
  return seen ? new Set(done.filter((j) => !seen!.includes(j))) : new Set();
}

/** One circle: the ring of 30 juz and what you can do. */
export async function openCircle(ctx: CircleContext, id: string, justCreated = false) {
  // A family circle (joined from an invite link) opens its own sheet.
  const known = cachedCircles().find((c) => c.circle.id === id) ?? (await loadCircle(id).catch(() => null));
  if (known?.circle.kind === 'family') {
    return void import('./family').then((m) => m.openFamily(id));
  }
  const body = h('div', { class: 'circle-view' });
  const title = h('h2', {}, 'Khatm circle');
  const d = sheet('circle-sheet', h('div', { class: 'sheet-head' }, title, h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => d.close() }, '✕')), body);
  let st: CircleState | null = null;
  let picked: number | null = null; // juz whose actions are shown
  let celebrated = false;
  let stopWatch: (() => void) | null = null;
  d.addEventListener('close', () => stopWatch?.());

  async function refresh() {
    try {
      st = await loadCircle(id);
    } catch (e) {
      body.replaceChildren(h('p', { class: 'muted' }, navigator.onLine ? `Could not load the circle: ${errorText(e)}` : 'Circles need the internet — you are offline.'));
      return;
    }
    if (!st) {
      body.replaceChildren(h('p', { class: 'muted' }, 'You are no longer in this circle.'));
      return;
    }
    draw();
  }
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      toast(errorText(e));
    }
    await refresh();
  };

  function draw() {
    if (!st) return;
    const { circle, members, parts } = st;
    const me = account()?.id;
    const byId = new Map(members.map((m) => [m.user_id, m]));
    title.textContent = circle.name;
    const done = parts.filter((p) => p.status === 'done').length;
    const complete = circle.status === 'complete';
    const sweep = newlyDone(st);
    if (complete && !celebrated) picked = null; // the moment: names and the reel, not one juz

    // --- the ring ---
    const ring = svg('svg', { viewBox: '0 0 300 300', class: `ring${complete ? ' complete' : ''}`, role: 'group', 'aria-label': `${done} of 30 juz finished` });
    for (const p of parts) {
      const a0 = ((p.juz - 1) / 30) * Math.PI * 2 - Math.PI / 2 + 0.012;
      const a1 = (p.juz / 30) * Math.PI * 2 - Math.PI / 2 - 0.012;
      const m = p.user_id ? byId.get(p.user_id) : undefined;
      const color = m ? MEMBER_COLORS[m.color % MEMBER_COLORS.length] : 'transparent';
      const g = svg('g', { class: `seg-g ${p.status}${p.user_id === me ? ' mine' : ''}${picked === p.juz ? ' picked' : ''}${sweep.has(p.juz) ? ' sweep' : ''}`, tabindex: 0, role: 'button',
        'aria-label': `Juz ${p.juz}: ${p.status === 'free' ? 'free' : `${m?.name ?? 'someone'}, ${p.status === 'done' ? 'finished' : 'reading'}`}` });
      g.style.setProperty('--c', color);
      g.append(svg('path', { d: arcPath(150, 150, 142, 100, a0, a1), class: 'seg' }));
      const mid = (a0 + a1) / 2;
      const label = svg('text', { x: (150 + 121 * Math.cos(mid)).toFixed(1), y: (150 + 121 * Math.sin(mid)).toFixed(1), class: 'seg-label' });
      label.textContent = p.status === 'free' ? String(p.juz) : (m?.name ?? '?').slice(0, 1).toUpperCase();
      g.append(label);
      const pick = () => { picked = picked === p.juz ? null : p.juz; draw(); };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') pick(); });
      ring.append(g);
    }
    const centre = h('div', { class: 'ring-centre' },
      h('b', {}, complete ? 'Khatm complete' : `${done} of 30`),
      h('span', { class: 'muted small' }, complete ? dateFmt.format(new Date(circle.completed_at!)) : `finished · round ${circle.round}`),
      circle.due_date && !complete ? h('span', { class: 'muted small' }, `by ${dateFmt.format(new Date(circle.due_date))}`) : false);
    const ringBox = h('div', { class: 'ring-box' }, ring, centre);

    // --- what you can do with the juz you tapped ---
    const panel = h('div', { class: 'circle-panel' });
    const part = picked ? parts.find((p) => p.juz === picked) : undefined;
    if (part) panel.append(...partActions(part, part.user_id ? byId.get(part.user_id) : undefined, me));
    else if (complete) panel.append(...completeView(members));
    else {
      const free = parts.filter((p) => p.status === 'free').length;
      panel.append(h('p', { class: 'muted small' }, free ? 'Tap a free juz to take it.' : 'Every juz is taken.'));
      if (free) panel.append(h('button', { class: 'chip', onclick: () => void act(async () => { picked = await takePart(id, null); }, 'A juz is yours — may Allah make it easy') }, 'Pick one for me'));
    }

    // --- members and invite ---
    const people = h('div', { class: 'circle-members' }, ...members.map((m) => {
      const theirs = parts.filter((p) => p.user_id === m.user_id);
      const finished = theirs.filter((p) => p.status === 'done').length;
      return h('span', { class: 'member' },
        h('span', { class: 'member-dot', style: `--c:${MEMBER_COLORS[m.color % MEMBER_COLORS.length]}` }, m.name.slice(0, 1).toUpperCase()),
        h('span', {}, m.name + (m.user_id === circle.owner_id ? ' (started it)' : '')),
        theirs.length ? h('span', { class: 'muted small' }, `juz ${ranges(theirs.map((p) => p.juz))}${finished ? ` · ${finished === theirs.length ? 'finished' : `${finished} finished`}` : ''}`) : false);
    }));
    const invite = h('button', { class: 'primary', onclick: () => void share(st!) }, 'Invite');
    const owner = circle.owner_id === me;
    const leave = h('button', { class: 'chip', onclick: () => {
      if (!leave.dataset.armed) {
        leave.dataset.armed = '1';
        leave.textContent = owner && members.length === 1 ? 'Tap again: delete the circle' : 'Tap again to leave';
        return;
      }
      void leaveCircle(id).then(() => { d.close(); toast('You left the circle'); void loadCircles().catch(() => {}); }, (e) => toast(errorText(e)));
    } }, 'Leave circle');
    const del: HTMLButtonElement = h('button', { class: 'chip danger', onclick: () => {
      if (!del.dataset.armed) {
        del.dataset.armed = '1';
        del.textContent = 'Tap again: delete for everyone';
        return;
      }
      void deleteCircle(id).then(() => { d.close(); toast('Circle deleted'); void loadCircles().catch(() => {}); }, (e) => toast(errorText(e)));
    } }, 'Delete circle');

    body.replaceChildren(ringBox, panel,
      h('h3', { class: 'circle-sub' }, 'Members'), people,
      h('div', { class: 'row circle-foot' }, invite, leave, owner && members.length > 1 && del),
      h('p', { class: 'muted small' }, `Invite code ${circle.invite_code}`));

    if (complete && !celebrated) {
      celebrated = true;
      ring.classList.add('glow');
    }
  }

  function partActions(p: Part, m: Member | undefined, me: string | undefined): Node[] {
    const pages = ctx.juzPages(p.juz);
    const range = `pages ${pages[0]}–${pages[pages.length - 1]}`;
    const headLine = h('p', {}, h('b', {}, `Juz ${p.juz}`), ` · ${range}`);
    if (p.status === 'free') {
      return [headLine, st!.circle.status === 'open'
        ? h('button', { class: 'primary', onclick: () => void act(() => takePart(id, p.juz), `Juz ${p.juz} is yours — may Allah make it easy`) }, `Take juz ${p.juz}`)
        : h('p', { class: 'muted small' }, 'This round is complete.')];
    }
    if (p.user_id !== me) {
      return [headLine, h('p', { class: 'muted' }, `${m?.name ?? 'Someone'} ${p.status === 'done' ? `finished it${p.done_at ? ` on ${dateFmt.format(new Date(p.done_at))}` : ''}` : 'is reading it'}.`)];
    }
    const read = pagesRead(p);
    const next = pages.find((pg) => !read.has(pg)) ?? pages[0];
    const readNow = h('button', { class: 'primary', onclick: () => {
      d.close();
      ctx.goToPage(next);
    } }, read.size ? `Continue · page ${next}` : 'Read now');
    if (p.status === 'done') {
      return [headLine, h('p', { class: 'muted' }, 'You finished this juz. May Allah accept it.'),
        st!.circle.status === 'open' ? h('button', { class: 'chip', onclick: () => void act(() => setPart(id, p.juz, 'taken')) }, 'Not finished yet') : false].filter(Boolean) as Node[];
    }
    return [headLine,
      h('p', { class: 'muted small' }, `${pages.length - pages.filter((pg) => read.has(pg)).length} of ${pages.length} pages left (read on this device)`),
      h('div', { class: 'row' },
        readNow,
        h('button', { class: 'chip', onclick: () => void act(() => setPart(id, p.juz, 'done'), 'May Allah accept it') }, 'I finished it'),
        h('button', { class: 'chip', onclick: () => void act(() => setPart(id, p.juz, 'free'), 'Juz given back') }, 'Give it back'))];
  }

  function completeView(members: Member[]): Node[] {
    const c = st!.circle;
    return [
      h('p', { class: 'khatm-names' }, members.map((m) => m.name).join('  ·  ')),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => void makeKhatmReel(st!) }, '🎬 Make the Khatm reel'),
        c.owner_id === account()?.id ? h('button', { class: 'chip', onclick: () => void act(() => newRound(id), 'A new round has begun') }, 'Start another round') : false),
    ];
  }

  body.append(h('p', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
  await refresh();
  if (justCreated && st) void share(st);
  try {
    stopWatch = await watchCircle(id, () => void refresh());
    if (!d.open) stopWatch();
  } catch {
    /* live updates unavailable: the sheet still refreshes after each action */
  }
}

async function share(st: CircleState) {
  const url = inviteLink(st.circle.invite_code);
  const text = `Join our Khatm circle “${st.circle.name}” on Ayah Studio — take a juz and we read the whole Quran together.`;
  try {
    if (navigator.share) return await navigator.share({ title: st.circle.name, text, url });
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

/** Opens the editor on the closing ayat (An-Nas) with the circle and its members on the closing card. */
export async function makeKhatmReel(st: CircleState) {
  const p = newProject(114, 1, 6, reciterById(reelReciter(DEFAULT_RECITER)).id);
  applyLook(p, reelLook(), () => true);
  p.outro = true;
  const when = st.circle.completed_at ? new Date(st.circle.completed_at) : new Date();
  p.closing = { title: `Khatm complete · ${st.circle.name} · ${dateFmt.format(when).replace(/ /g, '\u00a0')}`.slice(0, 80), names: st.members.map((m) => m.name).slice(0, 60) };
  const id = newDraftId();
  const now = Date.now();
  await saveDraft({ id, project: p, created: now, updated: now });
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((x) => x.close());
  location.hash = draftHash(p, id);
}

// --- #/join/{code}: an invite link ---
const PENDING = 'pendingJoin';
/** After a web sign-in (which returns to the app's address without the hash), resume the join. */
export function resumePendingJoin() {
  let code: string | null = null;
  try {
    code = sessionStorage.getItem(PENDING);
  } catch {
    /* ignore */
  }
  if (!code) return;
  onAccount((a) => {
    if (!a) return;
    try {
      sessionStorage.removeItem(PENDING);
    } catch {
      /* ignore */
    }
    if (!location.hash.startsWith('#/join/')) location.hash = `#/join/${code}`;
  });
}

export async function showJoin(root: HTMLElement, code: string): Promise<() => void> {
  code = code.toUpperCase();
  const body = h('div', { class: 'join' });
  root.append(h('header', { class: 'topbar' },
    h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Home' }, '‹'),
    h('div', { class: 'brand' }, h('h1', {}, 'Khatm circle'), h('p', { class: 'muted' }, 'An invitation'))), body);

  async function draw() {
    if (!account()) {
      try {
        sessionStorage.setItem(PENDING, code);
      } catch {
        /* ignore */
      }
      needAccount(body, 'You have been invited to a Khatm circle: everyone takes a juz and together the circle reads the whole Quran. Sign in to see the circle and join.');
      return;
    }
    body.replaceChildren(h('p', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
    let info: Awaited<ReturnType<typeof previewCircle>>;
    try {
      info = await previewCircle(code);
    } catch (e) {
      body.replaceChildren(h('p', {}, navigator.onLine ? `Could not open the invitation: ${errorText(e)}` : 'You are offline — open the link again when you are back online.'));
      return;
    }
    if (!info) {
      body.replaceChildren(h('p', {}, 'This invite link is not valid any more. Ask for a new one.'), h('a', { class: 'chip', href: '#/' }, 'Go to the app'));
      return;
    }
    const name = h('input', { class: 'search', maxlength: 40, value: firstName(), 'aria-label': 'Your name in the circle' });
    const btn = h('button', { class: 'primary', type: 'submit' }, 'Join the circle');
    body.replaceChildren(
      h('div', { class: 'join-card' },
        h('h2', {}, info.name),
        h('p', { class: 'muted' }, `${info.members} ${info.members === 1 ? 'member' : 'members'} · round ${info.round}${info.status === 'complete' ? ' · Khatm complete' : ''}`)),
      h('form', { class: 'circle-form', onsubmit: async (e: Event) => {
        e.preventDefault();
        if (!name.value.trim()) return toast('Please write your name');
        btn.disabled = true;
        try {
          const id = await joinCircle(code, name.value);
          try {
            sessionStorage.setItem('openCircle', id);
          } catch {
            /* ignore */
          }
          location.hash = lastRead(); // the mushaf opens on the circle
        } catch (err) {
          toast(errorText(err));
          btn.disabled = false;
        }
      } }, h('label', {}, 'Your name, as the others will see it', name), btn));
  }
  const off = onAccount(() => void draw());
  return () => off();
}
