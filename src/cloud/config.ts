// The app's Supabase project (docs/together.md). Both values are public by design: the publishable
// key only identifies the project, and every table is protected by row-level security
// (supabase/migrations). Never put a secret or service-role key here.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://jposubjybzstfmnngews.supabase.co';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_Su6KSbkC7LHqqLwoKbrj6w_aevj2aY9';

/** Google OAuth web client ID (public; the client secret lives only in Supabase). */
export const GOOGLE_WEB_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || '178803855692-hqbv3391cn2v71o9ba9jh2hkbs8s20bb.apps.googleusercontent.com';

/** The public web app (GitHub Pages): links shared from the Android app point here. */
export const PUBLIC_URL = 'https://brandyco.github.io/ayah-studio/';

/** Cloudflare Turnstile site key (public; the secret key lives only in Supabase → Attack protection).
 *  Empty = no security check before anonymous sign-ins. */
export const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
