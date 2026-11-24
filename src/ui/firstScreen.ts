// The first screen, like Duolingo's (owner decision 2026-11-24): the app opens in the phone's language, with a small
// language switch at the top in case it is wrong; the user's character (the app's own, before they make one) waves on
// the launch screen's violet; two buttons: **Get started** (new: the conversation in onboard.ts, then the mushaf) and
// **I already have an account** (sign in, skip every question, and a quick welcome back: their character, streak and
// what unlocks next). Shown once, on the first launch of a new install (mushaf.ts); the language switch reloads the
// app in the language picked and the screen comes back. On the web, sign-in leaves for Google and returns: the flag
// `fsSignIn` brings the welcome back after the return.
import { coverWhileOpen } from './coverPage';
import './firstScreen.css';
import { account, appleSignInAvailable, googleSignInAvailable, onAccount, signIn, signInAvailable, type SignInWith } from '../cloud/auth';
import { streak } from '../data/journey';
import { fe } from '../i18n/front';
import { errMsg, lang, setLang, t } from '../i18n';
import { LANGS } from '../i18n/langs';
import { actor, type Actor } from './actor';
import { appleLogo } from './appleLogo';
import { WORD_PATH, WORD_VIEW } from './wordmark';
import { h, haptic, toast } from './dom';
import { DEFAULT, encode, normalize } from './figure';
import { flame } from './flame';
import { icon } from './icons';
import { noor, popIn, reduced, rise, squash, stagger } from './juice';
import { sfx } from './sfx';

const FLAG = 'fsSignIn';
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private */ } };
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A sign-in from the first screen left for Google (web) and has not been welcomed back yet. */
export const signInPending = () => get(FLAG) === '1';

/** The first screen. `done` runs once the person goes on (new or signed in): the mushaf marks its first visit. */
export function openFirstScreen(done: () => void) {
  if (document.querySelector('dialog.fs1')) return;
  const code = encode(normalize({ ...DEFAULT, face: 1 }));
  const who: Actor | null = actor('fs1-actor', code);
  const stage = h('div', { class: 'fs1-stage', 'aria-hidden': 'true' }, hero(who?.el ?? noor('fs1-noor').el));
  const cur = LANGS.find((l) => l.id === lang());
  const langBtn = h('button', { class: 'fs1-lang', 'aria-label': fe('fw.lang') }, icon('globe', 18), h('span', { lang: cur?.id }, cur?.name ?? 'English'), icon('down', 14));
  const word = h('h1', { class: 'fs1-word', 'aria-label': 'ayah studio' });
  word.innerHTML = `<svg viewBox="${WORD_VIEW}" aria-hidden="true"><path d="${WORD_PATH}" fill="currentColor"/></svg>`;
  const tag = h('p', { class: 'fs1-tag' }, fe('fw.tagline'));
  const startBtn = h('button', { class: 'fs1-btn fs1-start' }, fe('fw.start'));
  const haveBtn = signInAvailable() ? h('button', { class: 'fs1-btn fs1-have' }, fe('fw.have')) : '';
  const foot = h('div', { class: 'fs1-foot' }, startBtn, haveBtn);
  const d = h('dialog', { class: 'fs1', 'aria-label': 'Ayah Studio' },
    h('div', { class: 'fs1-sky', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i')),
    h('header', { class: 'fs1-top' }, langBtn),
    stage, h('div', { class: 'fs1-mid', tabindex: '-1', autofocus: true }, word, tag), foot) as HTMLDialogElement;

  let ended = false;
  const close = (then?: () => void) => {
    if (ended) return;
    ended = true;
    d.classList.add('out');
    setTimeout(() => { d.close(); then?.(); }, reduced() ? 0 : 280);
  };
  startBtn.onclick = () => {
    haptic(12); sfx.tick();
    done();
    close(() => void import('./onboard').then((m) => m.openOnboarding()));
  };
  if (haveBtn) haveBtn.onclick = () => { haptic(10); sfx.tick(); showSignIn(); };
  langBtn.onclick = () => { haptic(8); pickLanguage(d); };

  /** The two buttons give way to the sign-in buttons (Apple first in the iPhone app, then Google). */
  function showSignIn() {
    const btn = (how: SignInWith) => h('button', { class: `fs1-btn fs1-sign ${how}`, onclick: async (e: Event) => {
      const b = e.currentTarget as HTMLButtonElement;
      b.disabled = true;
      set(FLAG, '1'); // the web leaves for Google here and comes back signed in
      try {
        await signIn(how);
        if (account()) { done(); close(() => void welcomeBack()); }
      } catch (err) {
        set(FLAG, null);
        const msg = err instanceof Error ? err.message : String(err);
        if (!/cancel|1001/i.test(msg)) toast(t('acc.signInFailed', { msg: errMsg(err) }));
      } finally { b.disabled = false; }
    } }, how === 'apple' ? appleLogo() : googleG(), t(how === 'apple' ? 'acc.apple' : 'acc.google'));
    const back = h('button', { class: 'fs1-link', onclick: () => { haptic(8); swap(foot, [startBtn, haveBtn]); tag.textContent = fe('fw.tagline'); } }, t('common.back'));
    tag.textContent = fe('fw.signText');
    swap(foot, [appleSignInAvailable() ? btn('apple') : '', googleSignInAvailable() ? btn('google') : '', back]);
    who?.wave(1600);
  }
  function swap(box: HTMLElement, kids: (Node | string)[]) {
    box.replaceChildren(...kids);
    if (!reduced()) stagger(box.querySelectorAll('button'), (el, delay) => rise(el, 16, { delay, feel: 'bouncy' }), 60);
  }

  // Android back / Esc: nothing to go back to on the first screen except the sign-in step.
  d.addEventListener('cancel', (e) => {
    e.preventDefault();
    if (foot.querySelector('.fs1-sign')) (foot.querySelector('.fs1-link') as HTMLElement | null)?.click();
  });
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
  coverWhileOpen(d);
  if (reduced()) { d.classList.add('up'); return; }
  requestAnimationFrame(() => d.classList.add('up'));
  // The character springs up out of the launch screen's place, the name and the buttons follow.
  if (who) {
    popIn(who.el, { stiffness: 210, damping: 15, delay: 60 });
    setTimeout(() => { who.wave(2000); who.face('happy', 2600); }, 420);
  }
  rise(word, 22, { delay: 220, feel: 'bouncy' });
  rise(tag, 18, { delay: 300 });
  stagger([startBtn, ...(haveBtn ? [haveBtn] : [])], (el, delay) => rise(el, 24, { delay, feel: 'bouncy' }), 80, 380);
}

/** The app icon come to life: the white ayah marker with the gold Light star, the character standing in front. */
function hero(body: HTMLElement): HTMLElement {
  const box = h('span', { class: 'fs1-hero' });
  const rose = (r: number, c = 256) => {
    const R1 = r, R2 = (r / Math.SQRT2) / Math.cos(Math.PI / 8);
    return 'M' + Array.from({ length: 16 }, (_, i) => {
      const a = (-90 + i * 22.5) * Math.PI / 180, rr = i % 2 ? R2 : R1;
      return `${(c + rr * Math.cos(a)).toFixed(1)},${(c + rr * Math.sin(a)).toFixed(1)}`;
    }).join(' L') + 'Z';
  };
  const star = (x: number, y: number, r: number, fill: string, dy = 0) =>
    `<g transform="translate(${x} ${y + dy}) scale(${(r / 10.5).toFixed(3)}) translate(-12 -12)"><path d="M12 1.5c.9 5 2.6 7.6 9.5 10.5-6.9 2.9-8.6 5.5-9.5 10.5-.9-5-2.6-7.6-9.5-10.5C9.4 9.1 11.1 6.5 12 1.5z" fill="${fill}" stroke="${fill}" stroke-width="1.6" stroke-linejoin="round"/></g>`;
  const mark = h('span', { class: 'fs1-mark' });
  mark.innerHTML = `<svg viewBox="0 0 512 512"><defs><linearGradient id="fs1g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe680"/><stop offset=".55" stop-color="#ffc22e"/><stop offset="1" stop-color="#ff9f1a"/></linearGradient>`
    + `<radialGradient id="fs1f" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9e2ff"/></radialGradient></defs>`
    + `<path d="${rose(190)}" fill="#3a2591" stroke="#3a2591" stroke-width="34" stroke-linejoin="round" transform="translate(0 14)"/>`
    + `<path d="${rose(190)}" fill="#fff" stroke="#fff" stroke-width="34" stroke-linejoin="round"/>`
    + `<path d="${rose(156)}" fill="url(#fs1f)" stroke="#d9cffc" stroke-width="6" stroke-linejoin="round"/></svg>`;
  const lit = h('span', { class: 'fs1-star' });
  lit.innerHTML = `<svg viewBox="0 0 512 512">${star(420, 92, 34, '#e07a00', 7)}${star(420, 92, 34, 'url(#fs1g)')}${star(86, 120, 14, '#fff')}${star(446, 330, 10, '#fff')}</svg>`;
  box.append(h('span', { class: 'fs1-glow' }), mark, body, lit);
  return box;
}

/** Google's "G", as its sign-in guidelines ask for on the button. */
function googleG(): HTMLElement {
  const g = h('span', { class: 'fs1-g', 'aria-hidden': 'true' });
  g.innerHTML = '<svg viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  return g;
}

/** The small language switch: every interface language in its own words; another one reloads the app in it. */
function pickLanguage(host: HTMLDialogElement) {
  const now = lang();
  const list = [...LANGS].sort((x, y) => Number(y.id === now) - Number(x.id === now));
  const close = () => s.close();
  const s = h('dialog', { class: 'sheet bottom fs1-langs', 'aria-label': fe('fw.lang') },
    h('div', { class: 'sheet-head' }, h('h2', {}, fe('fw.lang')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, icon('close', 20))),
    h('div', { class: 'fs1-langlist' }, ...list.map((l) => h('button', {
      class: `fs1-lopt${l.id === now ? ' on' : ''}`, 'aria-pressed': String(l.id === now),
      onclick: () => { haptic(8); if (l.id === now) close(); else setLang(l.id); },
    }, h('b', { lang: l.id, dir: l.dir }, l.name), l.id === 'en' ? '' : h('small', { lang: 'en' }, l.en), l.id === now ? icon('check', 16) : '')))) as HTMLDialogElement;
  s.addEventListener('click', (e) => { if (e.target === s) close(); });
  s.addEventListener('close', () => s.remove());
  host.append(s);
  s.showModal();
}

/** Back on the first screen's sign-in (web: after Google sent the page back): wait for the account, then welcome. */
export function resumeSignIn(done: () => void, fallback: () => void) {
  if (account()) { done(); void welcomeBack(); return; }
  let off = () => {};
  const timer = setTimeout(() => { off(); set(FLAG, null); fallback(); }, 9000);
  off = onAccount((a) => {
    if (!a) return;
    clearTimeout(timer);
    queueMicrotask(() => off());
    done();
    void welcomeBack();
  });
}

/** A quick welcome back after signing in on this phone: their character, streak and the next thing to unlock, once
 *  their progress has arrived ("Bringing your progress…" until then, at most ~10 s; offline it shows what is here). */
export async function welcomeBack() {
  set('obProgress', null); // signed in: no questions left to finish
  set(FLAG, null);
  set('comebackSeen', dayKey(new Date())); // one welcome is enough today
  if (document.querySelector('dialog.fs1-wb')) return;
  const sync = await import('../cloud/sync');
  const name = (account()?.name ?? '').trim().split(/\s+/)[0]?.slice(0, 24) ?? '';
  const title = h('h2', { class: 'fs1-wb-title' }, name ? fe('fw.wb', { name }) : fe('fw.wbNo'));
  const stage = h('div', { class: 'fs1-stage', 'aria-hidden': 'true' });
  const info = h('div', { class: 'fs1-wb-info' }, h('p', { class: 'fs1-wb-wait' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), fe('fw.bringing')));
  const go = h('button', { class: 'fs1-btn fs1-start', onclick: () => { haptic(12); sfx.tick(); close(); } }, fe('why.go'));
  const d = h('dialog', { class: 'fs1 fs1-wb up', 'aria-label': fe('fw.wbNo') },
    h('div', { class: 'fs1-sky', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'), h('i')),
    stage, h('div', { class: 'fs1-mid', tabindex: '-1', autofocus: true }, title, info), h('div', { class: 'fs1-foot' }, go)) as HTMLDialogElement;
  const close = () => { d.classList.add('out'); setTimeout(() => d.close(), reduced() ? 0 : 280); };
  d.addEventListener('close', () => { off(); d.remove(); });
  window.addEventListener('hashchange', () => d.open && d.close(), { once: true });
  document.body.append(d);
  d.showModal();
  if (!reduced()) { rise(title, 20, { feel: 'bouncy' }); rise(go, 20, { delay: 160, feel: 'bouncy' }); }

  let filled = false;
  const fill = async () => {
    if (filled || !d.isConnected) return;
    filled = true;
    off();
    const who = actor('fs1-actor');
    const light = who ? null : noor('fs1-noor');
    stage.append(hero(who?.el ?? light!.el));
    const st = streak();
    const rows: HTMLElement[] = [];
    if (st.days > 0) rows.push(h('div', { class: 'fs1-wb-row k-streak' }, h('span', { class: 'fs1-wb-ic' }, flame(st.days >= 7 ? 2 : 1, 52)), h('b', {}, fe('fw.streak', { n: st.days }))));
    const co = await import('./coming');
    const next = co.steps().find((s) => !s.reached);
    if (next) rows.push(h('div', { class: 'fs1-wb-row k-next' }, h('span', { class: 'fs1-wb-ic art' }, co.art(next)),
      h('span', {}, h('small', {}, fe('fw.next')), h('b', {}, co.stepTitle(next.id)))));
    info.replaceChildren(...rows);
    if (reduced()) return;
    if (who) { popIn(who.el, { stiffness: 200, damping: 15 }); setTimeout(() => { squash(who.el, 0.18); who.wave(1800); who.face('happy', 2400); sfx.shimmer(); }, 360); }
    else { light!.hop(1); sfx.shimmer(); }
    stagger(rows, (el, delay) => popIn(el, { delay }), 110, 200);
  };
  let off = () => {};
  const ready = () => !sync.firstSyncPending() || sync.syncStatus().state === 'offline' || sync.syncStatus().state === 'error';
  if (ready()) void fill();
  else {
    off = sync.onSyncStatus(() => { if (ready()) setTimeout(() => void fill(), 200); });
    setTimeout(() => void fill(), 10000);
  }
}
