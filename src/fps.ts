// Smoothness of the reward moments on this device (owner request 2026-11-11): while a moment plays, every frame's
// time is noted; when it ends, its average frames per second, the slowest frame and the share of frames slower
// than 1/40 s are kept (the newest 40, localStorage `fpsLog`) and shown in Device check.
export interface FpsEntry { name: string; fps: number; worst: number; jank: number; at: number }
const FPS_KEY = 'fpsLog';

export function fpsLog(): FpsEntry[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(FPS_KEY) ?? '[]');
    return Array.isArray(v) ? (v as FpsEntry[]).filter((e) => e && typeof e.name === 'string' && typeof e.fps === 'number') : [];
  } catch { return []; }
}

/** Starts counting frames for a moment; call the returned function when it ends. */
export function fpsStart(name: string): () => void {
  if (typeof requestAnimationFrame === 'undefined') return () => {};
  const gaps: number[] = [];
  let last = 0, raf = 0, done = false;
  const step = (t: number) => {
    if (last && !document.hidden) gaps.push(t - last);
    last = t;
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    if (gaps.length < 20) return;
    // The first frames (the moment being built) are counted too: they are part of what the user sees.
    const total = gaps.reduce((a, b) => a + b, 0);
    const e: FpsEntry = {
      name, at: Date.now(),
      fps: Math.round((gaps.length / total) * 1000),
      worst: Math.round(Math.max(...gaps)),
      jank: Math.round((gaps.filter((g) => g > 25).length / gaps.length) * 100),
    };
    try { localStorage.setItem(FPS_KEY, JSON.stringify([...fpsLog(), e].slice(-40))); } catch { /* storage blocked */ }
  };
}

export function clearFpsLog() { try { localStorage.removeItem(FPS_KEY); } catch { /* ignore */ } }
