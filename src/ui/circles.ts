// Family circles (docs/kids.md K6): ☰ → Family circles lists the family circles the user is in,
// creates one, or joins one with a code. Invite links open #/join/{code}. (Khatm circles were
// removed by the owner on 2026-10-28; a Khatm circle that is still in the database is not shown.)
// Names are user text: shown in the UI font, never like the ayah.
import { account, onAccount } from '../cloud/auth';
import { errorText, joinCircle, loadCircles, previewCircle, type CircleState } from '../together/circles';
import { openAccount } from './account';
import { h, toast } from './dom';
import { lastRead } from './prefs';
import { t } from '../i18n';

const members = (n: number) => t(n === 1 ? 'circ.member1' : 'circ.members', { n });

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

/** ☰ → Family circles. */
export function openCircles() {
  const body = h('div', { class: 'circles' });
  const d = sheet('circles-sheet', head(t('menu.circles'), () => d.close()), body);
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
    list = list.filter((st) => st.circle.kind === 'family');
    body.replaceChildren(
      ...list.map((st) =>
        h('button', { class: 'menu-item circle-row', onclick: () => { d.close(); void import('./family').then((m) => m.openFamily(st.circle.id)); } },
          h('span', { class: 'fam-row-icon', 'aria-hidden': 'true' }, '🏮'),
          h('span', { class: 'circle-row-text' },
            h('b', {}, st.circle.name),
            h('span', { class: 'muted small' }, t('fam.rowSub', { n: st.members.length }))))),
      ...(list.length ? [] : [h('p', { class: 'muted' }, t('circ.none'))]),
      h('div', { class: 'row' },
        h('button', { class: 'primary', onclick: () => void import('./family').then((m) => m.createFamilyForm((id) => { d.close(); void m.openFamily(id); })) }, t('fam.familyChip')),
        h('button', { class: 'chip', onclick: () => joinForm() }, t('circ.joinCode'))));
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

/** Opens a circle the user is in (after joining from an invite link). */
export async function openCircle(id: string) {
  const st = (await loadCircles().catch(() => [] as CircleState[])).find((x) => x.circle.id === id);
  if (st?.circle.kind === 'family') return void import('./family').then((m) => m.openFamily(id));
  openCircles();
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
        h('p', { class: 'muted' }, members(info.members))),
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
