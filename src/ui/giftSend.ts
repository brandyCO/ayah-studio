// Sending a gift to a friend (owner request 2026-11-12): Light, or a piece from the shop, from the friend's profile.
import './news.css';
import { h, haptic, toast } from './dom';
import { icon } from './icons';
import { star } from './lightChip';
import { wallet } from '../data/garden';
import { GIFT_LIGHT, giftLight } from '../together/lightGifts';
import { t } from '../i18n';
import { sht } from '../i18n/shop';
import { nwt } from '../i18n/news';

/** "Send this gift to Bilal?" (owner request 2026-11-23): asked before any Light leaves; true on Yes, send. */
export function confirmGift(name: string, what: Node | string): Promise<boolean> {
  return new Promise((done) => {
    let ok = false;
    const d: HTMLDialogElement = h('dialog', { class: 'sheet gs-confirm', 'aria-label': nwt('nw.giftQ', { name }) },
      h('span', { class: 'gs-confirm-art', 'aria-hidden': 'true' }, icon('gift', 40)),
      h('h2', {}, nwt('nw.giftQ', { name })),
      h('p', { class: 'gs-confirm-what' }, what),
      h('p', { class: 'muted small' }, nwt('nw.giftNote')),
      h('div', { class: 'gs-confirm-acts' },
        h('button', { class: 'chip', type: 'button', onclick: () => d.close() }, nwt('nw.cancel')),
        h('button', { class: 'primary brand-btn', type: 'button', onclick: () => { ok = true; haptic(12); d.close(); } }, nwt('nw.giftYes'))));
    d.addEventListener('close', () => { d.remove(); done(ok); });
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    document.body.append(d);
    d.showModal();
  });
}

export function openGiftSheet(pid: string, name: string) {
  const d: HTMLDialogElement = h('dialog', { class: 'sheet bottom gs-sheet' });
  const paint = () => {
    const left = wallet();
    d.replaceChildren(
      h('div', { class: 'sheet-head' }, h('h2', {}, sht('sh.giftTo', { name })), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
      h('p', { class: 'muted small' }, sht('sh.giftSub'), ' · ', star(), ` ${left}`),
      h('div', { class: 'gs-light' }, ...GIFT_LIGHT.map((n) => h('button', { class: `gs-amt${left < n ? ' short' : ''}`, disabled: left < n, onclick: async (e: Event) => {
        const b = e.currentTarget as HTMLButtonElement;
        if (!(await confirmGift(name, h('span', { class: 'gs-confirm-amt' }, star(), ` ${n}`)))) return;
        b.disabled = true;
        try {
          const now = await giftLight(pid, n);
          haptic(20);
          void import('./sfx').then((m) => { m.sfx.pop(0, true); m.sfx.shimmer(); });
          toast(sht(now ? 'sh.giftSent' : 'sh.giftQueued', { name }));
          d.close();
        } catch (err) { toast((err as Error).message === 'need' ? sht('sh.need', { n: n - wallet() }) : (err as Error).message); b.disabled = false; }
      } }, h('span', { class: 'gs-gift', 'aria-hidden': 'true' }, icon('gift', 22)), h('b', {}, star(), ` ${n}`)))),
      h('button', { class: 'chip gs-piece', onclick: () => { d.close(); void import('./shop').then((m) => m.openShop({ giftTo: { pid, name } })); } }, icon('bag', 18), sht('sh.giftPiece')),
      h('p', { class: 'muted small' }, sht('sh.giftNote')));
  };
  paint();
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
}
