// The user's character on the Learn path (owner idea 2026-11-10): it stands beside the step to do now and
// waves when it comes into view; when a tree has just grown it sits under it with its mushaf and cheers;
// with every step done it sits under the last tree. A tap makes it hop. Only with a character (none → the
// path stays as it was). Re-placed whenever the path repaints. Never on or near the Quran text.
import { actor, myFigureCode, type Actor } from './actor';
import { encode, normalize, parse } from './figure';
import { reduced } from './juice';
import { sfx } from './sfx';

export function pathBuddy(list: HTMLElement) {
  const base = parse(myFigureCode());
  if (!base) return;
  let cur: { el: Element; a: Actor } | null = null;
  const look = (sit: boolean) => encode(normalize({ ...base, pose: sit ? 1 : base.pose, hold: sit && base.hold !== 3 ? 2 : base.hold }));

  const place = () => {
    const grew = list.querySelector('.lp-tree.grew');
    const step = list.querySelector('.lp-step.is-current .lp-nodewrap');
    const trees = list.querySelectorAll('.lp-tree');
    const at = grew ?? step ?? trees[trees.length - 1] ?? null;
    if (!at) return;
    if (cur && cur.el === at && at.contains(cur.a.el)) return;
    list.querySelectorAll('.lp-buddy').forEach((e) => e.remove());
    const underTree = at.classList.contains('lp-tree');
    const a = actor(`lp-buddy ${underTree ? 'tree' : 'step'}`, look(underTree));
    if (!a) return;
    // Beside a step it stands on the side away from the path's sway, so it never covers the next node.
    const x = parseFloat((at.closest('.lp-step') as HTMLElement | null)?.style.getPropertyValue('--x') ?? '0') || 0;
    a.el.classList.add(x > 0 ? 'left' : 'right');
    a.el.addEventListener('click', (e) => { e.stopPropagation(); a.hop(0.6); sfx.tick(); });
    at.append(a.el);
    cur = { el: at, a };
    if (reduced()) return;
    // Greet once it is on screen.
    const io = new IntersectionObserver((es) => {
      if (!es.some((x) => x.isIntersecting)) return;
      io.disconnect();
      setTimeout(() => (grew ? a.cheer() : underTree ? a.nod() : a.wave()), grew ? 900 : 400);
    }, { threshold: 0.6 });
    io.observe(a.el);
  };

  place();
  new MutationObserver(() => place()).observe(list, { childList: true });
}
