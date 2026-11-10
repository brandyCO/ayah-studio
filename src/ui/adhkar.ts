// The morning / evening adhkar session (Me → the adhkar goal, or Me → Morning / Evening adhkar):
// one dhikr at a time, full text with its meaning and source, a big counter tapped for each time it
// is said. A dhikr said in full adds a little Light and moves on; when every one is said the goal is
// met (journey DayRec.ad / am) and can be claimed here. Progress is kept for the day, so leaving and
// coming back picks up where the user stopped. Quran parts are drawn from our own text in the
// KFGQPC font; the rest is Hisn al-Muslim as bundled (rule: nothing written by us).
// The same session says the du'a moments of the day (`openDuas`: waking, the adhan, after the salah
// per prayer, before sleep; src/data/duas.ts).
import './adhkar.css';
import { dhikrLight, lastAt, loadAdhkar, say, saidCount, sessionList, setLastAt, type AdhkarPeriod, type SessionKey } from '../data/adhkar';
import { bedtimeSaid, loadDuas, momentKey, momentList, prayerNow, PRAYER_LIST, type Dua, type Moment, type Prayer } from '../data/duas';
import { claimGoal, goalClaimed, markMoment, setAdhkar } from '../data/journey';
import { goals, lightFor } from '../data/goals';
import { surahMeta } from '../data/quran';
import { akt, type AdhkarKey } from '../i18n/adhkar';
import { lang, t } from '../i18n';
import { h, haptic, toast } from './dom';
import { chest } from './chest';
import { popIn, squash } from './juice';
import { sfx } from './sfx';

const R = 54;
const C = 2 * Math.PI * R;
const SIZES = [0.85, 1, 1.18, 1.38];
const pref = (k: string, d: number) => { try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && localStorage.getItem(k) !== null ? v : d; } catch { return d; } };
const setPref = (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } };

export async function openAdhkar(p: AdhkarPeriod) {
  let all: Dua[];
  try { all = await loadAdhkar(); } catch { toast(akt('ak.failed')); return; }
  await runSession({ key: p, list: sessionList(all, p), title: akt(p === 'm' ? 'ak.titleM' : 'ak.titleS'), goalId: p === 'm' ? 'adhkarM' : 'adhkar',
    doneTitle: akt(p === 'm' ? 'ak.doneTitleM' : 'ak.doneTitleS'), variant: `ak-${p}` });
}

/** A du'a moment of the day; the adhan and the salah open on the prayer whose time it is (chips change it). */
export async function openDuas(m: Moment, prayer?: Prayer) {
  let all: Record<Moment, Dua[]>;
  try { all = await loadDuas(); } catch { toast(akt('ak.failed')); return; }
  const p = m === 'salah' || m === 'adhan' ? (prayer ?? await prayerNow()) : undefined;
  await runSession({ key: momentKey(m, p), list: momentList(all, m, p), title: akt(`du.title.${m}` as AdhkarKey), moment: m, prayer: p,
    doneTitle: akt(`du.done.${m}` as AdhkarKey), variant: `du-${m}` });
}

interface SessionCfg {
  key: SessionKey;
  list: Dua[];
  title: string;
  doneTitle: string;
  variant: string;
  /** The daily goal this session meets (the morning / evening adhkar). */
  goalId?: string;
  moment?: Moment;
  prayer?: Prayer;
}

async function runSession(cfg: SessionCfg) {
  const { key: p, list, title, goalId } = cfg;
  if (!list.length) return;
  const names = new Map<number, string>();
  await Promise.all([...new Set(list.flatMap((x) => [...(x.quran ? [x.quran.s] : []), ...(x.read ?? [])]))].map(async (s) => {
    try { const m = await surahMeta(s); names.set(s, lang() === 'ar' ? m.ar : m.en); } catch { /* reference only */ }
  }));
  const isDone = (d: Dua) => saidCount(p, d.id) >= d.count;
  const firstOpen = () => list.findIndex((d) => !isDone(d));
  let i = Math.max(0, list.findIndex((d) => d.id === lastAt(p)));
  if (isDone(list[i]) && firstOpen() >= 0) i = firstOpen();
  let finished = list.every(isDone);
  let size = Math.min(SIZES.length - 1, Math.max(0, pref('adhkarSize', 1)));
  let meaning = pref('adhkarMeaning', lang() === 'ar' ? 0 : 1) === 1;
  let advancing = 0;

  const step = h('span', { class: 'ak-step' }, '');
  const dots = h('div', { class: 'ak-dots', role: 'tablist', 'aria-label': akt('ak.list') });
  const body = h('div', { class: 'ak-body' });
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 120 120');
  ring.classList.add('ak-ring');
  ring.innerHTML = `<circle cx="60" cy="60" r="${R}" class="ak-track"/><circle cx="60" cy="60" r="${R}" class="ak-fill" stroke-dasharray="${C}" stroke-dashoffset="${C}" transform="rotate(-90 60 60)"/>`;
  const fill = ring.lastElementChild as SVGCircleElement;
  // The 33s (and the 34) are counted on a ring of beads, one lighting with each tap.
  const beadsG = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  beadsG.classList.add('ak-beads');
  ring.append(beadsG);
  let beadsFor = '';
  const paintBeads = (d: Dua, n: number) => {
    ring.classList.toggle('beads', !!d.beads);
    if (!d.beads) { beadsG.replaceChildren(); beadsFor = ''; return; }
    if (beadsFor !== d.id) {
      beadsFor = d.id;
      beadsG.replaceChildren(...Array.from({ length: d.count }, (_, k) => {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / d.count;
        const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        c.setAttribute('cx', (60 + R * Math.cos(a)).toFixed(2));
        c.setAttribute('cy', (60 + R * Math.sin(a)).toFixed(2));
        c.setAttribute('r', d.count > 40 ? '2.2' : '3.1');
        c.style.transformOrigin = `${c.getAttribute('cx')}px ${c.getAttribute('cy')}px`;
        return c;
      }));
    }
    [...beadsG.children].forEach((c, k) => { c.classList.toggle('on', k < n); c.classList.toggle('next', k === n); });
  };
  // No sounds before sleeping (and none unless the user keeps reward sounds on: sfx checks).
  const quiet = cfg.moment === 'sleep';
  const num = h('b', { class: 'ak-num' }, '0');
  const of = h('span', { class: 'ak-of' }, '');
  const gain = h('span', { class: 'ak-gain', 'aria-live': 'polite' }, '');
  const counter = h('button', { class: 'ak-count', onclick: () => tap() }, ring, h('span', { class: 'ak-center' }, num, of), gain);
  const prev = h('button', { class: 'icon-btn ak-nav', 'aria-label': akt('ak.prev'), onclick: () => go(i - 1) }, lang() === 'ar' ? '›' : '‹');
  const next = h('button', { class: 'icon-btn ak-nav', 'aria-label': akt('ak.next'), onclick: () => go(i + 1) }, lang() === 'ar' ? '‹' : '›');
  const undo = h('button', { class: 'chip ak-undo', onclick: () => { if (saidCount(p, list[i].id) > 0) { say(p, list[i], -1, list[i].count); paint(); } } }, akt('ak.undo'));
  const hint = h('p', { class: 'muted small ak-hint' }, akt('ak.tap'));
  const foot = h('div', { class: 'ak-foot' }, prev, h('div', { class: 'ak-mid' }, counter, hint), next);

  const textOf = (d: Dua) => (p === 'm' && d.arM ? d.arM : d.ar);
  const enOf = (d: Dua) => (p === 'm' && d.enM ? d.enM : d.en);
  const timesLine = (n: number) => (n === 1 ? akt('ak.once') : akt(n > 10 ? 'ak.timesMany' : 'ak.times', { n }));
  const noteOf = (d: Dua) => {
    if (d.note === 'night') return akt('ak.noteNight');
    if (d.note === 'lazy') return akt('ak.noteLazy');
    if (d.note === 'day') return akt('ak.noteDay');
    // The book's own words where it has them in the reader's language, else a short line of ours.
    const book = lang() === 'ar' ? d.arNote : d.enNote;
    return book ?? (d.note ? akt(`du.note.${d.note}` as AdhkarKey) : '');
  };
  const prayerName = (x: Prayer) => akt(`du.p.${x}` as AdhkarKey);
  const kickerOf = (d: Dua, q: Dua['quran'], ref: string) => {
    if (d.act) return akt('du.sunnah');
    const base = q ? akt('ak.quran', { name: names.get(q.s) ?? '', ref }) : timesLine(d.count);
    return d.prayers && d.prayers.length < PRAYER_LIST.length ? `${base} · ${akt('du.only', { list: d.prayers.map(prayerName).join(lang() === 'ar' ? ' و' : ' & ') })}` : base;
  };

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
    paintBeads(d, n);
    counter.classList.toggle('met', n >= d.count);
    counter.setAttribute('aria-label', d.act ? akt('du.didIt') : akt('ak.tapAria', { n, of: d.count }));
    counter.classList.toggle('act', !!d.act);
    hint.textContent = d.act ? akt('du.tapDone') : akt('ak.tap');
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
      h('p', { class: 'ak-kicker' }, kickerOf(d, q, ref)),
      q && !d.act ? h('p', { class: 'ak-times muted small' }, timesLine(d.count)) : '',
      d.opening ? h('p', { class: 'ak-open', lang: 'ar', dir: 'rtl' }, d.opening) : '',
      h('p', { class: `ak-ar${q ? ' quran' : ''}`, lang: 'ar', dir: 'rtl', style: `--ak-scale:${SIZES[size]}` },
        // In "what to do", the words to say (the book's (( ))) stand out; the text itself is unchanged.
        ...(d.act ? textOf(d).split(/(\(\(.+?\)\))/s).map((x, k) => (k % 2 ? h('b', { class: 'ak-say' }, x) : x)) : [textOf(d)])),
      meaning ? h('p', { class: 'ak-en', lang: 'en', dir: 'ltr' }, enOf(d)) : '',
      meaning && d.gloss?.length ? h('ul', { class: 'ak-gloss', lang: 'en', dir: 'ltr' }, ...d.gloss.map((g) => h('li', {}, g))) : '',
      d.read?.length ? h('div', { class: 'chips ak-read' }, ...d.read.map((s) => h('button', { class: 'chip', onclick: () => { dialog.close(); location.hash = `#/s/${s}`; } },
        akt('du.open', { name: names.get(s) ?? String(s) })))) : '',
      note ? h('p', { class: 'ak-note' }, note,
        d.note === 'lazy' && !isDone(d) ? h('button', { class: 'chip', onclick: () => { say(p, d, d.count, d.count); completed(d); } }, akt('ak.lazyBtn')) : '') : '',
      h('p', { class: 'ak-ref muted small' }, akt('ak.source', { ref: lang() === 'ar' ? d.refAr : d.ref })),
      undo);
    body.scrollTop = 0;
    prev.disabled = i === 0;
    next.disabled = i === list.length - 1;
    paintCounter();
  };

  const paintDone = () => {
    const goalOn = goalId ? goals().adhkar : false;
    const canClaim = !!goalId && goalOn && !goalClaimed(goalId);
    const light = lightFor({ kind: 'adhkar', target: list.length });
    const open = async () => {
        // The session is a modal dialog: close it first so the moment plays above the Me screen.
        const m = await import('./celebrate');
        dialog.close();
        await m.celebrate({ kind: 'chest', title, sub: akt('ak.doneSub') }, null, light);
        claimGoal(goalId!, light);
    };
    const claim = h('button', { class: 'primary brand-btn ak-claim', onclick: open }, akt('ak.claim'));
    body.replaceChildren(h('div', { class: 'ak-done' },
      canClaim ? chest(light, 'ready', t('chest.open', { n: light }), () => void open())
        : cfg.moment === 'sleep' ? h('div', { class: 'ak-moon', 'aria-hidden': 'true' }) : h('div', { class: 'ak-done-mark', 'aria-hidden': 'true' }, '✓'),
      h('h3', {}, cfg.doneTitle),
      h('p', { class: 'muted' }, cfg.moment ? akt(`du.doneSub.${cfg.moment}` as AdhkarKey) : akt('ak.doneSub')),
      cfg.moment === 'sleep' ? h('p', { class: 'muted small' }, akt('du.dawnNext')) : '',
      cfg.moment === 'adhan' ? h('button', { class: 'chip on', onclick: () => { dialog.close(); void openDuas('salah', cfg.prayer); } }, `${akt('du.title.salah')} ›`) : '',
      canClaim ? claim : h('button', { class: 'primary', onclick: () => dialog.close() }, akt('ak.close')),
      h('button', { class: 'chip', onclick: () => { finished = false; i = 0; paint(); } }, akt('ak.again')),
      h('p', { class: 'muted small ak-credit' }, akt('ak.credit'))));
  };

  /** A dhikr was just said in full: Light, then on to the next one still to say. */
  const completed = (d: Dua) => {
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
    if (all && (p === 's' || p === 'm')) setAdhkar(true, p);
    if (all && cfg.moment === 'sleep') bedtimeSaid();
    if (all && cfg.moment) markMoment(p);
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
    const n = say(p, d, 1, d.count);
    counter.classList.remove('bump'); void counter.offsetWidth; counter.classList.add('bump');
    if (d.beads) {
      const b = beadsG.children[n - 1];
      if (b) popIn(b, { stiffness: 520, damping: 12 });
      if (!quiet) sfx.tick();
    }
    if (n >= d.count) { squash(counter, 0.12); if (!quiet) sfx.shimmer(); }
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
  // After the adhan / the salah: which prayer (what is said after Fajr and Maghrib differs).
  const prayers = cfg.prayer ? h('div', { class: 'chips ak-prayers', role: 'group', 'aria-label': akt('du.which') },
    ...PRAYER_LIST.map((x) => h('button', { class: `chip${x === cfg.prayer ? ' on' : ''}`, 'aria-pressed': String(x === cfg.prayer),
      onclick: () => { if (x === cfg.prayer) return; dialog.close(); void openDuas(cfg.moment!, x); } }, prayerName(x)))) : '';
  const dialog = h('dialog', { class: `adhkar ${cfg.variant}`, 'aria-label': title },
    h('div', { class: 'ak-top' },
      h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: close }, '✕'),
      h('div', { class: 'ak-title' }, h('h2', {}, title), step),
      h('div', { class: 'ak-tools' }, meaningBtn, sizeBtn)),
    prayers, dots, body, foot);
  dialog.addEventListener('keydown', onKey);
  dialog.addEventListener('close', () => { clearTimeout(advancing); dialog.remove(); window.dispatchEvent(new Event('journey-changed')); });
  window.addEventListener('hashchange', close, { once: true });
  document.body.append(dialog);
  dialog.showModal();
  paint();
  if (!finished) counter.focus();
}
