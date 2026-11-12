// The lamp wall (owner request 2026-11-12, "a sadaqa lamp wall"): one wall every player sees, of lamps lit with Light
// for people who passed away — a first name, him / her and one of four du'as from Sahih Muslim (never free text).
// A tap on a lamp shows its du'a; others say Ameen under it. Opened from the shop's Featured row and the Light sheet.
// A full page (like the shop), drawn at once from the copy kept on this device, then refreshed.
import './lampWall.css';
import { h, haptic, toast } from './dom';
import { star } from './lightChip';
import { reduced } from './juice';
import { account } from '../cloud/auth';
import { wallet } from '../data/garden';
import { keptWall, lampWall, lightLamp, LAMP_SIZES, removeLamp, reportLamp, sayAmeen, type Lamp, type Wall } from '../together/lampWall';
import { lang, t } from '../i18n';
import { DUAS, lwt, type LampKey } from '../i18n/lampWall';

const num = (n: number) => n.toLocaleString();
const sfx = (fn: (s: typeof import('./sfx').sfx) => void) => void import('./sfx').then((m) => fn(m.sfx)).catch(() => {});

/** A hanging lamp: chain, cap, glass with a flame, the name under it. */
function lampEl(l: Lamp, i: number, onTap: (l: Lamp) => void, fresh = false): HTMLButtonElement {
  const size = l.light >= 250 ? 'l' : l.light >= 100 ? 'm' : 's';
  // Each lamp hangs at its own height and flickers in its own time (seeded by its place, so it never jumps on refresh).
  const seed = [...l.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const style = `--drop:${12 + (seed % 46)}px;--fl:${(2.4 + (seed % 17) / 10).toFixed(2)}s;--dl:${-((seed >> 4) % 30) / 10}s;--hue:${(seed >> 7) % 3}`;
  return h('button', { class: `lw-lamp z-${size}${l.me ? ' me' : ''}${l.said ? ' said' : ''}${fresh ? ' new' : ''}`, type: 'button', style, 'aria-label': lwt('lw.forName', { name: l.for }), onclick: () => onTap(l), 'data-i': String(i) },
    h('span', { class: 'lw-chain', 'aria-hidden': 'true' }),
    h('span', { class: 'lw-body', 'aria-hidden': 'true' },
      h('span', { class: 'lw-glow' }), h('span', { class: 'lw-cap' }), h('span', { class: 'lw-glass' }, h('span', { class: 'lw-flame' })), h('span', { class: 'lw-base' })),
    h('span', { class: 'lw-name' }, l.for),
    l.ameen ? h('span', { class: 'lw-amn' }, `🤲 ${num(l.ameen)}`) : '');
}

export function openLampWall(o: { onChange?: () => void } = {}) {
  const back = h('button', { class: 'icon-btn lw-back', 'aria-label': t('common.close') }, '‹');
  const counts = h('p', { class: 'lw-counts small' });
  const wallEl = h('div', { class: 'lw-wall' });
  const lightBtn = h('button', { class: 'primary brand-btn lw-go' }, `🪔 ${lwt('lw.light')}`);
  const top = h('header', { class: 'lw-top' }, back, h('h1', {}, lwt('lw.title')), h('span', { class: 'lw-gap' }));
  const d: HTMLDialogElement = h('dialog', { class: `lw-page${reduced() ? ' still' : ''}`, 'aria-label': lwt('lw.title') },
    h('div', { class: 'lw-sky', 'aria-hidden': 'true' }),
    top,
    h('div', { class: 'lw-head' }, h('p', { class: 'lw-sub' }, lwt('lw.sub')), counts),
    wallEl,
    h('div', { class: 'lw-foot' }, lightBtn, h('p', { class: 'small lw-note' }, lwt('lw.note'))));

  let pushed = false;
  try { history.pushState({ lampWall: 1 }, ''); pushed = true; } catch { /* ignore */ }
  const onPop = () => { pushed = false; d.close(); };
  window.addEventListener('popstate', onPop);
  const close = () => { if (pushed) history.back(); else d.close(); };
  back.onclick = close;
  d.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  d.addEventListener('close', () => { window.removeEventListener('popstate', onPop); d.remove(); o.onChange?.(); });
  window.addEventListener('hashchange', () => { pushed = false; d.close(); }, { once: true });

  let wall: Wall | null = account() ? keptWall() : null;
  let freshId = '';
  const paint = () => {
    if (!account()) {
      counts.textContent = '';
      lightBtn.hidden = true;
      wallEl.replaceChildren(h('div', { class: 'lw-empty' }, h('p', {}, lwt('lw.signIn')),
        h('button', { class: 'chip', onclick: () => { d.close(); location.hash = '#/ranks'; } }, lwt('lw.toRanks'))));
      return;
    }
    if (!wall) { wallEl.replaceChildren(h('p', { class: 'lw-empty' }, lwt('lw.loading'))); return; }
    counts.textContent = lwt('lw.counts', { w: num(wall.week), n: num(wall.total) }) + (wall.mine ? ` · ${lwt('lw.mine', { n: num(wall.mine) })}` : '');
    wallEl.replaceChildren(...(wall.lamps.length
      ? [h('div', { class: 'lw-rail', 'aria-hidden': 'true' }), ...wall.lamps.map((l, i) => lampEl(l, i, openLamp, l.id === freshId))]
      : [h('p', { class: 'lw-empty' }, lwt('lw.empty'))]));
  };
  const refresh = async () => {
    if (!account()) return;
    try { wall = await lampWall(); if (d.isConnected) paint(); } catch (e) { if (!wall && d.isConnected) wallEl.replaceChildren(h('p', { class: 'lw-empty' }, navigator.onLine ? (e as Error).message : lwt('lw.offline'))); }
  };

  // A lamp's du'a, with Ameen, and Report / Take it down.
  function openLamp(l: Lamp) {
    haptic(6);
    const du = DUAS[l.dua] ?? DUAS[0];
    const g = l.he ? 0 : 1;
    const s: HTMLDialogElement = h('dialog', { class: 'sheet bottom lw-sheet' });
    const amen = h('button', { class: `primary brand-btn lw-amen${l.said ? ' done' : ''}`, disabled: l.said || l.me }, l.said ? `✓ ${lwt('lw.said')}` : `🤲 ${lwt('lw.ameen')}`);
    const amenN = h('p', { class: 'muted small' }, l.ameen ? lwt('lw.ameenN', { n: num(l.ameen) }) : '');
    amen.onclick = async () => {
      amen.disabled = true;
      l.said = true; l.ameen += 1;
      amen.textContent = `✓ ${lwt('lw.said')}`; amen.classList.add('done');
      amenN.textContent = lwt('lw.ameenN', { n: num(l.ameen) });
      haptic(14);
      sfx((x) => x.shimmer());
      try { l.ameen = await sayAmeen(l.id); amenN.textContent = lwt('lw.ameenN', { n: num(l.ameen) }); paint(); } catch (e) { toast((e as Error).message); }
    };
    const act = l.me
      ? h('button', { class: 'chip lw-rm', onclick: async () => {
        if (!confirm(lwt('lw.removeAsk'))) return;
        try { await removeLamp(l.id); s.close(); if (wall) { wall.lamps = wall.lamps.filter((x) => x.id !== l.id); wall.total--; } paint(); } catch (e) { toast((e as Error).message); }
      } }, lwt('lw.remove'))
      : h('button', { class: 'chip lw-rep', onclick: async () => {
        if (!confirm(lwt('lw.reportAsk'))) return;
        try { await reportLamp(l.id); toast(lwt('lw.reported')); s.close(); } catch (e) { toast((e as Error).message); }
      } }, lwt('lw.report'));
    s.append(
      h('div', { class: 'sheet-head' }, h('h2', {}, lwt('lw.forName', { name: l.for })), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => s.close() }, '✕')),
      h('div', { class: 'lw-big', 'aria-hidden': 'true' }, lampEl({ ...l, ameen: 0 }, 0, () => {})),
      h('p', { class: 'lw-dua-ar', dir: 'rtl', lang: 'ar' }, du.ar[g]),
      lang() === 'ar' ? '' : h('p', { class: 'lw-dua-en' }, du.en[g]),
      h('p', { class: 'muted small' }, lwt('lw.src', { n: du.src }), ' · ', l.me ? lwt('lw.yours') : l.by ? lwt('lw.by', { name: l.by }) : lwt('lw.byHidden')),
      amen, amenN, act);
    s.addEventListener('close', () => s.remove());
    s.addEventListener('click', (e) => { if (e.target === s) s.close(); });
    document.body.append(s);
    s.showModal();
  }

  // Lighting a lamp: a name, him / her, one du'a, the size, show my name.
  lightBtn.onclick = () => {
    let he = true, dua = 0, size: number = LAMP_SIZES[1], showMe = false;
    const s: HTMLDialogElement = h('dialog', { class: 'sheet bottom lw-sheet lw-form' });
    const name = h('input', { class: 'lw-in', type: 'text', maxlength: '24', placeholder: lwt('lw.namePh'), autocomplete: 'off', 'aria-label': lwt('lw.name') });
    const go = h('button', { class: 'primary brand-btn lw-light' });
    const body = h('div', { class: 'lw-form-body' });
    const chip = (on: boolean, label: string | Node, fn: () => void, cls = '') => h('button', { class: `chip${on ? ' on' : ''}${cls}`, type: 'button', 'aria-pressed': String(on), onclick: () => { fn(); haptic(4); paintForm(); } }, label);
    const paintForm = () => {
      const g = he ? 0 : 1;
      const left = wallet();
      const nm = name.value.trim();
      body.replaceChildren(
        h('label', { class: 'lw-lab' }, lwt('lw.name')), name,
        h('div', { class: 'chips' }, chip(he, lwt('lw.him'), () => { he = true; }), chip(!he, lwt('lw.her'), () => { he = false; })),
        h('label', { class: 'lw-lab' }, lwt('lw.dua')),
        h('div', { class: 'lw-duas' }, ...DUAS.map((du, i) => h('button', { class: `lw-dua${dua === i ? ' on' : ''}`, type: 'button', 'aria-pressed': String(dua === i), onclick: () => { dua = i; haptic(4); paintForm(); } },
          h('span', { class: 'lw-dua-ar', dir: 'rtl', lang: 'ar' }, du.ar[g]), lang() === 'ar' ? '' : h('span', { class: 'lw-dua-en small' }, du.en[g])))),
        h('label', { class: 'lw-lab' }, lwt('lw.size')),
        h('div', { class: 'lw-sizes' }, ...LAMP_SIZES.map((n) => h('button', { class: `lw-size${size === n ? ' on' : ''}`, type: 'button', 'aria-pressed': String(size === n), onclick: () => { size = n; haptic(4); paintForm(); } },
          h('span', { class: 'lw-mini', 'aria-hidden': 'true' }, lampEl({ id: String(n), for: '', he, dua, light: n, at: '', me: false, by: null, ameen: 0, said: false }, 0, () => {})),
          h('b', {}, lwt(`lw.s${n}` as LampKey)), h('span', { class: 'small' }, star(), ` ${n}`)))),
        h('div', { class: 'chips' }, chip(showMe, lwt('lw.showMe'), () => { showMe = !showMe; })),
        go);
      go.disabled = !nm || left < size;
      go.replaceChildren(left < size ? lwt('lw.need', { n: num(size - left) }) : lwt('lw.go', { n: '' }), left < size ? '' : star(), left < size ? '' : ` ${size}`);
      name.focus({ preventScroll: true });
    };
    name.addEventListener('input', () => { go.disabled = !name.value.trim() || wallet() < size; });
    go.onclick = async () => {
      go.disabled = true;
      try {
        const id = await lightLamp(name.value, he, dua, size, showMe);
        freshId = id;
        haptic(24);
        sfx((x) => { x.pop(0, true); x.shimmer(); });
        toast(lwt('lw.lit'));
        s.close();
        const mine: Lamp = { id, for: name.value.trim().replace(/\s+/g, ' '), he, dua, light: size, at: new Date().toISOString(), me: true, by: null, ameen: 0, said: false };
        if (wall) { wall.lamps.unshift(mine); wall.total++; wall.week++; wall.mine++; } else wall = { total: 1, week: 1, mine: 1, lamps: [mine] };
        paint();
        wallEl.scrollIntoView({ block: 'start', behavior: reduced() ? 'auto' : 'smooth' });
        void refresh();
      } catch (e) { toast((e as Error).message === 'need' ? lwt('lw.need', { n: num(size - wallet()) }) : (e as Error).message); go.disabled = false; }
    };
    s.append(h('div', { class: 'sheet-head' }, h('h2', {}, `🪔 ${lwt('lw.light')}`), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => s.close() }, '✕')),
      h('p', { class: 'muted small' }, star(), ` ${num(wallet())}`), body);
    paintForm();
    s.addEventListener('close', () => s.remove());
    s.addEventListener('click', (e) => { if (e.target === s) s.close(); });
    document.body.append(s);
    s.showModal();
  };

  paint();
  document.body.append(d);
  d.showModal();
  void refresh();
}
