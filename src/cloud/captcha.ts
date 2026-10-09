// Cloudflare Turnstile before an anonymous sign-in (wall guests, gift replies). Supabase checks the
// token when CAPTCHA protection is on (Authentication → Attack protection → Turnstile, with the
// secret key); the site key here is public. Without a site key nothing is shown and no token is sent.
// Turnstile decides itself whether to ask anything: usually it passes invisibly, at most one tap.
import { TURNSTILE_SITE_KEY } from './config';
import { h } from '../ui/dom';

interface Turnstile {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  remove(id: string): void;
}
declare global {
  interface Window { turnstile?: Turnstile }
}

let script: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  script ??= new Promise<Turnstile>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const s = h('script', { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: true });
    s.addEventListener('load', () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile did not load'))));
    s.addEventListener('error', () => reject(new Error('Could not load the security check — check your connection')));
    document.head.append(s);
  });
  script.catch(() => (script = null));
  return script;
}

export const captchaOn = () => !!TURNSTILE_SITE_KEY;

/** A one-time Turnstile token, or undefined when Turnstile is not set up. */
export async function captchaToken(): Promise<string | undefined> {
  if (!TURNSTILE_SITE_KEY) return undefined;
  const ts = await loadTurnstile();
  const box = h('div', { class: 'captcha-box' });
  const note = h('p', { class: 'muted small' }, 'A quick check that you are a person…');
  const d = h('dialog', { class: 'sheet captcha-sheet' }, note, box);
  document.body.append(d);
  d.showModal();
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('The security check took too long — please try again')), 60_000);
      const id = ts.render(box, {
        sitekey: TURNSTILE_SITE_KEY,
        appearance: 'interaction-only', // invisible unless it needs a tap
        callback: (token: string) => { clearTimeout(timer); resolve(token); },
        'error-callback': () => { clearTimeout(timer); reject(new Error('The security check failed — please try again')); },
        'expired-callback': () => { clearTimeout(timer); reject(new Error('The security check expired — please try again')); },
      });
      d.addEventListener('close', () => { clearTimeout(timer); ts.remove(id); reject(new Error('cancelled')); }, { once: true });
    });
  } finally {
    if (d.open) d.close();
    d.remove();
  }
}
