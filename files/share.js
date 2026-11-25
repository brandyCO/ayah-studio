// Link previews for shared links (owner request 2026-11-25): the `ayah-studio` worker (files/wrangler.site.toml) runs
// this only for the share paths below (`run_worker_first`); every other request is a static file, as before.
// WhatsApp, Telegram, iMessage, X… never see a `#/…` address, so shared links are real paths (src/native.ts
// `shareableLink()`): /s/11/90 → a tiny page with that ayah's own og:title, og:description and og:image (made by
// scripts/make-share-cards.mjs, served from /og/), which sends a person on to /i/#/s/11/90
// (public/i/index.html: the store listing once the app is live there, else the web app; with the app installed the
// phone opens it on the share path itself, src/appLinks.ts).
// Invite links (/rf/, /rc/, /rb/, /bp/, /relight/, /join/) name who invited, read from the same public preview
// functions the app uses (granted to anon), with one banner per kind. Free plan: one small JSON read per ayah link,
// at most one Supabase call per invite link (1.5 s at most, then the generic text).
const SUPABASE = 'https://jposubjybzstfmnngews.supabase.co';
const KEY = 'sb_publishable_Su6KSbkC7LHqqLwoKbrj6w_aevj2aY9'; // public (the app ships it), only reaches anon-granted functions

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s);
const AR_DIGITS = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);

/** What each invite kind says, in English and Arabic; `who` is the inviter's name when the preview gives one. */
const KINDS = {
  rf: { fn: 'rank_friend_invite_preview', arg: 'code', name: (r) => r?.name,
    en: (w) => (w ? `${w} wants to be your Quran friend` : 'Be my Quran friend on Ayah Studio'),
    ar: (w) => (w ? `${w} يدعوك لتكون صديقه في رحلة القرآن` : 'كن صديقي في رحلة القرآن على Ayah Studio'),
    den: 'Read, listen and keep your streaks together on Ayah Studio.', dar: 'نقرأ ونستمع ونحافظ على سلاسلنا معًا.' },
  rc: { fn: 'rank_challenge_preview', arg: 'ch_code', name: (r) => r?.from?.name,
    en: (w) => (w ? `${w} challenged you to 7 days with the Quran` : 'A Quran challenge for you'),
    ar: (w) => (w ? `${w} يتحداك سبعة أيام مع القرآن` : 'تحدٍّ قرآني لك'),
    den: 'Accept the challenge on Ayah Studio.', dar: 'اقبل التحدي على Ayah Studio.' },
  rb: { fn: 'rank_board_preview', arg: 'board_code', name: (r) => r?.name,
    en: (w) => (w ? `Join “${w}” on Ayah Studio` : 'Join our Quran league'),
    ar: (w) => (w ? `انضم إلى «${w}» على Ayah Studio` : 'انضم إلى دوري القرآن معنا'),
    den: 'A private board of friends reading and listening to the Quran.', dar: 'لوحة خاصة لأصدقاء يقرؤون القرآن ويستمعون إليه.' },
  bp: { fn: 'pact_preview', arg: 'p_code', name: (r) => r?.from?.name,
    en: (w) => (w ? `${w} invites you to a bedtime pact` : "Seven nights of the bedtime du'a"),
    ar: (w) => (w ? `${w} يدعوك إلى عهد دعاء النوم` : 'سبع ليالٍ من دعاء النوم معًا'),
    den: "Say the bedtime du'a together for seven nights.", dar: 'نقول دعاء النوم معًا سبع ليالٍ.' },
  relight: { fn: 'relight_preview', arg: 'code', name: (r) => r?.name,
    en: (w, r) => (w ? `Help ${w} relight a ${r?.streak ? `${r.streak}-day ` : ''}streak` : 'Help relight my streak'),
    ar: (w) => (w ? `ساعد ${w} على إعادة إشعال سلسلته` : 'ساعدني لأعيد إشعال سلسلتي'),
    den: 'One tap on Ayah Studio brings the flame back.', dar: 'ضغطة واحدة تعيد الشعلة.' },
  join: { fn: 'circle_preview', arg: 'code', name: (r) => (Array.isArray(r) ? r[0]?.name : r?.name),
    en: (w) => (w ? `Join “${w}” on Ayah Studio` : 'Join our family circle'),
    ar: (w) => (w ? `انضم إلى «${w}» على Ayah Studio` : 'انضم إلى دائرة عائلتنا'),
    den: "Children's surahs, du'a notes and encouragement, together.", dar: 'سور الأطفال ودعوات وتشجيع، معًا.' },
};

async function preview(kind, code) {
  const k = KINDS[kind];
  try {
    const r = await fetch(`${SUPABASE}/rest/v1/rpc/${k.fn}`, {
      method: 'POST',
      headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ [k.arg]: code }),
      signal: AbortSignal.timeout(1500),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

async function surahData(env, origin, s) {
  const r = await env.ASSETS.fetch(new Request(`${origin}/og/m/${s}.json`));
  return r.ok ? r.json() : null;
}

function page({ origin, url, app, title, description, image, lang }) {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  return `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ayah Studio">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:secure_url" content="${esc(image)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" href="${origin}/icon-b-192.png">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07130f;color:#fff;font:600 18px system-ui,sans-serif}a{color:#5eead4}</style>
</head><body><a href="${esc(app)}">${esc(title)}</a>
<script>location.replace(${JSON.stringify(app).replace(/</g, '\\u003c')})</script></body></html>`;
}

/** The preview for a share path, or null when it is not one (then the static file / app answers). */
export async function share(req, env) {
  const u = new URL(req.url);
  const origin = u.origin;
  const lang = u.searchParams.get('l') === 'ar' ? 'ar' : 'en';
  const parts = u.pathname.split('/').filter(Boolean);
  const [view, a, b, ...rest] = parts;

  if (view === 's' || view === 't') {
    const s = Number(a);
    if (!Number.isInteger(s) || s < 1 || s > 114) return null;
    const m = await surahData(env, origin, s);
    if (!m) return null;
    // /s/11/90 (an ayah), /s/11 (a surah); /t/11/90-92/reciter[/look] (a reel look to try, its first ayah).
    const ayah = Number(String(b ?? '').split('-')[0]) || 0;
    const to = Number(String(b ?? '').split('-')[1]) || ayah;
    const hash = view === 's' ? `#/s/${s}${ayah ? `/${ayah}` : ''}` : `#/t/${[a, b, ...rest].join('/')}`;
    if (ayah && (ayah > m.ayahs || to < ayah || to > m.ayahs)) return null;
    const range = ayah ? (to > ayah ? `${ayah}–${to}` : `${ayah}`) : '';
    const ref = lang === 'ar'
      ? `${m.ar}${range ? ` · ${AR_DIGITS(s)}:${AR_DIGITS(range)}` : ''}`
      : `${m.en}${range ? ` · ${s}:${range}` : ` · Surah ${s}`}`;
    const title = view === 't'
      ? (lang === 'ar' ? `اصنع مقطعًا من ${ref}` : `Make a reel of ${ref}`)
      : ref;
    const description = ayah
      ? clip(lang === 'ar' ? m.q[ayah - 1] : m.t[ayah - 1], 300)
      : (lang === 'ar' ? `${AR_DIGITS(m.ayahs)} آية · اقرأ واستمع على Ayah Studio` : `${m.tr} · ${m.ayahs} ayat · read and listen on Ayah Studio`);
    const image = ayah ? `${origin}/og/a/${s}/${ayah}.jpg` : `${origin}/og/s/${s}.jpg`;
    return page({ origin, url: u.href, app: `${origin}/i/${hash}`, title, description, image, lang });
  }

  if (KINDS[view] && a && /^[A-Za-z0-9_-]{3,64}$/.test(a)) {
    const k = KINDS[view];
    const r = await preview(view, a);
    const raw = k.name(r);
    const who = typeof raw === 'string' && raw.trim() ? clip(raw.trim(), 40) : '';
    return page({
      origin, url: u.href, app: `${origin}/i/#/${view}/${a}`, lang,
      title: lang === 'ar' ? k.ar(who, r) : k.en(who, r),
      description: lang === 'ar' ? k.dar : k.den,
      image: `${origin}/og/k/${view}.jpg`,
    });
  }
  return null;
}

export default {
  async fetch(req, env) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const html = await share(req, env).catch(() => null);
      if (html) {
        return new Response(req.method === 'HEAD' ? null : html, {
          headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=600', 'x-content-type-options': 'nosniff' },
        });
      }
    }
    // Not a share link after all (or a path the app itself uses): the app.
    const u = new URL(req.url);
    const parts = u.pathname.split('/').filter(Boolean);
    return Response.redirect(`${u.origin}/#/${parts.join('/')}`, 302);
  },
};
