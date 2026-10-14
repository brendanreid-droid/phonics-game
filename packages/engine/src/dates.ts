/**
 * Local calendar date as YYYY-MM-DD.
 *
 * Local, not UTC, and a date string rather than a timestamp. A streak is about
 * days as a child experiences them: playing at 11pm and again the next morning
 * is two days running, and in several timezones a UTC-based calculation would
 * disagree. Storing only the local date also means a timezone change cannot
 * retroactively rewrite history.
 *
 * In the engine, rather than the app, because the sync layer derives played
 * dates from attempt timestamps and must agree with the quest runner exactly.
 */
export function localDateString(at: number): string {
  const d = new Date(at);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}
