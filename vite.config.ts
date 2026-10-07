import { defineConfig } from 'vite';

// Relative base so the same build works on GitHub Pages, Capacitor and Tauri.
export default defineConfig({
  base: './',
  // Mediabunny and its optional WASM AAC encoder are large but loaded lazily by the editor.
  build: { chunkSizeWarningLimit: 1100 },
});
