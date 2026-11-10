// Bedtime pact on Me (under the day's lanterns) and its invite page #/bp/{code}. Each member has a row
// of seven crescents, one lit for each night they said the bedtime du'a; nobody is ordered or scored.
// Over → a chest, opened once each (src/together/pacts.ts).
import { account } from '../cloud/auth';
import { akt } from '../i18n/adhkar';
import { rt } from '../i18n/ranks';
import { isNative } from '../native';
import { claimPact, createPact, flushPactMark, joinPact, leavePact, myPacts, pactLink, pactPreview, type Pact } from '../together/pacts';
import { openAccount } from './account';
import { chest } from './chest';
import { h, haptic, toast } from './dom';
import { avatar } from './rankAvatars';
import { tabBar } from './tabs';

const PENDING = 'pendingPact';

async function share(code: string) {
  const url = pactLink(code);
  const text = akt('bp.shareText');
  try {
    if (isNative()) { const { Share } = await import('@capacitor/share'); await Share.share({ title: akt('bp.title'), text, url }); return; }
    if (navigator.share) { await navigator.share({ title: akt('bp.title'), text, url }); return; }
  } catch (e) { if ((e as Error).name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast(akt('bp.copied')); } catch { toast(url); }
}

const moons = (nights: number[], tonight: number, over: boolean) => h('span', { class: 'bp-moons', 'aria-label': akt('bp.kept', { n: nights.length }) },
  ...Array.from({ length: 7 }, (_, k) => h('i', { class: `bp-moon${nights.includes(k + 1) ? ' on' : ''}${!over && k + 1 === tonight ? ' now' : ''}` })));

function pactCard(p: Pact, repaint: () => void) {
  // What the chest holds (the server gives the same): 5 a night kept, +50 when everyone kept all seven.
  const mine = p.members.find((m) => m.face.me)?.nights.length ?? 0;
  const everyone = p.members.length >= 2 && p.members.every((m) => m.nights.length >= 7);
  const light = mine * 5 + (everyone ? 50 : 0);
  const open = async (el: HTMLElement) => {
    const r = await claimPact(p).catch((e: Error) => { toast(e.message); return null; });
    if (!r) { repaint(); return; }
    const m = await import('./celebrate');
    await m.celebrate({ kind: 'chest', title: akt('bp.title'), sub: r.everyone ? akt('bp.everyone') : akt('bp.kept', { n: r.kept }) }, el, r.light);
    repaint();
  };
  return h('div', { class: 'bp-card' },
    h('div', { class: 'me-row' }, h('b', {}, `🌙 ${akt('bp.title')}`),
      h('span', { class: 'muted small' }, p.over ? akt('bp.over') : akt('bp.night', { n: Math.min(7, p.night) }))),
    h('div', { class: 'bp-members' }, ...p.members.map((m) => h('div', { class: 'bp-row' },
      avatar(m.face.private ? null : m.face.avatar ?? 0, m.face.tier ?? 0, 28, m.face.frame ?? 0, m.face.figure),
      h('span', { class: 'bp-name' }, m.face.me ? akt('bp.you') : m.face.name ?? rt('rk.private')),
      moons(m.nights, p.night, p.over)))),
    p.code ? h('button', { class: 'chip', onclick: () => { haptic(); void share(p.code!); } }, `＋ ${akt('bp.invite')}`) : '',
    p.over && !p.claimed ? chest(light, 'ready', akt('bp.open'), (el) => void open(el)) : '',
    p.members.length === 1 && !p.code ? h('button', { class: 'chip', onclick: async () => { await leavePact(p.id).catch(() => {}); repaint(); } }, akt('bp.leave')) : '');
}

/** Fills the pact part of Me's du'a card. */
export async function paintPacts(slot: HTMLElement) {
  const repaint = () => void paintPacts(slot);
  const start = h('button', { class: 'chip bp-start', onclick: async () => {
    haptic();
    if (!account()) { openAccount(); return; }
    try { const r = await createPact(); await share(r.code); } catch (e) { toast((e as Error).message); }
    repaint();
  } }, `🌙 ${akt('bp.start')}`);
  if (!account()) { slot.replaceChildren(h('p', { class: 'muted small' }, akt('bp.help')), start); return; }
  void flushPactMark();
  void resumePendingPact();
  let list: Pact[] = [];
  try { list = await myPacts(); } catch { slot.replaceChildren(); return; }
  const running = list.filter((p) => !p.over || !p.claimed);
  slot.replaceChildren(...running.map((p) => pactCard(p, repaint)),
    running.some((p) => !p.over) ? '' : h('p', { class: 'muted small' }, akt('bp.help')), running.some((p) => !p.over) ? '' : start);
}

/** #/bp/{code}: the invite. */
export async function showPactInvite(root: HTMLElement, code: string): Promise<() => void> {
  const box = h('div', { class: 'rk-invite me-card bp-invite' }, h('p', { class: 'muted' }, akt('bp.loading')));
  root.append(h('header', { class: 'topbar' }, h('div', { class: 'brand' }, h('h1', {}, akt('bp.title')))), box, tabBar('me'));
  const p = await pactPreview(code).catch(() => null);
  if (!p) { box.replaceChildren(h('p', {}, akt('bp.bad'))); return () => {}; }
  const done = () => { location.hash = '#/me'; };
  const go = async () => {
    try { await joinPact(code); } catch (e) { toast((e as Error).message); return; }
    done();
  };
  const who = p.from.name ?? rt('rk.private');
  box.replaceChildren(
    h('div', { class: 'bp-invite-art', 'aria-hidden': 'true' }, ...Array.from({ length: 7 }, () => h('i', { class: 'bp-moon on' }))),
    h('h2', {}, akt('bp.inviteTitle', { name: who })),
    h('p', { class: 'muted' }, p.open || p.joined ? akt('bp.inviteSub') : akt('bp.closed')),
    p.joined ? h('button', { class: 'primary brand-btn', onclick: done }, akt('bp.see'))
      : !p.open ? h('a', { class: 'chip', href: '#/me' }, akt('bp.see'))
        : account() ? h('button', { class: 'primary brand-btn', onclick: go }, akt('bp.join'))
          : h('button', { class: 'primary brand-btn', onclick: () => { try { sessionStorage.setItem(PENDING, code); } catch { /* ignore */ } openAccount(); } }, akt('bp.signIn')));
  return () => {};
}

/** A pact invite opened before signing in: joined once the account is there. */
export async function resumePendingPact() {
  let code: string | null = null;
  try { code = sessionStorage.getItem(PENDING); } catch { /* ignore */ }
  if (!code || !account()) return;
  try { sessionStorage.removeItem(PENDING); await joinPact(code); location.hash = '#/me'; } catch (e) { toast((e as Error).message); }
}
