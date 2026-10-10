import { describe, expect, it } from 'vitest';
import { MemoryProgressRepo } from './MemoryProgressRepo';
import { mergeHighScore } from './ProgressRepo';
import { describeProgressRepo } from './progressRepoContract';

describeProgressRepo('MemoryProgressRepo', () => new MemoryProgressRepo());

describe('mergeHighScore', () => {
  it('does not mutate its input', () => {
    const scores = [{ level: 1, stars: 1, cleanRun: false, at: 1 }];
    const merged = mergeHighScore(scores, { level: 1, stars: 3, cleanRun: true, at: 2 });
    expect(scores[0].stars).toBe(1);
    expect(merged[0].stars).toBe(3);
  });

  it('keeps the existing score on a tie rather than replacing it', () => {
    const merged = mergeHighScore(
      [{ level: 1, stars: 2, cleanRun: false, at: 1 }],
      { level: 1, stars: 2, cleanRun: false, at: 2 },
    );
    expect(merged).toEqual([{ level: 1, stars: 2, cleanRun: false, at: 1 }]);
  });
});
