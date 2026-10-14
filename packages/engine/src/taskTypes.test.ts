import { describe, expect, it } from 'vitest';
import { SKILLS } from '@soundlings/curriculum';
import { DEFAULT_CONFIG } from './config';
import { TASK_TYPES, easiestTaskTypeForSkill, provingTaskTypeCount, taskTypeById, taskTypesForSkill } from './taskTypes';
import { attemptsForTask } from './taskOutcome';
import type { TaskInstance } from './types';
import type { TaskTypeMeta } from './taskTypes';

describe('task types', () => {
  it('has unique ids', () => {
    const ids = TASK_TYPES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares only real skills', () => {
    for (const taskType of TASK_TYPES) {
      expect(SKILLS).toContain(taskType.skill);
    }
  });

  it('offers at least as many task types as mastery requires, for every skill it covers', () => {
    const covered = new Set(TASK_TYPES.map((t) => t.skill));
    for (const skill of covered) {
      expect(taskTypesForSkill(skill).length, skill).toBeGreaterThanOrEqual(1);
    }
  });

  it('covers the four Level 1 skills', () => {
    expect(TASK_TYPES.map((t) => t.skill).sort()).toEqual(
      ['BLEND_READ', 'LETTER_SOUND', 'SEGMENT_SPELL', 'SOUND_ID'].sort(),
    );
  });

  it('keeps choice bounds sane', () => {
    for (const taskType of TASK_TYPES) {
      expect(taskType.minChoices).toBeGreaterThanOrEqual(2);
      expect(taskType.maxChoices).toBeGreaterThanOrEqual(taskType.minChoices);
    }
  });

  it('orders difficulty so there is always an easiest task type', () => {
    const difficulties = TASK_TYPES.map((t) => t.difficulty);
    expect(Math.min(...difficulties)).toBeLessThan(Math.max(...difficulties));
  });

  it('looks up by id and throws on an unknown id', () => {
    expect(taskTypeById('sound-hunt').skill).toBe('SOUND_ID');
    expect(() => taskTypeById('nope')).toThrow(/unknown task type/i);
  });

  it('maps each mini-game to the skill it exercises', () => {
    expect(taskTypeById('sound-hunt').skill).toBe('SOUND_ID');
    expect(taskTypeById('sound-singer').skill).toBe('LETTER_SOUND');
    expect(taskTypeById('picture-match').skill).toBe('BLEND_READ');
    expect(taskTypeById('word-builder').skill).toBe('SEGMENT_SPELL');
  });

  it('gives secondary grapheme credit only to the word tasks', () => {
    expect(taskTypeById('sound-hunt').secondaryTargets).toBe('none');
    expect(taskTypeById('sound-singer').secondaryTargets).toBe('none');
    expect(taskTypeById('picture-match').secondaryTargets).toBe('graphemes');
    expect(taskTypeById('word-builder').secondaryTargets).toBe('graphemes');
  });

  it('orders difficulty sound-hunt < sound-singer < picture-match < word-builder', () => {
    // The frustration guard caps difficulty, so this order is behaviour.
    const order = ['sound-hunt', 'sound-singer', 'picture-match', 'word-builder'];
    const byDifficulty = [...TASK_TYPES].sort((a, b) => a.difficulty - b.difficulty).map((t) => t.id);
    expect(byDifficulty).toEqual(order);
  });

  it('pins each task type\'s choice bounds', () => {
    const bounds = Object.fromEntries(TASK_TYPES.map((t) => [t.id, [t.minChoices, t.maxChoices]]));
    expect(bounds).toEqual({
      'sound-hunt': [2, 4],
      'sound-singer': [2, 3],
      'picture-match': [2, 3],
      'word-builder': [3, 5],
    });
  });

  it('gives every task type a distinct difficulty, easiest being the single-sound games', () => {
    const difficulties = TASK_TYPES.map((t) => t.difficulty);
    expect(new Set(difficulties).size).toBe(difficulties.length);
    expect(difficulties.every((d) => d >= 1)).toBe(true);
    const easiest = TASK_TYPES.reduce((a, b) => (b.difficulty < a.difficulty ? b : a));
    expect(easiest.id).toBe('sound-hunt');
  });

  it('returns only task types of the requested skill, and none for an unshipped skill', () => {
    expect(taskTypesForSkill('BLEND_READ').map((t) => t.id)).toEqual(['picture-match']);
    expect(taskTypesForSkill('TRICKY_READ')).toEqual([]);
  });

  it('picks the lowest-difficulty task type for a skill, and throws when there is none', () => {
    expect(easiestTaskTypeForSkill('SEGMENT_SPELL').id).toBe('word-builder');
    expect(() => easiestTaskTypeForSkill('TRICKY_READ')).toThrow(/no task type for skill/i);
  });

  it('picks the lowest difficulty from a pool, whichever order it is listed in', () => {
    const easy: TaskTypeMeta = { id: 'easy', skill: 'SOUND_ID', difficulty: 1, minChoices: 2, maxChoices: 3, secondaryTargets: 'none' };
    const hard: TaskTypeMeta = { id: 'hard', skill: 'SOUND_ID', difficulty: 5, minChoices: 2, maxChoices: 3, secondaryTargets: 'none' };
    expect(easiestTaskTypeForSkill('SOUND_ID', [easy, hard]).id).toBe('easy');
    expect(easiestTaskTypeForSkill('SOUND_ID', [hard, easy]).id).toBe('easy');
  });

  it('considers only the requested skill when picking the easiest from a pool', () => {
    const other: TaskTypeMeta = { id: 'other', skill: 'LETTER_SOUND', difficulty: 1, minChoices: 2, maxChoices: 3, secondaryTargets: 'none' };
    const mine: TaskTypeMeta = { id: 'mine', skill: 'BLEND_READ', difficulty: 4, minChoices: 2, maxChoices: 3, secondaryTargets: 'none' };
    expect(easiestTaskTypeForSkill('BLEND_READ', [other, mine]).id).toBe('mine');
    expect(() => easiestTaskTypeForSkill('SOUND_ID', [other, mine])).toThrow(/no task type for skill/i);
  });
});

describe('provingTaskTypeCount', () => {
  const type = (over: Partial<TaskTypeMeta> & { id: string }): TaskTypeMeta => ({
    skill: 'SOUND_ID', difficulty: 1, minChoices: 2, maxChoices: 3, secondaryTargets: 'none', ...over,
  });

  it('counts a skill\'s own type plus every type that grants it secondary credit', () => {
    // SOUND_ID: sound-hunt directly, plus picture-match and word-builder through
    // secondary credit. The other three skills get no composite credit.
    expect(provingTaskTypeCount('SOUND_ID', 's')).toBe(3);
    expect(provingTaskTypeCount('LETTER_SOUND', 's')).toBe(1);
    expect(provingTaskTypeCount('BLEND_READ', 'mat')).toBe(1);
    expect(provingTaskTypeCount('SEGMENT_SPELL', 'mat')).toBe(1);
  });

  it('is at least 1 even for a skill nothing can prove, so nothing is unmasterable', () => {
    // Floored, not zero: with no floor, `Math.min(masteryTaskTypes, 0)` would make
    // the task-type condition `seen >= 0`, true of any record whatever.
    expect(provingTaskTypeCount('TRICKY_READ', 'the')).toBe(1);
    expect(provingTaskTypeCount('SENTENCE_READ', 'sat')).toBe(1);
  });

  it('rises on its own when a second mini-game is added for a skill', () => {
    const pool = [...TASK_TYPES, type({ id: 'singer-two', skill: 'LETTER_SOUND', difficulty: 6 })];
    expect(provingTaskTypeCount('LETTER_SOUND', 's', pool)).toBe(2);
    expect(provingTaskTypeCount('LETTER_SOUND', 's', TASK_TYPES)).toBe(1);
  });

  it('counts secondary-credit types only for the skill that receives the credit', () => {
    const pool = [
      type({ id: 'direct', skill: 'SOUND_ID' }),
      type({ id: 'composite', skill: 'BLEND_READ', secondaryTargets: 'graphemes' }),
      type({ id: 'plain', skill: 'BLEND_READ', secondaryTargets: 'none' }),
    ];
    expect(provingTaskTypeCount('SOUND_ID', 's', pool)).toBe(2);
    expect(provingTaskTypeCount('BLEND_READ', 'mat', pool)).toBe(2);
    // Nothing in the pool serves LETTER_SOUND: floored to 1, not 0.
    expect(provingTaskTypeCount('LETTER_SOUND', 's', pool)).toBe(1);
  });

  it('does not count a SOUND_ID type twice when it also grants secondary credit', () => {
    const pool = [type({ id: 'both', skill: 'SOUND_ID', secondaryTargets: 'graphemes' })];
    expect(provingTaskTypeCount('SOUND_ID', 's', pool)).toBe(1);
  });

  it('agrees with the evidence taskOutcome actually emits, so the two cannot drift apart', () => {
    for (const skill of ['SOUND_ID', 'LETTER_SOUND', 'BLEND_READ', 'SEGMENT_SPELL'] as const) {
      const emitted = new Set<string>();
      for (const meta of TASK_TYPES) {
        const task: TaskInstance = {
          id: 't', taskTypeId: meta.id, skill: meta.skill, primaryTarget: 'pat',
          secondaryTargets: meta.secondaryTargets === 'graphemes' ? ['p', 'a', 't'] : [],
          choices: [], correctChoice: 'pat', band: 'focus', anchor: false, difficulty: meta.difficulty, seed: 1,
        };
        const outcome = { sessionId: 's', correct: true, scaffolded: false, latencyMs: 1000, at: 1 };
        for (const a of attemptsForTask(task, outcome, DEFAULT_CONFIG)) {
          if (a.skill === skill) emitted.add(a.taskTypeId);
        }
      }
      expect(provingTaskTypeCount(skill, 'pat'), skill).toBe(emitted.size);
    }
  });
});

describe('provingTaskTypeCount, per target', () => {
  const type = (over: Partial<TaskTypeMeta> & { id: string }): TaskTypeMeta => ({
    skill: 'LETTER_SOUND', difficulty: 1, minChoices: 2, maxChoices: 3, secondaryTargets: 'none', ...over,
  });
  // Stands in for Plan 3's picture-start: provable for `m` but not for `a`.
  const onlyForM = type({ id: 'only-for-m', canServeTarget: (target) => target === 'm' });

  it('counts the task types that could actually be scheduled for this target', () => {
    // SOUND_ID is provable directly by sound-hunt and indirectly by the two
    // word games' secondary credit.
    expect(provingTaskTypeCount('SOUND_ID', 's')).toBeGreaterThanOrEqual(2);
  });

  it('never exceeds what is schedulable, so mastery can never deadlock', () => {
    for (const skill of ['SOUND_ID', 'LETTER_SOUND', 'BLEND_READ', 'SEGMENT_SPELL'] as const) {
      for (const target of ['s', 'a', 't', 'p', 'i', 'm', 'f', 'mat', 'at']) {
        expect(provingTaskTypeCount(skill, target), `${skill}/${target}`).toBeGreaterThanOrEqual(1);
        // Each shipped type serves any target of its skill, so the count is
        // exactly what the skill-wide answer was before this change.
        expect(provingTaskTypeCount(skill, target), `${skill}/${target}`).toBe(
          provingTaskTypeCount(skill, 's'),
        );
      }
    }
  });

  it('is at least 1 even for a target nothing can prove, so nothing is unmasterable', () => {
    expect(provingTaskTypeCount('SENTENCE_READ', 'sat')).toBeGreaterThanOrEqual(1);
  });

  it('gives a different answer for different targets of the same skill', () => {
    const pool = [...TASK_TYPES, onlyForM];
    expect(provingTaskTypeCount('LETTER_SOUND', 'm', pool)).toBe(2);
    expect(provingTaskTypeCount('LETTER_SOUND', 'a', pool)).toBe(1);
  });

  it('asks the type about the target it was given, not some other', () => {
    const asked: string[] = [];
    const spy = type({ id: 'spy', canServeTarget: (target) => { asked.push(target); return true; } });
    provingTaskTypeCount('LETTER_SOUND', 'f', [spy]);
    expect(asked).toEqual(['f']);
  });

  it('floors at 1 when the only type of the skill cannot serve the target', () => {
    const pool = [onlyForM];
    expect(provingTaskTypeCount('LETTER_SOUND', 'a', pool)).toBe(1);
  });

  it('does not ask whether a type of another skill can serve the target', () => {
    // A BLEND_READ type's `canServeTarget` is about WORD targets. It says nothing
    // about whether `s` can be proved, so it must not be consulted for LETTER_SOUND.
    const wordOnly = type({ id: 'word-only', skill: 'BLEND_READ', canServeTarget: () => false });
    const plain = type({ id: 'plain' });
    expect(provingTaskTypeCount('LETTER_SOUND', 's', [wordOnly, plain])).toBe(1);
  });

  it('counts a type with no constraint as serving every target', () => {
    expect(provingTaskTypeCount('LETTER_SOUND', 'anything', [type({ id: 'free' })])).toBe(1);
    expect(
      provingTaskTypeCount('LETTER_SOUND', 'anything', [type({ id: 'free' }), type({ id: 'free-2' })]),
    ).toBe(2);
  });
});
