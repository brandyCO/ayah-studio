// Old-phone mode: on a device with little memory or few CPU cores (or with Data Saver on), the
// app drops its heaviest decorations — the paper grain and sheet shadows, glass blur behind bars
// and sheets, the launch sweep — and the studio previews at a lower resolution from the start.
// Exported videos are never affected. Device check → "Old-phone mode": Auto / On / Off.

export type LiteSetting = 'auto' | 'on' | 'off';
const KEY = 'liteMode';

export function liteSetting(): LiteSetting {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'on' || v === 'off') return v;
  } catch { /* storage blocked */ }
  return 'auto';
}

/** What Auto decides for this device, and why (shown in Device check). */
export function liteAuto(): { on: boolean; why: string } {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const mem = nav.deviceMemory, cores = navigator.hardwareConcurrency;
  if (nav.connection?.saveData) return { on: true, why: 'Data Saver is on' };
  if (mem && mem <= 3) return { on: true, why: `${mem} GB memory` };
  if (cores && cores <= 4) return { on: true, why: `${cores} CPU cores` };
  return { on: false, why: `${mem ? `${mem} GB memory, ` : ''}${cores ?? '?'} CPU cores` };
}

export const liteMode = (): boolean => {
  const s = liteSetting();
  return s === 'on' || (s === 'auto' && liteAuto().on);
};

export function setLiteSetting(s: LiteSetting) {
  try {
    if (s === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, s);
  } catch { /* storage blocked */ }
  applyLite();
}

/** `html.lite` switches the heavy decorations off in the styles. */
export function applyLite() {
  document.documentElement.classList.toggle('lite', liteMode());
}
