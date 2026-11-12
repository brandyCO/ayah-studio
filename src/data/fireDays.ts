// The days the character goes up in flames (powerUp.ts), for the streak and for friend streaks (owner 2026-11-12:
// "make it every single week", counted from each person's own first day, not tied to a weekday): day 3, every 7th day
// (7, 14, 21 …), 30, 50, 100, 365 and every 100th day after that. The daily streak moment plays on every other day.
export const isFireDay = (n: number): boolean =>
  n === 3 || (n > 0 && n % 7 === 0) || n === 30 || n === 50 || n === 100 || n === 365 || (n > 365 && n % 100 === 0);
/** A friend streak plays from its very first day too. */
export const isFriendFireDay = (n: number): boolean => n === 1 || isFireDay(n);
