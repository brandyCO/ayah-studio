// #/notifications (owner request 2026-11-19): the bell opens this screen. Every notification is kept after it is read
// (src/data/notifs.ts), grouped by kind (All · Wins · Friends · League · News) and by time (Today · This week · Earlier).
// A tap opens where it belongs (a Claim, a friend, the league); a long press starts selecting (Select all, Mark read,
// Delete, with Undo); ⚙ chooses what reaches the user: in the app, on the phone, and quiet hours.
import './notifications.css';
import { collectNotifs, deleteNotifs, GROUPS, markRead, notifPrefs, setNotifPrefs, undoDelete, visibleNotifs, type NEntry, type NGroup } from '../data/notifs';
import { nt, type NotifKey } from '../i18n/notifs';
import { locale, t } from '../i18n';
import { isNative } from '../native';
import { h, haptic } from './dom';
import { icon } from './icons';
import { loadWords, viewOf, waitingKeys } from './notifText';
import { tabBar } from './tabs';

type Tab = 'all' | NGroup;
const TAB_KEY: Record<Tab, NotifKey> = { all: 'nt.gAll', win: 'nt.gWin', friend: 'nt.gFriend', league: 'nt.gLeague', news: 'nt.gNews' };
const LONG = 450;

export async function showNotifications(root: HTMLElement): Promise<() => void> {
  collectNotifs(true);
  const [words, ] = await Promise.all([loadWords()]);
  let tab: Tab = (() => { try { return (sessionStorage.getItem('notifTab') as Tab) || 'all'; } catch { return 'all'; } })();
  if (tab !== 'all' && !GROUPS.includes(tab)) tab = 'all';
  // What was unread when the screen opened keeps its tint for this visit, though it is marked read.
  const fresh = new Set(visibleNotifs().filter((e) => !e.r).map((e) => e.k));
  let waiting = await waitingKeys(visibleNotifs());
  let selecting = false;
  const picked = new Set<string>();

  const rel = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto', style: 'short' });
  const when = (at: string) => {
    const s = (Date.now() - Date.parse(at)) / 1000;
    if (s < 60) return rel.format(0, 'second');
    if (s < 3600) return rel.format(-Math.floor(s / 60), 'minute');
    if (s < 86400) return rel.format(-Math.floor(s / 3600), 'hour');
    if (s < 7 * 86400) return rel.format(-Math.floor(s / 86400), 'day');
    return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(at));
  };
  const bucket = (at: string): NotifKey => {
    const d = new Date(at), now = new Date();
    const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return d.getTime() >= mid ? 'nt.today' : d.getTime() >= mid - 6 * 864e5 ? 'nt.week' : 'nt.earlier';
  };
  const shown = () => visibleNotifs().filter((e) => tab === 'all' || e.g === tab);

  const tabs = h('div', { class: 'nt-tabs chips', role: 'tablist' });
  const list = h('div', { class: 'nt-list' });
  const head = h('header', { class: 'topbar nt-top' });
  const hint = h('p', { class: 'muted small nt-hint' }, nt('nt.holdHint'));

  const paintTabs = () => {
    const unread = (g: Tab) => visibleNotifs().filter((e) => fresh.has(e.k) && (g === 'all' || e.g === g)).length;
    const p = notifPrefs();
    tabs.replaceChildren(...(['all', ...GROUPS.filter((g) => p.app[g])] as Tab[]).map((g) => {
      const n = unread(g);
      return h('button', {
        class: `chip nt-tab${g === tab ? ' on' : ''}`, role: 'tab', 'aria-selected': g === tab ? 'true' : 'false',
        onclick: () => { if (g === tab) return; haptic(6); tab = g; try { sessionStorage.setItem('notifTab', g); } catch { /* ignore */ } picked.clear(); paint(); },
      }, nt(TAB_KEY[g]), n ? h('i', { class: 'nt-tab-n' }, String(n)) : '');
    }));
  };

  const paintHead = () => {
    if (selecting) {
      const all = shown();
      const allOn = all.length > 0 && all.every((e) => picked.has(e.k));
      head.className = 'topbar nt-top selecting';
      head.replaceChildren(
        h('button', { class: 'icon-btn', 'aria-label': nt('nt.cancel'), onclick: () => { selecting = false; picked.clear(); sync(); } }, icon('close', 22)),
        h('div', { class: 'brand' }, h('h1', {}, nt('nt.selected', { n: picked.size }))),
        h('button', { class: 'chip', onclick: () => { haptic(6); if (allOn) picked.clear(); else all.forEach((e) => picked.add(e.k)); sync(); } }, allOn ? nt('nt.cancel') : nt('nt.selectAll')),
      );
    } else {
      head.className = 'topbar nt-top';
      head.replaceChildren(
        h('button', { class: 'icon-btn back-btn', 'aria-label': t('common.close'), onclick: back }, icon('back', 22)),
        h('div', { class: 'brand' }, h('h1', {}, nt('nt.title'))),
        shown().length ? h('button', { class: 'icon-btn nt-select', 'aria-label': nt('nt.select'), title: nt('nt.select'), onclick: () => { haptic(6); selecting = true; sync(); } }, icon('check', 22)) : '',
        h('button', { class: 'icon-btn', 'aria-label': nt('nt.settings'), onclick: openSettings }, icon('gear', 22)),
      );
    }
  };

  const actions = h('div', { class: 'nt-actions' });
  const paintActions = () => {
    actions.classList.toggle('show', selecting);
    if (!selecting) { actions.replaceChildren(); return; }
    const all = shown();
    const allOn = all.length > 0 && all.every((e) => picked.has(e.k));
    actions.replaceChildren(
      h('button', { class: 'chip', disabled: !picked.size, onclick: () => { markRead([...picked]); picked.forEach((k) => fresh.delete(k)); selecting = false; picked.clear(); paint(); } }, icon('check', 18), nt('nt.markRead')),
      h('button', { class: 'chip nt-del', disabled: !picked.size, onclick: () => remove([...picked]) }, icon('trash', 18), allOn ? nt('nt.deleteAll') : nt('nt.delete')),
    );
  };

  let undoBox: HTMLElement | null = null;
  const remove = (keys: string[]) => {
    if (!keys.length) return;
    haptic(14);
    const rows = keys.map((k) => list.querySelector<HTMLElement>(`[data-k="${CSS.escape(k)}"]`)).filter((r): r is HTMLElement => !!r);
    rows.forEach((r) => r.classList.add('going'));
    const gone = deleteNotifs(keys);
    selecting = false; picked.clear();
    // The rows slide away, then only they leave (no list rebuilt; a day heading left empty goes too).
    setTimeout(() => {
      if (!rows.length || !shown().length) { paint(); return; }
      rows.forEach((r) => r.remove());
      for (const hd of list.querySelectorAll('.nt-h')) if (!hd.nextElementSibling?.classList.contains('nt-row')) hd.remove();
      paintTabs(); sync();
    }, rows.length ? 220 : 0);
    undoBox?.remove();
    const box = h('div', { class: 'nt-undo', role: 'status' },
      h('span', {}, gone.length > 1 ? nt('nt.deletedN', { n: gone.length }) : nt('nt.deleted1')),
      h('button', { class: 'chip', onclick: () => { undoDelete(gone); box.remove(); paint(); } }, nt('nt.undo')));
    undoBox = box;
    document.body.append(box);
    requestAnimationFrame(() => box.classList.add('show'));
    setTimeout(() => { box.classList.remove('show'); setTimeout(() => box.remove(), 300); }, 5000);
  };

  const row = (e: NEntry) => {
    const v = viewOf(e, words, waiting);
    const on = picked.has(e.k);
    const el = h('div', {
      class: `nt-row g-${e.g}${fresh.has(e.k) ? ' unread' : ''}${on ? ' picked' : ''}${v.act ? ' has-act' : ''}`,
      role: 'button', tabindex: '0', 'data-k': e.k, 'aria-pressed': selecting ? String(on) : false,
    },
      h('span', { class: `nt-box${on ? ' on' : ''}`, 'aria-hidden': 'true' }, icon('check', 14)), // shown only while selecting (CSS)
      h('span', { class: 'nt-ic', 'aria-hidden': 'true' }, icon(v.icon, 20)),
      h('span', { class: 'nt-txt' }, h('b', {}, v.title), v.sub ? h('span', { class: 'nt-sub' }, v.sub) : '', h('span', { class: 'nt-when' }, when(e.at))),
      v.act ? h('button', { class: 'chip nt-act', tabindex: '-1', onclick: (ev: Event) => { ev.stopPropagation(); open(); } }, v.act) : '');
    const open = () => { haptic(6); markRead([e.k]); v.go(); };
    const toggle = () => { haptic(6); if (picked.has(e.k)) picked.delete(e.k); else picked.add(e.k); if (!picked.size) selecting = false; sync(); };
    // Press and hold: start selecting with this row; a tap while selecting toggles it.
    let timer = 0, held = false, sx = 0, sy = 0;
    el.addEventListener('pointerdown', (ev) => {
      held = false; sx = ev.clientX; sy = ev.clientY;
      timer = window.setTimeout(() => {
        held = true; haptic(18);
        try { localStorage.setItem('notifHint', '1'); } catch { /* ignore */ }
        if (!selecting) { selecting = true; picked.clear(); }
        picked.add(e.k); sync();
      }, LONG);
      el.classList.add('pressing');
    });
    const cancel = () => { clearTimeout(timer); el.classList.remove('pressing'); };
    el.addEventListener('pointermove', (ev) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 10) cancel(); });
    el.addEventListener('pointerup', cancel);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
    el.addEventListener('click', () => { if (held) { held = false; return; } if (selecting) toggle(); else open(); });
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); if (selecting) toggle(); else open(); }
      if (ev.key === 'Delete') remove([e.k]);
    });
    return el;
  };

  // Selecting changes only classes on the rows already there: no list rebuilt, so the long-press and each tap stay in one frame.
  const sync = () => {
    paintHead(); paintActions();
    list.classList.toggle('selecting', selecting);
    for (const el of list.querySelectorAll<HTMLElement>('.nt-row')) {
      const on = picked.has(el.dataset.k ?? '');
      el.classList.toggle('picked', on);
      el.querySelector('.nt-box')?.classList.toggle('on', on);
      if (selecting) el.setAttribute('aria-pressed', String(on)); else el.removeAttribute('aria-pressed');
    }
    hint.hidden = selecting || (() => { try { return !!localStorage.getItem('notifHint'); } catch { return true; } })();
  };

  const paint = () => {
    paintTabs(); paintHead(); paintActions();
    const items = shown();
    if (!items.length) {
      list.replaceChildren(h('div', { class: 'nt-empty' }, h('span', { class: 'nt-empty-ic', 'aria-hidden': 'true' }, icon('bell', 34)),
        h('p', {}, tab === 'all' ? nt('nt.empty') : nt('nt.emptyGroup'))));
      hint.hidden = true;
      return;
    }
    const out: HTMLElement[] = [];
    let last = '';
    for (const e of items) {
      const b = bucket(e.at);
      if (b !== last) { out.push(h('h2', { class: 'nt-h' }, nt(b))); last = b; }
      out.push(row(e));
    }
    list.replaceChildren(...out);
    list.classList.toggle('selecting', selecting);
    hint.hidden = selecting || (() => { try { return !!localStorage.getItem('notifHint'); } catch { return true; } })();
  };

  function back() {
    if (history.length > 1) history.back();
    else location.hash = '#/me';
  }
  // Android back: leaves select mode first.
  const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && selecting) { ev.preventDefault(); selecting = false; picked.clear(); paint(); } };
  document.addEventListener('keydown', onKey);

  function openSettings() {
    haptic(6);
    const p = notifPrefs();
    const native = isNative();
    const sw = (on: boolean, label: string, set: (v: boolean) => void, disabled = false) =>
      h('button', { class: `nt-sw${on ? ' on' : ''}`, role: 'switch', 'aria-checked': String(on), 'aria-label': label, disabled, onclick: (ev: Event) => {
        const b = ev.currentTarget as HTMLElement; const v = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', String(v)); b.classList.toggle('on', v); haptic(6); set(v);
      } }, h('i', {}));
    const save = () => { setNotifPrefs(p); paint(); };
    const hours = (v: number, set: (n: number) => void) => {
      const s = h('select', { class: 'nt-hour', onchange: () => { set(Number(s.value)); save(); } },
        ...Array.from({ length: 24 }, (_, i) => h('option', { value: String(i), selected: i === v }, new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(2020, 0, 1, i)))));
      return s;
    };
    const d = h('dialog', { class: 'sheet bottom nt-sheet' },
      h('div', { class: 'sheet-head' }, h('h2', {}, nt('nt.settings')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
      h('div', { class: 'nt-set-head' }, h('span', {}), h('span', {}, nt('nt.inApp')), h('span', {}, nt('nt.phone'))),
      ...GROUPS.map((g) => h('div', { class: 'nt-set' },
        h('b', {}, nt(TAB_KEY[g])),
        sw(p.app[g], `${nt(TAB_KEY[g])} · ${nt('nt.inApp')}`, (v) => { p.app[g] = v; save(); }),
        sw(native && p.phone[g], `${nt(TAB_KEY[g])} · ${nt('nt.phone')}`, (v) => { p.phone[g] = v; save(); }, !native))),
      h('p', { class: 'muted small' }, native ? nt('nt.phoneHint') : nt('nt.webPhone')),
      h('div', { class: 'nt-quiet' }, h('b', {}, nt('nt.quiet')),
        h('label', {}, nt('nt.quietFrom'), hours(p.quiet[0], (n) => { p.quiet[0] = n; })),
        h('label', {}, nt('nt.quietTo'), hours(p.quiet[1], (n) => { p.quiet[1] = n; }))),
      h('a', { class: 'nt-link', href: '#/me/settings', onclick: () => d.close() }, icon('bell', 18), h('span', {}, nt('nt.reminders')), icon('right', 18)));
    d.addEventListener('close', () => d.remove());
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    document.body.append(d);
    d.showModal();
  }

  root.append(head, h('main', { class: 'nt-page' }, tabs, list, hint), actions, tabBar('me'));
  paint();
  // Read once seen (the tint stays for this visit).
  const readTimer = window.setTimeout(() => markRead(), 1200);
  // New ones while open (a sync, Ranks answers): added at the top.
  const onChange = async () => {
    const add = collectNotifs();
    if (add.length) { add.forEach((e) => fresh.add(e.k)); markRead(add.map((e) => e.k)); }
    waiting = await waitingKeys(visibleNotifs());
    if (!selecting) paint();
  };
  const evs = ['journey-changed', 'rank-cache', 'sync-arrived'];
  evs.forEach((e) => window.addEventListener(e, onChange));
  return () => {
    clearTimeout(readTimer);
    evs.forEach((e) => window.removeEventListener(e, onChange));
    document.removeEventListener('keydown', onKey);
    undoBox?.remove();
    markRead();
  };
}
