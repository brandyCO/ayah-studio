// "Follow my voice" in a tasmi': the phone's speech recognition, listening while the learner recites, so the
// hidden words appear as they are said (matching: src/engine/follow.ts). In the Android app: the system
// recogniser through SpeechPlugin.java (on the device where Android has the Arabic pack); in a browser: the
// Web Speech API where it exists (Chrome sends the sound to Google to turn it into text). Only text comes
// back, nothing is kept. A recogniser stops after each pause, so the next utterance starts at once.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

interface SpeechNative {
  available(): Promise<{ available: boolean; onDevice: boolean }>;
  start(o: { lang: string }): Promise<{ onDevice: boolean }>;
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

let avail: Promise<boolean> | null = null;
/** Whether this device can follow a recitation. */
export function followSupported(): Promise<boolean> {
  avail ??= native() ? Speech.available().then((r) => r.available).catch(() => false) : Promise.resolve(!!WebCtor());
  return avail;
}

export interface FollowHandlers {
  /** The current utterance as heard so far (`final`: the recogniser is done with it). */
  heard(text: string, final: boolean): void;
  /** Listening stopped for good: 'denied' (no microphone), 'failed' (no recogniser) or 'stopped'. */
  ended(why: 'denied' | 'failed' | 'stopped'): void;
}
export interface Follower { stop(): void }

/** Starts listening in Arabic; keeps listening across pauses until stop(). */
export async function startFollow(on: FollowHandlers): Promise<Follower | null> {
  let alive = true, fails = 0;
  const finish = (why: 'denied' | 'failed' | 'stopped') => { if (!alive) return; alive = false; on.ended(why); };
  if (native()) {
    const subs: PluginListenerHandle[] = [];
    const again = async () => {
      if (!alive) return;
      try { await Speech.start({ lang: 'ar-SA' }); }
      catch (e) { finish(String((e as { code?: string })?.code ?? e).includes('denied') ? 'denied' : 'failed'); }
    };
    subs.push(await Speech.addListener('partial', (d) => { if (alive && d.text) { fails = 0; on.heard(d.text, false); } }));
    subs.push(await Speech.addListener('result', (d) => { if (alive) { if (d.text) fails = 0; on.heard(d.text ?? '', true); } }));
    // 7 no match, 6 silence: just listen again; 9 no permission; others a few times, then give up
    subs.push(await Speech.addListener('error', (d) => { if (d.code === 9) finish('denied'); else if (d.code !== 6 && d.code !== 7 && ++fails > 4) finish('failed'); }));
    subs.push(await Speech.addListener('end', () => { if (alive) window.setTimeout(() => void again(), 60); }));
    await again();
    const stop = () => { if (!alive) return; alive = false; void Speech.stop(); subs.forEach((x) => void x.remove()); };
    return { stop: () => { stop(); on.ended('stopped'); } };
  }
  const Ctor = WebCtor();
  if (!Ctor) return null;
  let r: WebRec;
  const open = () => {
    r = new Ctor();
    r.lang = 'ar-SA';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    // a continuous session gives one result per pause; each is followed on its own from where the last ended
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) on.heard(e.results[i][0].transcript, e.results[i].isFinal);
      fails = 0;
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') finish('denied');
      else if (e.error !== 'no-speech' && e.error !== 'aborted' && ++fails > 4) finish('failed');
    };
    r.onend = () => { if (alive) window.setTimeout(() => { if (alive) try { open(); } catch { finish('failed'); } }, 60); };
    r.start();
  };
  try { open(); } catch { return null; }
  return { stop: () => { if (!alive) return; alive = false; try { r.abort(); } catch { /* already stopped */ } on.ended('stopped'); } };
}
