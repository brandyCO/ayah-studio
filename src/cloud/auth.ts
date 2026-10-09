// Accounts (docs/together.md T0): "Sign in with Google" — on the web through Google's sign-in page
// (Supabase OAuth, PKCE), in the Android app natively (Credential Manager via
// @capgo/capacitor-social-login, then Supabase signInWithIdToken with a nonce). Everything in the app
// works signed out; signing in only adds syncing between the user's devices.
import type { User } from '@supabase/supabase-js';
import { isNative } from '../native';
import { GOOGLE_WEB_CLIENT_ID } from './config';
import { hasStoredSession, returningFromSignIn, supabase } from './supabase';

export interface Account {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}

let current: Account | null = null;
const cameBack = returningFromSignIn(); // checked at load: the client removes the code from the address
let attached: Promise<void> | null = null;
const listeners = new Set<(a: Account | null) => void>();

export const account = () => current;
export const signInAvailable = () => !!GOOGLE_WEB_CLIENT_ID;

/** Calls `fn` now and whenever the signed-in account changes; returns an unsubscribe function. */
export function onAccount(fn: (a: Account | null) => void): () => void {
  listeners.add(fn);
  fn(current);
  return () => listeners.delete(fn);
}

function toAccount(u: User | null | undefined): Account | null {
  if (!u || u.is_anonymous) return null;
  const m = u.user_metadata ?? {};
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    id: u.id,
    name: str(m.full_name) || str(m.name) || str(u.email).split('@')[0] || 'You',
    email: str(u.email),
    avatar: str(m.avatar_url) || str(m.picture) || null,
  };
}

function set(a: Account | null) {
  if (a?.id === current?.id && a?.name === current?.name) return;
  if (a && !current && cameBack) void import('../ui/dom').then(({ toast }) => toast(`Signed in as ${a.name} — syncing`));
  current = a;
  for (const fn of listeners) fn(a);
}

/** Connects to the auth session (loads the client). */
function attach(): Promise<void> {
  attached ??= supabase().then(async (sb) => {
    sb.auth.onAuthStateChange((_event, session) => set(toAccount(session?.user)));
    const { data } = await sb.auth.getSession();
    set(toAccount(data.session?.user));
  });
  attached.catch(() => (attached = null));
  return attached;
}

/** At startup: restores the session if there is one (or finishes a web sign-in). */
export async function initAuth() {
  if (!hasStoredSession() && !returningFromSignIn()) return;
  try {
    await attach();
  } catch (e) {
    console.warn('Sign-in could not be restored (offline?)', e);
  }
}

const randomNonce = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
async function sha256Hex(text: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Google sign-in. On the web the page leaves for Google and comes back signed in. */
export async function signIn(): Promise<void> {
  if (!signInAvailable()) throw new Error('Sign-in is not set up yet');
  const sb = await supabase();
  await attach();
  if (isNative()) {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    await SocialLogin.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID, mode: 'online' } });
    // Google puts the hashed nonce in the ID token; Supabase checks it against the raw one.
    const nonce = randomNonce();
    const res = await SocialLogin.login({ provider: 'google', options: { nonce: await sha256Hex(nonce) } });
    const idToken = (res.result as { idToken?: string | null }).idToken;
    if (!idToken) throw new Error('Google did not return a sign-in token');
    const { error } = await sb.auth.signInWithIdToken({ provider: 'google', token: idToken, nonce });
    if (error) throw error;
  } else {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      // Always show Google's account chooser (someone with several accounts picks one).
      options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
  }
}

/**
 * An anonymous session for wall guests and gift replies (no Google account needed), after a
 * Cloudflare Turnstile check when one is set up. False when anonymous sign-ins are off in the
 * project or the check did not pass (the caller then offers Google sign-in).
 */
export async function signInGuest(): Promise<boolean> {
  const sb = await supabase();
  const { data } = await sb.auth.getSession();
  if (data.session?.user?.is_anonymous) return true;
  let captchaToken: string | undefined;
  try {
    const { captchaToken: check } = await import('./captcha');
    captchaToken = await check();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== 'cancelled') void import('../ui/dom').then(({ toast }) => toast(msg));
    return false;
  }
  const { error } = await sb.auth.signInAnonymously({ options: { captchaToken } });
  if (error) console.warn('Guest sign-in failed', error.message);
  return !error;
}

export async function signOut() {
  const sb = await supabase();
  await sb.auth.signOut({ scope: 'local' });
  if (isNative()) {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    await SocialLogin.logout({ provider: 'google' }).catch(() => {});
  }
  set(null);
}

/** Deletes the account and everything synced to it. This device keeps its own copy. */
export async function deleteAccount() {
  const sb = await supabase();
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw error;
  await signOut();
}
