// Friendly gestures in a friend challenge (owner pick 2026-11-10, "no chat"): five set gestures — Salam,
// MashaAllah, Keep going, a du'a, Race you — sent with one tap, at most 5 a day (server: rank_challenge_cheer).
// Your character acts the gesture with a speech bubble; the friend's acts the one they sent the next time the
// card comes into view, once. No free text, so nothing to moderate; nothing is ranked.
import type { Actor } from './actor';
import { myCheers, sendCheer, type Challenge, type Cheer } from '../together/ranks';
import { rt, type RankKey } from '../i18n/ranks';
import { edge, starPath, two } from './flat';
import { h, haptic, toast } from './dom';
import { sfx } from './sfx';

const ICON: string[] = [
  // Salam: an open hand
  `${edge('M8 21Q4 17 4 12V8.5a1.5 1.5 0 0 1 3 0V12V5.5a1.5 1.5 0 0 1 3 0V11V4.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8q0 6-5 7Z', '#9a5b2a', 1.5)}${two('M8 21Q4 17 4 12V8.5a1.5 1.5 0 0 1 3 0V12V5.5a1.5 1.5 0 0 1 3 0V11V4.5a1.5 1.5 0 0 1 3 0V11V6a1.5 1.5 0 0 1 3 0v8q0 6-5 7Z', '#ffd3a1', '#f0a865', -1, -1)}`,
  // MashaAllah: a sparkle
  `${edge(starPath(12, 12, 10, 3.2, 4), '#a8650e', 1.5)}${two(starPath(12, 12, 10, 3.2, 4), '#ffd25e', '#e09a1f', -1, -1)}${two(starPath(19.5, 5, 3.5, 1.2, 4), '#fff1b8', '#ffd25e', -.5, -.5)}`,
  // Keep going: a rising arrow
  `${edge('M12 3L21 12H16V21H8V12H3Z', '#1f7a3a', 1.5)}${two('M12 3L21 12H16V21H8V12H3Z', '#6fdc8c', '#36b35a', -1, -1)}`,
  // Du'a: two raised palms
  `${edge('M11 21Q4 19 4 11Q4 7 6.5 7Q9 7 9 11V8Q9 5 11 5Z', '#9a5b2a', 1.5)}${two('M11 21Q4 19 4 11Q4 7 6.5 7Q9 7 9 11V8Q9 5 11 5Z', '#ffd3a1', '#f0a865', -1, -1)}${edge('M13 21Q20 19 20 11Q20 7 17.5 7Q15 7 15 11V8Q15 5 13 5Z', '#9a5b2a', 1.5)}${two('M13 21Q20 19 20 11Q20 7 17.5 7Q15 7 15 11V8Q15 5 13 5Z', '#ffd3a1', '#f0a865', -1, -1)}`,
  // Race you: a pennant
  `<path d="M6 3V22" stroke="#5b4380" stroke-width="2.4" stroke-linecap="round"/>${edge('M7 4H20L16.5 8.5L20 13H7Z', '#9c2a3a', 1.5)}${two('M7 4H20L16.5 8.5L20 13H7Z', '#ff7a8a', '#e04a5e', -1, -1)}`,
];
const icon = (k: number) => {
  const s = h('span', { class: 'rk-g-ic', 'aria-hidden': 'true' });
  s.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26">${ICON[k]}</svg>`;
  return s;
};
const phrase = (k: number) => rt(`rk.g${k}` as RankKey);

/** The actor plays a gesture, with a bubble over it. */
export function act(a: Actor | null, k: number, toward = 1) {
  if (!a) return;
  if (k === 0) a.wave();
  else if (k === 1) a.cheer();
  else if (k === 2) { a.hop(0.9); setTimeout(() => a.nod(), 520); }
  else if (k === 3) { a.nod(); setTimeout(() => a.nod(), 700); }
  else { a.lean(toward); setTimeout(() => a.hop(0.7), 650); }
  const side = a.el.parentElement;
  if (!side) return;
  side.querySelector('.rk-bub')?.remove();
  const b = h('span', { class: 'rk-bub', role: 'status' }, icon(k), phrase(k));
  side.append(b);
  setTimeout(() => b.classList.add('out'), 2600);
  setTimeout(() => b.remove(), 3100);
}

const SEEN = 'rkCheerSeen';
const seen = (): Record<string, string> => { try { return JSON.parse(localStorage.getItem(SEEN) || '{}'); } catch { return {}; } };
function markSeen(ch: string, at: string) {
  try { const s = seen(); s[ch] = at; localStorage.setItem(SEEN, JSON.stringify(s)); } catch { /* ignore */ }
}
const ago = (at: string) => {
  const m = Math.max(1, Math.round((Date.now() - Date.parse(at)) / 60000));
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
};

/** The gesture row under a running challenge (`cast` = the two characters when shown). */
export function gestureRow(c: Challenge, cast: { el: HTMLElement; a: Actor; b: Actor } | null, who: string): HTMLElement {
  const last = h('p', { class: 'small rk-g-last', hidden: true });
  const busy = new Set<number>();
  const row = h('div', { class: 'rk-g', role: 'group', 'aria-label': rt('rk.gSend', { name: who }) },
    ...[0, 1, 2, 3, 4].map((k) => h('button', { class: 'rk-g-btn', type: 'button', title: phrase(k), 'aria-label': phrase(k), onclick: async () => {
      if (busy.has(k)) return;
      busy.add(k);
      haptic(8); sfx.tick();
      act(cast?.a ?? null, k, 1);
      try { toast(rt('rk.gSent', { n: await sendCheer(c.id, k) })); } catch (e) { toast((e as Error).message); }
      setTimeout(() => busy.delete(k), 1200);
    } }, icon(k), h('span', {}, rt(`rk.gs${k}` as RankKey)))));
  const box = h('div', { class: 'rk-gbox' }, last, row);
  void myCheers().then((list: Cheer[]) => {
    const got = list.find((x) => x.ch === c.id && !x.mine);
    if (!got) return;
    last.hidden = false;
    last.textContent = `${rt('rk.gFrom', { name: who, g: phrase(got.kind) })} · ${ago(got.at)}`;
    last.prepend(icon(got.kind));
    if (!cast || seen()[c.id] === got.at) return;
    const io = new IntersectionObserver((es) => {
      if (!es.some((x) => x.isIntersecting)) return;
      io.disconnect();
      markSeen(c.id, got.at);
      setTimeout(() => act(cast.b, got.kind, -1), 1700);
    }, { threshold: 0.6 });
    io.observe(cast.el);
  }).catch(() => { /* offline: no gestures shown */ });
  return box;
}
