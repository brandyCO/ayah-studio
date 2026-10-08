# Stock media proxy (Pixabay + Pexels)

The app searches Pixabay and Pexels through this tiny Cloudflare Worker (`pixabay-worker.js`), so the
API keys are never in the (public) repo or the app. The worker:

- caches each search for 24 hours (everyone searching "clouds" today costs one call);
- offers curated calm **collections** (Calm skies, Ocean, Night, Rain, …) and drops results whose
  tags or descriptions mention people (rule 4);
- limits each visitor to 30 new searches and 20 file relays a minute, and keeps the calls to each
  library below its own limit (Pixabay 100/min, Pexels 200/h), so nobody can use up the keys;
- relays a file (`/file`) only when the browser can't download it from the library directly.

Picked files are downloaded by the app straight from the libraries' CDNs into the device's library.

## First setup (once)

1. Get a Pixabay API key: sign in at <https://pixabay.com/api/docs/> — the key is shown on that page.
2. Create the worker — either way works:
   - **Dashboard:** <https://dash.cloudflare.com> → Workers & Pages → Create → "Hello World" worker →
     name it `ayah-studio-pixabay` → Deploy → Edit code → paste `pixabay-worker.js` → Deploy.
     Then Settings → Variables and secrets: add a **Secret** `PIXABAY_KEY` (your key) and a
     **Text** variable `ALLOWED_ORIGINS` (copy the value from `wrangler.toml`).
   - **CLI:** in this folder run `npx wrangler deploy`, then `npx wrangler secret put PIXABAY_KEY`.
3. Note the worker URL (Settings → Domains & Routes), e.g. `https://ayah-studio-pixabay.<you>.workers.dev`.
4. In GitHub: repo Settings → Secrets and variables → Actions → **Variables** → New variable
   `PIXABAY_PROXY` = the worker URL. The Pages build reads it (`VITE_PIXABAY_PROXY`).

## Updating the worker (after this file changes)

Cloudflare → Workers & Pages → `ayah-studio-pixabay` → **Edit code** → select all, delete, paste the
new `pixabay-worker.js` → **Deploy**. The keys and variables stay as they are.

## Adding Pexels (optional, free)

1. Sign up at <https://www.pexels.com/api/> and request an API key (describe the app: "Quran recitation
   video maker; users pick calm nature backgrounds"). The key is shown on your Pexels API page.
2. Cloudflare → the worker → Settings → Variables and secrets → Add → **Secret** `PEXELS_KEY` = the key.

The app then shows a Pixabay / Pexels switch in Scenes → Add → Free library. Without `PEXELS_KEY` it
simply shows Pixabay only.

## Raising the limits before a public launch (free)

- **Pixabay** allows 100 requests a minute per key. Ask for more through the contact link on
  <https://pixabay.com/api/docs/> — mention that results are cached for 24 h, that images are
  downloaded (not hotlinked) and that Pixabay is credited in the app and on every export.
- **Pexels** starts at 200 requests an hour / 20,000 a month. Request unlimited use from your Pexels API
  page — they grant it for free when the app links to Pexels and credits photographers, which it does
  ("Videos provided by Pexels" under the results; "by X on Pexels" on the export page).
- Cloudflare's free plan allows 100,000 worker requests a day.

For exact per-visitor limits across Cloudflare's whole network (the built-in limit counts per server),
add a Rate Limiting binding named `RATE_LIMITER` to the worker; the code uses it when present.
