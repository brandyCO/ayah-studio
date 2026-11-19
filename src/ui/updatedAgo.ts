// "Updated 5 min ago" (thread "Make the whole app fast", 2026-11-19, owner: "small text in front of the friends"): a
// quiet line beside data kept on the phone (friends, league, streaks) when it is not fresh or the phone is offline.
// A small cloud-off mark + the time in the interface language (Intl.RelativeTimeFormat), so no new strings are needed.
import { locale } from '../i18n';

let rel: Intl.RelativeTimeFormat | null = null;
/** "5 min ago", "2 hr ago", "yesterday" in the interface language. */
export function agoText(ms: number): string {
  rel ??= new Intl.RelativeTimeFormat(locale(), { numeric: 'auto', style: 'short' });
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return rel.format(0, 'second');
  if (s < 3600) return rel.format(-Math.floor(s / 60), 'minute');
  if (s < 86400) return rel.format(-Math.floor(s / 3600), 'hour');
  return rel.format(-Math.floor(s / 86400), 'day');
}

const CLOUD = '<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18z"/><path d="M3 3l18 18"/></svg>';

/** Whether data from `ms` needs the note: offline, or older than `freshMs` (2 min). */
export const needsNote = (ms: number | null, freshMs = 120_000) => ms !== null && (navigator.onLine === false || Date.now() - ms > freshMs);

/** The note's element (empty and hidden when the data is fresh); `update()` keeps it current. */
export function updatedNote(at: () => number | null, freshMs = 120_000): HTMLElement & { update(): void } {
  const el = document.createElement('span') as HTMLElement & { update(): void };
  el.className = 'updated-ago';
  el.update = () => {
    const ms = at();
    const show = needsNote(ms, freshMs);
    el.hidden = !show;
    if (show) el.innerHTML = `${navigator.onLine === false ? CLOUD : ''}<span>${agoText(ms!)}</span>`;
  };
  el.update();
  return el;
}
