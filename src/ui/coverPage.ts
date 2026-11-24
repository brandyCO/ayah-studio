// A full-page sheet (the shop, a profile, the onboarding) covers the whole screen, yet the page behind it kept being
// styled and drawn every frame: Me's flame, embers and sky, Ranks' podium beams… (Marwan 2026-11-24, Tecno: the shop
// "fighting for the phone"). Once the sheet has slid in, everything behind it is skipped (`content-visibility:
// hidden`: not styled, laid out or drawn, its CSS animations stop, its size and scroll place kept) until it closes.
let count = 0, covered: Element[] = [], timer = 0;
const keepers = new Set<Element>();

/** Covers the page behind `sheet` after `delay` ms (once it has slid in); call the returned function as it closes. */
export function coverPage(sheet: Element, delay = 380): () => void {
  count++;
  keepers.add(sheet);
  clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (count <= 0) return;
    for (const c of document.body.children) {
      if (keepers.has(c) || c.classList.contains('page-off') || c.tagName === 'DIALOG' || c.tagName === 'SCRIPT') continue;
      c.classList.add('page-off');
      covered.push(c);
    }
  }, delay);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    count = Math.max(0, count - 1);
    keepers.delete(sheet);
    if (count) return;
    clearTimeout(timer);
    for (const c of covered) c.classList.remove('page-off');
    covered = [];
  };
}

/** For a full-page dialog just opened: covers the page behind it until it closes. */
export function coverWhileOpen(d: HTMLDialogElement, delay?: number): void {
  const off = coverPage(d, delay);
  d.addEventListener('close', off, { once: true });
}
