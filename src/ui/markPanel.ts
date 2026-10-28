// Layout → Watermark: the small Ayah Studio mark on/off, the user's own mark (text or logo) with its
// place, size and opacity, and one button that removes every watermark. The user's mark is kept on
// this device for their next reels.
import { cleanMarkText, defaultMark, MARK_POS, MARK_SIZE, MARK_TEXT_MAX, validMark, type Mark, type MarkKind, type MarkPos } from '../engine/mark';
import type { Project } from '../engine/project';
import { addLogo, listLogos, loadLogo, removeLogo } from '../data/logos';
import { t as ui } from '../i18n';
import { h, toast } from './dom';

const PREF = 'myMark';

/** The mark saved on this device (for new reels), or none. */
export function savedMark(): Mark | undefined {
  try { return validMark(JSON.parse(localStorage.getItem(PREF) ?? 'null')); } catch { return undefined; }
}
function saveMark(m: Mark) {
  try { localStorage.setItem(PREF, JSON.stringify(m)); } catch { /* private window */ }
}

export interface MarkPanelOptions {
  project: Project;
  busy: () => boolean; // exporting
  /** After a change: relayout (the mark's strip may have changed) and record it. `live`: while dragging a slider. */
  changed: (live?: boolean) => void;
}

export function markPanel(o: MarkPanelOptions): Node[] {
  const p = o.project;
  const m = (p.mark ??= savedMark() ?? defaultMark());
  const set = (fn: (m: Mark) => void, live = false) => {
    if (o.busy()) return;
    fn(m);
    saveMark(m);
    o.changed(live);
  };
  const chips = <T extends string>(items: [T, string][], get: () => T, pick: (v: T) => void) =>
    h('div', { class: 'chips' }, ...items.map(([v, label]) =>
      h('button', { class: `chip${get() === v ? ' on' : ''}`, onclick: () => { if (get() !== v) pick(v); } }, label)));
  const row = (label: string, ...kids: Node[]) => h('div', { class: 'sub-row' }, h('span', { class: 'muted small' }, label), ...kids);
  const note = (text: string) => h('p', { class: 'muted small' }, text);
  const slider = (min: number, max: number, step: number, get: () => number, put: (v: number) => void, label: string, fmt: (v: number) => string) => {
    const out = h('span', { class: 'clip-time' }, fmt(get()));
    const input = h('input', { class: 'clip-slider', type: 'range', min: String(min), max: String(max), step: String(step), value: String(get()), 'aria-label': label });
    const apply = (live: boolean) => { const v = Number(input.value); out.textContent = fmt(v); set(() => put(v), live); };
    input.addEventListener('input', () => apply(true));
    input.addEventListener('change', () => apply(false));
    return [row(label, out), input];
  };

  const nodes: Node[] = [
    row(ui('mk.app'), chips<'off' | 'on'>([['off', ui('ed.off')], ['on', ui('qr.mark-small')]], () => (p.watermark ? 'on' : 'off'),
      (v) => { if (!o.busy()) { p.watermark = v === 'on'; o.changed(); } })),
    row(ui('mk.own'), chips<MarkKind>([['off', ui('mk.none')], ['text', ui('mk.text')], ['logo', ui('mk.logo')]], () => m.kind,
      (v) => set((x) => { x.kind = v; if (v === 'logo' && !x.logo) x.logo = listLogos()[0]?.id; }))),
  ];

  if (m.kind === 'text') {
    const input = h('input', { class: 'search', type: 'text', maxlength: String(MARK_TEXT_MAX), placeholder: ui('mk.text-ph'), value: m.text, 'aria-label': ui('mk.text') });
    input.addEventListener('change', () => {
      const v = cleanMarkText(input.value);
      input.value = v;
      if (v !== m.text) set((x) => { x.text = v; });
    });
    nodes.push(input);
  }

  if (m.kind === 'logo') {
    const file = h('input', { type: 'file', accept: 'image/png,image/webp,image/svg+xml,image/jpeg', hidden: true });
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      file.value = '';
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) return toast(ui('mk.too-big'));
      addLogo(f).then((logo) => set((x) => { x.logo = logo.id; }), () => toast(ui('mk.unreadable')));
    });
    const logos = listLogos();
    for (const l of logos) void loadLogo(l.id);
    nodes.push(h('div', { class: 'mark-logos' },
      ...logos.map((l) => h('div', { class: `mark-logo${m.logo === l.id ? ' on' : ''}` },
        h('button', { class: 'mark-logo-pick', 'aria-label': ui('mk.use-logo'), onclick: () => set((x) => { x.logo = l.id; }) }, h('img', { src: l.url, alt: '' })),
        h('button', { class: 'mark-logo-x', 'aria-label': ui('mk.remove-logo'), onclick: () => {
          removeLogo(l.id);
          set((x) => { if (x.logo === l.id) x.logo = listLogos()[0]?.id; });
        } }, '✕'))),
      h('button', { class: 'chip mark-upload', onclick: () => file.click() }, ui('mk.upload')), file));
    nodes.push(note(ui('mk.logo-note')));
  }

  if (m.kind !== 'off') {
    const names: Record<MarkPos, string> = { tl: ui('mk.tl'), tr: ui('mk.tr'), bl: ui('mk.bl'), bc: ui('mk.bc'), br: ui('mk.br') };
    nodes.push(
      row(ui('ed.place'), chips<MarkPos>(MARK_POS.map((x) => [x, names[x]]), () => m.pos, (v) => set((x) => { x.pos = v; }))),
      ...slider(MARK_SIZE[0] * 100, MARK_SIZE[1] * 100, 5, () => Math.round(m.size * 100), (v) => { m.size = v / 100; }, ui('ed.size'), (v) => `${Math.round(v)} %`),
      ...slider(20, 100, 5, () => Math.round(m.opacity * 100), (v) => { m.opacity = v / 100; }, ui('mk.opacity'), (v) => `${Math.round(v)} %`),
    );
  }

  nodes.push(
    h('button', { class: 'chip mark-clear', disabled: !p.watermark && m.kind === 'off', onclick: () => {
      if (o.busy()) return;
      p.watermark = false;
      set((x) => { x.kind = 'off'; });
      toast(ui('mk.cleared'));
    } }, ui('mk.remove-all')),
    note(ui('mk.note')),
  );
  return nodes;
}
