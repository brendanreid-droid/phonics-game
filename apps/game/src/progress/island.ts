import { levelProgress } from '@soundlings/engine';
import type { MasteryMap } from '@soundlings/engine';
import { collectionFor } from './collection';
import type { CollectionEntry } from './collection';
import { currentRun, streakFrom } from './streaks';

export interface IslandView {
  /** Every creature in teaching order; the unhatched are eggs, not hidden. */
  collection: CollectionEntry[];
  hatchedCount: number;
  totalCount: number;
  playLabel: 'Play' | 'Keep going';
  /** Null whenever there is nothing to celebrate. Never a zero, never a broken run. */
  streakLine: string | null;
}

/**
 * What the island home shows, decided away from the screen.
 *
 * The creature collection *is* the progress bar. It reads the live
 * calculation, because the island answers "what can they do right now?"; the
 * level-complete badge, which never un-earns, is the level select's business.
 *
 * The streak line appears only for a run that is alive and at least two days
 * long. The island is not where a child is told what they have failed to do,
 * so a broken run is not a smaller number or a sad message: it is silence.
 */
export function islandFor(args: {
  level: number;
  mastery: MasteryMap;
  hasQuestInProgress: boolean;
  lastPlayedOn: string | null;
  playedDates: readonly string[];
  today: string;
  now: number;
}): IslandView {
  const { creaturesEarned } = levelProgress(args.level, args.mastery, args.now);
  const collection = collectionFor(creaturesEarned);

  const run = streakFrom(args.lastPlayedOn, args.today) === 1 ? currentRun(args.playedDates, args.today) : 0;

  return {
    collection,
    hatchedCount: collection.filter((e) => e.hatched).length,
    totalCount: collection.length,
    playLabel: args.hasQuestInProgress ? 'Keep going' : 'Play',
    streakLine: run >= 2 ? `${run} days in a row!` : null,
  };
}
