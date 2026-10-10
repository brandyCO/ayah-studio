// The Supabase client, loaded only when needed: when the user signs in, has signed in on this device
// before, or is coming back from Google's sign-in page. Everyone else never downloads it.
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

let client: Promise<SupabaseClient> | null = null;

export function supabase(): Promise<SupabaseClient> {
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }));
  client.catch(() => (client = null));
  return client;
}

/** A session is stored on this device (supabase-js keeps it as `sb-<project>-auth-token`). */
export function hasStoredSession(): boolean {
  try {
    return Object.keys(localStorage).some((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
  } catch {
    return false;
  }
}

/** The user of the session stored on this device (read without loading the client), or null. */
export function storedUser(): User | null {
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith('sb-') || !k.endsWith('-auth-token')) continue;
      const v = JSON.parse(localStorage.getItem(k) ?? 'null') as { user?: User } | null;
      if (v?.user?.id) return v.user;
    }
  } catch {
    /* no storage or not a session */
  }
  return null;
}

/** Google's sign-in page sent the user back here with a one-time code (web). */
export const returningFromSignIn = () => new URLSearchParams(location.search).has('code');
