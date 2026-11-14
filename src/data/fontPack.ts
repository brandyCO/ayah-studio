// The mushaf page fonts in the Play build (owner decision 2026-11-14, round 4): pages 1–3 stay inside the app, pages
// 4–604 (~95 MB) come as the fast-follow asset pack "qcf_fonts", which Google Play downloads right after the
// install (android/qcf_fonts, FontPackPlugin.java). So the install is ~25 MB and every page still reads offline
// once the pack is in. Until then a page is never shown broken or in another font: it waits on a "Preparing your
// mushaf" card (src/ui/mushafPrep.ts) while its own font is fetched from our site if there is a connection.
// Test APKs (and the web) are unchanged: every font is where it always was.

import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { PUBLIC_URL } from '../cloud/config';

export interface PackState {
  /** completed · pending · downloading · transferring · wifi · confirm · failed · canceled · missing · unknown */
  state: string;
  done?: number;
  total?: number;
  path?: string;
}
interface FontPackPlugin {
  state(): Promise<PackState>;
  fetch(): Promise<PackState>;
  allowMobileData(): Promise<{ ok: boolean }>;
  addListener(e: 'progress', f: (s: PackState) => void): Promise<PluginListenerHandle>;
}

/** Pages kept inside the app itself (the first ones opened). */
export const IN_APP_PAGES = 3;
export const FONT_PACK = import.meta.env.VITE_FONT_PACK === '1' && Capacitor.isNativePlatform();
const Pack = registerPlugin<FontPackPlugin>('FontPack');

let state: PackState = { state: FONT_PACK ? 'pending' : 'completed' };
const subs = new Set<(s: PackState) => void>();
let started = false;

function set(s: PackState) {
  if (state.path && !s.path) return; // once the pack is in, it stays in
  state = s;
  for (const f of subs) f(state);
}

async function check() {
  try {
    const s = await Pack.state();
    set(s);
    // Play normally starts a fast-follow pack by itself; ask again when it is not on its way (or failed).
    if (!s.path && ['missing', 'failed', 'canceled', 'pending'].includes(s.state)) set(await Pack.fetch());
  } catch { /* not a Play install: the page fonts come from the site */ }
}

function start() {
  if (started || !FONT_PACK) return;
  started = true;
  void Pack.addListener('progress', set).catch(() => {});
  void check();
  // Progress events stop while the app is away; look again when it comes back or the connection does.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !state.path) void check(); });
  window.addEventListener('online', () => { if (!state.path) void check(); });
}

/** Whether this page's font comes from the asset pack. */
export const inPack = (page: number) => FONT_PACK && page > IN_APP_PAGES;
/** Whether this page is still waiting for the pack (its font not on the phone yet). */
export const packWaiting = (page: number) => inPack(page) && !state.path;
export function packState(): PackState { start(); return state; }
export function onPack(f: (s: PackState) => void): () => void { start(); subs.add(f); return () => subs.delete(f); }
export function allowMobileData(): Promise<boolean> { return Pack.allowMobileData().then((r) => r.ok, () => false); }

/** Resolves on the next pack change, the connection coming back, or after `ms`. */
function nextChance(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    let un = () => {};
    const done = () => { un(); window.removeEventListener('online', done); clearTimeout(timer); resolve(); };
    un = onPack(() => { if (state.path) done(); });
    window.addEventListener('online', done);
    const timer = setTimeout(done, ms);
  });
}

async function loadFace(family: string, url: string): Promise<boolean> {
  try {
    const f = await new FontFace(family, `url(${url})`, { display: 'block' }).load();
    document.fonts.add(f);
    return true;
  } catch { return false; }
}

/**
 * Loads a pack page's font as `family`. Never fails: it waits for the pack (or for a connection to fetch just this
 * page from our site), so the page shows the preparing card instead of an error or a wrong font.
 */
export async function loadPackFont(page: number, family: string): Promise<void> {
  start();
  const fromPack = () => Capacitor.convertFileSrc(`${state.path}/qcf-v2/p${page}.woff2`);
  const fromSite = `${PUBLIC_URL}fonts/qcf-v2/p${page}.woff2`;
  // The pack about to land: wait a moment for it rather than fetch the page twice.
  const nearly = state.state === 'transferring' || (!!state.total && (state.done ?? 0) / state.total > 0.9);
  if (!state.path && nearly) await nextChance(1200);
  for (let wait = 2000; ; wait = Math.min(wait * 2, 30000)) {
    if (state.path && (await loadFace(family, fromPack()))) return;
    if (navigator.onLine !== false && (await loadFace(family, fromSite))) return;
    await nextChance(wait);
  }
}
