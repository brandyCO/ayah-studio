// Time spent learning (owner request 2026-11-12, "the time spent on learning or memorising in the celebration"):
// a Learn screen keeps a clock that runs only while the page is in view. `lap()` adds what ran since the last lap to
// today's learning time (journey `lm`, every device added up) and returns it; `stop()` adds the rest.
import { addLearnTime, todayRec } from './journey';

export interface LearnClock { lap(): number; stop(): void }

export function learnClock(): LearnClock {
  let acc = 0;
  let since = document.visibilityState === 'visible' ? performance.now() : 0;
  const onVis = () => {
    if (document.visibilityState === 'visible') { if (!since) since = performance.now(); }
    else if (since) { acc += performance.now() - since; since = 0; }
  };
  document.addEventListener('visibilitychange', onVis);
  const take = () => {
    if (since) { const n = performance.now(); acc += n - since; since = n; }
    const secs = acc / 1000;
    acc = 0;
    if (secs >= 1) addLearnTime(secs);
    return secs;
  };
  return {
    lap: take,
    stop() { take(); since = 0; document.removeEventListener('visibilitychange', onVis); },
  };
}

/** What a celebration shows: this lesson's time and all of today's. */
export const learnToday = () => todayRec().lm ?? 0;
export const timeFor = (lesson: number) => ({ lesson, today: learnToday() });
