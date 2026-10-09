// ☰ → Account: sign in with Google to sync bookmarks, settings and reel drafts between devices; see
// the sync state; export or delete the account's data. Everything works without signing in.
import { locale, t } from '../i18n';
import { account, deleteAccount, onAccount, signIn, signInAvailable, signOut } from '../cloud/auth';
import { onSyncStatus, syncNow, syncStatus, type SyncStatus } from '../cloud/sync';
import { supabase } from '../cloud/supabase';
import { bookmarkRecords } from '../data/bookmarks';
import { listDrafts } from '../data/drafts';
import { loadReflections, reflections } from '../data/reflections';
import { isNative, shareTextFile } from '../native';
import { received } from '../together/gifts';
import { lampRecords } from '../data/lamps';
import { h, toast } from './dom';
import { prefRecords } from './prefs';

/** The menu line for the account ("Sign in to sync" or the user's name). */
export const accountLabel = () => {
  const a = account();
  return a ? `👤  ${t('acc.synced', { name: a.name })}` : `👤  ${t('acc.signInToSync')}`;
};

const ago = (at: number) => {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return t('acc.justNow');
  if (s < 3600) return t('acc.minAgo', { n: Math.round(s / 60) });
  if (s < 86400) return t('acc.hAgo', { n: Math.round(s / 3600) });
  return new Date(at).toLocaleDateString(locale());
};
const statusText = (s: SyncStatus) =>
  s.state === 'syncing' ? t('acc.syncing')
    : s.state === 'ok' && s.at ? t('acc.syncedAgo', { ago: ago(s.at) })
      : s.state === 'offline' ? t('acc.offline')
        : s.state === 'error' ? t('acc.syncFailed', { error: s.error ?? '?' })
          : '';

export function openAccount() {
  const body = h('div', { class: 'account' });
  const close = () => d.close();
  const d = h('dialog', { class: 'sheet bottom' },
    h('div', { class: 'sheet-head' }, h('h2', {}, t('acc.title')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕')),
    body);
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  let statusLine: HTMLElement | null = null;

  function draw() {
    const a = account();
    if (!a) {
      statusLine = null;
      body.replaceChildren(
        h('p', {}, t('acc.why')),
        h('p', { class: 'muted small' }, t('acc.without')),
        signInAvailable()
          ? h('button', { class: 'primary google-btn', onclick: async (e: Event) => {
            const btn = e.currentTarget as HTMLButtonElement;
            btn.disabled = true;
            try {
              await signIn(); // on the web the page goes to Google and comes back
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              if (!/cancel/i.test(msg)) toast(t('acc.signInFailed', { msg }));
            } finally {
              btn.disabled = false;
            }
          } }, t('acc.google'))
          : h('p', { class: 'muted small' }, t('acc.soon')),
        h('p', { class: 'muted small' }, h('a', { href: `${import.meta.env.BASE_URL}privacy.html`, target: '_blank', rel: 'noopener' }, t('acc.privacy'))));
      return;
    }
    statusLine = h('p', { class: 'muted small sync-status' });
    body.replaceChildren(
      h('div', { class: 'acc-who' },
        a.avatar ? h('img', { class: 'acc-avatar', src: a.avatar, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'acc-avatar' }, a.name.slice(0, 1)),
        h('div', {}, h('b', {}, a.name), h('div', { class: 'muted small' }, a.email))),
      statusLine,
      h('div', { class: 'menu' },
        h('button', { class: 'menu-item', onclick: () => void syncNow() }, `⟳  ${t('acc.syncNow')}`),
        h('button', { class: 'menu-item', onclick: () => void exportData().catch((e) => toast(t('acc.exportFailed', { msg: e instanceof Error ? e.message : String(e) }))) }, `⇩  ${t('acc.export')}`),
        h('button', { class: 'menu-item', onclick: () => void signOut().then(() => toast(t('acc.signedOut'))) }, `↩  ${t('acc.signOut')}`),
        h('button', { class: 'menu-item danger', onclick: () => confirmDelete() }, `✕  ${t('acc.deleteMenu')}`)),
      h('p', { class: 'muted small' }, h('a', { href: `${import.meta.env.BASE_URL}privacy.html`, target: '_blank', rel: 'noopener' }, t('acc.privacy'))));
    statusLine.textContent = statusText(syncStatus());
  }

  function confirmDelete() {
    body.replaceChildren(
      h('p', {}, t('acc.deleteAsk')),
      h('div', { class: 'row' },
        h('button', { class: 'chip', onclick: () => draw() }, t('common.cancel')),
        h('button', { class: 'primary danger', onclick: async () => {
          try {
            await deleteAccount();
            toast(t('acc.deleted'));
          } catch (e) {
            toast(t('acc.deleteFailed', { msg: e instanceof Error ? e.message : String(e) }));
            draw();
          }
        } }, t('acc.delete'))));
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
  // Khatm circles you are in (names you gave and the juz you took); none if circles are not set up yet.
  const { data: circles } = await sb.from('circle_members').select('name,joined_at,circles(name,round,status)');
  const { data: parts } = await sb.from('circle_parts').select('circle_id,round,juz,status,taken_at,done_at').eq('user_id', a.id);
  // Gifts you sent and the replies they received (references, names and messages only).
  const { data: gifts } = await sb.rpc('my_gifts');
  // Ayah walls you host (with every entry on them) and your own entries on other walls.
  const { data: walls } = await sb.from('walls').select('title,occasion,join_code,status,reciter,created_at,closed_at,wall_entries(name,dua,surah,ayah_from,ayah_to,hidden,created_at)').eq('host_id', a.id);
  const { data: entries } = await sb.from('wall_entries').select('wall_id,name,dua,surah,ayah_from,ayah_to,hidden,created_at').eq('user_id', a.id);
  const file = {
    exported: new Date().toISOString(),
    account: { name: a.name, email: a.email, created: profile?.created_at ?? null },
    synced: docs,
    circles: { memberships: circles ?? [], juz: parts ?? [] },
    gifts: gifts ?? [],
    walls: { hosted: walls ?? [], myEntries: entries ?? [] },
    thisDevice: {
      bookmarks: bookmarkRecords(),
      reflections: reflections().map((r) => ({ ayah: `${r.s}:${r.a}`, paragraphs: r.entries.filter((e) => !e.deleted).map((e) => ({ date: new Date(e.at).toISOString(), text: e.text })) })),
      settings: prefRecords(),
      giftsReceived: received(),
      revisionLamps: lampRecords(),
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
