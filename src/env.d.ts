/** Content hash of public/data/*, injected by vite.config.ts. */
declare const __DATA_VERSION__: string;

interface ImportMetaEnv {
  /** URL of the Pixabay search proxy (proxy/pixabay-worker.js); unset → no Pixabay library. */
  readonly VITE_PIXABAY_PROXY?: string;
  /** Overrides for the Supabase project and Google sign-in (src/cloud/config.ts). */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
}
