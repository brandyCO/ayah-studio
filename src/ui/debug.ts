// Settings / debug panel: shows the device capability check and the chosen export path.
import { feature, setFeature } from '../features';
import { capabilities } from '../engine/capabilities';
import { h } from './dom';
import { liteAuto, liteSetting, setLiteSetting, type LiteSetting } from '../lite';
import { perfSummary } from '../perf';
import { errorReportsOn } from '../errors';

export function openDebugPanel() {
  const table = h('table', { class: 'caps' }, h('tr', {}, h('td', {}, 'Checking…')));
  const dialog = h('dialog', { class: 'sheet' },
    h('div', { class: 'sheet-head' },
      h('h2', {}, 'Device check'),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => dialog.close() }, '✕')),
    h('p', { class: 'muted' }, 'Can this browser export the video on-device?'),
    table,
    h('label', { class: 'sub-row flag-row' },
      h('input', { type: 'checkbox', checked: feature('tafsir'), onchange: (e: Event) => setFeature('tafsir', (e.target as HTMLInputElement).checked) }),
      h('span', {}, 'Tafsir beside the translation (preview: licence not confirmed yet)')),
    liteRow(),
    perfBlock(),
    h('p', { class: 'muted small' }, errorReportsOn() ? 'Error reports: on (Sentry; no account or personal data)' : 'Error reports: off'),
    h('p', { class: 'muted small' }, `User agent: ${navigator.userAgent}`),
  );
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  capabilities().then(({ rows }) => {
    table.replaceChildren(...rows.map(([label, v]) => {
      const ok = v === true || v === 'hardware' || v === 'software';
      const text = typeof v === 'string' ? (ok ? `Yes · ${v}` : v) : v ? 'Yes' : 'No';
      return h('tr', {}, h('td', {}, label), h('td', { class: typeof v === 'string' && !ok ? '' : ok ? 'ok' : 'no' }, text));
    }));
  });
}

/** Old-phone mode (src/lite.ts): Auto (what this device gets, and why) / On / Off. */
function liteRow() {
  const auto = liteAuto();
  const row = h('div', { class: 'sub-row flag-row' });
  const paint = () => {
    const cur = liteSetting();
    row.replaceChildren(h('span', {}, 'Old-phone mode'),
      ...(['auto', 'on', 'off'] as LiteSetting[]).map((v) => h('button', {
        class: `chip${cur === v ? ' on' : ''}`,
        onclick: () => { setLiteSetting(v); paint(); },
      }, v === 'auto' ? `Auto (${auto.on ? 'on' : 'off'}: ${auto.why})` : v === 'on' ? 'On' : 'Off')));
  };
  paint();
  return row;
}

/** Timings measured on this device (src/perf.ts): newest and median of each moment. */
function perfBlock() {
  const rows = perfSummary();
  if (!rows.length) return h('p', { class: 'muted small' }, 'Timings: none yet (open the mushaf or the studio first).');
  const s = (ms: number) => (ms >= 10000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(2)} s`);
  return h('div', {},
    h('h3', { class: 'small' }, 'Timings on this device'),
    h('table', { class: 'caps' }, ...rows.map((r) =>
      h('tr', {}, h('td', {}, r.name), h('td', {}, `${s(r.last)}${r.n > 1 ? ` · median ${s(r.median)} (${r.n})` : ''}`)))));
}
