import type { Skill } from '@soundlings/curriculum';

export interface TaskTypeMeta {
  id: string;
  skill: Skill;
  /** 1 is easiest. The frustration guard caps difficulty, so this must be meaningful. */
  difficulty: number;
  minChoices: number;
  maxChoices: number;
  /**
   * 'graphemes' means a correct answer is also evidence for each grapheme in
   * the target word, credited at half weight. This is why a child can reach
   * the two-task-type mastery bar for a sound without four separate sound games.
   */
  secondaryTargets: 'graphemes' | 'none';
}

/**
 * The four mini-games shipped in Level 1. Four is the minimum that lets both
 * sound skills and both word skills clear the two-task-type mastery bar once
 * secondary crediting is taken into account.
 */
export const TASK_TYPES: readonly TaskTypeMeta[] = [
  {
    id: 'sound-hunt',
    skill: 'SOUND_ID',
    difficulty: 1,
    minChoices: 2,
    maxChoices: 4,
    secondaryTargets: 'none',
  },
  {
    id: 'sound-singer',
    skill: 'LETTER_SOUND',
    difficulty: 2,
    minChoices: 2,
    maxChoices: 3,
    secondaryTargets: 'none',
  },
  {
    id: 'picture-match',
    skill: 'BLEND_READ',
    difficulty: 3,
    minChoices: 2,
    maxChoices: 3,
    secondaryTargets: 'graphemes',
  },
  {
    id: 'word-builder',
    skill: 'SEGMENT_SPELL',
    difficulty: 4,
    minChoices: 3,
    maxChoices: 5,
    secondaryTargets: 'graphemes',
  },
];

export function taskTypeById(id: string): TaskTypeMeta {
  const found = TASK_TYPES.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown task type: ${id}`);
  return found;
}

export function taskTypesForSkill(skill: Skill): TaskTypeMeta[] {
  return TASK_TYPES.filter((t) => t.skill === skill);
}

export function easiestTaskTypeForSkill(
  skill: Skill,
  pool: readonly TaskTypeMeta[] = TASK_TYPES,
): TaskTypeMeta {
  const candidates = pool.filter((t) => t.skill === skill);
  if (candidates.length === 0) throw new Error(`No task type for skill: ${skill}`);
  return candidates.reduce((best, t) => (t.difficulty < best.difficulty ? t : best));
}
