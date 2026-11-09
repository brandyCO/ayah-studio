// The morning / evening adhkar session (Me → the adhkar goal, or Me → Morning / Evening adhkar):
// one dhikr at a time, full text with its meaning and source, a big counter tapped for each time it
// is said. A dhikr said in full adds a little Light and moves on; when every one is said the goal is
// met (journey DayRec.ad / am) and can be claimed here. Progress is kept for the day, so leaving and
// coming back picks up where the user stopped. Quran parts are drawn from our own text in the
// KFGQPC font; the rest is Hisn al-Muslim as bundled (rule: nothing written by us).
import './adhkar.css';
import { dhikrLight, lastAt, loadAdhkar, say, saidCount, sessionList, setLastAt, type AdhkarPeriod, type Dhikr } from '../data/adhkar';
import { claimGoal, goalClaimed, setAdhkar } from '../data/journey';
import { goals, lightFor } from '../data/goals';
import { surahMeta } from '../data/quran';
import { akt } from '../i18n/adhkar';
import { lang, t } from '../i18n';
import { h, haptic, toast } from './dom';
import { chest } from './chest';

const R = 54;
const C = 2 * Math.PI * R;
const SIZES = [0.85, 1, 1.18, 1.38];
const pref = (k: string, d: number) => { try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && localStorage.getItem(k) !== null ? v : d; } catch { return d; } };
const setPref = (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } };

export async function openAdhkar(p: AdhkarPeriod) {
  let all: Dhikr[];
  try { all = await loadAdhkar(); } catch { toast(akt('ak.failed')); return; }
  const list = sessionList(all, p);
  const names = new Map<number, string>();
  await Promise.all([...new Set(list.filter((x) => x.quran).map((x) => x.quran!.s))].map(async (s) => {
    try { const m = await surahMeta(s); names.set(s, lang() === 'ar' ? m.ar : m.en); } catch { /* reference only */ }
  }));
  const goalId = p === 'm' ? 'adhkarM' : 'adhkar';
  const isDone = (d: Dhikr) => saidCount(p, d.id) >= d.count;
  const firstOpen = () => list.findIndex((d) => !isDone(d));
  let i = Math.max(0, list.findIndex((d) => d.id === lastAt(p)));
  if (isDone(list[i]) && firstOpen() >= 0) i = firstOpen();
  let finished = list.every(isDone);
  let size = Math.min(SIZES.length - 1, Math.max(0, pref('adhkarSize', 1)));
  let meaning = pref('adhkarMeaning', lang() === 'ar' ? 0 : 1) === 1;
  let advancing = 0;

  const title = akt(p === 'm' ? 'ak.titleM' : 'ak.titleS');
  const step = h('span', { class: 'ak-step' }, '');
  const dots = h('div', { class: 'ak-dots', role: 'tablist', 'aria-label': akt('ak.list') });
  const body = h('div', { class: 'ak-body' });
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 120 120');
  ring.classList.add('ak-ring');
  ring.innerHTML = `<circle cx="60" cy="60" r="${R}" class="ak-track"/><circle cx="60" cy="60" r="${R}" class="ak-fill" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 60 60)"/>`;
  const fill = ring.lastElementChild as SVGCircleElement;
  const num = h('b', { class: 'ak-num' }, '0');
  const of = h('span', { class: 'ak-of' }, '');
  const gain = h('span', { class: 'ak-gain', 'aria-live': 'polite' }, '');
  const counter = h('button', { class: 'ak-count', onclick: () => tap() }, ring, h('span', { class: 'ak-center' }, num, of), gain);
  const prev = h('button', { class: 'icon-btn ak-nav', 'aria-label': akt('ak.prev'), onclick: () => go(i - 1) }, lang() === 'ar' ? '›' : '‹');
  const next = h('button', { class: 'icon-btn ak-nav', 'aria-label': akt('ak.next'), onclick: () => go(i + 1) }, lang() === 'ar' ? '‹' : '›');
  const undo = h('button', { class: 'chip ak-undo', onclick: () => { if (saidCount(p, list[i].id) > 0) { say(p, list[i], -1); paint(); } } }, akt('ak.undo'));
  const foot = h('div', { class: 'ak-foot' }, prev, h('div', { class: 'ak-mid' }, counter, h('p', { class: 'muted small ak-hint' }, akt('ak.tap'))), next);

  const textOf = (d: Dhikr) => (p === 'm' && d.arM ? d.arM : d.ar);
  const enOf = (d: Dhikr) => (p === 'm' && d.enM ? d.enM : d.en);
  const timesLine = (n: number) => (n === 1 ? akt('ak.once') : akt(n > 10 ? 'ak.timesMany' : 'ak.times', { n }));
  const noteOf = (d: Dhikr) => (d.note === 'night' ? akt('ak.noteNight') : d.note === 'lazy' ? akt('ak.noteLazy') : d.note === 'day' ? akt('ak.noteDay') : '');

  const paintDots = () => dots.replaceChildren(...list.map((d, k) => h('button', {
    class: `ak-dot${isDone(d) ? ' done' : ''}${k === i && !finished ? ' cur' : ''}`, role: 'tab', 'aria-selected': String(k === i && !finished),
    'aria-label': `${k + 1}`, onclick: () => go(k),
  })));

  const paintCounter = () => {
    const d = list[i];
    const n = saidCount(p, d.id);
    num.textContent = String(n);
    of.textContent = `/ ${d.count}`;
    fill.style.strokeDashoffset = String(C * (1 - n / d.count));
    counter.classList.toggle('met', n >= d.count);
    counter.setAttribute('aria-label', akt('ak.tapAria', { n, of: d.count }));
    undo.hidden = n === 0;
  };

  const paint = () => {
    dialog.classList.toggle('finished', finished);
    step.textContent = finished ? '' : akt('ak.of', { n: i + 1, of: list.length });
    paintDots();
    if (finished) { paintDone(); return; }
    const d = list[i];
    setLastAt(p, d.id);
    const q = d.quran;
    const ref = q ? `${q.s}:${q.a}${q.b > q.a ? `–${q.b}` : ''}` : '';
    const note = noteOf(d);
    body.replaceChildren(
      h('p', { class: 'ak-kicker' }, q ? akt('ak.quran', { name: names.get(q.s) ?? '', ref }) : timesLine(d.count)),
      q ? h('p', { class: 'ak-times muted small' }, timesLine(d.count)) : '',
      d.opening ? h('p', { class: 'ak-open', lang: 'ar', dir: 'rtl' }, d.opening) : '',
      h('p', { class: `ak-ar${q ? ' quran' : ''}`, lang: 'ar', dir: 'rtl', style: `--ak-scale:${SIZES[size]}` }, textOf(d)),
      meaning ? h('p', { class: 'ak-en', lang: 'en', dir: 'ltr' }, enOf(d)) : '',
      note ? h('p', { class: 'ak-note' }, note,
        d.note === 'lazy' && !isDone(d) ? h('button', { class: 'chip', onclick: () => { say(p, d, d.count); completed(d); } }, akt('ak.lazyBtn')) : '') : '',
      h('p', { class: 'ak-ref muted small' }, akt('ak.source', { ref: lang() === 'ar' ? d.refAr : d.ref })),
      undo);
    body.scrollTop = 0;
    prev.disabled = i === 0;
    next.disabled = i === list.length - 1;
    paintCounter();
  };

  const paintDone = () => {
    const goalOn = goals().adhkar;
    const canClaim = goalOn && !goalClaimed(goalId);
    const light = lightFor({ kind: 'adhkar', target: list.length });
    const open = async () => {
        // The session is a modal dialog: close it first so the moment plays above the Me screen.
        const m = await import('./celebrate');
        dialog.close();
        await m.celebrate({ kind: 'chest', title, sub: akt('ak.doneSub') }, null, light);
        claimGoal(goalId, light);
    };
    const claim = h('button', { class: 'primary brand-btn ak-claim', onclick: open }, akt('ak.claim'));
    body.replaceChildren(h('div', { class: 'ak-done' },
      canClaim ? chest(light, 'ready', t('chest.open', { n: light }), () => void open())
        : h('div', { class: 'ak-done-mark', 'aria-hidden': 'true' }, '✓'),
      h('h3', {}, akt(p === 'm' ? 'ak.doneTitleM' : 'ak.doneTitleS')),
      h('p', { class: 'muted' }, akt('ak.doneSub')),
      canClaim ? claim : h('button', { class: 'primary', onclick: () => dialog.close() }, akt('ak.close')),
      h('button', { class: 'chip', onclick: () => { finished = false; i = 0; paint(); } }, akt('ak.again')),
      h('p', { class: 'muted small ak-credit' }, akt('ak.credit'))));
  };

  /** A dhikr was just said in full: Light, then on to the next one still to say. */
  const completed = (d: Dhikr) => {
    const light = dhikrLight(d.count);
    const id = `ak:${p}:${d.id}`;
    const fresh = !goalClaimed(id);
    claimGoal(id, light);
    haptic(60);
    if (fresh) {
      gain.textContent = akt('ak.light', { n: light });
      gain.classList.remove('show'); void gain.offsetWidth; gain.classList.add('show');
    }
    paintCounter();
    paintDots();
    const all = list.every(isDone);
    if (all) setAdhkar(true, p);
    clearTimeout(advancing);
    advancing = window.setTimeout(() => {
      advancing = 0;
      if (all) { finished = true; paint(); return; }
      const k = list.findIndex((x, j) => j > i && !isDone(x));
      go(k >= 0 ? k : firstOpen());
    }, 750);
  };

  const tap = () => {
    if (finished || advancing) return;
    const d = list[i];
    if (isDone(d)) { go(i + 1); return; }
    const n = say(p, d, 1);
    counter.classList.remove('bump'); void counter.offsetWidth; counter.classList.add('bump');
    if (n >= d.count) completed(d);
    else { haptic(12); paintCounter(); }
  };

  const go = (k: number) => {
    if (k < 0 || k >= list.length) return;
    clearTimeout(advancing); advancing = 0;
    finished = false;
    i = k;
    paint();
  };

  // Swipe sideways to move between adhkar (the reading direction decides which way is next).
  let sx = 0, sy = 0;
  body.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; });
  body.addEventListener('pointerup', (e) => {
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || finished) return;
    const forward = lang() === 'ar' ? dx > 0 : dx < 0;
    go(forward ? i + 1 : i - 1);
  });

  const sizeBtn = h('button', { class: 'chip', 'aria-label': akt('ak.size'), onclick: () => { size = (size + 1) % SIZES.length; setPref('adhkarSize', size); paint(); } }, 'Aa');
  const meaningBtn = h('button', { class: `chip${meaning ? ' on' : ''}`, 'aria-pressed': String(meaning), onclick: () => {
    meaning = !meaning; setPref('adhkarMeaning', meaning ? 1 : 0); meaningBtn.classList.toggle('on', meaning); meaningBtn.setAttribute('aria-pressed', String(meaning)); paint();
  } }, akt('ak.translation'));

  const close = () => dialog.close();
  const onKey = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') { if (e.target === dialog || e.target === counter) { e.preventDefault(); tap(); } }
    else if (e.key === 'ArrowRight') go(lang() === 'ar' ? i - 1 : i + 1);
    else if (e.key === 'ArrowLeft') go(lang() === 'ar' ? i + 1 : i - 1);
  };
  const dialog = h('dialog', { class: `adhkar ak-${p}`, 'aria-label': title },
    h('div', { class: 'ak-top' },
      h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕'),
      h('div', { class: 'ak-title' }, h('h2', {}, title), step),
      h('div', { class: 'ak-tools' }, meaningBtn, sizeBtn)),
    dots, body, foot);
  dialog.addEventListener('keydown', onKey);
  dialog.addEventListener('close', () => { clearTimeout(advancing); dialog.remove(); });
  window.addEventListener('hashchange', close, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  paint();
  if (!finished) counter.focus();
}
