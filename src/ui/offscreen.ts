// Smoothness: a looping picture (flame, badge shine) only animates while it is on screen. Off screen its
// animations pause (`.anim-off`), so a long page scrolls without drawing what nobody sees. One shared observer.
let io: IntersectionObserver | null = null;
export function restOffscreen(el: Element) {
  if (typeof IntersectionObserver === 'undefined') return;
  io ??= new IntersectionObserver((es) => {
    for (const e of es) {
      e.target.classList.toggle('anim-off', !e.isIntersecting);
      if (!e.target.isConnected) io!.unobserve(e.target);
    }
  });
  io.observe(el);
}
