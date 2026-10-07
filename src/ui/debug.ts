// Settings / debug panel: shows the device capability check and the chosen export path.
import { capabilities } from '../engine/capabilities';
import { h } from './dom';

export function openDebugPanel() {
  const table = h('table', { class: 'caps' }, h('tr', {}, h('td', {}, 'Checking…')));
  const dialog = h('dialog', { class: 'sheet' },
    h('div', { class: 'sheet-head' },
      h('h2', {}, 'Device check'),
      h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => dialog.close() }, '✕')),
    h('p', { class: 'muted' }, 'Can this browser export the video on-device?'),
    table,
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
