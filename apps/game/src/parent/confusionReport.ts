import { graphemesForLevel } from '@soundlings/curriculum';
import type { ConfusionMap } from '@soundlings/engine';
import type { SoundRow } from './soundReport';

export interface ConfusionRow {
  /** The sound the child was asked about. */
  target: string;
  /** What they picked instead. */
  mistakenFor: string;
  /** How many times, both directions combined if they mix the pair up both ways. */
  times: number;
  /** One line a parent can read aloud to themselves. */
  description: string;
}

/**
 * Fewer than this is a slip, not a pattern: one wrong tap is a wobble, and
 * reporting it would have a parent drilling something their child does not
 * actually struggle with. Two is the least that can be called a repeat.
 */
export const MIN_TIMES_TO_REPORT = 2;

interface Directed {
  target: string;
  mistakenFor: string;
  times: number;
}

/** A count we can trust: storage outlives the build that wrote it. */
function usableCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * The parent's second question: what are they mixing up?
 *
 * Only pairs of SOUNDS are reported. The confusion map also logs word-for-word
 * mix-ups from Picture Match and Word Pick (`sit>sat`); those are the vowel in
 * disguise, which the vowel's own row already shows, and calling them a pair of
 * sounds would be wrong. They are dropped because their target is not one of
 * the level's sounds.
 *
 * The map only ever counts up, so a mix-up from the first week would otherwise
 * be reported for ever. When `sounds` (the rows from `soundReport`) is given, a
 * pair whose target is now secure in both directions is left out: the child has
 * moved on, and a parent should not drill what is no longer a problem.
 *
 * A pair mixed up both ways is one row, led by whichever way happens more often.
 * Most frequent first; ties fall back to teaching order so the list is stable.
 */
export function confusionReport(
  confusions: ConfusionMap,
  level: number,
  sounds?: readonly SoundRow[],
): ConfusionRow[] {
  const order = new Map(graphemesForLevel(level).map((g, index) => [g.id, index]));
  const secure = new Set((sounds ?? []).filter((row) => row.state === 'secure').map((row) => row.grapheme.id));

  const directed: Directed[] = [];
  for (const [key, times] of Object.entries(confusions)) {
    const parts = key.split('>');
    if (parts.length !== 2 || parts[0] === '' || parts[1] === '' || !usableCount(times)) continue;
    const [target, mistakenFor] = parts;
    if (target === mistakenFor || !order.has(target) || secure.has(target)) continue;
    directed.push({ target, mistakenFor, times });
  }

  // One row per unordered pair.
  const byPair = new Map<string, Directed[]>();
  for (const d of directed) {
    const pair = [d.target, d.mistakenFor].sort().join('|');
    byPair.set(pair, [...(byPair.get(pair) ?? []), d]);
  }

  const rows: ConfusionRow[] = [];
  for (const group of byPair.values()) {
    const times = group.reduce((sum, d) => sum + d.times, 0);
    if (times < MIN_TIMES_TO_REPORT) continue;
    const lead = [...group].sort(
      (a, b) => b.times - a.times || (order.get(a.target) ?? Infinity) - (order.get(b.target) ?? Infinity),
    )[0];
    rows.push({
      target: lead.target,
      mistakenFor: lead.mistakenFor,
      times,
      description: `Sometimes mixes up ${lead.target} and ${lead.mistakenFor}`,
    });
  }

  return rows.sort(
    (a, b) =>
      b.times - a.times ||
      (order.get(a.target) ?? Infinity) - (order.get(b.target) ?? Infinity) ||
      a.mistakenFor.localeCompare(b.mistakenFor),
  );
}
