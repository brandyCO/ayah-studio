// The day's string of lanterns on Me: one for each du'a moment — on waking, after each of the five
// prayers, before sleeping. A lantern lights when that session is said in full today (progress from
// src/data/adhkar.ts); the one whose time it is now breathes. A tap opens the session. Loaded with Me.
import { finishedIds } from '../data/adhkar';
import { todayRec } from '../data/journey';
import { loadDuas, momentKey, momentList, prayerNow, type Dua, type Moment, type Prayer } from '../data/duas';
import { akt, type AdhkarKey } from '../i18n/adhkar';
import { h, haptic } from './dom';
import { popIn } from './juice';

interface Stop { m: Moment; p?: Prayer; label: string }
const STOPS: Stop[] = [
  { m: 'wake', label: 'du.title.wake' },
  ...(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as Prayer[]).map((p) => ({ m: 'salah' as Moment, p, label: `du.p.${p}` })),
  { m: 'sleep', label: 'du.title.sleep' },
];
const SHORT: Partial<Record<Moment, AdhkarKey>> = { wake: 'du.short.wake', sleep: 'du.short.sleep' };

let all: Record<Moment, Dua[]> | null = null;
const seen = new Set<string>();

const lanternSvg = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 32 48');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path class="dl-hook" d="M16 1v5"/><rect class="dl-cap" x="10" y="6" width="12" height="4" rx="2"/>'
    + '<path class="dl-body" d="M9 12h14c3 6 3 18 0 24H9c-3-6-3-18 0-24z"/><path class="dl-ribs" d="M16 12v24M12 12c-1.6 7-1.6 17 0 24M20 12c1.6 7 1.6 17 0 24"/>'
    + '<ellipse class="dl-flame" cx="16" cy="25" rx="3.4" ry="5"/><rect class="dl-cap" x="11" y="36" width="10" height="3.5" rx="1.7"/>';
  return s;
};

/** Fills `slot` with today's string (and keeps it up to date when called again). */
export async function paintDayLanterns(slot: HTMLElement) {
  try { all ??= await loadDuas(); } catch { slot.replaceChildren(); return; }
  const data = all;
  const now = await prayerNow();
  const hour = new Date().getHours();
  // "Now": waking in the early morning before Dhuhr's list is due, sleep late at night.
  const nowStop = hour >= 21 || hour < 3 ? 'sleep' : `salah:${now}`;
  const said = todayRec().dm ?? [];
  const done = (st: Stop) => {
    if (said.includes(momentKey(st.m, st.p))) return true;
    const list = momentList(data, st.m, st.p);
    const f = new Set(finishedIds(momentKey(st.m, st.p)));
    return list.every((d) => f.has(d.id));
  };
  const lit = STOPS.filter(done).length;
  slot.replaceChildren(
    h('div', { class: 'me-row' }, h('h2', { class: 'me-h' }, akt('du.moments')), h('span', { class: 'muted small' }, akt('du.lit', { n: lit, of: STOPS.length }))),
    h('div', { class: 'dl-string', role: 'list' },
      ...STOPS.map((st) => {
        const key = momentKey(st.m, st.p);
        const on = done(st);
        const isNow = !on && key === nowStop;
        const name = akt((SHORT[st.m] ?? st.label) as AdhkarKey);
        const b = h('button', {
          class: `dl-stop${on ? ' on' : ''}${isNow ? ' now' : ''}`, role: 'listitem',
          'aria-label': `${akt(st.m === 'salah' ? 'du.title.salah' : (st.label as AdhkarKey))}${st.p ? ` · ${name}` : ''}${on ? ` · ${akt('du.didIt')}` : ''}`,
          onclick: () => { haptic(); void import('./adhkar').then((x) => x.openDuas(st.m, st.p)); },
        }, lanternSvg(), h('span', { class: 'dl-name' }, name));
        // A lantern lit since the last look lights up with a little spring.
        if (on && !seen.has(key)) { seen.add(key); if (slot.isConnected && slot.dataset.ready) requestAnimationFrame(() => popIn(b.firstElementChild!, { stiffness: 380, damping: 11 })); }
        return b;
      })),
    h('button', { class: 'chip dl-adhan', onclick: () => { haptic(); void import('./adhkar').then((x) => x.openDuas('adhan')); } }, `🕌  ${akt('du.title.adhan')}`));
  slot.dataset.ready = '1';
}

/** The goal's button: the moment whose time it is, if it is still unlit, else the first unlit one. */
export async function openNextMoment() {
  const now = await prayerNow();
  const hour = new Date().getHours();
  const said = todayRec().dm ?? [];
  const lit = (st: Stop) => said.includes(momentKey(st.m, st.p));
  const cur = STOPS.find((st) => (hour >= 21 || hour < 3 ? st.m === 'sleep' : st.p === now));
  const st = cur && !lit(cur) ? cur : STOPS.find((x) => !lit(x)) ?? cur ?? STOPS[0];
  const { openDuas } = await import('./adhkar');
  await openDuas(st.m, st.p);
}
