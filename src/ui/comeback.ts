// Comeback welcome (front-end review, owner go-ahead 2026-11-13): the first time the app opens after three days or
// more away, a warm screen says it is good to see you, shows that everything built is still here (Light, badges,
// level: nothing is lost), and offers one step back in, a page (which lights today's flame). No guilt: no count of
// days missed, no lost streak. Once per return; after the account's first sync when signed in, so another phone's
// days count; never over the studio, the Kids space or another moment.
import './comeback.css';
import { account } from '../cloud/auth';
import { addDays, allDays, earnedBadges } from '../data/journey';
import { fe } from '../i18n/front';
import { actor } from './actor';
import { h, haptic } from './dom';
import { noor, popIn, reduced, squash } from './juice';
import { sfx } from './sfx';

export const AWAY_DAYS = 3;
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

/** Days since the app was last opened before today (null on a first day). */
export function daysAway(now = new Date()): number | null {
  const today = dayKey(now);
  let last = '';
  for (const [k, d] of Object.entries(allDays())) if (k < today && d.o && k > last) last = k;
  if (!last) return null;
  let n = 0;
  for (let k = last; k < today && n < 400; k = addDays(k, 1)) n++;
  return n;
}

export function comebackDue(now = new Date()): boolean {
  const away = daysAway(now);
  return away != null && away >= AWAY_DAYS && get('comebackSeen') !== dayKey(now);
}

export async function showComeback() {
  const now = new Date();
  if (!comebackDue(now)) return;
  if (/^#\/(reel|kids|rc|rb|rf|bp|t)(\/|$)/.test(location.hash) || document.querySelector('dialog[open], .cel')) return;
  set('comebackSeen', dayKey(now));
  const [{ wallet }, { levelOf, myXp }] = await Promise.all([import('../data/garden'), import('../data/xp')]);
  const light = wallet(), badges = Object.keys(earnedBadges()).length, xp = myXp();
  let name = (get('rankName') || account()?.name || '').trim().split(/\s+/)[0]?.slice(0, 24) ?? '';
  if (name === 'Reader') name = '';
  const kept = [
    light > 0 ? h('span', { class: 'cb-kept k-light' }, '✦ ', fe('cb.light', { n: light.toLocaleString() })) : '',
    badges > 0 ? h('span', { class: 'cb-kept k-badge' }, fe('cb.badges', { n: badges })) : '',
    xp > 0 ? h('span', { class: 'cb-kept k-level' }, fe('cb.level', { n: levelOf(xp) })) : '',
  ].filter(Boolean);
  const who = actor('cb-actor');
  if (who && xp > 0) { const { withLevel } = await import('./levelLook'); withLevel(who.el, levelOf(xp)); }
  const light2 = who ? null : noor('cb-noor');
  const stage = h('div', { class: 'cb-stage', 'aria-hidden': 'true' }, h('span', { class: 'cb-glow' }), who?.el ?? light2!.el, h('span', { class: 'cb-hill' }));
  const go = h('button', { class: 'primary brand-btn cb-go', onclick: () => {
    haptic(12);
    dialog.close();
    void import('./tabs').then((m) => m.goMushaf());
  } }, fe('cb.go'));
  const card = h('div', { class: 'cb-card', tabindex: '-1', autofocus: true },
    h('p', { class: 'cb-kicker' }, fe('cb.kicker')),
    h('h2', { class: 'cb-title' }, name ? fe('cb.titleName', { name }) : fe('cb.title')),
    h('p', { class: 'cb-body' }, fe('cb.body')),
    kept.length ? h('div', { class: 'cb-kepts' }, ...kept) : '',
    go,
    h('p', { class: 'cb-sub' }, fe('cb.goSub')),
    h('button', { class: 'chip cb-later', onclick: () => dialog.close() }, fe('cb.later')));
  const dialog = h('dialog', { class: 'comeback', 'aria-label': fe('cb.kicker') },
    h('div', { class: 'cb-sky', 'aria-hidden': 'true' }), h('div', { class: 'cb-rays', 'aria-hidden': 'true' }), stage, card);
  dialog.addEventListener('close', () => dialog.remove());
  window.addEventListener('hashchange', () => dialog.close(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
  if (reduced()) { dialog.classList.add('up'); card.classList.add('in'); return; }
  requestAnimationFrame(() => requestAnimationFrame(() => dialog.classList.add('up')));
  // The character drops onto its hill, lands with a squash and waves; then the card springs up.
  const body = who?.el ?? light2!.el;
  body.animate([{ translate: '0 -60vh' }, { translate: '0 0' }], { duration: 620, delay: 380, easing: 'cubic-bezier(.5, 0, .9, .5)', fill: 'backwards' });
  setTimeout(() => {
    sfx.pop(2);
    haptic(10);
    if (who) { squash(who.el, 0.22); setTimeout(() => { who.wave(1800); who.face('happy', 2400); sfx.shimmer(); }, 260); }
    else { light2!.hop(1); setTimeout(() => light2!.cheer(), 300); sfx.shimmer(); }
  }, 1000);
  setTimeout(() => { card.classList.add('in'); popIn(card, { stiffness: 190, damping: 17 }); kept.forEach((k, i) => popIn(k as Element, { delay: 220 + i * 110 })); }, 1250);
}
