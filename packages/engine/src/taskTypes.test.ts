import { describe, expect, it } from 'vitest';
import { SKILLS } from '@soundlings/curriculum';
import { TASK_TYPES, easiestTaskTypeForSkill, taskTypeById, taskTypesForSkill } from './taskTypes';
import type { TaskTypeMeta } from './taskTypes';
import { DEFAULT_CONFIG } from './config';

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

  it('lets a grapheme reach the two-task-type mastery bar via secondary credit', () => {
    // SOUND_ID has one direct task type, so without secondary credit from
    // word tasks no grapheme could ever be mastered. This asserts the escape hatch.
    const direct = taskTypesForSkill('SOUND_ID').length;
    const secondary = TASK_TYPES.filter((t) => t.secondaryTargets === 'graphemes').length;
    expect(direct + secondary).toBeGreaterThanOrEqual(DEFAULT_CONFIG.masteryTaskTypes);
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
