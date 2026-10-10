import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, applyAttempt, emptyRecord, masteryKey } from '@soundlings/engine';
import type { Attempt, MasteryMap } from '@soundlings/engine';
import type { Skill } from '@soundlings/curriculum';
import type { HighScore } from '../data/ProgressRepo';
import { longestRun, trophiesFrom } from './trophies';

const HOUR = 3_600_000;
const NOW = 500 * HOUR;

/** A mastery map entry that satisfies every mastery condition at NOW. */
function mastered(targetId: string, skill: Skill): MasteryMap {
  let record = emptyRecord(targetId, skill, DEFAULT_CONFIG);
  const base: Attempt = {
    sessionId: '', targetId, skill, taskTypeId: 'sound-hunt',
    correct: true, scaffolded: false, latencyMs: 800, weight: 1, at: NOW,
  };
  record = applyAttempt(record, { ...base, sessionId: 'one', taskTypeId: 'sound-hunt' }, DEFAULT_CONFIG);
  record = applyAttempt(record, { ...base, sessionId: 'two', taskTypeId: 'word-builder' }, DEFAULT_CONFIG);
  record = applyAttempt(record, { ...base, sessionId: 'three', taskTypeId: 'picture-match' }, DEFAULT_CONFIG);
  return { [masteryKey(targetId, skill)]: record };
}

const merge = (...maps: MasteryMap[]): MasteryMap => Object.assign({}, ...maps);

const score = (overrides: Partial<HighScore> = {}): HighScore => ({
  level: 1, stars: 1, cleanRun: false, at: NOW, ...overrides,
});

const base = { level: 1, mastery: {} as MasteryMap, highScores: [] as HighScore[], playedDates: [] as string[], now: NOW };

describe('trophiesFrom', () => {
  it('is all zeros for a new child, with the total still known', () => {
    expect(trophiesFrom(base)).toEqual({
      soundsLearned: 0, soundsTotal: 7, wordsRead: 0, wordsSpelled: 0,
      bestStars: 0, cleanRuns: 0, longestStreak: 0,
    });
  });

  it('counts a sound only when both skills for it are mastered', () => {
    const both = merge(mastered('s', 'SOUND_ID'), mastered('s', 'LETTER_SOUND'));
    const half = mastered('a', 'SOUND_ID');
    expect(trophiesFrom({ ...base, mastery: merge(both, half) }).soundsLearned).toBe(1);
  });

  it('counts words read and words spelled separately', () => {
    const mastery = merge(
      mastered('pat', 'BLEND_READ'),
      mastered('tap', 'BLEND_READ'),
      mastered('sat', 'SEGMENT_SPELL'),
    );
    const trophies = trophiesFrom({ ...base, mastery });
    expect(trophies.wordsRead).toBe(2);
    expect(trophies.wordsSpelled).toBe(1);
  });

  it('judges mastery at the time given, as the live calculation does', () => {
    const mastery = merge(mastered('s', 'SOUND_ID'), mastered('s', 'LETTER_SOUND'));
    expect(trophiesFrom({ ...base, mastery, now: NOW }).soundsLearned).toBe(1);
    expect(trophiesFrom({ ...base, mastery, now: NOW + 5000 * HOUR }).soundsLearned).toBe(0);
  });

  it('takes the best star count across scores', () => {
    const highScores = [score({ stars: 2 }), score({ level: 2, stars: 3 }), score({ level: 3, stars: 1 })];
    expect(trophiesFrom({ ...base, highScores }).bestStars).toBe(3);
  });

  it('counts clean runs, not quests', () => {
    const highScores = [score({ cleanRun: true }), score({ level: 2, cleanRun: false }), score({ level: 3, cleanRun: true })];
    expect(trophiesFrom({ ...base, highScores }).cleanRuns).toBe(2);
  });

  it('reports the longest streak from the days played', () => {
    const playedDates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-09'];
    expect(trophiesFrom({ ...base, playedDates }).longestStreak).toBe(3);
  });

  it('shows achievements only: no field is an error count or an accuracy', () => {
    expect(Object.keys(trophiesFrom(base)).sort()).toEqual(
      ['bestStars', 'cleanRuns', 'longestStreak', 'soundsLearned', 'soundsTotal', 'wordsRead', 'wordsSpelled'],
    );
  });

  it('does not change the lists it was given', () => {
    const playedDates = ['2026-10-03', '2026-10-01'];
    const highScores = [score()];
    trophiesFrom({ ...base, playedDates, highScores });
    expect(playedDates).toEqual(['2026-10-03', '2026-10-01']);
    expect(highScores).toEqual([score()]);
  });
});

describe('longestRun', () => {
  it('is zero with no days', () => {
    expect(longestRun([])).toBe(0);
  });

  it('is one for a single day', () => {
    expect(longestRun(['2026-10-10'])).toBe(1);
  });

  it('is one when no days are consecutive', () => {
    expect(longestRun(['2026-10-01', '2026-10-03', '2026-10-05'])).toBe(1);
  });

  it('counts a plain run', () => {
    expect(longestRun(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])).toBe(4);
  });

  it('finds the longest run when it is not the last', () => {
    expect(longestRun(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-10', '2026-10-11'])).toBe(3);
  });

  it('finds the longest run when it is the last', () => {
    expect(longestRun(['2026-10-01', '2026-10-02', '2026-10-10', '2026-10-11', '2026-10-12'])).toBe(3);
  });

  it('does not join runs separated by one missed day', () => {
    expect(longestRun(['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05'])).toBe(2);
  });

  it('ignores the order the days arrive in', () => {
    expect(longestRun(['2026-10-03', '2026-10-01', '2026-10-02'])).toBe(3);
  });

  it('counts a repeated day once', () => {
    expect(longestRun(['2026-10-01', '2026-10-01', '2026-10-02', '2026-10-02'])).toBe(2);
  });

  it('does not let a repeated day inside a run cut it short', () => {
    expect(longestRun(['2026-10-01', '2026-10-02', '2026-10-02', '2026-10-03'])).toBe(3);
  });

  it('runs across a month end, a year end and a leap day', () => {
    expect(longestRun(['2026-10-30', '2026-10-31', '2026-11-01'])).toBe(3);
    expect(longestRun(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'])).toBe(4);
    expect(longestRun(['2028-02-28', '2028-02-29', '2028-03-01'])).toBe(3);
  });

  it('breaks at 29 February in a year that has none', () => {
    expect(longestRun(['2027-02-28', '2027-03-01'])).toBe(2);
    expect(longestRun(['2027-02-27', '2027-03-01'])).toBe(1);
  });

  it('does not change the list it was given', () => {
    const dates = ['2026-10-03', '2026-10-01', '2026-10-03'];
    longestRun(dates);
    expect(dates).toEqual(['2026-10-03', '2026-10-01', '2026-10-03']);
  });
});
