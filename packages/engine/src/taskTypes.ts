import type { Skill, TargetId } from '@soundlings/curriculum';
import { picturesCanAnswerFor } from './pictureStart';

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
  /**
   * Whether this type can be scheduled for the given PRIMARY target of its own
   * skill. Absent means "any target of its skill", which is true of every
   * shipped type today. A mini-game that only works for some targets (Plan 3's
   * Picture Start needs a picturable word beginning with the sound) declares
   * that here, so `provingTaskTypeCount` and the session builder agree on what
   * is schedulable. It says nothing about secondary credit.
   */
  canServeTarget?: (targetId: TargetId) => boolean;
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
    id: 'picture-start',
    skill: 'LETTER_SOUND',
    // The same rung as Sound Singer: the same skill, asked another way.
    difficulty: 2,
    minChoices: 2,
    maxChoices: 3,
    secondaryTargets: 'none',
    // Needs a picturable word that starts with the sound and is not the letter's
    // own mnemonic. No Level 1 word starting with a vowel can be drawn, so this is
    // false for `a` and `i`, which keep one proving game until SAY_IT ships.
    canServeTarget: picturesCanAnswerFor,
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
    id: 'word-pick',
    skill: 'BLEND_READ',
    // The same stage as Picture Match, so the frustration guard's cap treats them alike.
    difficulty: 3,
    minChoices: 2,
    maxChoices: 3,
    secondaryTargets: 'graphemes',
  },
  {
    id: 'missing-letter',
    skill: 'SEGMENT_SPELL',
    // One below Word Builder: filling a single gap is easier than assembling a
    // whole word, and the frustration guard should be able to fall back to it.
    difficulty: 3,
    minChoices: 2,
    maxChoices: 4,
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

/**
 * The skill that receives composite credit when a word task is answered. Must
 * match the skill `attemptsForTask` records secondary attempts under; a test
 * compares the two against the evidence actually emitted.
 */
const SECONDARY_CREDIT_SKILL: Skill = 'SOUND_ID';

/**
 * How many distinct task types can contribute evidence for this particular
 * sound or word: the types of its own skill that could actually be scheduled
 * for it, plus (for the skill that receives it) every type that grants
 * secondary credit. Derived from the pool, so adding a mini-game raises it
 * without anyone remembering to.
 *
 * Per target rather than per skill because one skill can be provable two ways
 * for one sound and one way for another (see `TaskTypeMeta.canServeTarget`).
 *
 * `isMastered` caps its task-type condition by this number. Without the cap a
 * target that only one mini-game can prove could never reach two task types,
 * and could never be mastered.
 *
 * Never less than 1. A target nothing can prove must still be masterable on the
 * other five conditions, so the cap is a floor of one task type, never zero:
 * at zero, `Math.min(masteryTaskTypes, count)` would turn the task-type
 * condition into `seen >= 0`, which any record satisfies, and the guarantee
 * would quietly stop meaning anything.
 */
export function provingTaskTypeCount(
  skill: Skill,
  targetId: TargetId,
  pool: readonly TaskTypeMeta[] = TASK_TYPES,
): number {
  const ids = new Set<string>();
  for (const type of pool) {
    if (type.skill === skill) {
      if (type.canServeTarget === undefined || type.canServeTarget(targetId)) ids.add(type.id);
    } else if (skill === SECONDARY_CREDIT_SKILL && type.secondaryTargets === 'graphemes') {
      ids.add(type.id);
    }
  }
  return Math.max(1, ids.size);
}
