import { describe, expect, it } from 'vitest';
import { trophyTilesFrom } from './trophyTiles';
import type { Trophies } from './trophies';

const none: Trophies = {
  soundsLearned: 0, soundsTotal: 7, wordsRead: 0, wordsSpelled: 0, bestStars: 0, cleanRuns: 0, longestStreak: 0,
};

const tile = (t: Trophies, key: string) => trophyTilesFrom(t).find((x) => x.key === key)!;

describe('trophyTilesFrom', () => {
  it('shows sounds learned as "n of total", so the gap to seven is visible', () => {
    expect(tile({ ...none, soundsLearned: 5 }, 'sounds').value).toBe('5 of 7');
  });

  it('shows words read and words spelled', () => {
    expect(tile({ ...none, wordsRead: 4 }, 'read').value).toBe('4');
    expect(tile({ ...none, wordsSpelled: 2 }, 'spelled').value).toBe('2');
  });

  it('shows best stars as stars, filled and empty', () => {
    expect(tile({ ...none, bestStars: 2 }, 'stars').value).toBe('★★☆');
    expect(tile({ ...none, bestStars: 3 }, 'stars').value).toBe('★★★');
  });

  it('shows perfect quests as a count', () => {
    expect(tile({ ...none, cleanRuns: 3 }, 'perfect').value).toBe('3');
  });

  it('shows the longest streak in days once it is a streak', () => {
    expect(tile({ ...none, longestStreak: 4 }, 'streak').value).toBe('4 days');
    expect(tile({ ...none, longestStreak: 2 }, 'streak').value).toBe('2 days');
  });

  it('shows a dash, never "0 days" or "1 day", where there is no streak yet', () => {
    expect(tile({ ...none, longestStreak: 0 }, 'streak').value).toBe('—');
    expect(tile({ ...none, longestStreak: 1 }, 'streak').value).toBe('—');
  });

  it('has the six tiles, in a fixed order', () => {
    expect(trophyTilesFrom(none).map((t) => t.key)).toEqual(['sounds', 'read', 'spelled', 'stars', 'perfect', 'streak']);
  });

  it('shows NO failure of any kind: no errors, no accuracy, no misses', () => {
    const everything = JSON.stringify(trophyTilesFrom({ ...none, soundsLearned: 3, wordsRead: 2, bestStars: 1, cleanRuns: 1, longestStreak: 3 }));
    expect(everything).not.toMatch(/error|wrong|mistake|accura|incorrect|miss|fail|%/i);
  });
});
