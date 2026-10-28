// #/relight/{code}: a friend's flame that went out. Signed in with Google (another account), one tap
// relights it: the ember catches and the fire comes back. Signed out → sign in first, then back here.
import { account, onAccount } from '../cloud/auth';
import { giveRelight, relightPreview, type RelightPreview } from '../together/relight';
import { t } from '../i18n';
import { h, haptic } from './dom';
import { flame } from './flame';
import { openAccount } from './account';

const PENDING = 'pendingRelight';
/** After a web sign-in (which returns without the address), come back to the relight. */
export function resumePendingRelight() {
  let code: string | null = null;
  try { code = sessionStorage.getItem(PENDING); } catch { /* ignore */ }
  if (!code) return;
  onAccount((a) => {
    if (!a) return;
    try { sessionStorage.removeItem(PENDING); } catch { /* ignore */ }
    if (!location.hash.startsWith('#/relight/')) location.hash = `#/relight/${code}`;
  });
}

export async function showRelight(root: HTMLElement, code: string): Promise<() => void> {
  const art = h('div', { class: 'rl-flame' });
  const title = h('h1', {}, '');
  const sub = h('p', { class: 'rl-sub' }, '');
  const act = h('div', { class: 'rl-act' });
  root.append(h('div', { class: 'relight' }, art, title, sub, act,
    h('a', { class: 'chip rl-home', href: '#/me' }, t('rl.toApp'))));

  let p: RelightPreview | null = null;
  const draw = () => {
    if (!p) {
      art.replaceChildren(flame(0, 160));
      title.textContent = t('rl.invalid');
      sub.textContent = '';
      act.replaceChildren();
      return;
    }
    const lit = p.state === 'relit';
    art.replaceChildren(flame(lit ? 2 : 0, 160));
    title.textContent = lit ? t('rl.relitTitle', { name: p.name }) : t('rl.outTitle', { name: p.name, n: p.streak });
    sub.textContent = lit ? (p.helper ? t('rl.relitByLine', { name: p.helper }) : '') : p.state === 'expired' ? t('rl.expired') : t('rl.ask', { name: p.name });
    act.replaceChildren();
    if (p.state !== 'open') return;
    if (p.mine) { act.append(h('p', { class: 'muted' }, t('rl.yours'))); return; }
    if (!account()) {
      act.append(h('p', { class: 'muted small' }, t('rl.signInWhy')),
        h('button', { class: 'primary brand-btn', onclick: () => {
          try { sessionStorage.setItem(PENDING, code); } catch { /* ignore */ }
          openAccount();
        } }, t('rl.signIn')));
      return;
    }
    const btn = h('button', { class: 'primary brand-btn rl-btn', onclick: async () => {
      btn.disabled = true;
      try {
        await giveRelight(code);
        haptic(60);
        p = { ...p!, state: 'relit', helper: account()?.name.split(/\s+/)[0] ?? null };
        art.classList.add('catch');
        draw();
      } catch (e) {
        btn.disabled = false;
        sub.textContent = e instanceof Error ? e.message : String(e);
      }
    } }, `🔥  ${t('rl.relight')}`);
    act.append(btn);
  };

  const load = async () => {
    try { p = await relightPreview(code); } catch { p = null; }
    draw();
  };
  await load();
  const off = onAccount(() => void load());
  return off;
}
