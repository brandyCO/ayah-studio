import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

// Content hash of the bundled data files. The app requests them as `data/x.json?v=<hash>`, so after
// a deploy new code can never be served a stale cached copy of old data.
const hash = createHash('sha256');
for (const f of (readdirSync('public/data', { recursive: true }) as string[]).sort()) {
  if (statSync(`public/data/${f}`).isFile()) hash.update(f).update(readFileSync(`public/data/${f}`));
}

// The page each surah starts on (its header line, as surahStartPage() in src/data/mushaf.ts), so index.html can
// start that page's font for `#/s/N` before the app has loaded the layout.
const SURAH_PAGES: number[] = [];
(JSON.parse(readFileSync('public/data/mushaf.json', 'utf8')) as { pages: { lines: unknown[][] }[] }).pages.forEach((pg, i) => {
  for (const l of pg.lines) if (l[0] === 'h' && !SURAH_PAGES[(l[1] as number) - 1]) SURAH_PAGES[(l[1] as number) - 1] = i + 1;
});

// Relative base so the same build works on GitHub Pages, Capacitor and Tauri.
const DATA_VERSION = hash.digest('hex').slice(0, 12);

// Cold opens of Me and Learn (optimization review round 2, item 5): their screen code, the modules it loads on
// its first paint and its data used to come in three rounds, each waiting for the one before. index.html now
// starts all of them at once for these addresses, in parallel with the app's own code.
const ROUTE_PRELOADS: Record<string, { mods: string[]; data?: string[]; fonts?: string[] }> = {
  '#/me': { mods: ['src/ui/me.ts', 'src/ui/wardrobeCard.ts', 'src/ui/actor.ts', 'src/together/ranks.ts', 'src/together/relight.ts'], data: ['meta.json'] },
  '#/learn': { mods: ['src/ui/learnRoutes.ts', 'src/ui/learnPath.ts', 'src/ui/pathBuddy.ts', 'src/ui/actor.ts'],
    data: ['meta.json', 'mushaf.json'] },
};
const routePreloads = (): Plugin => ({
  name: 'route-preloads',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      const bundle = ctx.bundle;
      if (!bundle) return html;
      const chunks = Object.values(bundle).filter((c) => c.type === 'chunk');
      const byModule = (m: string) => chunks.find((c) => c.type === 'chunk' && c.facadeModuleId?.replace(/\\/g, '/').endsWith(m));
      const map: Record<string, string[][]> = {};
      for (const [hash, r] of Object.entries(ROUTE_PRELOADS)) {
        const js = new Set<string>(), css = new Set<string>();
        const add = (file: string) => {
          if (js.has(file)) return;
          const c = bundle[file];
          if (!c || c.type !== 'chunk' || c.isEntry) return;
          js.add(file);
          for (const f of c.viteMetadata?.importedCss ?? []) css.add(f);
          for (const i of c.imports) add(i);
        };
        for (const m of r.mods) {
          const c = byModule(m);
          if (!c) throw new Error(`route-preloads: no chunk for ${m}`);
          add(c.fileName);
        }
        map[hash] = [[...js], [...css], (r.data ?? []).map((d) => `data/${d}?v=${DATA_VERSION}`), (r.fonts ?? []).map((f) => `fonts/${f}`)];
      }
      const script = `<script>try{var e=${JSON.stringify(map)}[location.hash];if(e){var a=function(h,r,as,co,ty){var l=document.createElement('link');l.rel=r;l.href='./'+h;if(as)l.as=as;if(co)l.crossOrigin='anonymous';if(ty)l.type=ty;document.head.appendChild(l)};` +
        `e[2].forEach(function(h){a(h,'preload','fetch',1)});e[3].forEach(function(h){a(h,'preload','font',1,'font/woff2')});e[1].forEach(function(h){a(h,'preload','style',1)});e[0].forEach(function(h){a(h,'modulepreload')})}}catch(x){}</script>`;
      // Right after the charset: an inline script after a stylesheet would wait for that stylesheet first.
      return html.replace(/(<meta charset[^>]*>)/i, `$1\n    ${script}`);
    },
  },
});

export default defineConfig({
  base: './',
  // index.html starts the mushaf layout download before the app's code has even loaded (see there).
  plugins: [{ name: 'data-version-in-html', transformIndexHtml: (html) => html.replaceAll('%DATA_VERSION%', DATA_VERSION).replace('%SURAH_PAGES%', JSON.stringify(SURAH_PAGES)) }, routePreloads()],
  define: {
    __DATA_VERSION__: JSON.stringify(DATA_VERSION),
    // Which build a problem report came from (the commit on GitHub's runners, else the build date).
    __BUILD__: JSON.stringify((process.env.GITHUB_SHA ?? '').slice(0, 7) || new Date().toISOString().slice(0, 16)),
  },
  // Mediabunny and its optional WASM AAC encoder are large but loaded lazily by the editor.
  build: { chunkSizeWarningLimit: 1100 },
});
