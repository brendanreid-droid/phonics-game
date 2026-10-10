import { levelProgress } from '@soundlings/engine';
import type { MasteryMap } from '@soundlings/engine';
import type { HighScore } from '../data/ProgressRepo';
import { daysBetween } from './streaks';

export interface Trophies {
  soundsLearned: number;
  soundsTotal: number;
  wordsRead: number;
  wordsSpelled: number;
  bestStars: number;
  cleanRuns: number;
  longestStreak: number;
}

/**
 * The numbers the trophy room shows.
 *
 * Deliberately all achievements and no failures: no error count, no accuracy
 * percentage, nothing a child can read as a mark against them. The parent area
 * in Plan 3 is where the honest diagnostic picture lives, because that is a
 * conversation between adults.
 */
export function trophiesFrom(args: {
  level: number;
  mastery: MasteryMap;
  highScores: readonly HighScore[];
  playedDates: readonly string[];
  now: number;
}): Trophies {
  const progress = levelProgress(args.level, args.mastery, args.now);

  return {
    soundsLearned: progress.graphemesMastered,
    soundsTotal: progress.graphemesRequired,
    wordsRead: progress.blendWordsMastered,
    wordsSpelled: progress.segmentWordsMastered,
    bestStars: args.highScores.reduce((best, s) => Math.max(best, s.stars), 0),
    cleanRuns: args.highScores.filter((s) => s.cleanRun).length,
    longestStreak: longestRun(args.playedDates),
  };
}

/** The longest run of consecutive calendar days in a set of dates. */
export function longestRun(dates: readonly string[]): number {
  const unique = [...new Set(dates)].sort();
  if (unique.length === 0) return 0;

  let best = 1;
  let current = 1;
  for (let i = 1; i < unique.length; i += 1) {
    current = daysBetween(unique[i - 1], unique[i]) === 1 ? current + 1 : 1;
    if (current > best) best = current;
  }
  return best;
}
