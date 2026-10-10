// Settings / debug panel: shows the device capability check and the chosen export path.
import { feature, setFeature } from '../features';
import { capabilities } from '../engine/capabilities';
import { h } from './dom';
import { hasWebGL, reducedMotion, saveQuality, savedQuality } from '../light/support';

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
    lightRow(),
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

/** Light scenes (docs/light.md): the quality step the fps watchdog settled on, with a reset. */
function lightRow() {
  const why = !hasWebGL() ? 'no WebGL → flat 2D' : reducedMotion() ? 'reduced motion → flat 2D' : `3D · ${savedQuality()}`;
  const label = h('span', {}, `Light scenes: ${why}`);
  return h('div', { class: 'sub-row flag-row' }, label,
    h('button', { class: 'chip', onclick: () => { saveQuality(null); label.textContent = `Light scenes: ${hasWebGL() && !reducedMotion() ? '3D · medium' : why}`; } }, 'Reset'));
}
