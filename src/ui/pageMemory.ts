// Page memory (Learn tab), for those memorising the whole mushaf: always the same Madinah page.
//   #/learn/pages[/J]   the pages of a juz, each coloured by how firmly it is held (src/data/pageMemory.ts)
//   #/learn/page/P      one page, three ways:
//     Line starts   only the first word of each line shows (awa'il al-astur); recite each line, tap it to check
//     Quiz          the lesson exercises' cards, asked on the real page (words hidden in place): how does
//                   the page start / end, what starts the next page, which word starts the marked line,
//                   where does ayah X start (tap its line on the page)
//     Recite page   the whole page from memory: peeks and "Stuck? Next word" are slips, then tap missed
//                   words; the result moves the page's strength
// The page is drawn with its QCF page font from the bundled glyph codes; choices are the bundled text
// split at its spaces, never altered (rule 1; the printed ayah number is left off choices so it gives
// nothing away). Every screen shows the page and its surah reference (rule 2).
import './learn.css';
import './learnPath.css';
import { due, level, recordPage, strength } from '../data/pageMemory';
import { GATE_LIGHT, markPageRecited } from '../data/learnPath';
import { grantJuzGate } from '../data/garden';
import { addLesson, claimGoal } from '../data/journey';
import { earnLamp } from '../data/learnLamps';
import { loadMeta, loadWordMap, surahText, type SurahMeta } from '../data/quran';
import { displayWords, parseSpans } from '../engine/words';
import { surahName, uiRef } from '../i18n';
import { lt } from '../i18n/learn';
import { h, haptic, toast } from './dom';
import { ClipJar, helpCard, helpChoice } from './harakatClips';
import { kidsOn } from '../data/kids';
import { followFailKey, followChecksHarakat, followSupported, followUse, resetFollowUse, startFollow, type Follower } from './follow';
import { reportFollow, sendFollowStat, type FollowOutcome } from './followBeta';
import { follow, followWords, hintsFrom, type FollowWord } from '../engine/follow';
import { icon } from './icons';
import { popIn, reduced, squash } from './juice';
import { lightChip } from './lightChip';
import { sfx } from './sfx';
import { tabBar } from './tabs';

type Mod = typeof import('../data/mushaf');
type Mushaf = Awaited<ReturnType<Mod['loadMushaf']>>;
type Seg = [number, number, string];
const NUM = / [٠-٩]+$/;
const shuffle = <T>(xs: T[]): T[] => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** A glyph word on the page: its ayah and display-word index (-1 = the ayah-number glyph). */
interface Glyph { s: number; a: number; i: number; text: string }
interface PageData { lines: (Glyph[] | null)[]; surahs: number[] }

/** Display words per ayah, per surah (the bundled text, kept for the session). */
const texts = new Map<number, string[][]>();
async function pageData(mushaf: Mushaf, p: number): Promise<PageData> {
  const wordMap = await loadWordMap().catch(() => ({} as Record<string, string>));
  const words = async (s: number) => {
    if (!texts.has(s)) texts.set(s, (await surahText(s)).map((x) => displayWords(x)));
    return texts.get(s)!;
  };
  const lines: (Glyph[] | null)[] = [];
  const surahs = new Set<number>();
  for (const l of mushaf.pages[p - 1].lines) {
    if (l[0] === 'h' || l[0] === 'b') { lines.push(null); continue; }
    const out: Glyph[] = [];
    for (const seg of l as Seg[]) {
      const ws = await words(seg[0]);
      surahs.add(seg[0]);
      let pos = mushaf.segStart.get(seg) ?? 1;
      for (const g of seg[2].split(' ')) {
        const spans = parseSpans(wordMap[`${seg[0]}:${seg[1]}`]);
        const i = spans ? (spans[pos - 1]?.[0] ?? -1) : pos - 1;
        out.push({ s: seg[0], a: seg[1], i: i >= 0 && i < ws[seg[1] - 1].length ? i : -1, text: g });
        pos++;
      }
    }
    lines.push(out);
  }
  return { lines, surahs: [...surahs] };
}

/** Up to n display words from (s, a, i) onwards (or backwards when n < 0), joined; numbers left off. */
function run(s: number, a: number, i: number, n: number): string {
  const ws = texts.get(s);
  if (!ws) return '';
  const out: string[] = [];
  if (n > 0) {
    let x = a, k = i;
    while (out.length < n && x <= ws.length) { if (k < ws[x - 1].length) out.push(ws[x - 1][k++]); else { x++; k = 0; } }
  } else {
    let x = a, k = i;
    while (out.length < -n && x >= 1) { if (k >= 0) out.unshift(ws[x - 1][k--]); else { x--; k = x >= 1 ? ws[x - 1].length - 1 : -1; } }
  }
  return out.map((w) => w.replace(NUM, '')).join(' ');
}

function pageEl(mushaf: Mushaf, mod: Mod, p: number, data: PageData, onWord: (li: number, wi: number, el: HTMLElement) => void, onLine: (li: number) => void): HTMLElement {
  const el = h('div', { class: `mushaf-page ls-page pm-page${p <= 2 ? ' opening' : ''}`, dir: 'rtl', lang: 'ar', 'data-page': String(p) });
  el.style.fontFamily = `qcf-p${p}`;
  const basmala = fetch(`${import.meta.env.BASE_URL}fonts/bismillah.svg`).then((r) => r.text()).catch(() => '');
  mushaf.pages[p - 1].lines.forEach((l, li) => {
    if (l[0] === 'h') { el.append(h('div', { class: 'mp-line mp-surah' }, h('div', { class: 'surah-frame' }, h('span', { class: 'surah-name' }, String(l[1]).padStart(3, '0'))))); return; }
    if (l[0] === 'b') { const b = h('div', { class: 'mp-line mp-basmala' }); void basmala.then((x) => { b.innerHTML = x; }); el.append(b); return; }
    const line = h('div', { class: 'mp-line text', 'data-line': String(li) });
    line.addEventListener('click', (e) => { if (e.target === line) onLine(li); });
    data.lines[li]!.forEach((g, wi) => {
      const w = h('span', { class: g.i >= 0 ? 'w lw' : 'w' }, g.text);
      if (g.i >= 0) w.addEventListener('click', () => onWord(li, wi, w));
      else w.addEventListener('click', () => onLine(li));
      line.append(w);
    });
    el.append(line);
  });
  void mod.loadPageFont(p).catch(() => {}).then(() => requestAnimationFrame(() => fit(el)));
  return el;
}
function fit(el: HTMLElement) {
  if (!el.isConnected) return;
  const lh = Math.floor((el.clientHeight - 10) / 15);
  el.style.setProperty('--lh', `${lh}px`);
  el.style.setProperty('--f', '30px');
  el.classList.add('measuring');
  const widest = Math.max(1, ...[...el.querySelectorAll<HTMLElement>('.mp-line.text')].map((l) => l.scrollWidth));
  el.classList.remove('measuring');
  const cs = getComputedStyle(el);
  const width = (el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) * (el.classList.contains('opening') ? 0.8 : 1);
  el.style.setProperty('--f', `${Math.floor(Math.min((30 * width) / widest, lh * 0.72) * 4) / 4}px`);
}

const LEVEL_KEY = { none: 'learn.pmNone', weak: 'learn.pmWeak', fair: 'learn.pmFair', strong: 'learn.pmStrong' } as const;

// --- #/learn/pages ---

export async function showPageMap(root: HTMLElement, juzArg?: string): Promise<() => void> {
  const mod = await import('../data/mushaf');
  const [mushaf, meta] = await Promise.all([mod.loadMushaf(), loadMeta()]);
  root.classList.add('learn', 'lp', 'pm');
  let juz = Math.min(30, Math.max(1, Number(juzArg) || Number(sessionStorage.getItem('pmJuz')) || 30));
  const chips = h('div', { class: 'pm-juz', role: 'tablist' });
  const grid = h('div', { class: 'pm-grid' });
  const head = h('p', { class: 'pm-sub' });
  const firstSurah = (p: number) => { for (const l of mushaf.pages[p - 1].lines) { if (l[0] === 'h') return Number(l[1]); if (l[0] !== 'b') return (l as Seg[])[0][0]; } return 1; };
  function paint() {
    try { sessionStorage.setItem('pmJuz', String(juz)); } catch { /* ignore */ }
    chips.replaceChildren(...Array.from({ length: 30 }, (_, k) => k + 1).map((j) => h('button', {
      class: `pm-chip${j === juz ? ' on' : ''}`, role: 'tab', 'aria-selected': String(j === juz), onclick: () => { juz = j; paint(); },
    }, String(j))));
    chips.querySelector<HTMLElement>('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    const pages = mushaf.pages.map((pg, i) => [pg.juz, i + 1] as const).filter(([j]) => j === juz).map(([, p]) => p);
    const held = pages.filter((p) => level(p) !== 'none').length;
    head.textContent = lt('learn.pmHeld', { n: held, of: pages.length });
    grid.replaceChildren(...pages.map((p) => {
      const lv = level(p), st = strength(p);
      const m: SurahMeta = meta[firstSurah(p) - 1];
      return h('a', { class: `pm-tile ${lv}${due(p) ? ' due' : ''}`, href: `#/learn/page/${p}`, style: `--st:${st}`,
        'aria-label': `${lt('learn.pageN', { n: p })} · ${surahName(m)} · ${lt(LEVEL_KEY[lv])}` },
      h('b', {}, String(p)), h('span', {}, surahName(m)), h('i', { class: 'pm-bar' }, h('i')));
    }));
  }
  root.append(
    h('header', { class: 'lp-top' },
      h('a', { class: 'icon-btn back-btn', href: '#/learn', 'aria-label': lt('learn.backToPath') }, icon('back', 22)),
      h('h1', { class: 'lp-title' }, lt('learn.pmTitle')),
      h('span', { class: 'lp-gap' }), lightChip()),
    h('p', { class: 'pm-lead' }, lt('learn.pmLead')),
    chips, head, grid,
    h('p', { class: 'pm-legend' }, ...(['none', 'weak', 'fair', 'strong'] as const).map((k) => h('span', { class: `pm-key ${k}` }, h('i'), lt(LEVEL_KEY[k])))),
    tabBar('learn'));
  paint();
  const on = () => paint();
  window.addEventListener('pages-changed', on);
  return () => window.removeEventListener('pages-changed', on);
}

// --- #/learn/page/P ---

type Mode = 'starts' | 'quiz' | 'recite';

export async function showPageDrill(root: HTMLElement, pArg: string): Promise<() => void> {
  const mod = await import('../data/mushaf');
  const [mushaf, meta] = await Promise.all([mod.loadMushaf(), loadMeta()]);
  const p = Math.min(mod.PAGE_COUNT, Math.max(1, Number(pArg) || 1));
  const data = await pageData(mushaf, p);
  const next = p < mod.PAGE_COUNT ? await pageData(mushaf, p + 1) : null;
  root.classList.add('learn', 'lp', 'pm', 'pm-drill');
  let mode: Mode = (sessionStorage.getItem('pmMode') as Mode) || 'starts';
  if (!['starts', 'quiz', 'recite'].includes(mode)) mode = 'starts';

  const textLines = data.lines.map((l, i) => (l ? i : -1)).filter((i) => i >= 0);
  const firstOf = (li: number) => data.lines[li]!.findIndex((g) => g.i >= 0);
  const firstGlyph = data.lines[textLines[0]]!.find((g) => g.i >= 0)!;
  const lastLine = data.lines[textLines[textLines.length - 1]]!;
  const lastGlyph = [...lastLine].reverse().find((g) => g.i >= 0)!;
  const ref = (() => {
    const a = firstGlyph, b = lastGlyph;
    return a.s === b.s ? uiRef(meta[a.s - 1], a.a, b.a) : `${uiRef(meta[a.s - 1], a.a)} – ${uiRef(meta[b.s - 1], b.a)}`;
  })();

  // state
  const revealed = new Set<number>(); // Line starts: lines shown
  const helped = new Set<string>(), shown = new Set<string>(), missed = new Set<string>();
  let checking = false;
  const els = new Map<string, HTMLElement>();
  // voice follow-along (as in a lesson's tasmi'): words heard / passed over, fixed at each pause and pending
  let follower: Follower | null = null, canFollow = false, fw: FollowWord[] = [], fBase = 0;
  const said = new Set<string>(), skip = new Set<string>(), wrongS = new Set<string>(); // skip holds the wrong ones too
  const hkS = new Set<string>(); let hkNext: string[] = []; // said with another haraka (harakat server)
  const jar = new ClipJar(); // clips for "Help improve the harakat check" (src/ui/harakatClips.ts)
  const where = new Map<string, [number, number]>(); // word key -> surah, ayah
  let fwText = new Map<string, string>();
  let sayP = new Set<string>(), skipP = new Set<string>(), wrongP = new Set<string>();
  // heard only partly or not caught (said quietly): shown, never counted as a slip
  const unclearS = new Set<string>(); let unclearP = new Set<string>(); let louderAt = 0;
  const twins = new Map<string, string[]>(); // glyphs that show the same display word go together
  let harakatOn = false;
  void followChecksHarakat().then((x) => { harakatOn = x; });
  void followSupported().then((ok) => { canFollow = ok; if (mode === 'recite' && !checking) paintActions(); });

  const hidden = (li: number, wi: number): boolean => {
    const k = `${li}:${wi}`;
    if (mode === 'starts') return !revealed.has(li) && wi !== firstOf(li);
    if (mode === 'recite') return !checking && !shown.has(k) && !said.has(k) && !sayP.has(k) && !skip.has(k) && !skipP.has(k);
    return false;
  };
  function refresh(only?: Set<string>) {
    for (const [k, el] of only ? [...only].map((k) => [k, els.get(k)] as const) : els) {
      if (!el) continue;
      const [li, wi] = k.split(':').map(Number);
      el.classList.toggle('hid', hidden(li, wi));
      el.classList.toggle('helped', mode === 'recite' && helped.has(k));
      el.classList.toggle('missed', mode === 'recite' && checking && missed.has(k));
      el.classList.toggle('start', mode === 'starts' && wi === firstOf(li) && !revealed.has(li));
      el.classList.toggle('heard', mode === 'recite' && !checking && (said.has(k) || sayP.has(k)));
      const bad = mode === 'recite' && !checking && (skip.has(k) || skipP.has(k)), wr = wrongS.has(k) || wrongP.has(k);
      el.classList.toggle('skipped', bad && !wr);
      el.classList.toggle('wrong', bad && wr);
      el.classList.toggle('unclear', mode === 'recite' && !checking && !bad && (unclearS.has(k) || unclearP.has(k)));
      el.classList.toggle('harakah', mode === 'recite' && !checking && hkS.has(k));
    }
  }

  const titleEl = h('div', { class: 'ls-title' }, h('h1', {}, lt('learn.pageN', { n: p })), h('p', { class: 'ls-ref', dir: 'ltr' }, ref));
  const badge = h('span', { class: 'pm-badge' });
  const focusOn = () => { try { return localStorage.getItem('learnFocus') !== 'off'; } catch { return true; } };
  const svgIcon = (d: string) => { const e = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); e.setAttribute('viewBox', '0 0 24 24'); e.setAttribute('width', '22'); e.setAttribute('height', '22'); e.setAttribute('aria-hidden', 'true'); e.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`; return e; };
  const FOCUS_IN = 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5', FOCUS_OUT = 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5';
  const noorBtn = h('button', { class: 'ls-noor', type: 'button', 'aria-label': lt('learn.focusTools'), 'aria-expanded': 'false', onclick: () => peek(!root.classList.contains('peek')) }, h('i', { 'aria-hidden': 'true' }));
  const focusBtn = h('button', { class: 'icon-btn ls-focus-btn', type: 'button', onclick: () => { try { localStorage.setItem('learnFocus', focusOn() ? 'off' : 'on'); } catch { /* blocked */ } paintFocus(); } });
  const tabs = h('div', { class: 'pm-tabs', role: 'tablist' });
  const pageBox = h('div', { class: 'pm-pagebox' });
  const quizBox = h('div', { class: 'pm-quiz lk', hidden: true });
  const actions = h('div', { class: 'ls-actions pm-actions' });
  const nav = h('div', { class: 'pm-nav' },
    p > 1 ? h('a', { class: 'chip', href: `#/learn/page/${p - 1}` }, '‹ ', lt('learn.pageN', { n: p - 1 })) : h('span'),
    h('a', { class: 'chip', href: `#/learn/pages/${mushaf.pages[p - 1].juz}` }, lt('learn.pmAll')),
    p < mod.PAGE_COUNT ? h('a', { class: 'chip', href: `#/learn/page/${p + 1}` }, lt('learn.pageN', { n: p + 1 }), ' ›') : h('span'));

  const page = pageEl(mushaf, mod, p, data, (li, wi, el) => tapWord(li, wi, el), (li) => tapLine(li));
  page.querySelectorAll<HTMLElement>('.mp-line.text').forEach((line) => {
    const li = Number(line.dataset.line);
    [...line.children].forEach((w, wi) => { if (w.classList.contains('lw')) els.set(`${li}:${wi}`, w as HTMLElement); });
  });
  pageBox.append(page);

  root.append(
    h('header', { class: 'ls-head pm-head' },
      h('a', { class: 'icon-btn back-btn', href: `#/learn/pages/${mushaf.pages[p - 1].juz}`, 'aria-label': lt('learn.pmAll') }, icon('back', 22)),
      titleEl, badge, noorBtn, focusBtn),
    tabs, pageBox, quizBox, actions, nav, tabBar('learn'));

  // Focus page (as in a lesson): the page fills the screen; the page links come up on a tap of the
  // light or a swipe up from the bottom. Same switch as lessons (localStorage learnFocus).
  function paintFocus() {
    const on = focusOn();
    root.classList.toggle('ls-focus', on);
    root.classList.toggle('pm-focus', on);
    if (!on) peek(false);
    focusBtn.replaceChildren(svgIcon(on ? FOCUS_OUT : FOCUS_IN));
    focusBtn.setAttribute('aria-label', lt(on ? 'learn.focusOff' : 'learn.focusOn'));
    requestAnimationFrame(() => { if (!pageBox.hidden) fit(page); const q = quizBox.querySelector<HTMLElement>('.pm-qpage .pm-page'); if (q) fit(q); });
  }
  function peek(on: boolean) {
    root.classList.toggle('peek', on);
    noorBtn.setAttribute('aria-expanded', String(on));
  }
  let swipeY = -1;
  actions.addEventListener('pointerdown', (e) => { swipeY = e.clientY; });
  actions.addEventListener('pointermove', (e) => { if (swipeY >= 0 && swipeY - e.clientY > 36 && root.classList.contains('pm-focus')) { swipeY = -1; peek(true); } });
  actions.addEventListener('pointerup', () => { swipeY = -1; });
  root.addEventListener('click', (e) => { if (root.classList.contains('peek') && !(e.target as Element).closest('.pm-nav, .ls-noor')) peek(false); });
  const pro = new ResizeObserver(() => { if (!pageBox.hidden) fit(page); });
  pro.observe(pageBox);

  function paintBadge() {
    const lv = level(p);
    badge.className = `pm-badge ${lv}`;
    badge.textContent = lt(LEVEL_KEY[lv]);
  }

  function tapLine(li: number) {
    if (mode !== 'starts') return;
    if (revealed.has(li)) revealed.delete(li); else revealed.add(li);
    haptic(6);
    refresh(); paintActions();
  }
  let peekTimer = 0;
  function tapWord(li: number, wi: number, el: HTMLElement) {
    const k = `${li}:${wi}`;
    if (mode === 'starts') { tapLine(li); return; }
    if (mode !== 'recite') return;
    if (checking) { if (missed.has(k)) missed.delete(k); else missed.add(k); haptic(6); refresh(); paintActions(); return; }
    if (!el.classList.contains('hid')) return;
    helped.add(k);
    el.classList.remove('hid'); el.classList.add('peek', 'helped');
    clearTimeout(peekTimer);
    peekTimer = window.setTimeout(() => { el.classList.remove('peek'); refresh(); }, 1800);
    haptic(6);
    paintActions();
  }
  function stuck() {
    for (const li of textLines) for (const [wi] of data.lines[li]!.entries()) {
      const k = `${li}:${wi}`;
      if (!els.has(k) || !hidden(li, wi)) continue;
      shown.add(k); helped.add(k); refresh();
      els.get(k)!.classList.add('peek');
      haptic(10); paintActions();
      return;
    }
  }

  async function toggleFollow() {
    if (follower) { stopFollow(); paintActions(); return; }
    const list: { key: string; text: string }[] = [];
    let prev = '';
    for (const li of textLines) data.lines[li]!.forEach((g, wi) => {
      const k = `${li}:${wi}`;
      if (!els.has(k) || g.i < 0) return;
      const id = `${g.s}:${g.a}:${g.i}`;
      if (id === prev) { twins.get(list[list.length - 1].key)?.push(k); return; }
      prev = id;
      twins.set(k, []);
      list.push({ key: k, text: texts.get(g.s)?.[g.a - 1]?.[g.i] ?? '' });
      where.set(k, [g.s, g.a]);
    });
    fw = followWords(list);
    fwText = new Map(list.map((x) => [x.key, x.text]));
    fBase = fw.findIndex((w) => { const [li, wi] = w.key.split(':').map(Number); return hidden(li, wi); });
    if (fBase < 0) fBase = fw.length;
    const f = await startFollow({
      heard: (text, final) => heard(text, final),
      hints: () => hintsFrom(fw, fBase),
      ahead: () => fw.slice(fBase).map((w) => fwText.get(w.key) ?? ''),
      checked: (r, pcm) => {
        hkNext = r.flags.map((i) => fw[fBase + i]?.key).filter((k): k is string => !!k);
        const base = fBase;
        jar.take(pcm, r, (i) => { const w = fw[base + i]; const at = w && where.get(w.key); return w && at ? { key: w.key, s: at[0], a: at[1], text: fwText.get(w.key) ?? '' } : null; });
      },
      ended: (why) => {
        follower = null;
        if (why === 'denied') toast(lt('learn.followDenied'));
        else if (why === 'limit') toast(lt('learn.followLimit'));
        else if (why === 'failed') { const f = followFailKey(); toast(lt(f.key, { code: f.code })); canFollow = false; }
        else if (why === 'quiet') toast(lt('learn.followQuiet'));
        if (mode === 'recite' && !checking) paintActions();
      },
    });
    if (!f) { toast(lt('learn.followFailed')); return; }
    if (!localStorage.getItem(harakatOn ? 'followNotedS' : 'followNoted')) { toast(lt(harakatOn ? 'learn.followNoteServer' : 'learn.followNote')); try { localStorage.setItem(harakatOn ? 'followNotedS' : 'followNoted', '1'); } catch { /* blocked */ } }
    follower = f;
    haptic(10);
    paintActions();
  }
  function stopFollow() {
    const f = follower;
    follower = null;
    f?.stop();
    for (const k of sayP) said.add(k);
    for (const k of skipP) skip.add(k);
    for (const k of wrongP) wrongS.add(k);
    for (const k of unclearP) unclearS.add(k);
    sayP = new Set(); skipP = new Set(); wrongP = new Set(); unclearP = new Set();
  }
  let lastSig = '';
  const withTwins = (keys: string[]) => new Set(keys.flatMap((k) => [k, ...(twins.get(k) ?? [])]));
  function heard(text: string, final: boolean) {
    if (!follower || mode !== 'recite' || checking) return;
    const r = follow(fw, fBase, text);
    const touched = new Set([...sayP, ...skipP, ...unclearP]);
    unclearP = withTwins(r.unclear.map((x) => fw[x].key));
    sayP = new Set([...withTwins(r.said.map((x) => fw[x].key)), ...unclearP]);
    wrongP = withTwins(r.wrong.map((x) => fw[x].key));
    skipP = new Set([...withTwins(r.skipped.map((x) => fw[x].key)), ...wrongP]);
    // said again after a breath: a word passed over or heard unclearly before now counts as said
    for (const k of withTwins(r.again.map((x) => fw[x].key))) {
      if (skip.has(k) || wrongS.has(k) || unclearS.has(k)) { skip.delete(k); wrongS.delete(k); unclearS.delete(k); said.add(k); touched.add(k); }
    }
    if (final) {
      for (const k of sayP) said.add(k);
      for (const k of skipP) skip.add(k);
      for (const k of wrongP) wrongS.add(k);
      if (unclearP.size && Date.now() - louderAt > 25_000) { louderAt = Date.now(); toast(lt('learn.followLouder')); }
      for (const k of unclearP) unclearS.add(k);
      for (const k of withTwins(hkNext)) { said.add(k); skip.add(k); wrongS.add(k); hkS.add(k); }
      sayP = new Set(); skipP = new Set(); wrongP = new Set(); unclearP = new Set();
      fBase = r.cursor;
    }
    hkNext = [];
    for (const k of [...sayP, ...skipP]) touched.add(k);
    if (final) for (const k of [...said, ...skip]) touched.add(k);
    refresh(touched);
    const sig = `${skip.size + skipP.size > 0}|${new Set([...helped, ...skip, ...skipP]).size}`;
    if (sig !== lastSig) { lastSig = sig; paintActions(); }
    if (r.cursor >= fw.length) {
      stopFollow();
      toast(lt('learn.followEnd'));
      haptic(20);
      window.setTimeout(() => { if (mode === 'recite' && !checking) reveal(); }, 900);
    }
  }
  function reveal() {
    if (follower) stopFollow();
    checking = true;
    for (const k of skip) missed.add(k); // passed over: marked, untap if the phone misheard
    refresh(); paintActions();
  }

  function setMode(m: Mode) {
    if (follower) stopFollow();
    jar.clear();
    said.clear(); skip.clear(); wrongS.clear(); hkS.clear(); unclearS.clear(); sayP = new Set(); skipP = new Set(); wrongP = new Set(); unclearP = new Set();
    resetFollowUse();
    mode = m;
    try { sessionStorage.setItem('pmMode', m); } catch { /* ignore */ }
    revealed.clear(); helped.clear(); shown.clear(); missed.clear(); checking = false;
    tabs.replaceChildren(...([['starts', 'learn.pmStarts'], ['quiz', 'learn.pmQuiz'], ['recite', 'learn.pmRecite']] as const).map(([id, k]) =>
      h('button', { class: `pm-tab${id === mode ? ' on' : ''}`, role: 'tab', 'aria-selected': String(id === mode), onclick: () => setMode(id) }, lt(k))));
    pageBox.hidden = m === 'quiz';
    quizBox.hidden = m !== 'quiz';
    if (m === 'quiz') quizBox.replaceChildren(quiz());
    refresh(); paintActions();
    if (m !== 'quiz') requestAnimationFrame(() => fit(page));
  }

  function paintActions() {
    const b = (label: string, on: () => void, cls = 'chip') => h('button', { class: cls, onclick: on }, label);
    const primary = (label: string, on: () => void) => b(label, on, 'primary brand-btn');
    root.classList.toggle('ls-memory', mode === 'recite' && !checking);
    root.classList.toggle('ls-check', mode === 'recite' && checking);
    root.classList.toggle('pm-quizon', mode === 'quiz');
    if (mode === 'starts') {
      const left = textLines.filter((li) => !revealed.has(li));
      actions.replaceChildren(
        h('p', { class: 'ls-hint muted small' }, lt('learn.pmStartsHint')),
        b(lt('learn.pmHideAll'), () => { revealed.clear(); refresh(); paintActions(); }),
        left.length ? primary(lt('learn.pmNextLine'), () => { revealed.add(left[0]); refresh(); paintActions(); })
          : primary(lt('learn.pmRecitePage'), () => setMode('recite')));
    } else if (mode === 'quiz') actions.replaceChildren();
    else if (!checking) {
      const slips = new Set([...helped, ...skip, ...skipP]).size;
      const folBtn = canFollow ? h('button', { class: `chip ts-follow${follower ? ' live' : ''}`, 'aria-pressed': String(!!follower), onclick: () => void toggleFollow() },
        h('span', { class: 'ts-mic', 'aria-hidden': 'true' }), lt(follower ? 'learn.following' : 'learn.follow'), h('span', { class: 'beta-pill' }, lt('learn.beta'))) : '';
      actions.replaceChildren(
        h('p', { class: 'ls-hint muted small' }, slips ? lt(skip.size || skipP.size ? 'learn.followSkipped' : 'learn.slipsSoFar', { n: slips }) : lt(follower ? 'learn.followHint' : 'learn.memoryHint')),
        folBtn, b(lt('learn.stuck'), stuck, 'chip ts-stuck'),
        primary(lt('learn.reveal'), reveal));
    } else {
      const total = new Set([...helped, ...missed]).size;
      const verdict = total === 0 ? 2 : total <= Math.max(2, Math.round(els.size * 0.04)) ? 1 : 0;
      const outcome = (v?: number): FollowOutcome => ({ mode: 'page', ref: `p:${p}`, words: fw.length || els.size, said, skipped: skip,
        wrong: wrongS, unclear: unclearS, missed, helped: helped.size, verdict: v });
      const res = (k: 0 | 1 | 2, label: string) => {
        const go = () => { sendFollowStat(outcome(k)); done(k); };
        const el = k === verdict ? primary(label, go) : b(label, go);
        return el;
      };
      actions.replaceChildren(
        h('p', { class: 'ls-hint' }, lt('learn.tapMissed')),
        h('p', { class: 'ls-hint ts-sum' }, total ? lt('learn.slipsN', { n: total }) : lt('learn.noSlips')),
        hkS.size ? h('p', { class: 'ls-hint muted small' }, lt('learn.harakahN', { n: hkS.size })) : '',
        hkS.size && jar.size && helpChoice() === null && !kidsOn() ? helpCard(() => paintActions()) : '',
        followUse() ? h('div', { class: 'ts-ab' }, h('button', { class: 'chip ts-misheard', onclick: () => reportFollow(outcome()) }, lt('learn.followReport'))) : '',
        res(0, lt('learn.notYet')), res(1, lt('learn.someSlips')), res(2, lt('learn.hadIt')));
    }
  }
  function done(k: 0 | 1 | 2) {
    jar.share(missed);
    recordPage(p, k);
    // A page recited from memory lights a lamp again (src/data/learnLamps.ts).
    const lit = k > 0 && earnLamp();
    if (k > 0) { addLesson(); markPageRecited(p); }
    // From the Learn path: a page step goes back to the path; a juz checkpoint raises its gate.
    let gate = '', from = '';
    try { gate = sessionStorage.getItem('pmGate') ?? ''; from = sessionStorage.getItem('pmFromPath') ?? ''; } catch { /* ignore */ }
    const [gj, gp] = gate.split(':').map(Number);
    if (gp === p && k > 0) {
      try { sessionStorage.removeItem('pmGate'); } catch { /* ignore */ }
      if (grantJuzGate(gj)) {
        claimGoal(`jg:${gj}`, GATE_LIGHT);
        void import('./celebrate').then((c) => c.celebrate({ kind: 'star', kicker: lt('learn.gateKicker', { n: gj }), title: lt('learn.gatePassed'), sub: lt('learn.gatePassedSub', { n: gj }) }, null, GATE_LIGHT))
          .finally(() => { location.hash = '#/learn'; });
        return;
      }
    }
    if (gp === p && k === 0) toast(lt('learn.gateNotYet'));
    if (k === 2) sfx.shimmer();
    toast(`${lt('learn.pmSaved', { level: lt(LEVEL_KEY[level(p)]) })}${lit ? ` · ${lt('learn.lampEarned')}` : ''}`);
    paintBadge();
    if (from === String(p) && k > 0) {
      try { sessionStorage.removeItem('pmFromPath'); } catch { /* ignore */ }
      window.setTimeout(() => { if (location.hash === `#/learn/page/${p}`) location.hash = '#/learn'; }, 1400);
      return;
    }
    setMode(k === 0 ? 'starts' : 'recite');
  }

  // --- quiz ---
  // The same run of cards as a lesson's exercises (src/ui/lessonKinds.ts: bar, feedback strip, a missed
  // card back once at the end), asked on the real page: its words hidden in place, the line in question
  // marked, the words asked about pulsing where they stand; the answer appears there.
  const qro = new ResizeObserver(() => { const pg = quizBox.querySelector<HTMLElement>('.pm-qpage .pm-page'); if (pg) fit(pg); });
  qro.observe(quizBox);
  function quiz(): HTMLElement {
    type QC =
      | { k: 'pick'; q: string; mark: number; slot: string[]; show?: boolean; opts: string[]; answer: string; before?: boolean }
      | { k: 'tap'; q: string; sub: string; line: number };
    const cards: QC[] = [];
    const others = (pages: number[], fn: (d: PageData) => string) => pages.map((x) => fn(pageCache.get(x)!)).filter(Boolean);
    const startOf = (d: PageData) => { const li = d.lines.findIndex((l) => l && l.some((g) => g.i >= 0)); const g = d.lines[li]!.find((x) => x.i >= 0)!; return run(g.s, g.a, g.i, 3); };
    const endOf = (d: PageData) => { const l = [...d.lines].reverse().find((x) => x && x.some((g) => g.i >= 0))!; const g = [...l].reverse().find((x) => x.i >= 0)!; return run(g.s, g.a, g.i, -3); };
    // The page's words in reading order, and the glyphs that show n display words from one of them.
    const seq: [number, number][] = [];
    textLines.forEach((li) => data.lines[li]!.forEach((g, wi) => { if (g.i >= 0) seq.push([li, wi]); }));
    const idOf = ([li, wi]: [number, number]) => { const g = data.lines[li]![wi]; return `${g.s}:${g.a}:${g.i}`; };
    const glyphs = (from: number, n: number): string[] => {
      const ids = new Set<string>(), out: string[] = [];
      for (let x = from; x >= 0 && x < seq.length; x += n > 0 ? 1 : -1) {
        const id = idOf(seq[x]);
        if (!ids.has(id)) { if (ids.size >= Math.abs(n)) break; ids.add(id); }
        out.push(`${seq[x][0]}:${seq[x][1]}`);
      }
      return out;
    };
    const lastLi = textLines[textLines.length - 1];
    const pick = (q: string, answer: string, wrong: string[], mark: number, slot: string[], extra: { show?: boolean; before?: boolean } = {}) => {
      const opts = [...new Set(wrong.filter((w) => w && w !== answer))].slice(0, 2);
      if (opts.length < 2 || !answer) return;
      cards.push({ k: 'pick', q, mark, slot, opts: shuffle([answer, ...opts]), answer, ...extra });
    };
    const near = neighbours.filter((x) => x !== p);
    pick(lt('learn.pmQStart'), startOf(data), others(shuffle(near), startOf), textLines[0], glyphs(0, 3));
    pick(lt('learn.pmQEnd'), endOf(data), others(shuffle(near), endOf), lastLi, glyphs(seq.length - 1, -3), { before: true });
    if (next) pick(lt('learn.pmQNext'), startOf(next), others(shuffle(near.filter((x) => x !== p + 1)), startOf), lastLi, [], { show: true });
    // Which word starts the marked line?
    for (const li of shuffle(textLines.filter((li) => li !== textLines[0])).slice(0, 2)) {
      const g = data.lines[li]![firstOf(li)];
      const wrong = shuffle(textLines.filter((x) => x !== li)).map((x) => { const y = data.lines[x]![firstOf(x)]; return run(y.s, y.a, y.i, 2); });
      pick(lt('learn.pmQWhichLine'), run(g.s, g.a, g.i, 2), wrong, li, glyphs(seq.findIndex(([l]) => l === li), 2));
    }
    // Where does ayah X start? Tap its line on the page.
    const starts: [number, number, number][] = []; // s, a, line
    textLines.forEach((li) => data.lines[li]!.forEach((g) => { if (g.i === 0) starts.push([g.s, g.a, li]); }));
    for (const [s, a, li] of shuffle(starts).slice(0, 2)) cards.push({ k: 'tap', q: lt('learn.pmQWhere', { ref: uiRef(meta[s - 1], a) }), sub: run(s, a, 0, 3), line: li });

    const dir = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
    const ar = (text: string) => h('span', { class: 'lk-ar', lang: 'ar', dir: 'rtl' }, text);
    const box = h('div', { class: 'lk lk-drill pm-q', dir });
    const bar = h('div', { class: 'lk-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(cards.length) }, h('span'));
    const stage = h('div', { class: 'lk-stage', 'aria-live': 'polite' });
    const foot = h('div', { class: 'lk-foot' });
    box.append(bar, stage, foot);
    const queue = shuffle(cards);
    const retried = new Set<QC>();
    let right = 0, firstTry = 0;
    const setBar = () => {
      (bar.firstChild as HTMLElement).style.width = `${Math.max(4, Math.min(1, right / Math.max(1, cards.length)) * 100)}%`;
      bar.setAttribute('aria-valuenow', String(right));
    };
    function feedback(ok: boolean, card: QC, answerNode: Node | null) {
      foot.className = `lk-foot show ${ok ? 'good' : 'bad'}`;
      const cont = h('button', { class: 'primary lk-continue', onclick: () => nextCard() }, lt('learn.continue'));
      const goods = ['learn.good1', 'learn.good2', 'learn.good3'] as const;
      foot.replaceChildren(
        h('div', { class: 'lk-verdict' },
          h('strong', {}, lt(ok ? goods[Math.floor(Math.random() * 3)] : 'learn.notQuite')),
          !ok && answerNode ? h('span', { class: 'lk-answer' }, ...((answerNode as Element).classList?.contains('lk-ar') ? [lt('learn.answerIs'), ' ', answerNode] : [answerNode])) : ''),
        cont);
      if (!reduced()) popIn(foot.firstElementChild!);
      setTimeout(() => cont.focus(), 30);
      if (ok) { right++; if (!retried.has(card)) firstTry++; setBar(); sfx.pop(Math.min(right, 4)); haptic(8); } else {
        haptic(30);
        if (!retried.has(card)) { retried.add(card); queue.push(card); }
      }
    }
    function show(card: QC) {
      stage.classList.remove('answered');
      foot.className = 'lk-foot';
      foot.replaceChildren();
      let onLine = (_li: number) => {};
      const pg = pageEl(mushaf, mod, p, data, (li) => onLine(li), (li) => onLine(li));
      const wordEls = new Map<string, HTMLElement>();
      pg.querySelectorAll<HTMLElement>('.mp-line.text').forEach((line) => {
        const li = Number(line.dataset.line);
        [...line.children].forEach((w, wi) => { if (w.classList.contains('lw')) { w.classList.add('hid'); wordEls.set(`${li}:${wi}`, w as HTMLElement); } });
      });
      const lineEl = (li: number) => pg.querySelector<HTMLElement>(`.mp-line[data-line="${li}"]`);
      const showLine = (li: number, cls = '') => lineEl(li)?.querySelectorAll<HTMLElement>('.lw').forEach((w, i) => {
        w.classList.remove('hid', 'pm-slot');
        if (cls) { w.classList.add(cls); if (!reduced()) window.setTimeout(() => popIn(w), i * 40); }
      });
      const wrap = h('div', { class: 'pm-qpage' }, pg);
      let body: Node[];
      if (card.k === 'pick') {
        lineEl(card.mark)?.classList.add('pm-mark');
        for (const k of card.slot) wordEls.get(k)?.classList.add('pm-slot');
        if (card.show) showLine(card.mark);
        const fill = () => card.slot.forEach((k, i) => {
          const w = wordEls.get(k);
          if (!w) return;
          w.classList.remove('hid', 'pm-slot'); w.classList.add('pm-fill');
          if (!reduced()) window.setTimeout(() => popIn(w), i * 60);
        });
        const label = (o: string) => ar(card.before ? `… ${o}` : `${o} …`);
        const btns = card.opts.map((o) => h('button', { class: 'lk-opt' }, label(o)));
        btns.forEach((b, i) => b.addEventListener('click', () => {
          if (stage.classList.contains('answered')) return;
          stage.classList.add('answered');
          const ok = card.opts[i] === card.answer;
          fill();
          if (ok) { b.classList.add('right'); squash(b, 0.15); feedback(true, card, null); } else {
            b.classList.add('wrong');
            btns[card.opts.indexOf(card.answer)]?.classList.add('right', 'soft');
            feedback(false, card, label(card.answer));
          }
        }));
        body = [h('p', { class: 'lk-q' }, card.q), wrap, h('div', { class: 'lk-opts' }, ...btns)];
      } else {
        box.classList.add('tap');
        onLine = (li) => {
          if (stage.classList.contains('answered')) return;
          stage.classList.add('answered');
          const ok = li === card.line;
          const el = lineEl(li);
          el?.classList.add(ok ? 'right' : 'wrong');
          if (ok && el) squash(el, 0.06);
          if (!ok) lineEl(card.line)?.classList.add('right', 'soft');
          showLine(card.line, 'pm-fill');
          feedback(ok, card, ok ? null : h('span', {}, lt('learn.pmLineN', { n: card.line + 1 })));
        };
        body = [h('p', { class: 'lk-q' }, card.q), h('p', { class: 'lk-meant lk-ar pm-qsub', lang: 'ar', dir: 'rtl' }, card.sub, ' …'),
          h('p', { class: 'pm-qhint' }, lt('learn.pmQTapLine')), wrap];
      }
      box.classList.toggle('tap', card.k === 'tap');
      stage.replaceChildren(h('div', { class: 'lk-card' }, ...body));
      if (!reduced()) popIn(stage.firstElementChild!, { stiffness: 260, damping: 22 });
    }
    function nextCard() {
      const card = queue.shift();
      if (card) { show(card); return; }
      box.classList.remove('tap');
      foot.className = 'lk-foot'; foot.replaceChildren();
      if (firstTry === cards.length && cards.length) sfx.shimmer();
      stage.replaceChildren(h('div', { class: 'lk-card pm-qdone' },
        h('p', { class: 'lk-q' }, lt('learn.pmQuizDone', { n: firstTry, of: cards.length })),
        h('button', { class: 'primary brand-btn', onclick: () => setMode('recite') }, lt('learn.pmRecitePage')),
        h('button', { class: 'chip', onclick: () => setMode('quiz') }, lt('learn.pmAgain'))));
      if (!reduced()) popIn(stage.firstElementChild!, { stiffness: 260, damping: 22 });
    }
    setBar();
    nextCard();
    return box;
  }

  // Neighbouring pages give the wrong choices (their starts and ends are what gets mixed up).
  const pageCache = new Map<number, PageData>();
  const neighbours: number[] = [];
  for (let x = Math.max(1, p - 3); x <= Math.min(mod.PAGE_COUNT, p + 3); x++) neighbours.push(x);
  for (const x of neighbours) pageCache.set(x, x === p ? data : x === p + 1 && next ? next : await pageData(mushaf, x));

  paintBadge();
  paintFocus();
  setMode(mode);
  const onResize = () => { if (!pageBox.hidden) fit(page); };
  window.addEventListener('resize', onResize);
  return () => { if (follower) stopFollow(); clearTimeout(peekTimer); pro.disconnect(); qro.disconnect(); window.removeEventListener('resize', onResize); };
}
