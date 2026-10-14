import { TASK_TYPES } from './taskTypes';
import type { Attempt } from './types';

/**
 * What a finished quest is scored on. Lives in the engine, not the app, because
 * two places must agree on "what counts as three stars": the quest runner as it
 * scores a quest live, and the sync layer as it rebuilds a high score from an
 * attempt log on another device. Two copies would drift, and the drift would be
 * invisible.
 */
export interface QuestTally {
  /** Tasks on which the child gave a wrong answer that counted as an error. */
  errors: number;
  /** Tasks the child finished only with the answer shown. */
  scaffolds: number;
}

/**
 * Stars for a finished quest. The floor is one.
 *
 * Three stars allow one slip, two allow a few mistakes and a couple of helped
 * finishes. Three errors in fourteen tasks is a good session for a five-year-old.
 *
 * A child who sat through fourteen tasks has earned something, whatever the
 * accuracy. Zero stars is a punishment for effort, and effort is exactly the
 * behaviour that brings them back tomorrow.
 */
export function starsFor(tally: QuestTally): 1 | 2 | 3 {
  if (tally.errors <= 1 && tally.scaffolds === 0) return 3;
  if (tally.errors <= 4 && tally.scaffolds <= 2) return 2;
  return 1;
}

/**
 * Whether an attempt is the task's own, as against secondary credit for a
 * grapheme inside a word. Not told by weight: an answer given after the choices
 * were narrowed is a primary attempt at half weight, the same as a secondary.
 * Told by skill instead: a primary attempt is in the skill of the mini-game that
 * produced it, and secondary credit is always recorded under another skill.
 */
export function isPrimaryAttempt(attempt: Attempt): boolean {
  return TASK_TYPES.find((type) => type.id === attempt.taskTypeId)?.skill === attempt.skill;
}

/**
 * The errors and scaffolded finishes in a set of attempts. Only a task's own
 * attempts count: secondary credit belongs to graphemes the child was not
 * directly asked, and counting it would charge a word task's error once per
 * letter in the word.
 */
export function tallyAttempts(attempts: readonly Attempt[]): QuestTally {
  const tally: QuestTally = { errors: 0, scaffolds: 0 };
  for (const attempt of attempts) {
    if (!isPrimaryAttempt(attempt)) continue;
    if (!attempt.correct) tally.errors += 1;
    if (attempt.scaffolded) tally.scaffolds += 1;
  }
  return tally;
}
