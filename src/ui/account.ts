// ☰ → Account: sign in with Google to sync bookmarks, settings and reel drafts between devices; see
// the sync state; export or delete the account's data. Everything works without signing in.
import { account, deleteAccount, onAccount, signIn, signInAvailable, signOut } from '../cloud/auth';
import { onSyncStatus, syncNow, syncStatus, type SyncStatus } from '../cloud/sync';
import { supabase } from '../cloud/supabase';
import { bookmarkRecords } from '../data/bookmarks';
import { listDrafts } from '../data/drafts';
import { loadReflections, reflections } from '../data/reflections';
import { isNative, shareTextFile } from '../native';
import { h, toast } from './dom';
import { prefRecords } from './prefs';

/** The menu line for the account ("Sign in to sync" or the user's name). */
export const accountLabel = () => {
  const a = account();
  return a ? `👤  ${a.name} · synced` : '👤  Sign in to sync';
};

const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};
const statusText = (s: SyncStatus) =>
  s.state === 'syncing' ? 'Syncing…'
    : s.state === 'ok' && s.at ? `Synced ${ago(s.at)}`
      : s.state === 'offline' ? 'Offline — will sync when you are back online'
        : s.state === 'error' ? `Could not sync: ${s.error ?? 'unknown error'}`
          : '';

export function openAccount() {
  const body = h('div', { class: 'account' });
  const close = () => d.close();
  const d = h('dialog', { class: 'sheet bottom' },
    h('div', { class: 'sheet-head' }, h('h2', {}, 'Account'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕')),
    body);
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  let statusLine: HTMLElement | null = null;

  function draw() {
    const a = account();
    if (!a) {
      statusLine = null;
      body.replaceChildren(
        h('p', {}, 'Sign in to keep your bookmarks, reflections, settings and reel drafts the same on your phone, computer and the web.'),
        h('p', { class: 'muted small' }, 'Everything keeps working without an account. Your own photos and videos stay on this device.'),
        signInAvailable()
          ? h('button', { class: 'primary google-btn', onclick: async (e: Event) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.disabled = true;
            try {
              await signIn(); // on the web the page goes to Google and comes back
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (!/cancel/i.test(msg)) toast(`Sign-in failed: ${msg}`);
            } finally {
              btn.disabled = false;
            }
          } }, 'Sign in with Google')
          : h('p', { class: 'muted small' }, 'Sign-in is being set up — coming soon.'),
        h('p', { class: 'muted small' }, h('a', { href: `${import.meta.env.BASE_URL}privacy.html`, target: '_blank', rel: 'noopener' }, 'Privacy')));
      return;
    }
    statusLine = h('p', { class: 'muted small sync-status' });
    body.replaceChildren(
      h('div', { class: 'acc-who' },
        a.avatar ? h('img', { class: 'acc-avatar', src: a.avatar, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'acc-avatar' }, a.name.slice(0, 1)),
        h('div', {}, h('b', {}, a.name), h('div', { class: 'muted small' }, a.email))),
      statusLine,
      h('div', { class: 'menu' },
        h('button', { class: 'menu-item', onclick: () => void syncNow() }, '⟳  Sync now'),
        h('button', { class: 'menu-item', onclick: () => void exportData().catch((e) => toast(`Export failed: ${e instanceof Error ? e.message : e}`)) }, '⇩  Export my data'),
        h('button', { class: 'menu-item', onclick: () => void signOut().then(() => toast('Signed out — your data stays on this device')) }, '↩  Sign out'),
        h('button', { class: 'menu-item danger', onclick: () => confirmDelete() }, '✕  Delete account…')),
      h('p', { class: 'muted small' }, h('a', { href: `${import.meta.env.BASE_URL}privacy.html`, target: '_blank', rel: 'noopener' }, 'Privacy')));
    statusLine.textContent = statusText(syncStatus());
  }

  function confirmDelete() {
    body.replaceChildren(
      h('p', {}, 'Delete your account and everything synced to it? Bookmarks, reflections, settings and drafts on this device stay here.'),
      h('div', { class: 'row' },
        h('button', { class: 'chip', onclick: () => draw() }, 'Cancel'),
        h('button', { class: 'primary danger', onclick: async () => {
          try {
            await deleteAccount();
            toast('Account deleted');
          } catch (e) {
            toast(`Could not delete: ${e instanceof Error ? e.message : e}`);
            draw();
          }
        } }, 'Delete account')));
  }

  // Redrawn when the account changes (e.g. signed in or out while the sheet is open).
  const offAccount = onAccount(() => draw());
  const offStatus = onSyncStatus((st) => { if (statusLine) statusLine.textContent = statusText(st); });
  d.addEventListener('close', () => { offAccount(); offStatus(); d.remove(); });
  document.body.append(d);
  d.showModal();
}

/** "Export my data": everything synced to the account, as a JSON file. */
async function exportData() {
  const a = account();
  if (!a) return;
  const sb = await supabase();
  const { data: docs, error } = await sb.from('user_docs').select('kind,id,data,deleted,updated_at');
  if (error) throw error;
  const { data: profile } = await sb.from('profiles').select('name,created_at').maybeSingle();
  await loadReflections();
  const file = {
    exported: new Date().toISOString(),
    account: { name: a.name, email: a.email, created: profile?.created_at ?? null },
    synced: docs,
    thisDevice: {
      bookmarks: bookmarkRecords(),
      reflections: reflections().map((r) => ({ ayah: `${r.s}:${r.a}`, paragraphs: r.entries.filter((e) => !e.deleted).map((e) => ({ date: new Date(e.at).toISOString(), text: e.text })) })),
      settings: prefRecords(),
      drafts: (await listDrafts()).map((x) => ({ id: x.id, project: x.project, updated: x.updated })),
    },
  };
  const text = JSON.stringify(file, null, 2);
  const name = `ayah-studio-data-${new Date().toISOString().slice(0, 10)}.json`;
  if (isNative()) return shareTextFile(name, text);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  h('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
