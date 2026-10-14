import { describe, expect, it, vi } from 'vitest';
import type { Skill, TargetId } from '@soundlings/curriculum';
import { DEFAULT_CONFIG } from './config';
import { applyAttempt, emptyRecord, isMastered } from './mastery';
import type { MasteryRecord } from './types';

/**
 * Every Level 1 sound now has two LETTER_SOUND games, so the per-target count
 * equals the per-skill count for every real record and `isMastered` cannot be
 * told apart from a per-skill one. To pin that `isMastered` passes the TARGET
 * through, this file swaps in a pool in which Picture Start can serve `m` and
 * nothing else, as it once could not serve the vowels: two games for `m`, one for
 * `a`.
 *
 * Mocking the module is local to this file; the other mastery tests still see
 * the real pool.
 */
vi.mock('./taskTypes', async (importOriginal) => {
  const original = await importOriginal<typeof import('./taskTypes')>();
  const pool = original.TASK_TYPES.map((type) =>
    type.id === 'picture-start' ? { ...type, canServeTarget: (target: string) => target === 'm' } : type,
  );
  return {
    ...original,
    provingTaskTypeCount: (skill: Skill, target: TargetId) => original.provingTaskTypeCount(skill, target, pool),
  };
});

const HOUR = 3_600_000;
const NOW = 5 * HOUR;

/** Four fast unscaffolded correct answers over three sessions, on the given task types in turn. */
function proven(targetId: TargetId, skill: Skill, taskTypeIds: string[]): MasteryRecord {
  let record = emptyRecord(targetId, skill, DEFAULT_CONFIG);
  for (let i = 0; i < 4; i += 1) {
    record = applyAttempt(
      record,
      {
        sessionId: `session-${i % 3}`, targetId, skill, taskTypeId: taskTypeIds[i % taskTypeIds.length],
        correct: true, scaffolded: false, latencyMs: 900, weight: 1, at: (i + 1) * HOUR,
      },
      DEFAULT_CONFIG,
    );
  }
  return record;
}

describe('isMastered: the task-type bar is per target', () => {
  it('demands two task types of a sound that two games can prove', () => {
    const record = proven('m', 'LETTER_SOUND', ['sound-singer']);
    expect(record.taskTypesSeen).toHaveLength(1);
    expect(isMastered(record, NOW, DEFAULT_CONFIG)).toBe(false);
  });

  it('accepts that sound once it has been proved two ways', () => {
    const record = proven('m', 'LETTER_SOUND', ['sound-singer', 'picture-start']);
    expect(isMastered(record, NOW, DEFAULT_CONFIG)).toBe(true);
  });

  it('accepts a sound only one game can prove on that one game, in the same skill', () => {
    // Same skill, same evidence as the failing case above, different target.
    const record = proven('a', 'LETTER_SOUND', ['sound-singer']);
    expect(record.taskTypesSeen).toHaveLength(1);
    expect(isMastered(record, NOW, DEFAULT_CONFIG)).toBe(true);
  });
});

describe('isMastered: a target nothing can prove', () => {
  // No task type in the pool serves TRICKY_READ, so the proving count is
  // floored at 1. The floor has two jobs, both pinned here.
  it('is still masterable on one task type, so it can never be stuck', () => {
    const record = proven('the', 'TRICKY_READ', ['some-future-game']);
    expect(record.taskTypesSeen).toHaveLength(1);
    expect(isMastered(record, NOW, DEFAULT_CONFIG)).toBe(true);
  });

  it('still requires at least one task type to have been seen', () => {
    // Without the floor, `Math.min(2, 0)` makes the condition `seen >= 0` and a
    // record with no recorded task type at all would pass. Such a record can
    // only come from corrupt or hand-edited storage, but "mastered, evidence
    // unknown" is the wrong answer for one.
    const record = { ...proven('the', 'TRICKY_READ', ['some-future-game']), taskTypesSeen: [] };
    expect(isMastered(record, NOW, DEFAULT_CONFIG)).toBe(false);
  });
});
