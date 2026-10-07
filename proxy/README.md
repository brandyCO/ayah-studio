# Pixabay proxy

The app searches Pixabay through this tiny Cloudflare Worker so the API key is never in the
(public) repo or the app. It caches each search for 24 hours and returns only what the app needs.
Picked files are downloaded by the app straight from `cdn.pixabay.com` into the device's library.

## Set it up (once, ~5 minutes, free)

1. Get a Pixabay API key: sign in at <https://pixabay.com/api/docs/> — the key is shown on that page.
2. Create the worker — either way works:
   - **Dashboard:** <https://dash.cloudflare.com> → Workers & Pages → Create → "Hello World" worker →
     name it `ayah-studio-pixabay` → Deploy → Edit code → paste `pixabay-worker.js` → Deploy.
     Then Settings → Variables and secrets: add a **Secret** `PIXABAY_KEY` (your key) and a
     **Text** variable `ALLOWED_ORIGINS` (copy the value from `wrangler.toml`).
   - **CLI:** in this folder run `npx wrangler deploy`, then `npx wrangler secret put PIXABAY_KEY`.
3. Note the worker URL, e.g. `https://ayah-studio-pixabay.<you>.workers.dev`. Check it in a browser:
   `…/search?type=image&q=clouds` should list results.
4. In GitHub: repo Settings → Secrets and variables → Actions → **Variables** → New variable
   `PIXABAY_PROXY` = the worker URL. The Pages build reads it (`VITE_PIXABAY_PROXY`); push to `main`
   (or re-run the Pages workflow) and the Pixabay tab appears in Scenes → Add.

For a local build: `VITE_PIXABAY_PROXY=https://… npm run dev`.

## Limits

Pixabay allows 100 requests per minute per key; the 24 h cache keeps the app far below that.
The Cloudflare free tier allows 100,000 requests a day.
