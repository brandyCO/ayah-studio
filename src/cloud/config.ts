// The app's Supabase project (docs/together.md). Both values are public by design: the publishable
// key only identifies the project, and every table is protected by row-level security
// (supabase/migrations). Never put a secret or service-role key here.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://jposubjybzstfmnngews.supabase.co';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_Su6KSbkC7LHqqLwoKbrj6w_aevj2aY9';

/** Google OAuth web client ID (public). Empty → "Sign in with Google" is not offered yet. */
export const GOOGLE_WEB_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || '';
