import { WORDS } from '@soundlings/curriculum';
import type { Skill, TargetId } from '@soundlings/curriculum';
import { picturesCanAnswerFor } from './pictureStart';

export interface TaskTypeMeta {
  id: string;
  skill: Skill;
  /**
   * The rung this mini-game sits on for a two-sound target. The difficulty the
   * engine actually uses is `difficultyFor(id, targetId)`, which adds the
   * word's own length on top: a CVC word is one more blend to hold than a VC
   * word, and rating a game without its target is how spelling came to be
   * rated exactly as hard as reading.
   */
  baseDifficulty: number;
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
   * shipped type but Picture Start, which needs pictures of its own for the
   * sound (true of every Level 1 grapheme today). A mini-game that only works for
   * some targets declares that here, so `provingTaskTypeCount` and the session builder agree on what
   * is schedulable. It says nothing about secondary credit.
   */
  canServeTarget?: (targetId: TargetId) => boolean;
}

/**
 * The mini-games shipped in Level 1, listed in teaching order.
 *
 * The order of this array is documentation, not behaviour — the session builder
 * schedules by difficulty and skill. But reading it top to bottom should look
 * like a lesson: hear the sounds in a word, learn a letter, read a word, spell
 * a word.
 */
export const TASK_TYPES: readonly TaskTypeMeta[] = [
  {
    id: 'robot-talk',
    skill: 'ORAL_BLEND',
    baseDifficulty: 1,
    minChoices: 2,
    maxChoices: 3,
    // Deliberately 'none'. Blending /m/-/a/-/p/ aloud is evidence a child can
    // hear the sounds in "map"; it is NOT evidence they know the letter `m`,
    // which they may never have seen. Granting grapheme credit here would let a
    // child master letters by never looking at one.
    secondaryTargets: 'none',
    // No letters may appear, so pictures are the only possible answer. Unlike
    // the reading games' picture requirement, this is a fact about the task
    // rather than a gap in the artwork: there is nothing here to read.
    canServeTarget: (targetId) => WORDS[targetId]?.picture !== undefined,
  },
  {
    id: 'sound-hunt',
    skill: 'SOUND_ID',
    baseDifficulty: 2,
    minChoices: 2,
    maxChoices: 4,
    secondaryTargets: 'none',
  },
  {
    id: 'sound-singer',
    skill: 'LETTER_SOUND',
    baseDifficulty: 3,
    minChoices: 2,
    maxChoices: 3,
    secondaryTargets: 'none',
  },
  {
    id: 'picture-start',
    skill: 'LETTER_SOUND',
    // The same rung as Sound Singer: the same skill, asked another way.
    baseDifficulty: 3,
    minChoices: 2,
    maxChoices: 3,
    secondaryTargets: 'none',
    // Needs pictures of its own for the sound (`Grapheme.startPictures`), which
    // every Level 1 grapheme has, vowels included. The hook stays so a grapheme
    // added without pictures is honestly counted as having one proving game.
    canServeTarget: picturesCanAnswerFor,
  },
  {
    id: 'picture-match',
    skill: 'BLEND_READ',
    baseDifficulty: 5,
    minChoices: 2,
    maxChoices: 3,
    secondaryTargets: 'graphemes',
  },
  {
    id: 'word-pick',
    skill: 'BLEND_READ',
    // The same stage as Picture Match, so the frustration guard's cap treats them alike.
    baseDifficulty: 5,
    minChoices: 2,
    maxChoices: 3,
    secondaryTargets: 'graphemes',
  },
  {
    id: 'missing-letter',
    skill: 'SEGMENT_SPELL',
    // One below Word Builder: filling a single gap is easier than assembling a
    // whole word, and the frustration guard should be able to fall back to it.
    baseDifficulty: 6,
    minChoices: 2,
    maxChoices: 4,
    secondaryTargets: 'graphemes',
  },
  {
    id: 'word-builder',
    skill: 'SEGMENT_SPELL',
    baseDifficulty: 7,
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
  return candidates.reduce((best, t) => (t.baseDifficulty < best.baseDifficulty ? t : best));
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
