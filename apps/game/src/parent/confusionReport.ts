import { graphemesForLevel } from '@soundlings/curriculum';
import type { Attempt } from '@soundlings/engine';
import { isPrimary, recentSittings } from './needsAHand';

export interface ConfusionRow {
  /** The sound the child was asked about. */
  target: string;
  /** What they picked instead. */
  mistakenFor: string;
  /** How many times in the recent sittings, both directions combined if they mix the pair up both ways. */
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

/**
 * The wrong taps in the recent sittings, counted per `${target}>${chosen}`.
 *
 * Read from the attempt log (`chosen` on a wrong primary answer), limited to the
 * same last few sittings `needsAHand` judges.
 */
function recentSlips(attempts: readonly Attempt[], level: number): Record<string, number> {
  const recent = new Set(recentSittings(attempts, level));
  const counts: Record<string, number> = {};
  for (const attempt of attempts) {
    if (!recent.has(attempt.sessionId) || !isPrimary(attempt)) continue;
    if (attempt.correct || attempt.scaffolded || typeof attempt.chosen !== 'string' || attempt.chosen === '') continue;
    const key = `${attempt.targetId}>${attempt.chosen}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * The parent's second question: what are they mixing up?
 *
 * Drawn from the attempt log, over the last few sittings, and NOT from the
 * running `ConfusionMap`. The two answer different questions and must not be
 * "unified". The map counts for the child's whole life and has no dates, which is
 * right for the distractor picker: a sound a child has ever confused is worth
 * contrasting again. But it is wrong for a parent, who is asking what is going on
 * this week: a mix-up from the first month would be reported for ever, even for
 * a sound the child has never quite secured, which is the very sound the parent
 * is reading about. So the map stays as it is for the picker, and this reads
 * `chosen` and the sitting from the log.
 *
 * (The log holds a little less than the map: a second wrong tap on the same
 * question shows the answer and is not logged as an attempt. That errs towards
 * reporting less, which is the safe side for a list a parent will act on.)
 *
 * Only pairs of SOUNDS are reported. The confusion map also logs word-for-word
 * mix-ups from Picture Match and Word Pick (`sit>sat`); those are the vowel in
 * disguise, which the vowel's own row already shows, and calling them a pair of
 * sounds would be wrong. They are dropped because their target is not one of
 * the level's sounds.
 *
 * A pair mixed up both ways is one row, led by whichever way happens more often.
 * Most frequent first; ties fall back to teaching order so the list is stable.
 */
export function confusionReport(attempts: readonly Attempt[], level: number): ConfusionRow[] {
  const confusions = recentSlips(attempts, level);
  const order = new Map(graphemesForLevel(level).map((g, index) => [g.id, index]));

  const directed: Directed[] = [];
  for (const [key, times] of Object.entries(confusions)) {
    const parts = key.split('>');
    if (parts.length !== 2 || parts[0] === '' || parts[1] === '') continue;
    const [target, mistakenFor] = parts;
    if (target === mistakenFor || !order.has(target)) continue;
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
