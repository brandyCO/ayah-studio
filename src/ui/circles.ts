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
import { mountConstellation, type Constellation } from './constellation';
import { h, toast } from './dom';
import { lightQuality } from '../light/support';
import { lastRead, reelLook, reelReciter } from './prefs';
import { locale, t } from '../i18n';

export interface CircleContext {
  /** Pages of a juz in the mushaf (1-based page numbers). */
  juzPages(juz: number): number[];
  /** Opens the mushaf on a page. */
  goToPage(page: number): void;
}

// Built on use: the interface language is known only after start-up.
const dateFmt = { format: (d: Date) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(d) };
const members = (n: number) => t(n === 1 ? 'circ.member1' : 'circ.members', { n });
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
  h('div', { class: 'sheet-head' }, h('h2', {}, text), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕'));

const firstName = () => (account()?.name ?? '').split(' ')[0].slice(0, 40);

/** Circles need an account: offers sign-in (everything else in the app works without). */
function needAccount(body: HTMLElement, why: string): boolean {
  if (account()) return false;
  body.replaceChildren(
    h('p', {}, why),
    h('p', { class: 'muted small' }, t('circ.noAccountNote')),
    h('button', { class: 'primary', onclick: () => openAccount() }, t('circ.signIn')));
  return true;
}

/** ☰ → Khatm circles. */
export function openCircles(ctx: CircleContext) {
  const body = h('div', { class: 'circles' });
  const d = sheet('circles-sheet', head(t('circ.title'), () => d.close()), body);
  const off = onAccount(() => void draw());
  d.addEventListener('close', off);

  async function draw() {
    if (needAccount(body, t('circ.why'))) return;
    body.replaceChildren(h('p', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading your circles…'));
    let list: CircleState[];
    try {
      list = await loadCircles();
    } catch (e) {
      body.replaceChildren(h('p', { class: 'muted' }, navigator.onLine ? t('circ.loadAllFailed', { msg: errorText(e) }) : t('circ.offline')));
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
              h('span', { class: 'muted small' }, t('fam.rowSub', { n: st.members.length }))));
        }
        const done = st.parts.filter((p) => p.status === 'done').length;
        const mine = st.parts.filter((p) => p.user_id === me).map((p) => p.juz);
        return h('button', { class: 'menu-item circle-row', onclick: () => { d.close(); void openCircle(ctx, st.circle.id); } },
          miniRing(st),
          h('span', { class: 'circle-row-text' },
            h('b', {}, st.circle.name),
            h('span', { class: 'muted small' }, st.circle.status === 'complete' ? t('circ.completeRound', { round: st.circle.round })
              : `${t('circ.finishedOf30', { n: done })} · ${members(st.members.length)}${mine.length ? ` · ${t('circ.yourJuz', { list: mine.join(', ') })}` : ''}`)));
      }),
      ...(list.length ? [] : [h('p', { class: 'muted' }, t('circ.none'))]),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => createForm() }, t('circ.new')),
        h('button', { class: 'chip', onclick: () => joinForm() }, t('circ.joinCode')),
        h('button', { class: 'chip', onclick: () => void import('./family').then((m) => m.createFamilyForm((id) => { d.close(); void m.openFamily(id); })) }, t('fam.familyChip'))));
  }

  function createForm() {
    const name = h('input', { class: 'search', maxlength: 60, placeholder: t('circ.namePh'), 'aria-label': t('circ.nameAria') });
    const me = h('input', { class: 'search', maxlength: 40, value: firstName(), 'aria-label': t('fam.meAria') });
    const due = h('input', { class: 'search', type: 'date', 'aria-label': t('circ.due') });
    const go = h('button', { class: 'primary', type: 'submit' }, t('circ.create'));
    body.replaceChildren(h('form', { class: 'circle-form', onsubmit: async (e: Event) => {
      e.preventDefault();
      if (!name.value.trim() || !me.value.trim()) return toast(t('fam.bothNames'));
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
    h('label', {}, t('fam.circleName'), name),
    h('label', {}, t('circ.yourName'), me),
    h('label', {}, t('circ.due'), due),
    h('div', { class: 'row' }, h('button', { class: 'chip', type: 'button', onclick: () => void draw() }, t('common.back')), go)));
    name.focus();
  }

  function joinForm() {
    const code = h('input', { class: 'search', maxlength: 60, placeholder: t('circ.codePh'), 'aria-label': t('circ.codePh') });
    body.replaceChildren(h('form', { class: 'circle-form', onsubmit: (e: Event) => {
      e.preventDefault();
      const c = code.value.trim().split('/').pop()!.toUpperCase();
      if (!/^[A-HJ-NP-Z2-9]{8}$/.test(c)) return toast(t('circ.badCode'));
      d.close();
      location.hash = `#/join/${c}`;
    } },
    h('label', {}, t('circ.codeLabel'), code),
    h('div', { class: 'row' }, h('button', { class: 'chip', type: 'button', onclick: () => void draw() }, t('common.back')), h('button', { class: 'primary', type: 'submit' }, t('gate.continue')))));
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
  const title = h('h2', {}, t('circ.one'));
  const d = sheet('circle-sheet', h('div', { class: 'sheet-head' }, title, h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')), body);
  let st: CircleState | null = null;
  let picked: number | null = null; // juz whose actions are shown
  let celebrated = false;
  let stopWatch: (() => void) | null = null;
  // The ring as a 3D constellation behind the SVG ring (docs/light.md, L3); the SVG alone without it.
  let sky: Constellation | null = null;
  let skyGone = false;
  const quality = await lightQuality();
  d.addEventListener('close', () => { stopWatch?.(); sky?.dispose(); skyGone = true; });

  async function refresh() {
    try {
      st = await loadCircle(id);
    } catch (e) {
      body.replaceChildren(h('p', { class: 'muted' }, navigator.onLine ? t('fam.loadFailed', { msg: errorText(e) }) : t('circ.offline')));
      return;
    }
    if (!st) {
      body.replaceChildren(h('p', { class: 'muted' }, t('circ.notMember')));
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
    const ring = svg('svg', { viewBox: '0 0 300 300', class: `ring${complete ? ' complete' : ''}`, role: 'group', 'aria-label': t('circ.ringAria', { n: done }) });
    for (const p of parts) {
      const a0 = ((p.juz - 1) / 30) * Math.PI * 2 - Math.PI / 2 + 0.012;
      const a1 = (p.juz / 30) * Math.PI * 2 - Math.PI / 2 - 0.012;
      const m = p.user_id ? byId.get(p.user_id) : undefined;
      const color = m ? MEMBER_COLORS[m.color % MEMBER_COLORS.length] : 'transparent';
      const g = svg('g', { class: `seg-g ${p.status}${p.user_id === me ? ' mine' : ''}${picked === p.juz ? ' picked' : ''}${sweep.has(p.juz) ? ' sweep' : ''}`, tabindex: 0, role: 'button',
        'aria-label': `${t('circ.juz', { n: p.juz })}: ${p.status === 'free' ? t('circ.free') : `${m?.name ?? t('circ.someone')}, ${p.status === 'done' ? t('circ.finished') : t('circ.reading')}`}` });
      g.style.setProperty('--c', color);
      g.append(svg('path', { d: arcPath(150, 150, 142, 100, a0, a1), class: 'seg' }));
      const mid = (a0 + a1) / 2;
      const lr = sky ? 92 : 121; // with the stars on the ring, the labels sit just inside it
      const label = svg('text', { x: (150 + lr * Math.cos(mid)).toFixed(1), y: (150 + lr * Math.sin(mid)).toFixed(1), class: 'seg-label' });
      label.textContent = p.status === 'free' ? String(p.juz) : (m?.name ?? '?').slice(0, 1).toUpperCase();
      g.append(label);
      const pick = () => { picked = picked === p.juz ? null : p.juz; draw(); };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') pick(); });
      ring.append(g);
    }
    const centre = h('div', { class: 'ring-centre' },
      h('b', {}, complete ? t('circ.complete') : t('circ.of30', { n: done })),
      h('span', { class: 'muted small' }, complete ? dateFmt.format(new Date(circle.completed_at!)) : t('circ.finishedRound', { round: circle.round })),
      circle.due_date && !complete ? h('span', { class: 'muted small' }, t('circ.by', { date: dateFmt.format(new Date(circle.due_date)) })) : false);
    const ringBox = h('div', { class: `ring-box${sky ? ' ring-3d' : ''}` }, ...(sky ? [sky.canvas] : []), ring, centre);
    sky?.set(parts.map((p) => {
      const m = p.user_id ? byId.get(p.user_id) : undefined;
      return { juz: p.juz, status: p.status, color: m ? MEMBER_COLORS[m.color % MEMBER_COLORS.length] : '', mine: p.user_id === me, picked: picked === p.juz, sweep: sweep.has(p.juz) };
    }));

    // --- what you can do with the juz you tapped ---
    const panel = h('div', { class: 'circle-panel' });
    const part = picked ? parts.find((p) => p.juz === picked) : undefined;
    if (part) panel.append(...partActions(part, part.user_id ? byId.get(part.user_id) : undefined, me));
    else if (complete) panel.append(...completeView(members));
    else {
      const free = parts.filter((p) => p.status === 'free').length;
      panel.append(h('p', { class: 'muted small' }, free ? t('circ.tapFree') : t('circ.allTaken')));
      if (free) panel.append(h('button', { class: 'chip', onclick: () => void act(async () => { picked = await takePart(id, null); }, t('circ.yoursToast')) }, t('circ.pickForMe')));
    }

    // --- members and invite ---
    const people = h('div', { class: 'circle-members' }, ...members.map((m) => {
      const theirs = parts.filter((p) => p.user_id === m.user_id);
      const finished = theirs.filter((p) => p.status === 'done').length;
      return h('span', { class: 'member' },
        h('span', { class: 'member-dot', style: `--c:${MEMBER_COLORS[m.color % MEMBER_COLORS.length]}` }, m.name.slice(0, 1).toUpperCase()),
        h('span', {}, m.name + (m.user_id === circle.owner_id ? ' (started it)' : '')),
        theirs.length ? h('span', { class: 'muted small' }, `${t('circ.juzList', { list: ranges(theirs.map((p) => p.juz)) })}${finished ? ` · ${finished === theirs.length ? t('circ.finished') : t('circ.nFinished', { n: finished })}` : ''}`) : false);
    }));
    const invite = h('button', { class: 'primary', onclick: () => void share(st!) }, t('circ.invite'));
    const owner = circle.owner_id === me;
    const leave = h('button', { class: 'chip', onclick: () => {
      if (!leave.dataset.armed) {
        leave.dataset.armed = '1';
        leave.textContent = owner && members.length === 1 ? t('circ.tapAgainDelete') : t('circ.tapAgainLeave');
        return;
      }
      void leaveCircle(id).then(() => { d.close(); toast(t('circ.left')); void loadCircles().catch(() => {}); }, (e) => toast(errorText(e)));
    } }, t('fam.leave'));
    const del: HTMLButtonElement = h('button', { class: 'chip danger', onclick: () => {
      if (!del.dataset.armed) {
        del.dataset.armed = '1';
        del.textContent = t('circ.tapAgainDeleteAll');
        return;
      }
      void deleteCircle(id).then(() => { d.close(); toast(t('circ.deleted')); void loadCircles().catch(() => {}); }, (e) => toast(errorText(e)));
    } }, t('fam.delete'));

    body.replaceChildren(ringBox, panel,
      h('h3', { class: 'circle-sub' }, t('circ.membersTitle')), people,
      h('div', { class: 'row circle-foot' }, invite, leave, owner && members.length > 1 && del),
      h('p', { class: 'muted small' }, t('circ.inviteCode', { code: circle.invite_code })));

    // (with 3D on the way, the moment waits for the constellation)
    if (complete && !celebrated && (sky || quality === 'flat' || skyGone)) {
      celebrated = true;
      if (sky) {
        // All lights drift together into one point that opens into the date and the names.
        sky.celebrate();
        ringBox.classList.add('celebrating');
        panel.classList.add('after-bloom');
      } else ring.classList.add('glow');
    }
  }

  function partActions(p: Part, m: Member | undefined, me: string | undefined): Node[] {
    const pages = ctx.juzPages(p.juz);
    const range = t('circ.pages', { a: pages[0], b: pages[pages.length - 1] });
    const headLine = h('p', {}, h('b', {}, t('circ.juz', { n: p.juz })), ` · ${range}`);
    if (p.status === 'free') {
      return [headLine, st!.circle.status === 'open'
        ? h('button', { class: 'primary', onclick: () => void act(() => takePart(id, p.juz), t('circ.juzYours', { n: p.juz })) }, t('circ.take', { n: p.juz }))
        : h('p', { class: 'muted small' }, t('circ.roundComplete'))];
    }
    if (p.user_id !== me) {
      return [headLine, h('p', { class: 'muted' }, p.status === 'done' ? (p.done_at ? t('circ.finishedOn', { name: m?.name ?? t('circ.someone'), date: dateFmt.format(new Date(p.done_at)) }) : t('circ.finishedIt', { name: m?.name ?? t('circ.someone') })) : t('circ.readingIt', { name: m?.name ?? t('circ.someone') }))];
    }
    const read = pagesRead(p);
    const next = pages.find((pg) => !read.has(pg)) ?? pages[0];
    const readNow = h('button', { class: 'primary', onclick: () => {
      d.close();
      ctx.goToPage(next);
    } }, read.size ? t('circ.continuePage', { n: next }) : t('circ.readNow'));
    if (p.status === 'done') {
      return [headLine, h('p', { class: 'muted' }, t('circ.youFinished')),
        st!.circle.status === 'open' ? h('button', { class: 'chip', onclick: () => void act(() => setPart(id, p.juz, 'taken')) }, t('circ.notFinished')) : false].filter(Boolean) as Node[];
    }
    return [headLine,
      h('p', { class: 'muted small' }, t('circ.pagesLeft', { n: pages.length - pages.filter((pg) => read.has(pg)).length, total: pages.length })),
      h('div', { class: 'row' },
        readNow,
        h('button', { class: 'chip', onclick: () => void act(() => setPart(id, p.juz, 'done'), t('circ.accept')) }, t('circ.iFinished')),
        h('button', { class: 'chip', onclick: () => void act(() => setPart(id, p.juz, 'free'), t('circ.givenBack')) }, t('circ.giveBack')))];
  }

  function completeView(members: Member[]): Node[] {
    const c = st!.circle;
    return [
      h('p', { class: 'khatm-names' }, members.map((m) => m.name).join('  ·  ')),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => void makeKhatmReel(st!) }, t('circ.makeReel')),
        c.owner_id === account()?.id ? h('button', { class: 'chip', onclick: () => void act(() => newRound(id), t('circ.newRoundToast')) }, t('circ.newRound')) : false),
    ];
  }

  body.append(h('p', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
  if (quality !== 'flat') {
    void mountConstellation(quality, () => { sky = null; skyGone = true; draw(); }).then((c) => {
      if (!c) { skyGone = true; draw(); return; }
      if (skyGone) return c.dispose();
      sky = c;
      draw();
    });
  }
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
  const text = t('circ.inviteText', { name: st.circle.name });
  try {
    if (navigator.share) return await navigator.share({ title: st.circle.name, text, url });
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

/** Opens the editor on the closing ayat (An-Nas) with the circle and its members on the closing card. */
export async function makeKhatmReel(st: CircleState) {
  const p = newProject(114, 1, 6, reciterById(reelReciter(DEFAULT_RECITER)).id);
  applyLook(p, reelLook(), () => true);
  p.outro = true;
  const when = st.circle.completed_at ? new Date(st.circle.completed_at) : new Date();
  p.closing = { title: t('circ.reelTitle', { name: st.circle.name, date: dateFmt.format(when).replace(/ /g, '\u00a0') }).slice(0, 80), names: st.members.map((m) => m.name).slice(0, 60) };
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
    h('a', { class: 'icon-btn', href: '#/', 'aria-label': t('circ.home') }, '‹'),
    h('div', { class: 'brand' }, h('h1', {}, t('circ.one')), h('p', { class: 'muted' }, t('circ.invitation')))), body);

  async function draw() {
    if (!account()) {
      try {
        sessionStorage.setItem(PENDING, code);
      } catch {
        /* ignore */
      }
      needAccount(body, t('circ.invitedWhy'));
      return;
    }
    body.replaceChildren(h('p', { class: 'muted' }, h('span', { class: 'spinner' }), ' Loading…'));
    let info: Awaited<ReturnType<typeof previewCircle>>;
    try {
      info = await previewCircle(code);
    } catch (e) {
      body.replaceChildren(h('p', {}, navigator.onLine ? t('circ.inviteFailed', { msg: errorText(e) }) : t('circ.inviteOffline')));
      return;
    }
    if (!info) {
      body.replaceChildren(h('p', {}, t('circ.inviteInvalid')), h('a', { class: 'chip', href: '#/' }, t('circ.goToApp')));
      return;
    }
    const name = h('input', { class: 'search', maxlength: 40, value: firstName(), 'aria-label': t('fam.meAria') });
    const btn = h('button', { class: 'primary', type: 'submit' }, t('circ.join'));
    body.replaceChildren(
      h('div', { class: 'join-card' },
        h('h2', {}, info.name),
        h('p', { class: 'muted' }, `${members(info.members)} · ${t('circ.round', { n: info.round })}${info.status === 'complete' ? ` · ${t('circ.complete')}` : ''}`)),
      h('form', { class: 'circle-form', onsubmit: async (e: Event) => {
        e.preventDefault();
        if (!name.value.trim()) return toast(t('circ.writeName'));
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
      } }, h('label', {}, t('circ.yourName'), name), btn));
  }
  const off = onAccount(() => void draw());
  return () => off();
}
