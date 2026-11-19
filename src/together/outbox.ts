// Send later (thread "Make the whole app fast", 2026-11-19, owner: "works offline like Duolingo, then syncs"): a small
// social action done with no connection (follow, unfollow, answering a friend ask, MashaAllah on a friend's news, a
// challenge gesture) is kept on the phone and sent, in order, as soon as the connection is back. Its own UI shows the
// result at once, as if it had gone. Two actions on the same thing collapse into the last one (follow then unfollow
// offline = nothing to send). A refused action (the server said no, not the network) is dropped and announced with the
// event `outbox-refused`, so a screen can put things back. Kept per account (localStorage `rankOutbox`).
import { account, onAccount } from '../cloud/auth';

export interface Pending { key: string; fn: string; args: Record<string, unknown>; at: number; tries?: number }
type Send = (fn: string, args: Record<string, unknown>) => Promise<unknown>;

const STORE = 'rankOutbox';
const MAX = 100;
let sender: Send | null = null;
let busy = false;
let timer = 0;

function load(): Pending[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    return v && v.who === account()?.id && Array.isArray(v.q) ? v.q : [];
  } catch { return []; }
}
function save(q: Pending[]) {
  try {
    if (q.length) localStorage.setItem(STORE, JSON.stringify({ who: account()?.id, q }));
    else localStorage.removeItem(STORE);
  } catch { /* full */ }
  window.dispatchEvent(new Event('outbox'));
}

/** How many actions wait for a connection. */
export const pendingCount = () => load().length;
/** Whether an action on `key` waits (e.g. `follow:{pid}`): screens can show the state it will have. */
export const pendingFor = (key: string): Pending | undefined => load().find((p) => p.key === key);

/** A failure of the connection (no answer at all), not a refusal by the server. */
export class Offline extends Error { offline = true; }
export const isOffline = (e: unknown) => !!(e && typeof e === 'object' && (e as { offline?: boolean }).offline);

/** Keeps an action to send later; one waiting on the same `key` is replaced (or, with `cancels`, both go). */
export function sendLater(key: string, fn: string, args: Record<string, unknown>, cancels?: (old: Pending) => boolean) {
  if (!account()) return;
  let q = load();
  const old = q.find((p) => p.key === key);
  q = q.filter((p) => p.key !== key);
  if (!(old && cancels?.(old))) q.push({ key, fn, args, at: Date.now() });
  save(q.slice(-MAX));
  soon(4_000);
}

/** Sends what waits, oldest first; stops at the first network failure and tries again later. */
export async function flushOutbox(): Promise<void> {
  if (busy || !sender || !account() || navigator.onLine === false) return;
  busy = true;
  try {
    for (;;) {
      const q = load();
      const p = q[0];
      if (!p) break;
      try {
        await sender(p.fn, p.args);
      } catch (e) {
        if (isOffline(e)) {
          p.tries = (p.tries ?? 0) + 1;
          save(q);
          soon(Math.min(15 * 60_000, 30_000 * 2 ** Math.min(5, p.tries - 1)));
          break;
        }
        window.dispatchEvent(new CustomEvent('outbox-refused', { detail: { ...p, message: (e as Error).message } }));
      }
      // Remove it from what is stored now (another action may have been added while it went).
      save(load().filter((x) => !(x.key === p.key && x.at === p.at)));
    }
  } finally { busy = false; }
  window.dispatchEvent(new Event('outbox-sent'));
}

function soon(ms: number) {
  clearTimeout(timer);
  timer = window.setTimeout(() => void flushOutbox(), ms);
}

/** Starts sending with `send` (the Ranks rpc): on start, when the connection or the app comes back, and after sign-in. */
export function watchOutbox(send: Send) {
  if (sender) return;
  sender = send;
  addEventListener('online', () => soon(1_500));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) soon(2_000); });
  onAccount(() => soon(3_000));
  soon(5_000);
}
