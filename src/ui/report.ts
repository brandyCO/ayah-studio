// Report a problem (owner request 2026-11-02): one tap from where it happens. The sheet already knows what was
// going on — the reciter and recording, the ayah and the word being recited, the moment in the recording, the
// screen, the app build — so a user only picks what went wrong (and may add a note). Sent to Supabase
// (`send_report()`, supabase/migrations/20261102100000_problem_reports.sql); offline it waits on this device
// and goes out when the app is online again. The owner reads them in the Supabase dashboard.
import { SUPABASE_KEY, SUPABASE_URL } from '../cloud/config';
import { installId } from '../net';
import { isNative } from '../native';
import { t } from '../i18n';
import { h, toast } from './dom';

export type ReportKind = 'start' | 'highlight' | 'voice' | 'skip' | 'cut' | 'text' | 'reel' | 'app' | 'other';
/** What was happening; small and plain (the database keeps ≤ 2000 characters of it). */
export type ReportContext = Record<string, string | number | boolean | null | undefined>;

const KINDS: { id: ReportKind; listen?: boolean }[] = [
  { id: 'start', listen: true }, { id: 'highlight', listen: true }, { id: 'skip', listen: true }, { id: 'voice', listen: true },
  { id: 'cut', listen: true }, { id: 'text' }, { id: 'reel' }, { id: 'app' }, { id: 'other' },
];
const QUEUE = 'reportQueue';

const base = (): ReportContext => ({
  screen: location.hash.slice(0, 60) || '#/',
  build: __BUILD__,
  app: isNative() ? 'android' : 'web',
  ua: navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 140),
  lang: document.documentElement.lang,
  vw: innerWidth, vh: innerHeight,
  at: new Date().toISOString(),
});

async function post(kind: ReportKind, note: string, context: ReportContext): Promise<boolean> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/send_report`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, note: note || null, context, install: installId() }),
    });
    // 4xx: refused (malformed or over the day's limit), never retried; 404: the server has no send_report yet
    return r.status < 500 && r.status !== 404;
  } catch { return false; }
}

type Queued = { kind: ReportKind; note: string; context: ReportContext };
const readQueue = (): Queued[] => { try { return JSON.parse(localStorage.getItem(QUEUE) || '[]') as Queued[]; } catch { return []; } };
const writeQueue = (q: Queued[]) => { try { if (q.length) localStorage.setItem(QUEUE, JSON.stringify(q.slice(-20))); else localStorage.removeItem(QUEUE); } catch { /* ignore */ } };

/** Reports made offline go out once the app is online again. */
export async function flushReports() {
  const q = readQueue();
  if (!q.length || !navigator.onLine) return;
  const left: Queued[] = [];
  for (const x of q) if (!(await post(x.kind, x.note, x.context))) left.push(x);
  writeQueue(left);
}
addEventListener('online', () => void flushReports());

/** The sheet: what went wrong (chips), an optional note, and what will be sent with it. */
export function openReport(context: ReportContext = {}, opts: { listening?: boolean; summary?: string; kind?: ReportKind } = {}) {
  let kind: ReportKind | null = opts.kind ?? null;
  const send = h('button', { class: 'primary brand-btn', disabled: !kind }, t('rp.send')) as HTMLButtonElement;
  const chips = h('div', { class: 'chips rp-kinds', role: 'radiogroup', 'aria-label': t('rp.what') },
    ...KINDS.filter((k) => opts.listening || !k.listen || k.id === 'text').map((k) => {
      const c = h('button', {
        class: `chip${kind === k.id ? ' on' : ''}`, role: 'radio', 'aria-checked': String(kind === k.id),
        onclick: () => {
          kind = k.id;
          for (const x of chips.querySelectorAll('.chip')) { x.classList.toggle('on', x === c); x.setAttribute('aria-checked', String(x === c)); }
          send.disabled = false;
        },
      }, t(`rp.k.${k.id}`));
      return c;
    }));
  const note = h('textarea', { class: 'search rp-note', maxlength: '500', rows: '3', placeholder: t('rp.note') }) as HTMLTextAreaElement;
  const d = h('dialog', { class: 'sheet bottom report-sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, t('rp.title')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
    h('p', { class: 'muted small' }, t('rp.what')),
    chips,
    note,
    opts.summary ? h('p', { class: 'muted small rp-sum' }, t('rp.with', { what: opts.summary })) : h('p', { class: 'muted small rp-sum' }, t('rp.withApp')),
    h('div', { class: 'row end' }, send));
  send.onclick = async () => {
    if (!kind) return;
    const all = { ...base(), ...context };
    const clean: ReportContext = {};
    for (const [k, v] of Object.entries(all)) if (v !== undefined) clean[k] = v;
    send.disabled = true;
    d.close();
    if (await post(kind, note.value.trim().slice(0, 500), clean)) toast(t('rp.thanks'));
    else { writeQueue([...readQueue(), { kind, note: note.value.trim().slice(0, 500), context: clean }]); toast(t('rp.later')); }
  };
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
}
