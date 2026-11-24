// Accounts (docs/together.md T0): "Sign in with Google" — on the web through Google's sign-in page
// (Supabase OAuth, PKCE), in the Android app natively (Credential Manager via
// @capgo/capacitor-social-login, then Supabase signInWithIdToken with a nonce). Everything in the app
// works signed out; signing in only adds syncing between the user's devices.
// iPhone app (docs/ios.md): "Sign in with Apple" first (App Store guideline 4.8: an app offering Google sign-in must
// offer Apple's too), natively (AuthenticationServices), then Supabase signInWithIdToken with a nonce like Google;
// Google too once its iOS client id is set (VITE_GOOGLE_IOS_CLIENT_ID).
import type { User } from '@supabase/supabase-js';
import { isIOS, isNative } from '../native';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from './config';
import { hasStoredSession, returningFromSignIn, storedUser, supabase } from './supabase';

export interface Account {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  /** When the account was made (ISO), so the first week's unlocks count from it on a new phone. */
  created?: string;
}

// Known at once from the session stored on this device, so no screen asks a signed-in user to
// sign in while the client is still loading (it confirms or corrects this a moment later).
let current: Account | null = null;
const cameBack = returningFromSignIn(); // checked at load: the client removes the code from the address
let attached: Promise<void> | null = null;
const listeners = new Set<(a: Account | null) => void>();

export const account = () => current;
export const signInAvailable = () => !!GOOGLE_WEB_CLIENT_ID || isIOS();
/** Sign in with Apple: the iPhone app. */
export const appleSignInAvailable = () => isIOS();
/** Sign in with Google: the web and Android; the iPhone once its iOS client id is set. */
export const googleSignInAvailable = () => !!GOOGLE_WEB_CLIENT_ID && (!isIOS() || !!GOOGLE_IOS_CLIENT_ID);
export type SignInWith = 'google' | 'apple';

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
    created: str(u.created_at) || undefined,
  };
}

current = toAccount(storedUser());

function set(a: Account | null) {
  if (a?.id === current?.id && a?.name === current?.name) return;
  if (a && !current && cameBack) void Promise.all([import('../ui/dom'), import('../i18n')]).then(([{ toast }, { t }]) => toast(t('notif.signedIn', { name: a.name })));
  current = a;
  for (const fn of listeners) fn(a);
}

/** Connects to the auth session (loads the client). */
function attach(): Promise<void> {
  attached ??= supabase().then(async (sb) => {
    // Signed out only when the session is really gone (signed out, deleted or revoked): a refresh
    // that fails because the device is offline keeps the stored session, and so the account.
    sb.auth.onAuthStateChange((event, session) => {
      if (session?.user) set(toAccount(session.user));
      else set(event === 'SIGNED_OUT' ? null : toAccount(storedUser()));
    });
    const { data } = await sb.auth.getSession();
    set(toAccount(data.session?.user ?? storedUser()));
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

let lastWith: SignInWith = 'google';
/** Google (or, in the iPhone app, Apple) sign-in. On the web the page leaves for Google and comes back signed in. */
export async function signIn(how: SignInWith = 'google'): Promise<void> {
  if (how === 'apple' ? !appleSignInAvailable() : !googleSignInAvailable()) throw new Error('Sign-in is not set up yet');
  const sb = await supabase();
  await attach();
  lastWith = how;
  if (how === 'apple') {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    await SocialLogin.initialize({ apple: {} });
    // Apple puts the hashed nonce in the identity token; Supabase checks it against the raw one.
    const nonce = randomNonce();
    const res = await SocialLogin.login({ provider: 'apple', options: { scopes: ['name', 'email'], nonce: await sha256Hex(nonce) } });
    const r = res.result as { idToken?: string | null; profile?: { givenName?: string | null; familyName?: string | null } };
    if (!r.idToken) throw new Error('Apple did not return a sign-in token');
    const { data, error } = await sb.auth.signInWithIdToken({ provider: 'apple', token: r.idToken, nonce });
    if (error) throw error;
    // Apple gives the name only the first time, and never in the token: keep it on the account.
    const full = [r.profile?.givenName, r.profile?.familyName].filter(Boolean).join(' ').trim();
    if (full && !data.user?.user_metadata?.full_name) await sb.auth.updateUser({ data: { full_name: full } }).catch(() => {});
    return;
  }
  if (isNative()) {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    await SocialLogin.initialize({ google: isIOS()
      ? { iOSClientId: GOOGLE_IOS_CLIENT_ID, iOSServerClientId: GOOGLE_WEB_CLIENT_ID, mode: 'online' }
      : { webClientId: GOOGLE_WEB_CLIENT_ID, mode: 'online' } });
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

export async function signOut() {
  const sb = await supabase();
  await sb.auth.signOut({ scope: 'local' });
  if (isNative()) {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    await SocialLogin.logout({ provider: lastWith }).catch(() => {});
  }
  set(null);
}

/** Deletes the account and everything synced to it. This device keeps its own copy. */
export async function deleteAccount() {
  const sb = await supabase();
  // shared harakat clip files are not in the database, so they go first (best effort)
  await import('./clipFiles').then((m) => m.removeMyClipFiles(sb)).catch(() => {});
  const { error } = await sb.rpc('delete_my_account');
  if (error) throw error;
  await signOut();
}
