/** Content hash of public/data/*, injected by vite.config.ts. */
declare const __DATA_VERSION__: string;
declare const __BUILD__: string;

interface ImportMetaEnv {
  /** URL of the Pixabay search proxy (proxy/pixabay-worker.js); unset → no Pixabay library. */
  readonly VITE_PIXABAY_PROXY?: string;
  /** Overrides for the Supabase project and Google sign-in (src/cloud/config.ts). */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_KEY?: string;
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
  /** Sentry project DSN (src/errors.ts); unset → no error reports. */
  readonly VITE_SENTRY_DSN?: string;
  /** '1' in the Play build: mushaf pages 4–604 come as a Play asset pack (src/data/fontPack.ts). */
  readonly VITE_FONT_PACK?: string;
}
