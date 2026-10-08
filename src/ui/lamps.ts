// Revision lamps (docs/together.md T5a, before the Phase 2 flashcards): ☰ → My memorisation shows all
// 604 pages as small lamps on one canvas, a row per juz. Pages not memorised are quiet outlines;
// memorised pages glow, the light fading with the time since their last revision over their Leitner
// interval; a lamp past its interval is drawn as a dim lamp with a ring (shape, not only colour).
// Tap a lamp → its page: open it, "Revised today" (relights it with a warm bloom, up one box), "Needs
// work" (back to box 1), or remove it. Mark a page, a surah, a juz or a range as memorised. Calm:
// no streaks or scores — only how many lamps there are and which ones would like a visit.
import { forget, glow, INTERVALS, lamps, memorise, revise, type Lamp } from '../data/lamps';
import { loadMushaf, PAGE_COUNT, type Mushaf } from '../data/mushaf';
import { loadMeta, type SurahMeta } from '../data/quran';
import { h, toast } from './dom';

const DAY = 86_400_000;

/** The surah a page starts in (the first surah with text on it). */
export function surahOfPage(m: Mushaf, meta: SurahMeta[], page: number): number {
  let s = 1;
  for (let n = 1; n <= meta.length; n++) {
    if (m.surahStartPage(n) <= page) s = n;
    else break;
  }
  return s;
}

/** Due lamps grouped by surah, for the Today card. */
export async function dimLamps(): Promise<{ count: number; surah: SurahMeta | null }> {
  const all = Object.entries(lamps()).filter(([, l]) => glow(l).due).map(([p]) => Number(p));
  if (!all.length) return { count: 0, surah: null };
  const [m, meta] = await Promise.all([loadMushaf(), loadMeta()]);
  const by = new Map<number, number>();
  for (const p of all) {
    const s = surahOfPage(m, meta, p);
    by.set(s, (by.get(s) ?? 0) + 1);
  }
  const top = [...by.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { count: all.length, surah: meta[top - 1] };
}

const ago = (ms: number) => {
  const d = Math.floor(ms / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
};
const inDays = (ms: number) => {
  const d = Math.ceil(ms / DAY);
  return d <= 0 ? 'now' : d === 1 ? 'tomorrow' : `in ${d} days`;
};

export async function openLamps(current: number, goToPage: (page: number) => void) {
  const [m, meta] = await Promise.all([loadMushaf(), loadMeta()]);
  // Rows: the pages of each juz (a page belongs to the juz it is listed under in the mushaf data).
  const rows: number[][] = Array.from({ length: 30 }, () => []);
  m.pages.forEach((pg, i) => rows[pg.juz - 1].push(i + 1));
  const cols = Math.max(...rows.map((r) => r.length));
  const where = new Map<number, [number, number]>();
  rows.forEach((r, y) => r.forEach((p, x) => where.set(p, [x, y])));

  let selected = Math.min(PAGE_COUNT, Math.max(1, current));
  let bloom: { page: number; t0: number } | null = null;

  const summary = h('p', { class: 'muted small lamps-summary' });
  const canvas = h('canvas', { class: 'lamps-grid', role: 'img', 'aria-label': 'Your memorised pages as lamps, one row per juz' });
  const ctx = canvas.getContext('2d')!;
  const panel = h('div', { class: 'lamp-panel', 'aria-live': 'polite' });
  const markForm = h('div', { class: 'lamp-mark' });
  const d = h('dialog', { class: 'sheet bottom lamps-sheet' },
    h('div', { class: 'sheet-head' }, h('h2', {}, 'My memorisation'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => d.close() }, '✕')),
    summary, canvas, panel, markForm,
    h('p', { class: 'muted small' }, `A lamp glows after you revise its page and slowly dims until it would like another visit (after ${INTERVALS.join(', ')} days as it settles). Kept on this device and synced when you are signed in.`));
  document.body.append(d);
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });

  // --- drawing ---
  const LABEL = 26;
  let cell = 14;
  let cssW = 0;
  function size() {
    cssW = canvas.getBoundingClientRect().width || 340;
    cell = Math.max(10, Math.floor((cssW - LABEL) / cols));
    const cssH = cell * 30 + 4;
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.height = `${cssH}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }
  const css = (v: string) => getComputedStyle(d).getPropertyValue(v).trim();

  function draw(now = Date.now()) {
    const all = lamps();
    const text = css('--text') || '#222', muted = css('--muted') || '#888', accent = css('--accent') || '#0a6e55';
    ctx.clearRect(0, 0, cssW, cell * 30 + 4);
    ctx.font = `600 ${Math.min(11, cell * 0.75)}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const r = cell * 0.32;
    rows.forEach((row, y) => {
      ctx.fillStyle = muted;
      ctx.fillText(String(y + 1), LABEL - 6, y * cell + cell / 2 + 2);
      row.forEach((p, x) => {
        const cx = LABEL + x * cell + cell / 2, cy = y * cell + cell / 2 + 2;
        const l = all[p];
        if (!l) {
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = muted;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          const g = glow(l, now);
          const light = g.light;
          let halo = 1.9;
          if (bloom?.page === p) {
            const k = Math.min(1, (now - bloom.t0) / 1200);
            halo += 1.6 * Math.sin(Math.PI * k);
          }
          // Warm gold when bright, a deeper amber as it dims.
          const hue = 30 + 14 * light;
          const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * halo);
          grd.addColorStop(0, `hsla(${hue}, 85%, ${45 + 25 * light}%, ${0.35 + 0.65 * light})`);
          grd.addColorStop(0.45, `hsla(${hue}, 85%, 55%, ${0.25 * light})`);
          grd.addColorStop(1, `hsla(${hue}, 85%, 55%, 0)`);
          ctx.fillStyle = grd;
          ctx.beginPath();
          ctx.arc(cx, cy, r * halo, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `hsla(${hue}, 80%, ${40 + 30 * light}%, 1)`;
          ctx.beginPath();
          ctx.arc(cx, cy, r * (g.due ? 0.55 : 0.8), 0, Math.PI * 2);
          ctx.fill();
          if (g.due) { // a ring: would like a visit
            ctx.strokeStyle = `hsla(${hue}, 60%, 45%, .9)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        if (p === current) {
          ctx.fillStyle = text;
          ctx.fillRect(cx - r * 0.7, cy + r + 1.5, r * 1.4, 1.2);
        }
        if (p === selected) {
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, cell * 0.47, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
    });
    if (bloom && now - bloom.t0 < 1200) requestAnimationFrame(() => draw());
    else bloom = null;
  }

  canvas.addEventListener('click', (e) => {
    const b = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - b.left - LABEL) / cell), y = Math.floor((e.clientY - b.top - 2) / cell);
    const row = rows[Math.max(0, Math.min(29, y))];
    if (x < 0) return;
    selected = row[Math.min(row.length - 1, x)];
    refresh();
  });

  // --- the selected page ---
  function refresh() {
    const all = lamps();
    const n = Object.keys(all).length;
    const due = Object.values(all).filter((l) => glow(l).due).length;
    summary.textContent = n
      ? `${n} ${n === 1 ? 'page' : 'pages'} memorised${due ? ` · ${due} would like a visit` : ' · all glowing'}`
      : 'Mark the pages you know by heart, and they become lamps.';
    const s = meta[surahOfPage(m, meta, selected) - 1];
    const l: Lamp | undefined = all[selected];
    const step = (k: number) => { selected = Math.min(PAGE_COUNT, Math.max(1, selected + k)); refresh(); };
    const info = l
      ? (() => {
        const g = glow(l);
        return `Revised ${ago(Date.now() - l.at)} · ${g.due ? 'would like a visit' : `next visit ${inDays(g.nextIn)}`}`;
      })()
      : 'Not marked as memorised';
    panel.replaceChildren(
      h('div', { class: 'lamp-head' },
        h('button', { class: 'icon-btn', 'aria-label': 'Previous page', onclick: () => step(-1) }, '‹'),
        h('div', {}, h('b', {}, `Page ${selected}`), h('span', { class: 'muted small' }, ` · ${s.en} · Juz ${m.pages[selected - 1].juz}`), h('div', { class: 'muted small' }, info)),
        h('button', { class: 'icon-btn', 'aria-label': 'Next page', onclick: () => step(1) }, '›')),
      h('div', { class: 'row' },
        h('button', { class: 'chip', onclick: () => { d.close(); goToPage(selected); } }, 'Open page'),
        l ? h('button', { class: 'primary brand-btn', onclick: () => { revise(selected, true); bloom = { page: selected, t0: Date.now() }; refresh(); } }, '✦ Revised today') : '',
        l ? h('button', { class: 'chip', title: 'Back to daily visits', onclick: () => { revise(selected, false); bloom = { page: selected, t0: Date.now() }; refresh(); } }, 'Needs work') : '',
        l ? h('button', { class: 'chip', onclick: () => { forget([selected]); refresh(); } }, 'Remove')
          : h('button', { class: 'primary brand-btn', onclick: () => { memorise([selected]); bloom = { page: selected, t0: Date.now() }; refresh(); } }, 'Mark memorised')));
    draw();
  }

  // --- marking several pages ---
  const kind = h('select', { class: 'search', 'aria-label': 'What to mark' },
    h('option', { value: 'surah' }, 'A surah'), h('option', { value: 'juz' }, 'A juz'), h('option', { value: 'range' }, 'Pages'));
  const surahSel = h('select', { class: 'search', 'aria-label': 'Surah' }, ...meta.map((s) => h('option', { value: String(s.n) }, `${s.n}. ${s.en}`)));
  surahSel.value = String(surahOfPage(m, meta, selected));
  const juzSel = h('select', { class: 'search', 'aria-label': 'Juz', hidden: true }, ...Array.from({ length: 30 }, (_, i) => h('option', { value: String(i + 1) }, `Juz ${i + 1}`)));
  juzSel.value = String(m.pages[selected - 1].juz);
  const pFrom = h('input', { class: 'search', type: 'number', min: 1, max: PAGE_COUNT, value: String(selected), 'aria-label': 'From page' });
  const pTo = h('input', { class: 'search', type: 'number', min: 1, max: PAGE_COUNT, value: String(selected), 'aria-label': 'To page' });
  const range = h('span', { class: 'lamp-range', hidden: true }, pFrom, '–', pTo);
  kind.onchange = () => {
    surahSel.hidden = kind.value !== 'surah';
    juzSel.hidden = kind.value !== 'juz';
    range.hidden = kind.value !== 'range';
  };
  const pagesOf = (): number[] => {
    if (kind.value === 'surah') {
      const s = Number(surahSel.value);
      const a = m.surahStartPage(s), b = s < 114 ? m.pageOf(s, meta[s - 1].ayahs) : PAGE_COUNT;
      return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    }
    if (kind.value === 'juz') return rows[Number(juzSel.value) - 1];
    const a = Math.max(1, Math.min(PAGE_COUNT, Number(pFrom.value) || 1)), b = Math.max(1, Math.min(PAGE_COUNT, Number(pTo.value) || a));
    return Array.from({ length: Math.abs(b - a) + 1 }, (_, i) => Math.min(a, b) + i);
  };
  markForm.append(
    h('p', { class: 'circle-sub' }, 'Mark several pages'),
    h('div', { class: 'row lamp-mark-row' }, kind, surahSel, juzSel, range),
    h('div', { class: 'row' },
      h('button', { class: 'chip', onclick: () => { const p = pagesOf(); memorise(p); toast(`${p.length} ${p.length === 1 ? 'page' : 'pages'} marked as memorised`); refresh(); } }, 'Mark memorised'),
      h('button', { class: 'chip', onclick: () => {
        const p = pagesOf().filter((x) => lamps()[x]);
        if (!p.length) return toast('None of these pages are marked');
        if (!confirm(`Remove ${p.length} ${p.length === 1 ? 'lamp' : 'lamps'}?`)) return;
        forget(p);
        refresh();
      } }, 'Remove')));

  const ro = new ResizeObserver(() => size());
  const onChange = () => refresh(); // another device's lamps arrived
  window.addEventListener('lamps-changed', onChange);
  d.addEventListener('close', () => { ro.disconnect(); window.removeEventListener('lamps-changed', onChange); d.remove(); });
  d.showModal();
  ro.observe(canvas);
  refresh();
}
