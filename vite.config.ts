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
export default defineConfig({
  base: './',
  define: { __DATA_VERSION__: JSON.stringify(hash.digest('hex').slice(0, 12)) },
  // Mediabunny and its optional WASM AAC encoder are large but loaded lazily by the editor.
  build: { chunkSizeWarningLimit: 1100 },
});
