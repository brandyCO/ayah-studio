import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { defineConfig } from 'vite';

// Content hash of the bundled data files. The app requests them as `data/x.json?v=<hash>`, so after
// a deploy new code can never be served a stale cached copy of old data.
const hash = createHash('sha256');
for (const f of (readdirSync('public/data', { recursive: true }) as string[]).sort()) {
  if (statSync(`public/data/${f}`).isFile()) hash.update(f).update(readFileSync(`public/data/${f}`));
}

// Relative base so the same build works on GitHub Pages, Capacitor and Tauri.
const DATA_VERSION = hash.digest('hex').slice(0, 12);

export default defineConfig({
  base: './',
  // index.html starts the mushaf layout download before the app's code has even loaded (see there).
  plugins: [{ name: 'data-version-in-html', transformIndexHtml: (html) => html.replaceAll('%DATA_VERSION%', DATA_VERSION) }],
  define: {
    __DATA_VERSION__: JSON.stringify(DATA_VERSION),
    // Which build a problem report came from (the commit on GitHub's runners, else the build date).
    __BUILD__: JSON.stringify((process.env.GITHUB_SHA ?? '').slice(0, 7) || new Date().toISOString().slice(0, 16)),
  },
  // Mediabunny and its optional WASM AAC encoder are large but loaded lazily by the editor.
  build: { chunkSizeWarningLimit: 1100 },
});
