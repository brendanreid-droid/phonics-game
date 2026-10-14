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

  describe('Missing Letter, whose choices are letters for one gap', () => {
    // 'mat' with the middle blank: the right letter is `a`, though the task's
    // correctChoice is the word id.
    const gap = (choices: string[], overrides: Partial<TaskInstance> = {}) =>
      task({
        skill: 'SEGMENT_SPELL', taskTypeId: 'missing-letter', primaryTarget: 'mat', correctChoice: 'mat',
        blankIndex: 1, choices, ...overrides,
      });

    it('leaves the right letter and one wrong one at tier 2', () => {
      const wide = gap(['i', 'a', 'm', 'p']);
      const dimmed = dimmedFor(wide, 2);
      expect(wide.choices.length - dimmed.length).toBe(2);
      expect(dimmed).not.toContain('a');
    });

    it('never dims the letter that belongs in the gap, whichever position is blank, at any tier', () => {
      for (const [blankIndex, letter] of [[0, 'm'], [1, 'a'], [2, 't']] as const) {
        const t = gap(['s', letter, 'i', 'p'], { blankIndex });
        for (const tier of [0, 1, 2, 3]) expect(dimmedFor(t, tier), `${blankIndex}/${tier}`).not.toContain(letter);
      }
    });

    it('dims nothing below tier 2, and leaves a two-way gap alone', () => {
      expect(dimmedFor(gap(['i', 'a', 'p']), 1)).toEqual([]);
      expect(dimmedFor(gap(['i', 'a']), 2)).toEqual([]);
    });

    it('does not dim by the word id: a letter is never mistaken for the answer', () => {
      // If the word id were compared against the letters, nothing would match and
      // everything but one wrong letter would be dimmed, including the right one.
      const dimmed = dimmedFor(gap(['i', 'a', 'p', 's']), 2);
      expect(dimmed.length).toBe(2);
      expect(dimmed).not.toContain('a');
    });

    it('still dims nothing on Word Builder, whose tiles the word needs', () => {
      const builder = task({ skill: 'SEGMENT_SPELL', taskTypeId: 'word-builder', primaryTarget: 'mat', correctChoice: 'mat', choices: ['m', 'a', 't', 'p'] });
      expect(dimmedFor(builder, 2)).toEqual([]);
    });
  });
});
