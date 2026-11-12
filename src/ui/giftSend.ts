// Sending a gift to a friend (owner request 2026-11-12): Light, or a piece from the shop, from the friend's profile.
import { h, haptic, toast } from './dom';
import { star } from './lightChip';
import { wallet } from '../data/garden';
import { GIFT_LIGHT, giftLight } from '../together/lightGifts';
import { t } from '../i18n';
import { sht } from '../i18n/shop';

export function openGiftSheet(pid: string, name: string) {
  const d: HTMLDialogElement = h('dialog', { class: 'sheet bottom gs-sheet' });
  const paint = () => {
    const left = wallet();
    d.replaceChildren(
      h('div', { class: 'sheet-head' }, h('h2', {}, sht('sh.giftTo', { name })), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
      h('p', { class: 'muted small' }, sht('sh.giftSub'), ' · ', star(), ` ${left}`),
      h('div', { class: 'gs-light' }, ...GIFT_LIGHT.map((n) => h('button', { class: `gs-amt${left < n ? ' short' : ''}`, disabled: left < n, onclick: async (e: Event) => {
        const b = e.currentTarget as HTMLButtonElement;
        b.disabled = true;
        try {
          await giftLight(pid, n);
          haptic(20);
          void import('./sfx').then((m) => { m.sfx.pop(0, true); m.sfx.shimmer(); });
          toast(sht('sh.giftSent', { name }));
          d.close();
        } catch (err) { toast((err as Error).message === 'need' ? sht('sh.need', { n: n - wallet() }) : (err as Error).message); b.disabled = false; }
      } }, h('span', { class: 'gs-gift', 'aria-hidden': 'true' }, '🎁'), h('b', {}, star(), ` ${n}`)))),
      h('button', { class: 'chip gs-piece', onclick: () => { d.close(); void import('./shop').then((m) => m.openShop({ giftTo: { pid, name } })); } }, `🛍 ${sht('sh.giftPiece')}`),
      h('p', { class: 'muted small' }, sht('sh.giftNote')));
  };
  paint();
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
}
