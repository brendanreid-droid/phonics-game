import { describe, expect, it } from 'vitest';
import { buildSession } from '@soundlings/engine';
import type { TaskInstance } from '@soundlings/engine';
import { dimmedFor } from './dimming';

const plan = (sessionId = 'q') =>
  buildSession({ sessionId, level: 1, mastery: {}, confusions: {}, now: 1_000_000 });

function task(overrides: Partial<TaskInstance> = {}): TaskInstance {
  return {
    id: 'x',
    taskTypeId: 'sound-hunt',
    skill: 'SOUND_ID',
    primaryTarget: 's',
    secondaryTargets: [],
    choices: ['s', 'a', 't'],
    correctChoice: 's',
    band: 'focus',
    anchor: false,
    difficulty: 1,
    seed: 1,
    ...overrides,
  };
}

describe('dimmedFor', () => {
  it('dims nothing below hint tier 2', () => {
    expect(dimmedFor(plan()[0], 0)).toEqual([]);
    expect(dimmedFor(plan()[0], 1)).toEqual([]);
  });

  it('leaves exactly two choices at hint tier 2 on a task with more', () => {
    const wide = task({ choices: ['s', 'a', 't', 'p'] });
    expect(wide.choices.length - dimmedFor(wide, 2).length).toBe(2);
    const three = task({ choices: ['a', 's', 't'] });
    expect(three.choices.length - dimmedFor(three, 2).length).toBe(2);
  });

  it('leaves a two-way task alone', () => {
    expect(dimmedFor(task({ choices: ['s', 'a'] }), 2)).toEqual([]);
  });

  it('never dims the correct answer, on any task, at any tier', () => {
    for (const seed of ['a', 'b', 'c', 'd']) {
      for (const t of plan(seed)) {
        for (const tier of [0, 1, 2, 3]) expect(dimmedFor(t, tier)).not.toContain(t.correctChoice);
      }
    }
  });

  it('is stable for a task, so a re-render cannot swap which choice is kept', () => {
    const t = task({ choices: ['t', 'a', 's', 'p'] });
    expect(dimmedFor(t, 2)).toEqual(dimmedFor(t, 2));
    expect(dimmedFor(t, 3)).toEqual(dimmedFor(t, 2));
  });

  it('dims nothing on a spelling task, where tiles are not choices', () => {
    const spelling = task({ skill: 'SEGMENT_SPELL', taskTypeId: 'word-builder', choices: ['s', 'a', 't', 'p'] });
    expect(dimmedFor(spelling, 2)).toEqual([]);
  });
});
