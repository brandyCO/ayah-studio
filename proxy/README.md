# Edge proxy (Pixabay + Pexels, Popular this week, remote switches)

The app searches Pixabay and Pexels through this small Cloudflare Worker (`pixabay-worker.js`), so the
API keys are never in the (public) repo or the app. It also answers the two calls every phone makes to
Supabase ("Popular this week", cached 10 minutes for everyone, and the anonymous reel counter,
rate-limited) and serves remote switches. The worker:

- caches each search for 24 hours, in each data center and worldwide (KV), so everyone searching
  "clouds" today costs one call;
- builds every collection and the Quick reel searches once a day ahead of time (Cron Trigger), so
  browsing them never reaches the library;
- counts the calls to each library in one place for the whole world (a Durable Object), so all copies
  of the worker together stay under the key's limit;
- offers curated calm **collections** (Calm skies, Ocean, Night, Rain, …) and drops results whose
  tags or descriptions mention people (rule 4);
- limits each app install to 30 new searches and 20 file relays a minute (each address to 10 times
  that, as mobile networks share addresses), and keeps the calls to each library below its own limit
  (Pixabay 100/min, Pexels 200/h), so nobody can use up the keys;
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

## Automatic deploys (recommended)

`.github/workflows/proxy.yml` deploys the worker from `wrangler.toml` whenever `proxy/` changes on main,
with the daily collections, the worldwide counter and the worldwide cache (it creates the KV namespace
`ayah-studio-stock` the first time). All of it works on Cloudflare's free plan. Once:

1. Cloudflare → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers** → create.
   Also make sure it can edit **Workers KV Storage** (the template includes it).
2. Your account id: Cloudflare → Workers & Pages → the right-hand column "Account ID".
3. GitHub → repo Settings → Secrets and variables → Actions → **Secrets**: `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`. Then Actions → "Deploy edge proxy" → Run workflow.

The worker keeps its name (`ayah-studio-pixabay`), its address and its secrets (`PIXABAY_KEY`,
`PEXELS_KEY`); variables set in the dashboard stay too.

## Remote switches

Cloudflare → the worker → Settings → Variables → add a **Text** variable `FLAGS` with JSON, e.g.
`{"stock": false}`. Takes effect within minutes, no app release:

| Switch | Default | Off means |
| --- | --- | --- |
| `stock` | true | the free library refuses searches with a kind note (own photos and built-in scenes still work) |
| `popular` | true | no "Popular this week" and no reel counting |
| `mushafDownload` | true | phones stop the background download of the whole mushaf |
| `syncMinutes` | 1 | least minutes between two account syncs started by returning to the app (0–120) |

## Growing past the free plans

Nothing in the code changes; only plans and limits:

- **Cloudflare free plan**: 100,000 worker requests a day and 1,000 KV writes a day. At a large crowd,
  switch to **Workers Paid** ($5 a month: 10 million requests and 1 million KV writes a month included).
- When Pixabay or Pexels raise your limit, set the variables `PIXABAY_PER_MIN` / `PEXELS_PER_HOUR` to the
  new numbers (the worker keeps 10 % below them).
- For exact per-install limits across the whole network, add a Rate Limiting binding named
  `RATE_LIMITER` (limit 30, period 60 s); without it each copy of the worker counts on its own.

## Updating the worker by hand (without the workflow)

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
