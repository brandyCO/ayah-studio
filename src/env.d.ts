/** Content hash of public/data/*, injected by vite.config.ts. */
declare const __DATA_VERSION__: string;

interface ImportMetaEnv {
  /** URL of the Pixabay search proxy (proxy/pixabay-worker.js); unset → no Pixabay library. */
  readonly VITE_PIXABAY_PROXY?: string;
}
