import { describe, expect, it } from 'vitest';
import { islandFor } from './island';
import { masteredLevelOne, masteredSounds } from './masteryFixture';

const NOW = 1_800_000_000_000;
const base = {
  level: 1,
  mastery: {},
  hasQuestInProgress: false,
  lastPlayedOn: null,
  playedDates: [] as string[],
  today: '2026-10-10',
  now: NOW,
};

describe('islandFor: the creature collection is the progress bar', () => {
  it('always shows all seven creatures, as eggs for a new child', () => {
    const { collection } = islandFor(base);
    expect(collection).toHaveLength(7);
    expect(collection.every((e) => !e.hatched)).toBe(true);
  });

  it('hatches exactly the creatures whose sounds are mastered, keeping the eggs visible', () => {
    const { collection } = islandFor({ ...base, mastery: masteredSounds(['s', 'm'], NOW) });
    expect(collection.filter((e) => e.hatched).map((e) => e.creature.id)).toEqual(['sisi', 'momo']);
    expect(collection.filter((e) => !e.hatched)).toHaveLength(5);
  });

  it('hatches all seven when the level is mastered', () => {
    expect(islandFor({ ...base, mastery: masteredLevelOne(NOW) }).collection.every((e) => e.hatched)).toBe(true);
  });

  it('counts the hatched, for the caption', () => {
    const view = islandFor({ ...base, mastery: masteredSounds(['s', 'a', 't'], NOW) });
    expect(view.hatchedCount).toBe(3);
    expect(view.totalCount).toBe(7);
  });
});

describe('islandFor: the button', () => {
  it('says Play for a fresh start', () => {
    expect(islandFor(base).playLabel).toBe('Play');
  });

  it('says Keep going when a quest is in progress, so the child knows their place was kept', () => {
    expect(islandFor({ ...base, hasQuestInProgress: true }).playLabel).toBe('Keep going');
  });
});

describe('islandFor: the streak line', () => {
  it('says nothing for a child who has never played', () => {
    expect(islandFor(base).streakLine).toBeNull();
  });

  it('says nothing for a single day: that is not yet a run', () => {
    const view = islandFor({ ...base, lastPlayedOn: '2026-10-10', playedDates: ['2026-10-10'] });
    expect(view.streakLine).toBeNull();
  });

  it('celebrates a live run of days', () => {
    const view = islandFor({
      ...base,
      lastPlayedOn: '2026-10-10',
      playedDates: ['2026-10-08', '2026-10-09', '2026-10-10'],
    });
    expect(view.streakLine).toBe('3 days in a row!');
  });

  it('still celebrates when the run ended yesterday: today has not been missed', () => {
    const view = islandFor({ ...base, lastPlayedOn: '2026-10-09', playedDates: ['2026-10-08', '2026-10-09'] });
    expect(view.streakLine).toBe('2 days in a row!');
  });

  it('says NOTHING - not zero, not "broken" - once a day has been missed', () => {
    const view = islandFor({ ...base, lastPlayedOn: '2026-10-07', playedDates: ['2026-10-06', '2026-10-07'] });
    expect(view.streakLine).toBeNull();
  });

  it('reports the current run, not the best one ever', () => {
    const view = islandFor({
      ...base,
      lastPlayedOn: '2026-10-10',
      playedDates: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-10-09', '2026-10-10'],
    });
    expect(view.streakLine).toBe('2 days in a row!');
  });

  it('never mentions a failure of any kind', () => {
    const lines = [
      islandFor({ ...base, lastPlayedOn: '2026-10-01', playedDates: ['2026-09-30', '2026-10-01'] }).streakLine,
      islandFor({ ...base, lastPlayedOn: '2026-10-10', playedDates: ['2026-10-09', '2026-10-10'] }).streakLine,
    ];
    for (const line of lines) expect(line ?? '').not.toMatch(/broke|lost|miss|streak/i);
  });
});
