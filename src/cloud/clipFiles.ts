// Harakat clip files (supabase/migrations/20261113100000_harakat_clips_storage.sql): each shared clip is a
// file `{user id}/{random}.pcm` (16 kHz mono 16-bit PCM) in the private Storage bucket `harakat-clips`, not
// a value in the database. Clips shared before that stay in the table and still play for teachers.
import type { SupabaseClient } from '@supabase/supabase-js';

export const CLIP_BUCKET = 'harakat-clips';

const uid = async (sb: SupabaseClient) => (await sb.auth.getSession()).data.session?.user.id ?? null;

/** Uploads one clip; its path, or null (signed out, offline, today's limit). */
export async function uploadClip(sb: SupabaseClient, pcm: Int16Array): Promise<string | null> {
  const me = await uid(sb);
  if (!me) return null;
  const path = `${me}/${crypto.randomUUID().replace(/-/g, '')}.pcm`;
  const body = new Blob([pcm.slice().buffer], { type: 'application/octet-stream' });
  const { error } = await sb.storage.from(CLIP_BUCKET).upload(path, body, { contentType: 'application/octet-stream', upsert: false });
  return error ? null : path;
}

/** Deletes every clip file in this account's folder (before forgetting the clips or the account). */
export async function removeMyClipFiles(sb: SupabaseClient): Promise<void> {
  const me = await uid(sb);
  if (!me) return;
  const bucket = sb.storage.from(CLIP_BUCKET);
  for (let round = 0; round < 20; round++) {
    const { data, error } = await bucket.list(me, { limit: 1000 });
    if (error) throw error;
    if (!data?.length) return;
    const { error: e2 } = await bucket.remove(data.map((f) => `${me}/${f.name}`));
    if (e2) throw e2;
  }
}

/** A clip's sound for a teacher: the file, or (clips shared before files) the base64 kept in the table. */
export async function clipPcm(sb: SupabaseClient, c: { path?: string | null; audio?: string | null }): Promise<Uint8Array<ArrayBuffer> | null> {
  if (c.path) {
    const { data, error } = await sb.storage.from(CLIP_BUCKET).download(c.path);
    return error || !data ? null : new Uint8Array(await data.arrayBuffer());
  }
  if (c.audio) return Uint8Array.from(atob(c.audio.replace(/\s/g, '')), (ch) => ch.charCodeAt(0));
  return null;
}
