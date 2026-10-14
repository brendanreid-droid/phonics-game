import { getWord } from '@soundlings/curriculum';
import type { TargetId, TaskInstance } from '@soundlings/engine';

/**
 * Which choices to dim at hint tier 2+, narrowing to a two-way decision.
 *
 * Called by each mini-game with the tier it has merged from idling, errors and
 * the owl button, because only the mini-game knows all three. The runner only
 * ever sees the error-driven tier, so computing this there would leave a
 * nine-second pause showing the mnemonic and narrowing nothing.
 *
 * Word Builder is excluded: its "choices" are letter tiles the child needs to
 * assemble, so dimming them would remove letters the word requires.
 *
 * Missing Letter is a spelling task too, but its choices are alternatives for
 * one gap, so they narrow like any other. Its `correctChoice` is the word, not
 * a letter, so the right answer here is the letter at the blank position.
 */
export function dimmedFor(task: TaskInstance, tier: number): TargetId[] {
  if (tier < 2) return [];
  if (task.skill === 'SEGMENT_SPELL' && task.taskTypeId !== 'missing-letter') return [];

  const right = rightChoice(task);
  const wrong = task.choices.filter((choice) => choice !== right);
  // Keep one wrong answer, dim the rest.
  return wrong.slice(1);
}

/** The choice that answers the task correctly. For Missing Letter that is the letter for the gap. */
function rightChoice(task: TaskInstance): TargetId {
  if (task.taskTypeId !== 'missing-letter') return task.correctChoice;
  return getWord(task.correctChoice).graphemes[task.blankIndex ?? -1] ?? task.correctChoice;
}
