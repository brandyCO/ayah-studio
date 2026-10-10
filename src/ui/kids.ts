// Kids space (docs/kids.md K1): a calm sky screen for children that a parent switches on from ☰.
// While it is on, the app opens here and every other address leads back (src/main.ts); the parent
// gate guards leaving, the settings and anything that leads out. No sign-in, no social features.
//   #/kids          home: the surahs to listen to
//   #/kids/{surah}  listen & repeat (src/ui/kidsListen.ts)
import { cleanName, grantPass, kidsSettings, KIDS_SURAHS, kidsSetUp, learned, NAME_MAX, setKidsOn, setKidsSettings, setLearned } from '../data/kids';
import { constellation, kidsPathState, outerSide, pathHeight, pathPoint, takeBloom } from '../data/kidsPath';
import { reducedMotion } from '../light/support';
import { kidsNoor, NOOR_GLIDE_MS } from './kidsNoor';
import { keepAllOffline, keptCount } from '../data/kidsAudio';
import { loadMeta } from '../data/quran';
import { h, toast } from './dom';
import { parentGate } from './kidsGate';
import { DEFAULT_RECITER, RECITERS, reciterById, reciterPickerLabel } from '../data/reciters';
import { lastRead, reelLook, reelReciter } from './prefs';
import { lang, locale, surahName, t } from '../i18n';

const lockIcon = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<rect x="5" y="11" width="14" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
  return s;
};

/** The parent button in the corner of every Kids screen. */
export const parentButton = () =>
  h('button', { class: 'kids-parent', 'aria-label': t('kids.grownUps'), onclick: () => void openParent() }, lockIcon());

/** ☰ → Kids space: the first time a short setup for the parent, then the space opens. */
export function openKidsSpace() {
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((x) => x.close());
  if (kidsSetUp()) return enter();
  const name = h('input', { class: 'kids-name-input', type: 'text', maxLength: NAME_MAX, placeholder: t('kids.nameOptional'), autocomplete: 'off', 'aria-label': t('kids.childName') });
  const d = h('dialog', { class: 'sheet bottom kids-setup' },
    h('div', { class: 'sheet-head' }, h('h2', {}, t('menu.kids')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
    h('p', {}, t('kids.intro')),
    h('p', { class: 'muted small' }, t('kids.gateNote')),
    h('label', { class: 'kids-field' }, h('span', {}, t('kids.nameNote')), name),
    h('button', { class: 'primary wide', onclick: () => { setKidsSettings({ name: name.value }); d.close(); enter(); } }, t('kids.open')));
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
}

function enter() {
  setKidsOn(true);
  location.hash = '#/kids';
}

/** The parent sheet (after the gate): name, reading options, leaving the space. */
export async function openParent() {
  if (!(await parentGate())) return;
  const k = kidsSettings();
  const name = h('input', { class: 'kids-name-input', type: 'text', maxLength: NAME_MAX, value: k.name, autocomplete: 'off', 'aria-label': "Child's name" });
  const toggle = (label: string, on: boolean, set: (v: boolean) => void) => {
    const b = h('button', { class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: () => {
      on = !on;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      set(on);
    } }, label);
    return b;
  };
  // Husary (Muallim) first: his slow teaching recitation suits repeating.
  const current = kidsReciter();
  const order = [...RECITERS.filter((r) => r.id === 12), ...RECITERS.filter((r) => r.id !== 12)];
  const reciterSelect = h('select', { class: 'kids-name-input', onchange: () => { setKidsSettings({ reciter: Number(reciterSelect.value) }); paintOffline(); } },
    ...order.map((r) => h('option', { value: String(r.id), selected: r.id === current }, `${reciterPickerLabel(r)}${r.id === 12 ? t('kids.slowForLearning') : ''}`)));
  const offline = h('div', { class: 'kids-offline' });
  const paintOffline = () => {
    const id = kidsReciter();
    const kept = keptCount(id);
    offline.replaceChildren(h('p', { class: 'muted small' }, kept >= KIDS_SURAHS.length ? t('kids.keptAll', { n: KIDS_SURAHS.length, reciter: reciterById(id).short })
        : t('kids.kept', { kept, n: KIDS_SURAHS.length, reciter: reciterById(id).short })));
    if (kept < KIDS_SURAHS.length) offline.append(h('button', { class: 'chip', onclick: async (e: Event) => {
        const b = e.currentTarget as HTMLButtonElement;
        b.disabled = true;
        const failed = await keepAllOffline(id, (n, total) => { b.textContent = t('kids.downloading', { n, total }); });
        toast(failed ? t('kids.downloadFailed', { n: failed }) : t('kids.downloadDone'));
        paintOffline();
      } }, t('kids.keepAll')));
  };
  paintOffline();
  const meta = await loadMeta();
  const learnedList = h('div', { class: 'chips' });
  const paintLearned = () => {
    const lit = learned();
    const list = KIDS_SURAHS.filter((n) => lit[n]);
    learnedList.replaceChildren(...(list.length ? list.map((n) => h('button', { class: 'chip', onclick: () => { setLearned(n, false); unshare(n); paintLearned(); window.dispatchEvent(new HashChangeEvent('hashchange')); } }, `${surahName(meta[n - 1])} ✕`))
      : [h('span', { class: 'muted small' }, t('kids.noneLearned'))]));
  };
  paintLearned();
  const familyBox = h('div', {});
  void import('./family').then((m) => familyBox.replaceChildren(m.familyLinkSection()));
  const d = h('dialog', { class: 'sheet bottom kids-parent-sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, t('kids.grownUps')), h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => d.close() }, '✕')),
    h('label', { class: 'kids-field' }, h('span', {}, t('kids.childName')), name),
    h('div', { class: 'kids-field' }, h('span', {}, t('kids.show')), h('div', { class: 'chips' },
      toggle(t('kids.translation'), k.translation, (v) => setKidsSettings({ translation: v })),
      toggle(t('kids.sky3d'), k.sky3d, (v) => { setKidsSettings({ sky3d: v }); if (location.hash === '#/kids') window.dispatchEvent(new HashChangeEvent('hashchange')); }))),
    h('div', { class: 'kids-field' }, h('span', {}, t('kids.learnedList')), learnedList),
    h('div', { class: 'kids-field' }, h('span', {}, t('kids.family')), familyBox),
    h('label', { class: 'kids-field' }, h('span', {}, t('kids.reciter')), reciterSelect),
    h('div', { class: 'kids-field' }, h('span', {}, t('kids.offline')), offline),
    h('button', { class: 'primary wide', onclick: () => { d.close(); leave(); } }, t('kids.leave')),
    h('p', { class: 'muted small' }, t('kids.privacy')));
  d.addEventListener('close', () => {
    if (cleanName(name.value) !== k.name) setKidsSettings({ name: name.value });
    d.remove();
  });
  document.body.append(d);
  d.showModal();
}

const dateFmt = new Intl.DateTimeFormat(locale() ?? 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * "My first surah" keepsake (docs/kids.md K4), after the parent gate: an editor draft of the surah
 * (up to MAX_AYAT ayat) in a calm mood, with "{name} memorised {surah}" and the date on the closing
 * card (user text, drawn in the UI fonts by the closing-card code, inside the safe area).
 */
export async function makeKeepsake(n: number) {
  if (!(await parentGate(t('kids.keepsakeGate')))) return;
  const [{ newProject, applyLook, MAX_AYAT }, { applyMood, MOODS }, drafts, meta] = await Promise.all([
    import('../engine/project'), import('../engine/moods'), import('../data/drafts'), loadMeta()]);
  const s = meta[n - 1];
  const p = newProject(n, 1, Math.min(s.ayahs, MAX_AYAT), kidsReciter());
  applyLook(p, reelLook(), () => true);
  applyMood(p, MOODS.find((m) => m.id === KEEPSAKE_MOOD) ?? MOODS[0]);
  p.scenes = [KEEPSAKE_BACKGROUND];
  p.clips = [];
  p.sceneMode = 'single';
  p.sceneLengths = [];
  p.outro = true;
  const name = kidsSettings().name;
  const when = learned()[n] ?? Date.now();
  p.closing = { title: (name ? t('kids.keepsakeTitle', { name, surah: surahName(s) }) : t('kids.keepsakeTitleNoName', { surah: surahName(s) })).slice(0, 80), names: [dateFmt.format(when)] };
  const id = drafts.newDraftId();
  const now = Date.now();
  await drafts.saveDraft({ id, project: p, created: now, updated: now });
  grantPass('#/reel/');
  location.hash = drafts.draftHash(p, id);
}
const KEEPSAKE_MOOD = 'pastel';
const KEEPSAKE_BACKGROUND = 'kid-moon';

/** A lantern put out by the parent: also put out for the linked child in the family circle. */
function unshare(n: number) {
  if (!hasFamilyLink()) return;
  void import('../together/family').then(async (f) => {
    const l = f.kidsLink();
    f.forgetPushed(n);
    if (l) await f.setChildSurah(l.child, n, 'none').catch((e) => console.warn('Family not updated', e));
  });
}
const hasFamilyLink = () => {
  try {
    return !!localStorage.getItem('kidsFamily');
  } catch {
    return false;
  }
};

/** Linked to a family circle (K6) and signed in: share lit lanterns, then show unseen du'a notes. */
function familyNotes() {
  if (!hasFamilyLink()) return;
  void Promise.all([import('../cloud/auth'), import('../together/family'), import('./family')]).then(([auth, f, ui]) => {
    const off = auth.onAccount((a) => {
      if (!a) return;
      queueMicrotask(() => off());
      const l = f.kidsLink();
      if (l) void f.syncKidsFamily().then((notes) => { if (location.hash === '#/kids') ui.showNotes(notes, l.childName); });
    });
  });
}

/** The reciter of the space: the parent's pick, else the reel reciter. */
export const kidsReciter = () => kidsSettings().reciter ?? reciterById(reelReciter(DEFAULT_RECITER)).id;

function leave() {
  setKidsOn(false);
  toast(t('kids.closed'));
  location.hash = lastRead();
}

const greeting = () => {
  const n = kidsSettings().name;
  return n ? t('kids.helloName', { name: n }) : t('kids.hello');
};

/** A lantern (SVG): outline when unlit; filled with a flame when lit (shape, not only colour). */
function lantern(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path class="l-frame" d="M19 9a5 5 0 0 1 10 0"/><rect class="l-frame" x="15" y="10" width="18" height="5" rx="2"/>'
    + '<path class="l-body" d="M14 16h20l-2.5 32h-15z"/><rect class="l-frame" x="14.5" y="48" width="19" height="5" rx="2"/>'
    + '<ellipse class="l-flame" cx="24" cy="34" rx="4.5" ry="7.5"/>';
  return svg;
}

const STAR_PX = 6; // px between two stars of a constellation
/**
 * A learned surah's constellation (one star per ayah, joined softly in ayah order) beside its
 * lantern, on the side away from its name. Positioned in the stop's own box (the 72 px lantern).
 */
function constellationSvg(i: number, surah: number, ayahs: number): SVGSVGElement {
  const c = constellation(surah, ayahs);
  const pts = c.stars.map((p) => ({ x: p.x * STAR_PX, y: p.y * STAR_PX }));
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  const pad = 3, w = maxX - minX + pad * 2, hgt = maxY - minY + pad * 2;
  // Its centre: up and out from the lantern's circle (r 36), clear of it and of the screen edge.
  const out = outerSide(i);
  const cx = 36 + out * (30 + w * 0.3), cy = 36 - (26 + hgt * 0.25);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'kids-const');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', `${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${w.toFixed(1)} ${hgt.toFixed(1)}`);
  svg.setAttribute('style', `left:${(cx - w / 2).toFixed(1)}px;top:${(cy - hgt / 2).toFixed(1)}px;width:${w.toFixed(1)}px;height:${hgt.toFixed(1)}px`);
  const step = Math.min(70, 2000 / ayahs); // the stars come out in ayah order within ~2 s when it blooms
  const xy = (k: number) => `${pts[k].x.toFixed(1)} ${pts[k].y.toFixed(1)}`;
  const line = c.links.length ? `<path pathLength="1" style="--d:600ms" d="${c.links.map(([a, b]) => `M${xy(a)}L${xy(b)}`).join('')}"/>` : '';
  svg.innerHTML = line + pts.map((p, k) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${k === 0 ? 1.6 : 1.15}" style="--d:${Math.round(600 + step * k)}ms"/>`).join('');
  return svg;
}

/** Home of the space: a path winding down the sky through the short surahs, one lantern each. */
export async function showKids(root: HTMLElement): Promise<() => void> {
  const meta = await loadMeta();
  const path = kidsPathState(learned(), takeBloom());
  const { lit, next, bloom } = path;
  root.classList.add('kids');
  // Lantern positions: x in % of the width (a gentle wave), y in px.
  const pts = path.surahs.map((_, i) => pathPoint(i));
  const height = pathHeight(pts.length);
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], my = (a.y + b.y) / 2;
    d += ` C ${a.x} ${my}, ${b.x} ${my}, ${b.x} ${b.y}`;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'kids-path-line');
  svg.setAttribute('viewBox', `0 0 100 ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<path d="${d}" vector-effect="non-scaling-stroke"/>`;

  let target: HTMLElement | null = null;
  const stops = path.surahs.map((n, i) => {
    const s = meta[n - 1];
    const { x, y } = pts[i];
    const right = x < 50; // the label sits on the side with more room
    const el = h('a', {
      class: `kids-stop${lit[i] ? ' lit' : ''}${i === next ? ' next' : ''}${i === bloom ? ' bloom' : ''}${right ? '' : ' label-left'}`,
      href: `#/kids/${n}`, style: `left: ${x}%; top: ${y}px`,
      'aria-label': `${surahName(s)}, ${t('common.ayat', { n: s.ayahs })}${lit[i] ? t('kids.learnedAria') : ''}`,
    },
    h('span', { class: 'kids-lantern' }, lantern()),
    h('span', { class: 'kids-stop-label' },
      h('strong', lang() === 'ar' ? { class: 'kids-stop-ar', lang: 'ar' } : {}, surahName(s)),
      lang() === 'ar' ? h('span', { class: 'kids-stop-sub', lang: 'en', dir: 'ltr' }, s.en) : h('span', { class: 'kids-stop-ar', lang: 'ar', dir: 'rtl' }, s.ar),
      h('span', { class: 'kids-stop-sub' }, t('common.ayat', { n: s.ayahs }))));
    if (lit[i]) el.append(constellationSvg(i, n, s.ayahs));
    if (i === (bloom >= 0 ? bloom : next)) target = el;
    return el;
  });
  const noor = kidsNoor();
  const noorAt = (i: number, glide = false) => {
    const { x, y } = pts[i];
    // Beside the next lantern, on the side away from its name; above a lit one (its stars are beside it).
    const out = outerSide(i);
    noor.place(lit[i] ? `${x}%` : `calc(${x}% + ${out * 54}px)`, `${y - (lit[i] ? 58 : 30)}px`, glide);
  };
  const home = next >= 0 ? next : lit.lastIndexOf(true);
  let glideT = 0;
  if (bloom >= 0 && home >= 0 && home !== bloom) {
    // The lantern just lit: Noor brightens beside it, then glides over to the next one.
    noorAt(bloom);
    noor.brighten();
    glideT = window.setTimeout(() => {
      noorAt(home, true);
      glideT = window.setTimeout(() => stops[home].scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }), NOOR_GLIDE_MS);
    }, 1600);
  } else if (home >= 0) {
    noorAt(home);
    if (bloom >= 0) noor.brighten();
  }
  root.append(
    h('header', { class: 'kids-top' }, h('h1', { class: 'kids-hello' }, greeting()), parentButton()),
    h('p', { class: 'kids-lead' }, t('kids.which')),
    h('div', { class: 'kids-path', style: `height: ${height}px` }, svg, ...stops, noor.el));
  if (target) requestAnimationFrame(() => (target as HTMLElement).scrollIntoView({ block: 'center' }));
  familyNotes();
  // The same path as floating lanterns in 3D behind the stops (L7); the 2D path stays as it is.
  let off = () => {};
  let gone = false;
  if (kidsSettings().sky3d) {
    void import('./kidsSky').then((m) => m.mountKidsSky(root, stops, path, path.surahs.map((n) => meta[n - 1].ayahs)))
      .then((f) => { if (gone) f(); else off = f; }).catch(() => {});
  }
  return () => { gone = true; clearTimeout(glideT); noor.dispose(); off(); };
}
