// The app's one player, as seen by the first screen: the mushaf, the tab bar and the router only need to know whether
// something is playing and where. The player itself (src/ui/player.ts, with the reciter list, timings and downloads)
// loads the first time something is played, not with the app's first page.
import type { SurahMeta } from '../data/quran';

export interface PlayerPos { s: number; a: number; w: number | null }
export interface PlayerView {
  onPosition(pos: PlayerPos | null): void;
  onShow(shown: boolean): void;
}
/** What the hub needs from the real player (set by player.ts when it is made). */
export interface HubPlayer {
  active(): boolean;
  position(): { s: number; a: number } | null;
  pause(): void;
  stop(): void;
}

let shared: HubPlayer | null = null;
let view: PlayerView | null = null;
const markAway = () => document.body.classList.toggle('listening-away', !!shared?.active() && !view);

/** player.ts: the shared player was made. */
export function setShared(p: HubPlayer) { shared = p; }
export const hubView = () => view;
export const markListeningAway = markAway;

/** The shared player, loading its code first (the first play, a tap on an ayah while listening). */
export async function loadPlayer(meta: SurahMeta[]) {
  return (await import('./player')).sharedPlayer(meta);
}

/** The mushaf follows the recitation while it is open; returns the detach. */
export function attachPlayer(v: PlayerView): () => void {
  view = v;
  markAway();
  return () => { if (view === v) { view = null; markAway(); } };
}

/** Once the attached view is built: what is playing now (the bar's room, the page, the lit ayah). */
export function replayPosition() {
  if (!view || !shared?.active()) return;
  view.onShow(true);
  const pos = shared.position();
  if (pos) view.onPosition({ s: pos.s, a: pos.a, w: null });
}

export const playerActive = () => !!shared?.active();

/** Open the page being recited (the mushaf then tracks it). */
export function followAlong() {
  const pos = shared?.position();
  if (!pos) return;
  try { sessionStorage.removeItem('tabIntent'); } catch { /* ignore */ }
  location.hash = `#/s/${pos.s}/${Math.max(1, pos.a)}`;
}

/** Screens with their own sound (the studio) pause it; the Kids space stops it. */
export function quietPlayer(stop = false) {
  if (!shared?.active()) return;
  if (stop) shared.stop(); else shared.pause();
}
// Screens loaded later (Learn lessons, page memory) pause the bar with this event instead of importing the player.
window.addEventListener('player-quiet', () => quietPlayer());
