// First-run tour (docs/grow.md, G3): three calm cards over the mushaf — Read the mushaf · Make a
// reel · Together — shown once, with Skip on every card; ☰ → Tour shows it again. The brand gradient
// appears only on the last button (CLAUDE.md "App colours").
import { t } from '../i18n';
import { h } from './dom';

export function tourSeen(): boolean {
  try {
    return !!localStorage.getItem('tourSeen');
  } catch {
    return true; // no storage: never nag
  }
}
export function markTourSeen() {
  try {
    localStorage.setItem('tourSeen', '1');
  } catch {
    /* ignore */
  }
}

const svg = (body: string) => {
  const el = h('div', { class: 'tour-art', 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 120 120" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return el;
};
// Line drawings: an open mushaf; a 9:16 frame with sound bars; three linked circles.
const ART = [
  '<path d="M60 34c-10-7-26-9-40-6v58c14-3 30-1 40 6 10-7 26-9 40-6V28c-14-3-30-1-40 6z"/><path d="M60 34v58"/><path d="M30 44h18M30 54h18M30 64h14M72 44h18M72 54h18M76 64h14" opacity=".55"/>',
  '<rect x="38" y="16" width="44" height="88" rx="8"/><path d="M52 76v-6M58 80v-14M64 78v-10M70 74v-2" /><path d="M50 44h20M54 52h12" opacity=".55"/>',
  '<circle cx="60" cy="42" r="14"/><circle cx="38" cy="78" r="14"/><circle cx="82" cy="78" r="14"/><path d="M52 54l-7 12M68 54l7 12M52 78h16" opacity=".55"/>',
];

/** Shows the tour; `done` runs when it closes (Skip or Start). */
export function showTour(done?: () => void) {
  const steps = [
    { title: t('tour.read'), text: t('tour.readText') },
    { title: t('tour.reel'), text: t('tour.reelText') },
    { title: t('tour.together'), text: t('tour.togetherText') },
  ];
  let i = 0;
  const card = h('div', { class: 'tour-card', role: 'group' });
  const dots = h('div', { class: 'tour-dots', 'aria-hidden': 'true' });
  const overlay = h('div', { class: 'tour', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('tour.label') }, card);
  const close = () => {
    markTourSeen();
    overlay.classList.add('out');
    window.setTimeout(() => overlay.remove(), 400);
    document.removeEventListener('keydown', onKey);
    done?.();
  };
  const go = (k: number) => {
    i = Math.max(0, Math.min(steps.length - 1, k));
    draw();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') go(document.documentElement.dir === 'rtl' ? i - 1 : i + 1);
    else if (e.key === 'ArrowLeft') go(document.documentElement.dir === 'rtl' ? i + 1 : i - 1);
  };
  function draw() {
    const last = i === steps.length - 1;
    dots.replaceChildren(...steps.map((_, k) => h('span', { class: k === i ? 'on' : '' })));
    card.replaceChildren(
      h('div', { class: 'tour-step' },
        svg(ART[i]),
        h('h2', {}, steps[i].title),
        h('p', {}, steps[i].text)),
      dots,
      h('div', { class: 'tour-buttons' },
        last ? null : h('button', { class: 'chip', onclick: close }, t('tour.skip')),
        i > 0 ? h('button', { class: 'chip', onclick: () => go(i - 1) }, t('common.back')) : null,
        last ? h('button', { class: 'primary brand-btn', onclick: close }, t('tour.start'))
          : h('button', { class: 'primary', onclick: () => go(i + 1) }, t('tour.next'))));
    (card.querySelector('.tour-buttons .primary') as HTMLElement | null)?.focus();
  }
  // Swipe between cards.
  let x0: number | null = null;
  overlay.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  overlay.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) < 50) return;
    const forward = document.documentElement.dir === 'rtl' ? dx > 0 : dx < 0;
    go(forward ? i + 1 : i - 1);
  });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  draw();
}
