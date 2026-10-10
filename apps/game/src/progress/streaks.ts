/**
 * Local calendar date as YYYY-MM-DD.
 *
 * Local, not UTC, and a date string rather than a timestamp. A streak is about
 * days as a child experiences them: playing at 11pm and again the next morning
 * is two days running, and in several timezones a UTC-based calculation would
 * disagree. Storing only the local date also means a timezone change cannot
 * retroactively rewrite history.
 */
export function localDateString(at: number): string {
  const d = new Date(at);
  const month = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * Whether a run of consecutive days is still alive, as 1 or 0.
 *
 * This answers "does today continue the run?", not "how long is it?" — the
 * length itself is counted in trophies.ts from the quest history. A future
 * stored date (a clock change, a flight) counts as alive: the benefit of the
 * doubt goes to the child.
 */
export function streakFrom(lastPlayedOn: string | null, today: string): 0 | 1 {
  if (lastPlayedOn === null) return 0;
  if (lastPlayedOn >= today) return 1;
  return daysBetween(lastPlayedOn, today) <= 1 ? 1 : 0;
}

/** Whole days between two YYYY-MM-DD strings, via UTC midnights. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
