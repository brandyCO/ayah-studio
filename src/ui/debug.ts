// Settings / debug panel: shows the device capability check and the chosen export path.
import { feature, setFeature } from '../features';
import { capabilities } from '../engine/capabilities';
import { h } from './dom';
import { liteAuto, liteSetting, setLiteSetting, type LiteSetting } from '../lite';
import { perfSummary } from '../perf';
import { clearFpsLog, fpsLog } from '../fps';
import { errorReportsOn } from '../errors';
import { dvt } from '../i18n/device';
import { t } from '../i18n';

const LABELS: Record<string, 'dv.webcodecs' | 'dv.aac' | 'dv.opus' | 'dv.path'> = {
  'WebCodecs available': 'dv.webcodecs', 'AAC audio (native)': 'dv.aac', 'Opus audio': 'dv.opus', 'Export path': 'dv.path',
};

export function openDebugPanel() {
  const table = h('table', { class: 'caps' }, h('tr', {}, h('td', {}, dvt('dv.checking'))));
  const dialog = h('dialog', { class: 'sheet' },
    h('div', { class: 'sheet-head' },
      h('h2', {}, dvt('dv.title')),
      h('button', { class: 'icon-btn', 'aria-label': t('common.close'), onclick: () => dialog.close() }, '✕')),
    h('p', { class: 'muted' }, dvt('dv.intro')),
    table,
    h('label', { class: 'sub-row flag-row' },
      h('input', { type: 'checkbox', checked: feature('tafsir'), onchange: (e: Event) => setFeature('tafsir', (e.target as HTMLInputElement).checked) }),
      h('span', {}, dvt('dv.tafsir'))),
    liteRow(),
    perfBlock(),
    fpsBlock(),
    h('p', { class: 'muted small' }, dvt(errorReportsOn() ? 'dv.errorsOn' : 'dv.errorsOff')),
    h('p', { class: 'muted small' }, dvt('dv.ua', { ua: navigator.userAgent })),
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  capabilities(true).then(({ rows }) => {
    table.replaceChildren(...rows.map(([label, v]) => {
      const ok = v === true || v === 'hardware' || v === 'software';
      const text = typeof v === 'string' ? (ok ? `${dvt('dv.yes')} · ${v}` : v.startsWith('none') ? dvt('dv.noPath') : v) : dvt(v ? 'dv.yes' : 'dv.no');
      return h('tr', {}, h('td', {}, LABELS[label] ? dvt(LABELS[label]) : label), h('td', { class: typeof v === 'string' && !ok ? '' : ok ? 'ok' : 'no' }, text));
    }));
  });
}

/** Old-phone mode (src/lite.ts): Auto (what this device gets, and why) / On / Off. */
function liteRow() {
  const auto = liteAuto();
  const why = auto.saveData ? dvt('dv.saveData') : [auto.mem ? dvt('dv.mem', { n: auto.mem }) : '', auto.cores ? dvt('dv.cores', { n: auto.cores }) : ''].filter(Boolean).join(', ');
  const row = h('div', { class: 'sub-row flag-row' });
  const paint = () => {
    const cur = liteSetting();
    row.replaceChildren(h('span', {}, dvt('dv.lite')),
      ...(['auto', 'on', 'off'] as LiteSetting[]).map((v) => h('button', {
        class: `chip${cur === v ? ' on' : ''}`,
        onclick: () => { setLiteSetting(v); paint(); },
      }, v === 'auto' ? dvt(auto.on ? 'dv.autoOn' : 'dv.autoOff', { why }) : dvt(v === 'on' ? 'dv.on' : 'dv.off'))));
  };
  paint();
  return row;
}

/** Timings measured on this device (src/perf.ts): newest and median of each moment. */
function perfBlock() {
  const rows = perfSummary();
  if (!rows.length) return h('p', { class: 'muted small' }, dvt('dv.timingsNone'));
  const s = (ms: number) => (ms >= 10000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(2)} s`);
  return h('div', {},
    h('h3', { class: 'small' }, dvt('dv.timings')),
    h('table', { class: 'caps' }, ...rows.map((r) =>
      h('tr', {}, h('td', {}, r.name), h('td', {}, `${s(r.last)}${r.n > 1 ? ` · ${dvt('dv.median', { t: s(r.median), n: r.n })}` : ''}`)))));
}

/** Reward moments recorded on this device: frames per second, slowest frame, share of slow frames. */
function fpsBlock(): HTMLElement {
  const log = fpsLog();
  if (!log.length) return h('p', { class: 'muted small' }, dvt('dv.fpsNone'));
  const by = new Map<string, typeof log>();
  for (const e of log) by.set(e.name, [...(by.get(e.name) ?? []), e]);
  const box: HTMLElement = h('div', {},
    h('h3', { class: 'small' }, dvt('dv.fps')),
    h('table', { class: 'caps' }, ...[...by].map(([name, v]) => {
      const e = v[v.length - 1];
      const med = [...v].sort((a, b) => a.fps - b.fps)[Math.floor(v.length / 2)].fps;
      return h('tr', {}, h('td', {}, name), h('td', {}, `${dvt('dv.fpsRow', { fps: e.fps, ms: e.worst, p: e.jank })}${v.length > 1 ? ` · ${dvt('dv.fpsMedian', { fps: med, n: v.length })}` : ''}`));
    })),
    h('button', { class: 'chip', onclick: () => { clearFpsLog(); box.replaceWith(fpsBlock()); } }, dvt('dv.clear')));
  return box;
}
