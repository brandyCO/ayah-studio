// The app's Supabase project (docs/together.md). Both values are public by design: the publishable
// key only identifies the project, and every table is protected by row-level security
// (supabase/migrations). Never put a secret or service-role key here.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://jposubjybzstfmnngews.supabase.co';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_Su6KSbkC7LHqqLwoKbrj6w_aevj2aY9';

/** Google OAuth web client ID (public; the client secret lives only in Supabase). */
export const GOOGLE_WEB_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || '674921848576-e00g0tpvakre3lvp29bi25q6ip3tjl1e.apps.googleusercontent.com';

/** Google OAuth iOS client ID (public), for "Sign in with Google" in the iPhone app (docs/ios.md). Without it the
 *  iPhone app offers Sign in with Apple only. Its reversed form is the app's URL scheme (set by the iOS build). */
export const GOOGLE_IOS_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID || '674921848576-8oieva400a6iekagbkbdv8ureklp549d.apps.googleusercontent.com';

/** The public web app (GitHub Pages): links shared from the Android app point here. */
export const PUBLIC_URL = 'https://brandyco.github.io/ayah-studio/';
