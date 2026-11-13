// "Follow my voice" in a tasmi': the phone's speech recognition, listening while the learner recites, so the
// hidden words appear as they are said (matching: src/engine/follow.ts). In the Android app: the system
// recogniser through SpeechPlugin.java (on the device where Android has the Arabic pack); in a browser: the
// Web Speech API where it exists (Chrome sends the sound to Google to turn it into text). Only text comes
// back, nothing is kept. A recogniser stops after each pause, so the next utterance starts at once.
// With our harakat server set up (VITE_HARAKAT_URL, server/harakat) and the learner signed in, the phone's
// recogniser is not used: the app records the recitation itself, cuts it at each pause and sends each part
// to the server, which hears it, finds the words said (the same matching) and checks their harakat. The
// audio is checked in memory there and never kept.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { account } from '../cloud/auth';
import { supabase } from '../cloud/supabase';
import type { PartResult } from './harakatClips';

interface SpeechNative {
  available(): Promise<{ available: boolean; onDevice: boolean; arabic?: 'yes' | 'no' | 'unknown' }>;
  start(o: { lang: string; hints?: string[] }): Promise<{ onDevice: boolean; way?: string }>;
  mic(): Promise<{ granted: boolean }>;
  stop(): Promise<void>;
  addListener(e: 'partial' | 'result', f: (d: { text: string }) => void): Promise<PluginListenerHandle>;
  addListener(e: 'end', f: () => void): Promise<PluginListenerHandle>;
  addListener(e: 'error', f: (d: { code: number }) => void): Promise<PluginListenerHandle>;
}
const Speech = registerPlugin<SpeechNative>('Speech');

type WebRec = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
const WebCtor = (): (new () => WebRec) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => WebRec; webkitSpeechRecognition?: new () => WebRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const native = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Speech');

const HARAKAT = ((import.meta.env.VITE_HARAKAT_URL as string | undefined) ?? '').replace(/\/+$/, '');
const canRecord = () => !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== 'undefined';
/** The signed-in learner's token when the harakat server can be used, else null. */
async function serverToken(): Promise<string | null> {
  if (!HARAKAT || !canRecord()) return null;
  try {
    if (!account()) return null;
    const { data } = await (await supabase()).auth.getSession();
    return data.session?.access_token ?? null;
  } catch { return null; }
}
/** Whether the harakat are checked too (server set up and signed in). */
export async function followChecksHarakat(): Promise<boolean> { return !!(await serverToken()); }

/** The last error the phone's recogniser gave before listening stopped ('failed'), for the message. */
let lastCode = 0;
/** Why Follow my voice stopped with 'failed', in words: no Arabic on the phone's recogniser, or the code. */
export function followFailKey(): { key: 'learn.followNoArabic' | 'learn.followFailedCode'; code: number } {
  return { key: [12, 13, 14, 15].includes(lastCode) ? 'learn.followNoArabic' : 'learn.followFailedCode', code: lastCode };
}
/** In the app: asks for the microphone the native way first, so a refusal is clear (Record me). */
export async function askMic(): Promise<boolean> {
  if (!native()) return true;
  try { return (await Speech.mic()).granted; } catch { return true; }
}

/** A phone whose recogniser failed in Arabic hides the button for 3 days (then tries again: Arabic may have
 * been added since). localStorage `followBroken` = when it failed. */
const BROKEN_DAYS = 3;
const broken = () => { try { return Date.now() - Number(localStorage.getItem('followBroken') || 0) < BROKEN_DAYS * 864e5; } catch { return false; } };
function markBroken(on: boolean) { try { if (on) localStorage.setItem('followBroken', String(Date.now())); else localStorage.removeItem('followBroken'); } catch { /* blocked */ } }

let avail: Promise<boolean> | null = null;
/** Whether this device can follow a recitation (in the app: only when its recogniser knows Arabic or might). */
export function followSupported(): Promise<boolean> {
  avail ??= native() ? Speech.available().then((r) => r.available && r.arabic !== 'no' && !broken()).catch(() => false) : Promise.resolve(!!WebCtor() && !broken());
  return avail.then(async (ok) => ok || !!(await serverToken()));
}

export interface FollowHandlers {
  /** The current utterance as heard so far (`final`: the recogniser is done with it). */
  heard(text: string, final: boolean): void;
  /** Listening stopped for good: 'denied' (no microphone), 'failed' (no recogniser), 'quiet' (nothing heard
   * for a while, to spare the battery) or 'stopped'. */
  ended(why: Why): void;
  /** Phrases to expect next (the coming words of the text), given to the recogniser when it can use them. */
  hints?(): string[];
  /** The text from where the reciter is now (words as written): the harakat server matches parts to it. */
  ahead?(): string[];
  /** Server only, just before heard(…, true) for the same part: what the server found (indices into the
   * ahead() sent with it; `flags` = said with another haraka) and the part's audio. */
  checked?(r: PartResult, pcm: Int16Array): void;
}
type Why = 'denied' | 'failed' | 'quiet' | 'stopped' | 'limit';
export interface Follower { stop(): void }
/** What listening was like since resetFollowUse() (beta stats, src/ui/followBeta.ts): no audio, no text. */
export interface FollowUse { engine: string; way: string; ms: number; parts: number; runs: number; ended: string; code: number }
let use: FollowUse | null = null;
export const followUse = (): FollowUse | null => use;
export function resetFollowUse() { use = null; }
/** Nothing heard for this long: the microphone stops by itself. */
const QUIET_MS = 20_000;

/** Starts listening in Arabic; keeps listening across pauses until stop(). */
export async function startFollow(on: FollowHandlers): Promise<Follower | null> {
  let alive = true, fails = 0, lastHeard = Date.now();
  let stopNow = () => {};
  lastCode = 0;
  let token: string | null = null;
  const runAt = Date.now();
  const u = (use ??= { engine: '', way: '', ms: 0, parts: 0, runs: 0, ended: '', code: 0 });
  u.runs++;
  const finish = (why: Why) => {
    if (!alive) return;
    stopNow(); alive = false; clearInterval(quiet);
    u.ms += Date.now() - runAt; u.ended = why; u.code = lastCode;
    // the phone's recogniser cannot do it: hide the button on this phone (not when it was the server)
    if (why === 'failed' && !heardAny && !token) { markBroken(true); avail = Promise.resolve(false); }
    on.ended(why);
  };
  const quiet = window.setInterval(() => { if (Date.now() - lastHeard > QUIET_MS) finish('quiet'); }, 2000);
  let heardAny = false;
  const got = (text: string, final: boolean) => { if (final && text.trim()) u.parts++; if (text.trim()) { lastHeard = Date.now(); if (!heardAny) { heardAny = true; markBroken(false); } } on.heard(text, final); };
  token = on.ahead ? await serverToken() : null;
  if (token) {
    u.engine = 'server';
    const r = await recordParts(token, on, got, finish, () => alive);
    if (!r) { alive = false; clearInterval(quiet); return null; }
    stopNow = r;
    return { stop: () => finish('stopped') };
  }
  if (native()) {
    const subs: PluginListenerHandle[] = [];
    const again = async () => {
      if (!alive) return;
      try {
        const r = await Speech.start({ lang: 'ar-SA', hints: on.hints?.() ?? [] });
        u.engine = r.onDevice ? 'android-device' : 'android'; u.way = String(r.way ?? '').slice(0, 80);
      }
      catch (e) { lastCode = lastCode || -1; finish(String((e as { code?: string })?.code ?? e).includes('denied') ? 'denied' : 'failed'); }
    };
    subs.push(await Speech.addListener('partial', (d) => { if (alive && d.text) { fails = 0; got(d.text, false); } }));
    subs.push(await Speech.addListener('result', (d) => { if (alive) { if (d.text) fails = 0; got(d.text ?? '', true); } }));
    // 7 no match, 6 silence: just listen again; 8 busy: again a little later; 9 no permission; others a few
    // times, then give up (the plugin has already tried every recogniser on the phone for 12/13)
    let wait = 60;
    subs.push(await Speech.addListener('error', (d) => {
      wait = d.code === 8 ? 400 : 60;
      if (d.code === 9) finish('denied');
      else if (d.code === 8) { if (++fails > 12) { lastCode = 8; finish('failed'); } }
      else if (d.code !== 6 && d.code !== 7 && ++fails > 4) { lastCode = d.code; finish('failed'); }
    }));
    subs.push(await Speech.addListener('end', () => { if (alive) window.setTimeout(() => void again(), wait); }));
    stopNow = () => { void Speech.stop(); subs.forEach((x) => void x.remove()); };
    await again();
    return { stop: () => finish('stopped') };
  }
  const Ctor = WebCtor();
  if (!Ctor) { alive = false; clearInterval(quiet); return null; }
  u.engine = 'web';
  let r: WebRec;
  const open = () => {
    r = new Ctor();
    r.lang = 'ar-SA';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    // a continuous session gives one result per pause; each is followed on its own from where the last ended
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) got(e.results[i][0].transcript, e.results[i].isFinal);
      fails = 0;
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') finish('denied');
      else if (e.error !== 'no-speech' && e.error !== 'aborted' && ++fails > 4) finish('failed');
    };
    r.onend = () => { if (alive) window.setTimeout(() => { if (alive) try { open(); } catch { finish('failed'); } }, 60); };
    r.start();
  };
  stopNow = () => { try { r.abort(); } catch { /* already stopped */ } };
  try { open(); } catch { alive = false; clearInterval(quiet); return null; }
  return { stop: () => finish('stopped') };
}

// --- the harakat server: record, cut at pauses, check each part in turn ---
const RATE = 16000, FRAME = 320; // 20 ms
const PRE = 15, END_QUIET = 30, MIN_SPEECH = 40, MAX_FRAMES = 600; // 0.3 s before, 0.6 s pause, 0.8 s, 12 s

async function recordParts(token: string, on: FollowHandlers, got: (t: string, f: boolean) => void,
  finish: (why: Why) => void, alive: () => boolean): Promise<(() => void) | null> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    finish((e as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'failed');
    return () => {};
  }
  let ctx: AudioContext;
  try { ctx = new AudioContext({ sampleRate: RATE }); } catch { ctx = new AudioContext(); }
  const step = ctx.sampleRate / RATE; // the browser may not record at 16 kHz: take every step-th sample
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  const sink = ctx.createGain(); sink.gain.value = 0;
  src.connect(proc); proc.connect(sink); sink.connect(ctx.destination);

  const frames: Float32Array[] = [], level: number[] = [];
  let carry = new Float32Array(0), pos = 0, floor = -50;
  let start = -1, quietN = 0, speechN = 0;
  const queue: Int16Array[] = [];
  let busy = false, fails = 0;

  const send = async () => {
    if (busy || !queue.length || !alive()) return;
    busy = true;
    const pcm = queue.shift()!;
    const words = on.ahead?.() ?? [];
    try {
      const res = await fetch(`${HARAKAT}/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ audio: b64(pcm), words: words.slice(0, 100) }),
      });
      if (res.status === 429) { finish('limit'); return; }
      if (!res.ok) throw new Error(String(res.status));
      const r = await res.json() as PartResult & { heard: string };
      fails = 0;
      if (alive()) { on.checked?.({ said: r.said ?? [], flags: r.flags ?? [], scores: r.scores, at: r.at }, pcm); got(r.heard ?? '', true); }
    } catch {
      if (++fails > 2) { finish('failed'); return; }
      queue.unshift(pcm);
      await new Promise((ok) => window.setTimeout(ok, 800));
    } finally { busy = false; }
    void send();
  };
  const cut = (from: number, to: number) => {
    const n = (to - from) * FRAME, out = new Int16Array(n);
    // a soft voice is brought up to a steady level (≈ −20 dBFS speech, ≤ 8×, peaks kept under −1 dBFS),
    // so quiet words reach the model as clearly as loud ones
    let peak = 1e-6, e = 0, m = 0;
    for (let f = from; f < to; f++) {
      const fr = frames[f];
      for (let i = 0; i < FRAME; i++) peak = Math.max(peak, Math.abs(fr[i]));
      if (level[f] > floor + 12) { for (let i = 0; i < FRAME; i++) e += fr[i] * fr[i]; m += FRAME; }
    }
    const rms = m ? Math.sqrt(e / m) : peak / 4;
    const gain = Math.max(1, Math.min(8, 0.1 / Math.max(rms, 1e-6), 0.89 / peak));
    for (let f = from; f < to; f++) {
      const fr = frames[f];
      for (let i = 0; i < FRAME; i++) out[(f - from) * FRAME + i] = Math.max(-32768, Math.min(32767, Math.round(fr[i] * gain * 32767)));
    }
    queue.push(out);
    void send();
  };
  const frame = (fr: Float32Array) => {
    let e = 0; for (let i = 0; i < fr.length; i++) e += fr[i] * fr[i];
    const db = 10 * Math.log10(e / fr.length + 1e-10);
    // the room's noise floor: follows quiet moments down at once, louder ones up slowly
    floor = db < floor ? db : floor + 0.02;
    const f = frames.push(fr) - 1; level.push(db);
    const speech = db > floor + 12;
    if (start < 0) {
      if (speech) { start = Math.max(0, f - PRE); quietN = 0; speechN = 0; }
      else if (frames.length > PRE * 4) { frames.splice(0, frames.length - PRE); level.splice(0, level.length - PRE); }
      return;
    }
    if (speech) { quietN = 0; speechN++; } else quietN++;
    if (quietN >= END_QUIET && speechN >= MIN_SPEECH) {
      cut(start, f - 20);
      frames.splice(0); level.splice(0); start = -1;
    } else if (f - start >= MAX_FRAMES) {
      // a long breath: cut at the quietest moment of its last 2 s
      let q = f - 100;
      for (let i = f - 100; i <= f; i++) if (level[i] < level[q]) q = i;
      cut(start, q);
      frames.splice(0, q); level.splice(0, q); start = 0; quietN = 0; speechN = 0;
    } else if (quietN >= END_QUIET * 3) { frames.splice(0); level.splice(0); start = -1; } // a cough or a click
  };
  proc.onaudioprocess = (ev) => {
    if (!alive()) return;
    const inp = ev.inputBuffer.getChannelData(0);
    const take = step === 1 ? inp : Float32Array.from({ length: Math.floor((inp.length - pos) / step) }, (_, i) => inp[Math.floor(pos + i * step)]);
    if (step !== 1) pos = (pos + take.length * step) - inp.length;
    const all = new Float32Array(carry.length + take.length); all.set(carry); all.set(take, carry.length);
    let i = 0;
    for (; i + FRAME <= all.length; i += FRAME) frame(all.slice(i, i + FRAME));
    carry = all.slice(i);
  };
  try { await ctx.resume(); } catch { /* starts on its own */ }
  return () => {
    proc.onaudioprocess = null;
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => {});
    queue.length = 0;
  };
}

function b64(pcm: Int16Array): string {
  const u = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
