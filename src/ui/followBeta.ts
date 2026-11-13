// Follow my voice beta (owner decision 2026-11-13): after a recitation followed by voice, one small row of
// counts goes to Supabase (`follow_stat()`, supabase/migrations/20261113200000_follow_beta.sql) so the owner can
// see how well each phone's recogniser does — which recogniser, how many words it heard and marked, how many the
// reciter corrected at the check. Never audio, never the recognised text, never the account; the app's random
// install id groups a phone's rows. "The voice heard me wrong" at the check opens the problem report sheet
// (kind 'follow') with the same counts and the word positions involved.
import { SUPABASE_KEY, SUPABASE_URL } from '../cloud/config';
import { installId } from '../net';
import { isNative } from '../native';
import { followUse, resetFollowUse, type FollowUse } from './follow';
import { openReport, type ReportContext } from './report';

/** What the phone marked and what the reciter kept at the check (sets of word keys). */
export interface FollowOutcome {
  mode: 'lesson' | 'page';
  ref: string;                 // "67:1-5" or "p:562"
  words: number;               // words recited from memory
  said: Set<string>;           // heard as said
  skipped: Set<string>;        // marked passed over (pre-marked missed at the check)
  wrong: Set<string>;
  unclear: Set<string>;
  missed: Set<string>;         // missed at the check, as the reciter left it
  helped: number;              // "Stuck? Next word" and peeks
  verdict?: number;            // 0 not yet · 1 a few slips · 2 had it
}

const osOf = () => {
  const m = /Android ([\d.]+)(?:; ([^;)]+))?/.exec(navigator.userAgent);
  if (m) return `android ${m[1]}${m[2] && m[2] !== 'K' ? ` · ${m[2].trim()}` : ''}`.slice(0, 60);
  if (/iPhone|iPad/.test(navigator.userAgent)) return 'ios';
  return /Windows/.test(navigator.userAgent) ? 'windows' : /Mac OS/.test(navigator.userAgent) ? 'mac' : 'other';
};
const browserOf = () => /Edg\//.test(navigator.userAgent) ? 'edge' : /SamsungBrowser/.test(navigator.userAgent) ? 'samsung'
  : /Chrome\//.test(navigator.userAgent) ? 'chrome' : /Safari\//.test(navigator.userAgent) ? 'safari' : 'other';

function counts(o: FollowOutcome, u: FollowUse) {
  let untapped = 0, added = 0;
  for (const k of o.skipped) if (!o.missed.has(k)) untapped++;   // the phone said "passed over", the reciter said no
  for (const k of o.missed) if (o.said.has(k)) added++;          // the phone heard it, the reciter says it was missed
  return {
    v: 1, mode: o.mode, ref: o.ref.slice(0, 20), engine: u.engine || '?', way: u.way, app: isNative() ? 'android' : 'web',
    os: osOf(), browser: isNative() ? undefined : browserOf(), build: __BUILD__, lang: document.documentElement.lang,
    words: o.words, said: o.said.size, skipped: o.skipped.size, wrong: o.wrong.size, unclear: o.unclear.size,
    missed: o.missed.size, untapped, added, helped: o.helped, verdict: o.verdict,
    secs: Math.round(u.ms / 1000), parts: u.parts, runs: u.runs, ended: u.ended, code: u.code || undefined,
  };
}

/** Sends the counts once a recitation followed by voice is checked (fire and forget). */
export function sendFollowStat(o: FollowOutcome) {
  const u = followUse();
  if (!u || !o.words) return;
  const stat = counts(o, u);
  resetFollowUse(); // once per check
  void fetch(`${SUPABASE_URL}/rest/v1/rpc/follow_stat`, {
    method: 'POST', keepalive: true,
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ stat, install: installId() }),
  }).catch(() => { /* offline: a beta stat is not worth keeping */ });
}

const keys = (s: Set<string>) => [...s].slice(0, 20).join(' ');

/** "The voice heard me wrong": the report sheet with what the phone marked. */
export function reportFollow(o: FollowOutcome) {
  const u = followUse();
  const c = u ? counts(o, u) : { ref: o.ref, words: o.words };
  const ctx: ReportContext = {
    ...Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) as ReportContext,
    skippedK: keys(o.skipped), wrongK: keys(o.wrong), unclearK: keys(o.unclear), missedK: keys(o.missed),
  };
  openReport(ctx, { kind: 'follow', summary: `${o.ref} · ${u?.engine ?? ''}` });
}
