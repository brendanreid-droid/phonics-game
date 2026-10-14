import { localDateString } from '@soundlings/engine';

// Defined in the engine so the sync layer and the quest runner cannot disagree about it.
export { localDateString };

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

/**
 * How many days in a row the child has played, counting back from their most
 * recent day, or 0 if that run has already been broken.
 *
 * "Broken" means a whole day was missed: a run ending yesterday is alive,
 * because today is not over and has not been missed. This is the number behind
 * "3 days in a row!". It is the *current* run, not the best one (that is
 * `longestRun` in trophies.ts), and it returns 0 rather than a smaller number
 * once the run is over: the island has nothing to say then.
 */
export function currentRun(playedDates: readonly string[], today: string): number {
  const days = [...new Set(playedDates)].sort();
  if (days.length === 0) return 0;

  const last = days[days.length - 1];
  if (streakFrom(last, today) === 0) return 0;

  let run = 1;
  for (let i = days.length - 1; i > 0 && daysBetween(days[i - 1], days[i]) === 1; i -= 1) run += 1;
  return run;
}

/** Whole days between two YYYY-MM-DD strings, via UTC midnights. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
