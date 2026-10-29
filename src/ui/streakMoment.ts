// The streak moment (Me tab): plays once a day, the first time Me is opened after a goal lit
// today's flame — never over reading, listening or the tasbih counter. The flame springs up out of
// a burst of light, the count rolls from yesterday's number to today's, and this week's row fills
// today's circle with a check that stamps in. Theme colours (rewardPalette), vibration, no sound.
// Reduced motion → the end picture, still.
import { t, type Key } from '../i18n';
import { h, haptic } from './dom';
import { flame, flameTier } from './flame';
import { sparks, type Sparks } from './sparks';
import { rewardPalette, rgba } from './theme';

export type WeekState = 'lit' | 'frozen' | 'revived' | 'today' | 'missed' | 'future';
export interface WeekDay { day: string; state: WeekState; label: string }

const CHECK = 'M6.5 12.5l3.8 3.8 7.4-8.6';
/** A day's mark: a check in a theme-gradient circle (lit), a snowflake (frozen), or an empty ring. */
export function dayMark(state: WeekState, animate = false): HTMLElement {
  const el = h('span', { class: `me-pip-ic${animate ? ' stamp' : ''}` });
  if (state === 'lit' || state === 'revived') {
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${CHECK}" pathLength="1" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  } else if (state === 'frozen') el.textContent = '❄';
  return el;
}

const vibrate = (p: number[]) => { try { navigator.vibrate?.(p); } catch { /* ignore */ } };

/** Plays the moment; resolves when it is closed. */
export function streakMoment(days: number, week: WeekDay[], today: string): Promise<void> {
  const P = rewardPalette();
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const from = Math.max(0, days - 1);
  const oldNum = h('b', { class: 'sm-n old' }, String(from));
  const newNum = h('b', { class: 'sm-n new' }, String(days));
  const roll = h('span', { class: 'sm-roll' }, oldNum, newNum);
  const fl = h('span', { class: 'sm-flame' }, flame(flameTier(days, true), 168, still));
  const row = h('div', { class: 'sm-week' }, ...week.map((w) => {
    const isToday = w.day === today;
    return h('span', { class: `me-pip ${isToday ? 'lit sm-today' : w.state}` },
      isToday ? h('span', { class: 'me-pip-ic sm-slot' }) : dayMark(w.state),
      h('span', { class: 'me-pip-d' }, w.label));
  }));
  const ok = h('button', { class: 'cel-ok' }, t('sm.continue'));
  const canvas = h('canvas', { class: 'cel-sparks', 'aria-hidden': 'true' });
  const title = t((days === 1 ? 'sm.title1' : 'sm.title') as Key, { n: days });
  const el = h('div', { class: `cel cel-streak${still ? ' still go done' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('span', { class: 'cel-flash', 'aria-hidden': 'true' }),
    h('div', { class: 'sm-stage' },
      h('span', { class: 'cel-rings' }, h('i', {}), h('i', {}), h('i', {})),
      fl),
    canvas,
    h('div', { class: 'sm-count' }, roll, h('span', { class: 'sm-label' }, t(days === 1 ? 'me.day' : 'me.days'))),
    h('p', { class: 'sm-sub' }, t(days === 1 ? 'sm.sub1' : 'sm.sub')),
    row,
    ok);

  return new Promise((resolve) => {
    const timers: number[] = [];
    const later = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
    let fx: Sparks | null = null;
    let closed = false;
    const opened = performance.now();
    const close = () => {
      if (closed) return;
      closed = true;
      timers.forEach(clearTimeout);
      fx?.stop();
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(); }, still ? 0 : 280);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' || e.key === 'Enter') close(); };
    ok.addEventListener('click', close);
    el.addEventListener('click', (e) => { if (e.target !== ok && performance.now() - opened > 2400) close(); });
    document.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', close);
    document.body.append(el);
    ok.focus({ preventScroll: true });
    if (still) {
      row.querySelector('.sm-slot')?.replaceWith(dayMark('lit'));
      return;
    }
    const centre = (node: Element) => {
      const a = node.getBoundingClientRect();
      const c = canvas.getBoundingClientRect();
      return [a.left + a.width / 2 - c.left, a.top + a.height / 2 - c.top] as const;
    };
    // 1. Light gathers, then the flame springs up out of a burst.
    later(380, () => {
      el.classList.add('go');
      fx = sparks(canvas, [rgba(P.n1, 1), rgba(P.n2, 1), rgba(P.n3, 1), rgba(P.hi, 1), rgba(P.core, 1)]);
      const [x, y] = centre(fl);
      fx.burst(x, y + 20, 80, 1.1);
      vibrate([22]);
    });
    // 2. The count rolls over: yesterday's number lifts away, today's drops in with a bounce.
    later(1250, () => {
      roll.classList.add('go');
      const [x, y] = centre(roll);
      fx?.burst(x, y, 36, 0.6);
      vibrate([12, 60, 18]);
    });
    // 3. Today's circle fills and the check stamps in.
    later(2000, () => {
      const slot = row.querySelector('.sm-slot');
      if (!slot) return;
      const mark = dayMark('lit', true);
      slot.replaceWith(mark);
      const [x, y] = centre(mark);
      fx?.burst(x, y, 28, 0.45);
      haptic(16);
    });
    later(2500, () => { el.classList.add('done'); fx?.motes(true); });
  });
}
