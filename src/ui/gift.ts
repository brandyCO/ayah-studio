// Gift an ayah (docs/together.md T3).
//   Composer: selection bar or editor → "Gift": the ayat (≤ 10), reciter, the current reel look, an
//   optional message (≤ 140, or a preset) and the sender's name → a link to share.
//   #/gift/{id}: anyone with the link, no install or account: a sealed card "A gift from Aisha"; a tap
//   opens it — the recitation plays and the ayat appear in the chosen look, word-synced, drawn by the
//   same engine as the editor's preview (render() + the reel's recitation). The message shows below
//   in the UI font, attributed — never on the video, never like the ayah. Then: Reply with an ayah
//   (a gift back, linked to this one), Make it a reel, Read in the mushaf.
//   ☰ → Gifts: gifts received on this device, and (signed in) gifts sent with their replies.
import { reelTranslation } from '../data/translations';
import { account, onAccount } from '../cloud/auth';
import { arrangeAudio } from '../data/audio';
import { newDraftId, saveDraft, draftHash } from '../data/drafts';
import { loadMeta, loadWordMap, reference, surahText, surahTranslation, surahWordMeanings, type SurahMeta } from '../data/quran';
import { DEFAULT_RECITER, RECITERS, reciterById, reciterPickerLabel } from '../data/reciters';
import { BACKGROUNDS, backgroundById, loadBackground, type BackgroundMedia } from '../engine/backgrounds';
import { H, W } from '../engine/layout';
import { applyLook, frameStyle, lookOf, MAX_AYAT, newProject, pacing, strictLook, type Look, type Project } from '../engine/project';
import { arrangeReel, voiceOnset } from '../engine/recitation';
import { render } from '../engine/render';
import { prepareScenes, sceneSpans } from '../engine/scenes';
import { buildTimeline, type Timeline } from '../engine/timeline';
import { displayWords, parseSpans, wordMeanings } from '../engine/words';
import {
  deleteGift, ensureSender, errorText, forgetReceived, getGift, giftLink, MESSAGE_MAX, myGifts, NAME_MAX, pendingReply,
  PRESETS, received, rememberReceived, sendGift, setPendingReply, validGiftId, type Gift, type MyGift,
} from '../together/gifts';
import { openAccount } from './account';
import { h, toast } from './dom';
import { icon } from './icons';
import { reelLook, reelReciter } from './prefs';
import { loadReel } from './reelSource';

const BUILT_IN = new Set(BACKGROUNDS.map((b) => b.id));
const builtIn = (id: string) => BUILT_IN.has(id);
/** The look as sent: the receiver does not have the sender's own media, so only the built-in
 *  backgrounds travel (with their clip settings); without any, the default background. */
export function giftLook(look: Look): Partial<Look> {
  const out: Partial<Look> = structuredClone(look);
  const keep = look.scenes.map((id, i) => (BUILT_IN.has(id) ? i : -1)).filter((i) => i >= 0);
  if (keep.length) {
    out.scenes = keep.map((i) => look.scenes[i]);
    out.clips = keep.map((i) => look.clips[i] ?? null).slice(0, out.scenes.length);
    out.sceneLengths = look.sceneLengths.length === look.scenes.length ? keep.map((i) => look.sceneLengths[i]) : [];
  } else {
    out.scenes = ['mist'];
    out.clips = [];
    out.sceneLengths = [];
  }
  return out;
}
const usesOwnMedia = (look: Look) => look.scenes.some((id) => !BUILT_IN.has(id));

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

function sheet(cls: string, ...content: (Node | string | false)[]) {
  const d = h('dialog', { class: `sheet bottom ${cls}` }, ...content);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
  return d;
}
const head = (text: string, close: () => void) =>
  h('div', { class: 'sheet-head' }, h('h2', {}, text), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, '✕'));

async function shareLink(url: string, text: string) {
  try {
    if (navigator.share) return await navigator.share({ title: 'A gift from Ayah Studio', text, url });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Link copied');
  } catch {
    toast(url);
  }
}

// --- composer ---

/** The look and reciter a gift is sent with: the editor's current reel, or the remembered reel look. */
export interface GiftSource {
  look: Look;
  reciter: number;
}
function defaultSource(s: SurahMeta, lo: number, hi: number): GiftSource {
  const p = newProject(s.n, lo, hi, reciterById(reelReciter(DEFAULT_RECITER)).id);
  applyLook(p, reelLook(), () => true);
  return { look: lookOf(p), reciter: p.reciterId };
}

export function openGiftComposer(s: SurahMeta, lo: number, hi: number, src?: GiftSource) {
  hi = Math.min(hi, lo + MAX_AYAT - 1, s.ayahs);
  const source = src ?? defaultSource(s, lo, hi);
  let reply = pendingReply();
  const body = h('div', { class: 'gift-compose' });
  const d = sheet('gift-sheet', head('Gift an ayah', () => d.close()), body);

  const reciter = h('select', { class: 'search', 'aria-label': 'Reciter' },
    ...RECITERS.map((r) => h('option', { value: String(r.id), selected: r.id === source.reciter }, reciterPickerLabel(r))));
  const message = h('textarea', { class: 'search gift-msg', maxlength: MESSAGE_MAX, rows: 2, placeholder: 'A few words (optional)', 'aria-label': 'Message' });
  const count = h('span', { class: 'muted small gift-count' }, `0/${MESSAGE_MAX}`);
  message.addEventListener('input', () => (count.textContent = `${message.value.length}/${MESSAGE_MAX}`));
  const presets = h('div', { class: 'gift-presets' }, ...PRESETS.map((p) => h('button', { type: 'button', class: 'chip', onclick: () => {
    message.value = p;
    count.textContent = `${p.length}/${MESSAGE_MAX}`;
  } }, p)));
  const name = h('input', { class: 'search', maxlength: NAME_MAX, value: (account()?.name ?? '').split(' ')[0].slice(0, NAME_MAX), 'aria-label': 'Your name' });
  const sendBtn = h('button', { class: 'primary brand-btn', type: 'submit' }, '🎁 Create the gift link');
  const signInNote = h('div', { class: 'gift-signin', hidden: true });

  function draw() {
    const replyRow = reply
      ? h('p', { class: 'gift-reply-to' }, `A reply to ${reply.to}’s gift `,
        h('button', { type: 'button', class: 'link-btn', onclick: () => { reply = null; setPendingReply(null); draw(); } }, 'not a reply'))
      : null;
    body.replaceChildren(
      h('div', { class: 'gift-ref' }, h('b', {}, reference(s, lo, hi)), h('span', { class: 'muted small' }, `${hi - lo + 1} ${hi > lo ? 'ayat' : 'ayah'} · plays in your reel look`)),
      ...(replyRow ? [replyRow] : []),
      usesOwnMedia(source.look) ? h('p', { class: 'muted small' }, 'Your own photos and videos stay on your device — the gift uses a built-in background instead.') : '',
      h('form', { class: 'circle-form', onsubmit: (e: Event) => { e.preventDefault(); void send(); } },
        h('label', {}, 'Reciter', reciter),
        h('label', {}, h('span', { class: 'gift-label-row' }, 'Message', count), message),
        presets,
        h('label', {}, 'From (your name, as they will see it)', name),
        signInNote,
        sendBtn),
      h('p', { class: 'muted small' }, 'Anyone with the link can open the gift — no app or account needed. Only the reference, reciter, look, your name and message are stored; the ayat come from the app’s verified text.'));
  }

  async function send() {
    if (!name.value.trim()) return toast('Please write your name');
    sendBtn.disabled = true;
    try {
      const who = await ensureSender(!!reply);
      if (!who) {
        signInNote.hidden = false;
        signInNote.replaceChildren(
          h('p', { class: 'small' }, reply ? 'Sign in with Google to reply with a gift.' : 'Sign in with Google to send gifts — opening them needs no account.'),
          h('button', { type: 'button', class: 'chip', onclick: () => openAccount() }, 'Sign in with Google'));
        return;
      }
      const id = await sendGift({
        surah: s.n, from: lo, to: hi, reciter: Number(reciter.value), look: giftLook(source.look), name: name.value, message: message.value,
        replyTo: reply?.id ?? null,
      });
      if (reply) setPendingReply(null);
      done(id);
    } catch (e) {
      toast(navigator.onLine ? errorText(e) : 'You are offline — try again when you are back online.');
    } finally {
      sendBtn.disabled = false;
    }
  }

  function done(id: string) {
    const url = giftLink(id);
    const text = `A gift for you: ${reference(s, lo, hi)} — from ${name.value.trim()}`;
    body.replaceChildren(
      h('div', { class: 'gift-done' },
        h('div', { class: 'gift-seal small-seal', 'aria-hidden': 'true' }, '🎁'),
        h('h3', {}, 'Your gift is ready'),
        h('p', { class: 'muted small' }, 'Send the link — it opens in the app or in any browser.'),
        h('input', { class: 'search gift-url', readonly: true, value: url, onfocus: (e: Event) => (e.target as HTMLInputElement).select() }),
        h('div', { class: 'row center' },
          h('button', { class: 'primary brand-btn', onclick: () => void shareLink(url, text) }, 'Share'),
          h('button', { class: 'chip', onclick: async () => {
            try { await navigator.clipboard.writeText(url); toast('Link copied'); } catch { toast(url); }
          } }, 'Copy link'),
          h('a', { class: 'chip', href: `#/gift/${id}`, onclick: () => d.close() }, 'Preview'))));
  }

  const off = onAccount(() => {
    if (account() && !name.value) name.value = account()!.name.split(' ')[0].slice(0, NAME_MAX);
    if (account()) signInNote.hidden = true;
  });
  d.addEventListener('close', off);
  // Leaving the screen (e.g. back to the mushaf) closes the sheet.
  const leave = () => d.close();
  window.addEventListener('hashchange', leave);
  d.addEventListener('close', () => window.removeEventListener('hashchange', leave));
  draw();
}

// --- #/gift/{id}: the gift player ---

/** The gift, checked like the database does: a forged document never renders. */
function checkGift(g: Gift | null, meta: SurahMeta[]): string | null {
  if (!g) return 'This gift link is not valid any more.';
  const s = meta[g.surah - 1];
  const ok = !!s && Number.isInteger(g.ayah_from) && Number.isInteger(g.ayah_to) && g.ayah_from >= 1 && g.ayah_to >= g.ayah_from
    && g.ayah_to <= s.ayahs && g.ayah_to - g.ayah_from < MAX_AYAT && RECITERS.some((r) => r.id === g.reciter)
    && typeof g.from_name === 'string' && g.from_name.length <= NAME_MAX && (g.message === null || (typeof g.message === 'string' && g.message.length <= MESSAGE_MAX))
    && strictLook(g.look, builtIn);
  return ok ? null : 'This gift cannot be opened.';
}

export async function showGift(root: HTMLElement, id: string): Promise<() => void> {
  const body = h('div', { class: 'gift-page' });
  root.append(h('header', { class: 'topbar' },
    h('a', { class: 'icon-btn', href: '#/', 'aria-label': 'Home' }, '‹'),
    h('div', { class: 'brand' }, h('h1', {}, 'A gift'), h('p', { class: 'muted' }, 'Ayah Studio'))), body);
  body.replaceChildren(h('p', { class: 'muted center' }, h('span', { class: 'spinner' }), ' Opening…'));
  const fail = (msg: string) => body.replaceChildren(h('div', { class: 'gift-error' }, h('p', {}, msg), h('a', { class: 'chip', href: '#/' }, 'Go to the app')));

  if (!validGiftId(id)) {
    fail('This gift link is not valid.');
    return () => {};
  }
  let g: Gift | null;
  const meta = await loadMeta();
  try {
    g = await getGift(id);
  } catch (e) {
    fail(navigator.onLine ? `Could not open the gift: ${errorText(e)}` : 'You are offline — open the link again when you are back online.');
    return () => {};
  }
  const bad = checkGift(g, meta);
  if (bad || !g) {
    fail(bad ?? 'This gift cannot be opened.');
    return () => {};
  }
  const gift = g;
  rememberReceived(gift);
  const s = meta[gift.surah - 1];
  const project = newProject(gift.surah, gift.ayah_from, gift.ayah_to, gift.reciter);
  applyLook(project, gift.look, builtIn);
  const ref = reference(s, gift.ayah_from, gift.ayah_to);

  // The stage: the reel canvas, under a sealed card until it is opened.
  const canvas = h('canvas', { class: 'gift-canvas', width: 540, height: 960 });
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const status = h('div', { class: 'stage-status', hidden: true });
  const playBtn = h('button', { class: 'ctl play', 'aria-label': 'Play', hidden: true }, icon('play', 26));
  const seal = h('button', { class: 'gift-sealed', 'aria-label': `Open the gift from ${gift.from_name}` },
    h('span', { class: 'gift-seal', 'aria-hidden': 'true' }, '🎁'),
    h('span', { class: 'gift-from' }, gift.mine ? 'Your gift' : `A gift from ${gift.from_name}`),
    h('span', { class: 'gift-sealed-ref' }, ref),
    h('span', { class: 'gift-tap' }, 'Tap to open'));
  const stage = h('div', { class: 'gift-stage' }, canvas, status, seal);
  const note = gift.message
    ? h('figure', { class: 'gift-note' }, h('blockquote', {}, gift.message), h('figcaption', {}, `— ${gift.from_name}`))
    : h('p', { class: 'gift-note muted' }, `From ${gift.from_name}`);
  const actions = h('div', { class: 'gift-actions', hidden: true },
    h('button', { class: 'primary brand-btn', onclick: () => replyWithAyah() }, '🎁 Reply with an ayah'),
    h('button', { class: 'chip', onclick: () => void makeReel() }, '🎬 Make it a reel'),
    h('a', { class: 'chip', href: `#/s/${gift.surah}/${gift.ayah_from}` }, 'Read in the mushaf'));
  const extra = h('div', { class: 'gift-extra' });
  if (gift.reply_to) extra.append(h('p', { class: 'muted small' }, 'A reply to a gift · ', h('a', { href: `#/gift/${gift.reply_to}` }, 'see the gift it answers')));
  if (gift.mine) {
    extra.append(h('p', { class: 'muted small' }, `Opened ${gift.opens ?? 0} ${gift.opens === 1 ? 'time' : 'times'} · `,
      h('button', { class: 'link-btn', onclick: () => void shareLink(giftLink(gift.id), `A gift for you: ${ref} — from ${gift.from_name}`) }, 'share again')));
    if (gift.replies?.length) {
      extra.append(h('p', { class: 'circle-sub' }, 'Replies'), ...gift.replies.map((r) =>
        h('a', { class: 'gift-row', href: `#/gift/${r.id}` }, h('b', {}, r.from_name), h('span', { class: 'muted small' }, `${reference(meta[r.surah - 1], r.ayah_from, r.ayah_to)} · ${dateFmt.format(new Date(r.created_at))}`))));
    }
  }
  body.replaceChildren(stage, h('div', { class: 'gift-controls' }, playBtn), note, actions, extra);

  // --- the editor's preview pipeline, read-only ---
  let alive = true;
  let tl: Timeline | null = null;
  let audio: AudioBuffer | null = null;
  let media: BackgroundMedia[] = [];
  let ac: AudioContext | null = null;
  let src: AudioBufferSourceNode | null = null;
  let playing = false;
  let wantPlay = false;
  let t = 0, startCtx = 0, startT = 0;
  let dirty = true;
  const setStatus = (msg: string) => {
    status.textContent = msg;
    status.hidden = !msg;
  };

  const ready = (async () => {
    const n = gift.surah, from = gift.ayah_from, to = gift.ayah_to;
    const [allAr, allEn, allWbw, wordMap] = await Promise.all([surahText(n), surahTranslation(n), surahWordMeanings(n), loadWordMap()]);
    const arabic = allAr.slice(from - 1, to);
    const english = allEn.slice(from - 1, to);
    const meanings = arabic.map((text, i) => wordMeanings(allWbw[from - 1 + i], parseSpans(wordMap[`${n}:${from + i}`]), displayWords(text).length));
    await Promise.all([document.fonts.load('80px "UthmanicHafs"', arabic[0]), document.fonts.load('54px "AmiriQuran"', s.ar)]).catch(() => {});
    const r = reciterById(project.reciterId);
    const [reel, scenes] = await Promise.all([
      loadReel(r, n, from, arabic, wordMap, () => {}),
      Promise.all(project.scenes.map((sid) => loadBackground(backgroundById(sid)).catch(() => ({ bg: backgroundById('charcoal') }) as BackgroundMedia))),
    ]);
    if (!alive) return;
    if (reel.plan.onset === undefined) reel.plan.onset = voiceOnset(reel.audio.getChannelData(0), reel.audio.sampleRate, reel.plan.ayat[0].start);
    const pc = pacing(project);
    const plan = arrangeReel(reel.plan, pc);
    audio = pc.pause || pc.intro || pc.outro || pc.gaps.some(Boolean) ? arrangeAudio(reel.audio, plan.pieces!, plan.duration) : reel.audio;
    media = scenes;
    tl = buildTimeline(document.createElement('canvas').getContext('2d')!, {
      translation: reelTranslation(),
      surah: s, reciter: r, plan, arabic, english, meanings,
      mode: plan.wordTimed ? project.textMode : 'ayah', // never guess sync (rule 8)
      wordsPerStep: project.wordsPerStep, translationMode: project.translationMode,
      style: frameStyle(project), sceneMode: project.sceneMode, sceneCount: project.scenes.length, sceneLengths: project.sceneLengths,
    });
    dirty = true;
  })();
  ready.catch((e) => {
    console.error(e);
    setStatus(navigator.onLine ? 'The recitation could not be loaded. Check your connection and open the link again.'
      : 'You are offline — open the link again when you are back online.');
  });

  async function play() {
    if (!audio || !tl || !ac) return;
    await ac.resume();
    if (t >= tl.duration - 0.05) t = 0;
    src = ac.createBufferSource();
    src.buffer = audio;
    src.connect(ac.destination);
    src.start(0, t);
    startCtx = ac.currentTime;
    startT = t;
    playing = true;
    setPlayIcon();
  }
  function pause() {
    if (src) {
      try { src.stop(); } catch { /* already stopped */ }
      src.disconnect();
      src = null;
    }
    if (playing && ac) t = startT + ac.currentTime - startCtx;
    playing = false;
    setPlayIcon();
    dirty = true;
  }
  const setPlayIcon = () => {
    playBtn.replaceChildren(icon(playing ? 'pause' : 'play', 26));
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  };
  playBtn.onclick = () => (playing ? pause() : void play());

  seal.onclick = async () => {
    // Created in the tap, so the browser lets the recitation play.
    ac ??= new AudioContext();
    void ac.resume();
    seal.classList.add('open');
    setTimeout(() => seal.remove(), 900);
    playBtn.hidden = false;
    actions.hidden = false;
    wantPlay = true;
    if (!tl) setStatus('Loading recitation…');
    await ready.catch(() => {});
    if (!alive || !tl) return;
    setStatus('');
    if (wantPlay) void play();
  };

  // Canvas size: one pixel per screen pixel, never more than the export's 1080.
  const resize = () => {
    const w = Math.min(1080, Math.round(canvas.getBoundingClientRect().width * (devicePixelRatio || 1))) || 540;
    canvas.width = w;
    canvas.height = Math.round((w * H) / W);
    ctx.setTransform(w / W, 0, 0, w / W, 0, 0);
    dirty = true;
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!tl) return;
    if (playing && ac) {
      t = startT + ac.currentTime - startCtx;
      if (t >= tl.duration) {
        pause();
        t = tl.duration;
        actions.classList.add('glow');
      }
      dirty = true;
    }
    void prepareScenes(sceneSpans(tl.scenes, project.transition), t, media, project.clips, true)?.then(() => (dirty = true));
    if (!dirty) return;
    dirty = false;
    render(ctx, t, project, tl, media);
  }
  raf = requestAnimationFrame(frame);

  function replyWithAyah() {
    setPendingReply({ id: gift.id, to: gift.from_name });
    pause();
    location.hash = `#/s/${gift.surah}/${gift.ayah_from}`;
    setTimeout(() => toast('Long-press an ayah to choose your reply, then tap 🎁 Gift'), 400);
  }

  async function makeReel() {
    const id = newDraftId();
    const now = Date.now();
    await saveDraft({ id, project: structuredClone(project) as Project, created: now, updated: now });
    location.hash = draftHash(project, id);
  }

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    pause();
    void ac?.close();
    for (const m of media) m.video?.dispose();
  };
}

// --- ☰ → Gifts ---
export async function openGifts() {
  const meta = await loadMeta();
  const body = h('div', { class: 'gifts' });
  const d = sheet('gifts-sheet', head('Gifts', () => d.close()), body);
  const ref = (x: { surah: number; ayah_from: number; ayah_to: number }) => reference(meta[x.surah - 1], x.ayah_from, x.ayah_to);
  const go = (id: string) => { d.close(); location.hash = `#/gift/${id}`; };

  async function draw() {
    const got = received();
    const parts: Node[] = [
      h('p', { class: 'muted small' }, 'Long-press an ayah in the mushaf and tap 🎁 Gift to send one.'),
      h('p', { class: 'circle-sub' }, 'Received on this device'),
      got.length
        ? h('div', { class: 'gift-list' }, ...got.map((x) => h('div', { class: 'gift-row' },
          h('button', { class: 'gift-row-main', onclick: () => go(x.id) }, h('b', {}, x.from), h('span', { class: 'muted small' }, `${ref(x)} · ${dateFmt.format(new Date(x.at))}`)),
          h('button', { class: 'icon-btn', 'aria-label': 'Remove from this list', onclick: () => { forgetReceived(x.id); void draw(); } }, '✕'))))
        : h('p', { class: 'muted small' }, 'Gifts you open appear here.'),
    ];
    body.replaceChildren(...parts);
    if (!account()) {
      body.append(h('p', { class: 'circle-sub' }, 'Sent'), h('p', { class: 'muted small' }, 'Sign in to send gifts and see who replied.'),
        h('button', { class: 'chip', onclick: () => openAccount() }, 'Sign in with Google'));
      return;
    }
    const sent = h('div', { class: 'gift-list' }, h('p', { class: 'muted small' }, h('span', { class: 'spinner' }), ' Loading…'));
    body.append(h('p', { class: 'circle-sub' }, 'Sent and replies'), sent);
    let mine: MyGift[];
    try {
      mine = await myGifts();
    } catch (e) {
      sent.replaceChildren(h('p', { class: 'muted small' }, navigator.onLine ? errorText(e) : 'You are offline.'));
      return;
    }
    if (!mine.length) return sent.replaceChildren(h('p', { class: 'muted small' }, 'Nothing sent yet.'));
    sent.replaceChildren(...mine.map((x) => h('div', { class: 'gift-row' },
      h('button', { class: 'gift-row-main', onclick: () => go(x.id) },
        h('b', {}, x.kind === 'reply' ? `${x.from_name} replied` : ref(x)),
        h('span', { class: 'muted small' }, x.kind === 'reply'
          ? `${ref(x)} · ${dateFmt.format(new Date(x.created_at))}`
          : `${dateFmt.format(new Date(x.created_at))} · opened ${x.opens ?? 0}× ${x.replies ? `· ${x.replies} ${x.replies === 1 ? 'reply' : 'replies'}` : ''}`)),
      x.kind === 'sent' ? h('button', { class: 'icon-btn', 'aria-label': 'Delete this gift', onclick: async () => {
        if (!confirm('Delete this gift? Its link will stop working.')) return;
        try { await deleteGift(x.id); void draw(); } catch (e) { toast(errorText(e)); }
      } }, '✕') : '')));
  }
  const off = onAccount(() => void draw());
  d.addEventListener('close', off);
}
