import type { Trophies } from './trophies';

export interface TrophyTile {
  key: 'sounds' | 'read' | 'spelled' | 'stars' | 'perfect' | 'streak';
  emoji: string;
  label: string;
  value: string;
}

/**
 * The trophy room's tiles, as text, decided away from the screen.
 *
 * Achievements only. There is deliberately no tile for errors, accuracy or
 * anything a child could read as a mark against them: that picture belongs to
 * the parent area, because it is a conversation between adults. A streak that
 * is not yet a streak shows a dash rather than "0 days" or "1 day".
 */
export function trophyTilesFrom(t: Trophies): TrophyTile[] {
  const stars = Math.max(0, Math.min(3, t.bestStars));
  return [
    { key: 'sounds', emoji: '🔤', label: 'Sounds learned', value: `${t.soundsLearned} of ${t.soundsTotal}` },
    { key: 'read', emoji: '📖', label: 'Words read', value: `${t.wordsRead}` },
    { key: 'spelled', emoji: '🧩', label: 'Words spelled', value: `${t.wordsSpelled}` },
    { key: 'stars', emoji: '⭐', label: 'Best stars', value: '★'.repeat(stars) + '☆'.repeat(3 - stars) },
    { key: 'perfect', emoji: '🏅', label: 'Perfect quests', value: `${t.cleanRuns}` },
    { key: 'streak', emoji: '🔥', label: 'Longest streak', value: t.longestStreak >= 2 ? `${t.longestStreak} days` : '—' },
  ];
}
