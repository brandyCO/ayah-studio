// Tasbih counter (Me → a dhikr goal, or Me → Tasbih): one big round button counts, a ring fills
// towards the goal (or 33), a gentle vibration on each count and a longer one at the goal. Counts go
// to today's journey (dhikr goals, stats, badges). Phrases are fixed (goals.ts DHIKR).
import { addDhikr, todayRec } from '../data/journey';
import { DHIKR, goals, type DhikrId } from '../data/goals';
import { t, type Key } from '../i18n';
import { h, haptic } from './dom';

const R = 104;
const C = 2 * Math.PI * R;

export function openTasbih(start: DhikrId = 'subhan') {
  let id: DhikrId = start;
  const target = () => goals().dhikr[id] || 33;
  const count = () => todayRec().dk?.[id] ?? 0;

  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 240 240');
  ring.classList.add('tb-ring');
  ring.innerHTML = `<circle cx="120" cy="120" r="${R}" class="tb-track"/><circle cx="120" cy="120" r="${R}" class="tb-fill" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 120 120)"/>`;
  const fill = ring.lastElementChild as SVGCircleElement;
  const num = h('b', { class: 'tb-num' }, '0');
  const of = h('span', { class: 'tb-of' }, '');
  const phrase = h('p', { class: 'tb-ar', lang: 'ar', dir: 'rtl' }, '');
  const meaning = h('p', { class: 'tb-en muted' }, '');
  const chips = h('div', { class: 'chips tb-chips' });

  const paint = (bump = false) => {
    const d = DHIKR.find((x) => x.id === id)!;
    const n = count();
    const goal = target();
    phrase.textContent = d.ar;
    meaning.textContent = t(d.key as Key);
    num.textContent = String(n);
    of.textContent = n >= goal ? t('tb.done', { n: goal }) : t('tb.of', { n: goal });
    const laps = n % goal === 0 && n > 0 ? goal : n % goal;
    fill.style.strokeDashoffset = String(C * (1 - laps / goal));
    btn.classList.toggle('met', n >= goal);
    if (bump) { btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); }
    chips.replaceChildren(...DHIKR.map((x) => h('button', {
      class: `chip${x.id === id ? ' on' : ''}`, lang: 'ar', 'aria-pressed': String(x.id === id),
      onclick: () => { id = x.id; paint(); },
    }, x.ar)));
  };

  const btn = h('button', {
    class: 'tb-btn', 'aria-label': t('tb.count'),
    onclick: () => {
      const before = count();
      addDhikr(id, 1);
      const goal = target();
      haptic(before + 1 === goal ? 60 : 12);
      paint(true);
    },
  }, ring, h('span', { class: 'tb-center' }, num, of));

  const close = () => d.close();
  const d = h('dialog', { class: 'tasbih' },
    h('div', { class: 'tb-top' },
      h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕'),
      h('h2', {}, t('tb.title')),
      h('button', { class: 'chip', onclick: () => { if (count() > 0) { addDhikr(id, -1); paint(); } } }, t('tb.undo'))),
    chips, phrase, meaning, btn,
    h('p', { class: 'muted small tb-hint' }, t('tb.hint')));
  d.addEventListener('close', () => d.remove());
  window.addEventListener('hashchange', close, { once: true });
  document.body.append(d);
  d.showModal();
  paint();
  btn.focus();
}
