// Send feedback (owner request 2026-11-16): from Me (and Me → ⚙ → App) a sheet takes what it is about, a message, an
// optional screenshot from the gallery and an optional email for a reply, and sends it to Sentry's User Feedback inbox
// (same project as the crash reports, src/errors.ts; Sentry emails the owner for each one). Sent with it: the app
// version, the platform, the phone/browser, the language and the screen it was opened from — nothing else. Offline,
// the message (and a small screenshot) waits on this device and goes out when the app is online again.
import { platform } from '../native';
import { sentry } from '../errors';
import { fe } from '../i18n/front';
import { t } from '../i18n';
import { h, haptic, toast } from './dom';
import { icon } from './icons';
import './feedback.css';

type Kind = 'idea' | 'problem' | 'love' | 'other';
const KINDS: { id: Kind; ic: string }[] = [
  { id: 'idea', ic: 'sparkle' }, { id: 'problem', ic: 'flag' }, { id: 'love', ic: 'star' }, { id: 'other', ic: 'pen' },
];
/** English names for the owner's inbox (the message reads "Idea: …" whatever the app's language). */
const LABEL: Record<Kind, string> = { idea: 'Idea', problem: 'Problem', love: 'Love', other: 'Other' };
const QUEUE = 'feedbackQueue';
const MAX = 2000;

type Shot = { data: Uint8Array; type: string; name: string };
type Item = { kind: Kind; text: string; email: string; screen: string; at: string; shot?: string };

/** A screenshot shrunk to ≤ 1600 px on its long side, as JPEG (a phone screenshot is ~150–400 KB then). */
async function shrink(file: File): Promise<Shot | null> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.82));
    if (!blob) return null;
    return { data: new Uint8Array(await blob.arrayBuffer()), type: 'image/jpeg', name: 'screenshot.jpg' };
  } catch { return null; }
}

const toB64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (b: string) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));

async function post(x: Item, shot: Shot | null): Promise<boolean> {
  if (!navigator.onLine) return false;
  const S = await sentry();
  if (!S) return false;
  S.captureFeedback({
    message: `${LABEL[x.kind]}: ${x.text}`,
    email: x.email || undefined,
    url: x.screen,
    source: 'app',
    tags: {
      kind: x.kind, platform: platform(), lang: document.documentElement.lang || 'en', build: String(__BUILD__),
      screen: x.screen, viewport: `${innerWidth}x${innerHeight}`, written: x.at,
      device: navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 190),
    },
  }, shot ? { attachments: [{ filename: shot.name, data: shot.data, contentType: shot.type }] } : {});
  return S.flush(10_000);
}

const readQueue = (): Item[] => { try { return JSON.parse(localStorage.getItem(QUEUE) || '[]') as Item[]; } catch { return []; } };
function writeQueue(q: Item[]) {
  try {
    if (!q.length) { localStorage.removeItem(QUEUE); return; }
    localStorage.setItem(QUEUE, JSON.stringify(q.slice(-10)));
  } catch {
    // too big with a screenshot: keep the words
    try { localStorage.setItem(QUEUE, JSON.stringify(q.slice(-10).map(({ shot: _s, ...x }) => x))); } catch { /* ignore */ }
  }
}

/** Feedback written offline goes out once the app is online again. */
export async function flushFeedback() {
  const q = readQueue();
  if (!q.length || !navigator.onLine) return;
  const left: Item[] = [];
  for (const x of q) {
    const shot = x.shot ? { data: fromB64(x.shot), type: 'image/jpeg', name: 'screenshot.jpg' } : null;
    if (!(await post(x, shot))) left.push(x);
  }
  writeQueue(left);
}
addEventListener('online', () => void flushFeedback());

/** The sheet. */
export function openFeedback(from = location.hash) {
  const screen = from.replace(/#\/([a-z]+(?:\/[a-z]+)?).*/, '#/$1').slice(0, 40) || '#/';
  let kind: Kind | null = null;
  let shot: Shot | null = null;
  let shotUrl = '';

  const send = h('button', { class: 'primary brand-btn fb-send', disabled: true }, fe('fb.send')) as HTMLButtonElement;
  const text = h('textarea', { class: 'search fb-text', maxlength: String(MAX), rows: '5', placeholder: fe('fb.ph'), 'aria-label': fe('fb.ph') }) as HTMLTextAreaElement;
  const count = h('span', { class: 'muted small fb-count', 'aria-hidden': 'true' }, `0 / ${MAX}`);
  const ready = () => { send.disabled = !kind || !text.value.trim(); };
  text.addEventListener('input', () => { count.textContent = `${text.value.length} / ${MAX}`; ready(); });

  const chips = h('div', { class: 'fb-kinds', role: 'radiogroup', 'aria-label': fe('fb.what') },
    ...KINDS.map((k) => {
      const c = h('button', {
        class: `fb-kind k-${k.id}`, role: 'radio', 'aria-checked': 'false',
        onclick: () => {
          kind = k.id; haptic();
          for (const x of chips.querySelectorAll('.fb-kind')) { x.classList.toggle('on', x === c); x.setAttribute('aria-checked', String(x === c)); }
          ready();
          if (!text.value) text.focus();
        },
      }, h('span', { class: 'fb-kind-ic', 'aria-hidden': 'true' }, icon(k.ic, 20)), h('span', {}, fe(`fb.k.${k.id}` as 'fb.k.idea')));
      return c;
    }));

  const pick = h('input', { type: 'file', accept: 'image/*', hidden: true }) as HTMLInputElement;
  const shotBox = h('div', { class: 'fb-shot' });
  const paintShot = () => {
    if (!shot) {
      shotBox.replaceChildren(h('button', { class: 'fb-add', onclick: () => pick.click() },
        h('span', { class: 'fb-add-ic', 'aria-hidden': 'true' }, icon('plus', 18)), fe('fb.shot')));
      return;
    }
    shotBox.replaceChildren(
      h('img', { class: 'fb-thumb', src: shotUrl, alt: fe('fb.shot') }),
      h('div', { class: 'fb-shot-acts' },
        h('button', { class: 'chip', onclick: () => pick.click() }, fe('fb.shotChange')),
        h('button', { class: 'chip', onclick: () => { URL.revokeObjectURL(shotUrl); shot = null; shotUrl = ''; paintShot(); } }, fe('fb.shotRemove'))));
  };
  pick.addEventListener('change', async () => {
    const f = pick.files?.[0];
    pick.value = '';
    if (!f) return;
    const s = await shrink(f);
    if (!s) { toast(fe('fb.badPic')); return; }
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    shot = s; shotUrl = URL.createObjectURL(new Blob([s.data as BlobPart], { type: s.type }));
    paintShot();
  });
  paintShot();

  const email = h('input', { class: 'search fb-email', type: 'email', inputmode: 'email', autocomplete: 'email', maxlength: '120', placeholder: fe('fb.email'), 'aria-label': fe('fb.email') }) as HTMLInputElement;

  const d = h('dialog', { class: 'sheet bottom fb-sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, fe('fb.title')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
    h('p', { class: 'muted fb-intro' }, fe('fb.intro')),
    chips,
    h('div', { class: 'fb-write' }, text, count),
    shotBox, pick,
    email,
    h('p', { class: 'muted small fb-with' }, fe('fb.with')),
    h('div', { class: 'row end' }, send));

  send.onclick = async () => {
    if (!kind || !text.value.trim()) return;
    const mail = email.value.trim();
    if (mail && !email.checkValidity()) { email.focus(); toast(fe('fb.badMail')); return; }
    const item: Item = { kind, text: text.value.trim().slice(0, MAX), email: mail, screen, at: new Date().toISOString() };
    send.disabled = true;
    send.textContent = fe('fb.sending');
    if (await post(item, shot)) { d.close(); haptic(14); toast(fe('fb.thanks')); return; }
    if (!navigator.onLine) {
      writeQueue([...readQueue(), { ...item, ...(shot ? { shot: toB64(shot.data) } : {}) }]);
      d.close(); toast(fe('fb.later')); return;
    }
    send.disabled = false; send.textContent = fe('fb.send');
    toast(fe('fb.fail'));
  };
  d.addEventListener('close', () => { if (shotUrl) URL.revokeObjectURL(shotUrl); d.remove(); });
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
  void sentry(); // load it while the message is written
}
