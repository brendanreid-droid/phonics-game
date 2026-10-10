import type { Trophies } from './trophies';

export interface TrophyTile {
  key: 'sounds' | 'read' | 'spelled' | 'stars' | 'perfect' | 'streak';
  emoji: string;
  label: string;
  value: string;
  /** False when nothing has been earned yet: the screen dims the tile and the value reads "Not yet". */
  earned: boolean;
}

/** What an unearned trophy says. Forward-looking, and nothing like a score. */
export const NOT_YET = 'Not yet';

/**
 * The trophy room's tiles, as text, decided away from the screen.
 *
 * Achievements only. There is deliberately no tile for errors, accuracy or
 * anything a child could read as a mark against them: that picture belongs to
 * the parent area, because it is a conversation between adults. A streak that
 * is not yet a streak is shown as "not yet". An unearned trophy never reads as
 * a bare 0: a five-year-old does not read framing, they read the nought. The
 * tile stays (the gaps are the map, as with the island's eggs) but is marked
 * unearned so the screen can dim it.
 */
export function trophyTilesFrom(t: Trophies): TrophyTile[] {
  const stars = Math.max(0, Math.min(3, t.bestStars));
  const count = (n: number): Pick<TrophyTile, 'value' | 'earned'> =>
    n > 0 ? { value: `${n}`, earned: true } : { value: NOT_YET, earned: false };

  return [
    {
      key: 'sounds',
      emoji: '🔤',
      label: 'Sounds learned',
      ...(t.soundsLearned > 0
        ? { value: `${t.soundsLearned} of ${t.soundsTotal}`, earned: true }
        : { value: NOT_YET, earned: false }),
    },
    { key: 'read', emoji: '📖', label: 'Words read', ...count(t.wordsRead) },
    { key: 'spelled', emoji: '🧩', label: 'Words spelled', ...count(t.wordsSpelled) },
    // The model for the rest: the outline of what is possible, with what has
    // been achieved filled in. Never a bare number.
    { key: 'stars', emoji: '⭐', label: 'Best stars', value: '★'.repeat(stars) + '☆'.repeat(3 - stars), earned: stars > 0 },
    { key: 'perfect', emoji: '🏅', label: 'Perfect quests', ...count(t.cleanRuns) },
    {
      key: 'streak',
      emoji: '🔥',
      label: 'Longest streak',
      ...(t.longestStreak >= 2 ? { value: `${t.longestStreak} days`, earned: true } : { value: NOT_YET, earned: false }),
    },
  ];
}
